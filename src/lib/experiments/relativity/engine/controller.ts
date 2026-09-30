import { WebGLRenderer } from 'three';
import { sceneFactories, type SceneId } from '../scenes';
import { disposeKit } from './kit';
import { LabelLayer } from './labels';
import { OrbitRig } from './rig';
import type { SceneInstance } from './types';

export interface SlotOptions {
	scene: SceneId;
	params: object;
	readout: object;
}

type StageState = 'idle' | 'live' | 'unsupported' | 'error';

interface Slot {
	view: HTMLElement;
	/** The whole figure: touching or focusing anything in it makes this Stage the live one. */
	region: HTMLElement;
	options: SlotOptions;
	ratio: number;
	primed: boolean;
	broken: boolean;
	pinnedUntil: number;
	width: number;
	height: number;
	inst?: SceneInstance;
	rig?: OrbitRig;
	layer?: LabelLayer;
	undo: (() => void)[];
}

const VISIBLE = 0.15;
const PIN_MS = 5000;

/**
 * Runs every 3D scene on the page with one WebGL context. A phone can't spare a context per chapter, so
 * the canvas moves into whichever Stage is most on screen; the others keep a snapshot of their last
 * frame. A frame is only drawn when something moved, so a paused page costs nothing.
 */
export class StageController {
	private renderer: WebGLRenderer | null = null;
	private unsupported = false;
	private readonly slots = new Map<HTMLElement, Slot>();
	private active: Slot | null = null;
	private frame = 0;
	private last = 0;
	private dirty = false;
	private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');
	private readonly seen: IntersectionObserver;
	private readonly near: IntersectionObserver;
	private readonly resizes: ResizeObserver;

	constructor() {
		this.seen = new IntersectionObserver(this.onSeen, {
			threshold: Array.from({ length: 11 }, (_, i) => i / 10)
		});
		this.near = new IntersectionObserver(this.onNear, { rootMargin: '90% 0px' });
		this.resizes = new ResizeObserver(this.onResize);
		document.addEventListener('visibilitychange', this.onVisibility);
	}

	register(view: HTMLElement, options: SlotOptions) {
		const region = view.closest<HTMLElement>('[data-stage-region]') ?? view;
		const slot: Slot = {
			view,
			region,
			options,
			ratio: 0,
			primed: false,
			broken: false,
			pinnedUntil: 0,
			width: 0,
			height: 0,
			undo: []
		};
		this.slots.set(view, slot);
		this.mark(slot, this.unsupported ? 'unsupported' : 'idle');

		const pin = () => {
			slot.pinnedUntil = performance.now() + PIN_MS;
			this.activate(slot);
		};
		const keydown = (event: KeyboardEvent) => {
			if (event.target !== view || !slot.rig?.key(event)) return;
			event.preventDefault();
			this.invalidate();
		};
		region.addEventListener('pointerdown', pin, true);
		region.addEventListener('focusin', pin);
		view.addEventListener('keydown', keydown);
		slot.undo.push(
			() => region.removeEventListener('pointerdown', pin, true),
			() => region.removeEventListener('focusin', pin),
			() => view.removeEventListener('keydown', keydown)
		);

		this.seen.observe(view);
		this.near.observe(view);
		this.resizes.observe(view);
		return () => this.unregister(slot);
	}

	private unregister(slot: Slot) {
		this.seen.unobserve(slot.view);
		this.near.unobserve(slot.view);
		this.resizes.unobserve(slot.view);
		for (const undo of slot.undo) undo();
		if (this.active === slot) {
			this.renderer?.domElement.remove();
			this.active = null;
		}
		slot.layer?.dispose();
		slot.inst?.dispose();
		this.slots.delete(slot.view);
	}

	/** Something changed (a param, a resize): draw one more frame. */
	invalidate() {
		this.dirty = true;
		this.schedule();
	}

	destroy() {
		cancelAnimationFrame(this.frame);
		document.removeEventListener('visibilitychange', this.onVisibility);
		this.seen.disconnect();
		this.near.disconnect();
		this.resizes.disconnect();
		for (const slot of [...this.slots.values()]) this.unregister(slot);
		this.renderer?.dispose();
		this.renderer?.forceContextLoss();
		this.renderer?.domElement.remove();
		this.renderer = null;
		disposeKit();
	}

	private mark(slot: Slot, state: StageState) {
		slot.view.dataset.state = state;
	}

	private ensureRenderer() {
		if (this.renderer || this.unsupported) return this.renderer;
		try {
			const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'default' });
			const canvas = renderer.domElement;
			canvas.setAttribute('aria-hidden', 'true');
			canvas.addEventListener('pointerdown', this.onPointerDown);
			canvas.addEventListener('pointermove', this.onPointerMove);
			canvas.addEventListener('pointerup', this.onPointerEnd);
			canvas.addEventListener('pointercancel', this.onPointerEnd);
			canvas.addEventListener('lostpointercapture', this.onPointerEnd);
			canvas.addEventListener('dblclick', this.onDoubleClick);
			canvas.addEventListener('wheel', this.onWheel, { passive: false });
			canvas.addEventListener('webglcontextrestored', () => this.invalidate());
			this.renderer = renderer;
		} catch (error) {
			console.warn('WebGL is not available, so the 3D scenes are switched off.', error);
			this.unsupported = true;
			for (const slot of this.slots.values()) this.mark(slot, 'unsupported');
		}
		return this.renderer;
	}

	private ensureScene(slot: Slot) {
		if (slot.inst) return true;
		if (slot.broken) return false;
		try {
			slot.layer = new LabelLayer(slot.view.querySelector<HTMLElement>('.stage-labels') ?? slot.view);
			slot.inst = sceneFactories[slot.options.scene](
				{ labels: slot.layer, reducedMotion: () => this.reduced.matches, compact: () => slot.view.clientWidth < 480 },
				slot.options.params as never,
				slot.options.readout as never
			);
			slot.rig = new OrbitRig(slot.inst.camera, slot.inst.rig, () => !this.reduced.matches);
			return true;
		} catch (error) {
			console.error(error);
			slot.broken = true;
			this.mark(slot, 'error');
			return false;
		}
	}

	/** Sizes the shared canvas for `slot`. Returns false while the Stage has no size yet. */
	private fit(slot: Slot) {
		const width = Math.round(slot.view.clientWidth);
		const height = Math.round(slot.view.clientHeight);
		if (!width || !height || !this.renderer) return false;
		slot.width = width;
		slot.height = height;
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this.renderer.setSize(width, height, false);
		slot.rig?.setAspect(width / height);
		this.dirty = true;
		return true;
	}

	private render(slot: Slot) {
		const { inst, rig, layer } = slot;
		if (!inst || !rig || !this.renderer) return;
		this.renderer.render(inst.scene, inst.camera);
		layer?.update(inst.camera, slot.width, slot.height);
		const { dataset } = slot.view;
		const yaw = String(rig.yawDegrees);
		const pitch = String(rig.pitchDegrees);
		if (dataset.yaw !== yaw) dataset.yaw = yaw;
		if (dataset.pitch !== pitch) dataset.pitch = pitch;
	}

	/** Draws `slot` once and keeps the picture as its poster, so an idle Stage never looks empty. */
	private snapshot(slot: Slot) {
		this.render(slot);
		try {
			const url = this.renderer!.domElement.toDataURL('image/jpeg', 0.84);
			slot.view.style.setProperty('--poster', `url("${url}")`);
		} catch {
			/* A poster is a nicety. */
		}
	}

	private activate(next: Slot | null) {
		if (next === this.active) return;
		const previous = this.active;
		this.active = null;
		if (previous && this.renderer) {
			if (previous.inst) this.snapshot(previous);
			this.renderer.domElement.remove();
			this.mark(previous, 'idle');
		}
		if (next) this.claim(next);
		this.invalidate();
	}

	private claim(slot: Slot) {
		const renderer = this.ensureRenderer();
		if (!renderer || !this.ensureScene(slot)) return;
		if (!this.fit(slot)) return;
		slot.view.prepend(renderer.domElement);
		this.active = slot;
		this.mark(slot, 'live');
		this.last = 0;
	}

	private choose() {
		const now = performance.now();
		const current = this.active;
		if (current && current.pinnedUntil > now && current.ratio > 0) return;
		let best: Slot | null = null;
		let bestScore = 0;
		for (const slot of this.slots.values()) {
			if (slot.ratio < VISIBLE || slot.broken) continue;
			const score = slot.ratio + (slot === current ? 0.25 : 0);
			if (score > bestScore) {
				best = slot;
				bestScore = score;
			}
		}
		this.activate(best);
	}

	/** Renders a Stage that is about to scroll into view while the browser is idle, so it arrives with a picture. */
	private prime(slot: Slot) {
		if (!this.slots.has(slot.view) || slot === this.active || this.unsupported) return;
		if (!this.ensureRenderer() || !this.ensureScene(slot) || !this.fit(slot)) return;
		this.snapshot(slot);
		const live = this.active;
		if (live && this.fit(live)) this.render(live);
	}

	private schedule() {
		if (this.frame || !this.active || document.hidden) return;
		this.frame = requestAnimationFrame(this.tick);
	}

	private tick = (now: number) => {
		this.frame = 0;
		const slot = this.active;
		if (!slot?.inst || !slot.rig || document.hidden) return;
		const dt = this.last ? Math.min(0.05, Math.max(0, (now - this.last) / 1000)) : 1 / 60;
		this.last = now;
		const moving = slot.inst.update(dt);
		if (slot.inst.fit) slot.rig.setFit(slot.inst.fit());
		if (slot.inst.focus) slot.rig.setTarget(...slot.inst.focus());
		const orbiting = slot.rig.update(dt, moving);
		if (moving || orbiting || this.dirty) {
			this.dirty = false;
			this.render(slot);
		}
		if (moving || orbiting) this.schedule();
		else this.last = 0;
	};

	private onSeen = (entries: IntersectionObserverEntry[]) => {
		for (const entry of entries) {
			const slot = this.slots.get(entry.target as HTMLElement);
			if (slot) slot.ratio = entry.intersectionRatio;
		}
		this.choose();
	};

	private onNear = (entries: IntersectionObserverEntry[]) => {
		for (const entry of entries) {
			const slot = this.slots.get(entry.target as HTMLElement);
			if (!slot || !entry.isIntersecting || slot.primed) continue;
			slot.primed = true;
			const run = () => this.prime(slot);
			if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 });
			else setTimeout(run, 250);
		}
	};

	private onResize = (entries: ResizeObserverEntry[]) => {
		for (const entry of entries) {
			const slot = this.slots.get(entry.target as HTMLElement);
			if (slot && slot === this.active && this.fit(slot)) this.invalidate();
		}
	};

	private onVisibility = () => {
		if (!document.hidden) this.invalidate();
	};

	private onPointerDown = (event: PointerEvent) => {
		const slot = this.active;
		if (!slot?.rig || (event.pointerType === 'mouse' && event.button !== 0)) return;
		slot.rig.pointerDown(event);
		(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
		slot.view.dataset.dragging = 'true';
	};

	private onPointerMove = (event: PointerEvent) => {
		if (this.active?.rig?.pointerMove(event)) this.invalidate();
	};

	private onPointerEnd = (event: PointerEvent) => {
		const slot = this.active;
		if (!slot?.rig) return;
		slot.rig.pointerUp(event);
		if (!slot.rig.dragging) delete slot.view.dataset.dragging;
	};

	private onDoubleClick = () => {
		this.active?.rig?.reset();
		this.invalidate();
	};

	private onWheel = (event: WheelEvent) => {
		if (!this.active?.rig?.wheel(event)) return;
		event.preventDefault();
		this.invalidate();
	};
}
