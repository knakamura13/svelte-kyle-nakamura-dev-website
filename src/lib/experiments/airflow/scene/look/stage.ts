import { AgXToneMapping, PCFShadowMap, PMREMGenerator, WebGLRenderer, type Box3, type PerspectiveCamera, type Scene, type Texture } from 'three';
import type { SlotOptions } from '$lib/experiments/engine/controller';
import type { StageHost } from '$lib/experiments/engine/experience.svelte';
import { LabelLayer } from '$lib/experiments/engine/labels';
import type { SceneHost, SceneInput } from '$lib/experiments/engine/types';
import { detectSmallDevice } from '../../sim/device';
import type { SimsCamera } from '../camera/controls';
import { disposeLookAssets, type LookAssets } from './assets';
import { Post } from './post';
import { QUALITY, SOFTWARE, chooseQuality, isSoftwareRenderer, isTier, type Quality, type QualityTier } from './quality';

/**
 * The airflow page's own host for its one full-screen world, in place of the article pages' `StageController`. It owns the WebGL
 * renderer and the post-processing, draws a frame whenever something moves (always, while the simulation runs), and hands the
 * pointer, the wheel and the keys to two owners: the tools (`scene.input`: a click pins a probe, a hold releases smoke, a press on a
 * fan drags it) take left clicks and a finger in Probe or Emit mode, and the Sims camera (`scene.controls`) takes everything else, so
 * a right drag turns the view, a middle drag pans it, the wheel zooms, and a finger pans and pinches. The keys go to the tools first,
 * then to the camera (WASD and the arrows pan, Q and E turn, + and - zoom, Home goes back to the default view).
 */

/** How bright the picture is before AgX maps it to the screen. */
const EXPOSURE = 1.0;

/** What the world needs from its host beyond what any scene gets: the CC0 assets (or null when they could not be had) and the quality tier. */
export interface WorldHost extends SceneHost {
	assets: LookAssets | null;
	quality(): Quality;
}

/** The world the host draws. */
export interface World {
	scene: Scene;
	camera: PerspectiveCamera;
	/** The Sims camera, which the host feeds the camera's share of the input. */
	controls: SimsCamera;
	/** The tools' input: left clicks and touch in Probe or Emit mode. */
	input: SceneInput;
	/** The sky's PMREM, made once the renderer exists, for the ambient light and the reflections. */
	setEnvironment(environment: Texture): void;
	setQuality(quality: Quality): void;
	/** True once after anything that casts the sun's shadow has moved, so the shadow map is drawn only then. */
	takeShadowChange(): boolean;
	/** A box round what ambient occlusion has to cover. */
	aoBox(): Box3;
	/** Keys the world handles itself after the tools and before the camera (the walls' temporary C key). */
	key?(event: KeyboardEvent): boolean;
	/** Moves everything one frame on. Returns true while anything is still moving. */
	update(dt: number): boolean;
	dispose(): void;
}

export type WorldFactory = (host: WorldHost, params: never, readout: never) => World;

interface Slot {
	view: HTMLElement;
	options: SlotOptions;
	world: World;
	labels: LabelLayer;
	post: Post | null;
	tier: QualityTier;
	quality: Quality;
	width: number;
	height: number;
	ratio: number;
	/** The pointer the tools claimed, until it lifts. */
	claimed: number | null;
	/** Pointers the camera has. */
	camera: Set<number>;
	firstFrame: boolean;
	undo: (() => void)[];
}

export class AirflowStage implements StageHost {
	private renderer: WebGLRenderer | null = null;
	private environment: Texture | null = null;
	private slot: Slot | null = null;
	private frame = 0;
	private last = 0;
	private dirty = true;
	private broken = false;
	private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');
	private readonly resizes: ResizeObserver;

	constructor(
		private readonly factory: WorldFactory,
		private readonly assets: LookAssets | null
	) {
		this.resizes = new ResizeObserver(() => this.resize());
		document.addEventListener('visibilitychange', this.onVisibility);
	}

	/** The tier the visitor asked for (the store's `view.quality`), or what suits the device: `?quality=` in the address wins over the guess. */
	private tierFor(options: SlotOptions): QualityTier {
		const asked = this.asked(options);
		if (asked) return asked;
		return chooseQuality({ search: location.search, small: detectSmallDevice(), cores: navigator.hardwareConcurrency, software: this.software });
	}

	/** A tier asked for by name, in the store or the address, rather than guessed. */
	private asked(options: SlotOptions): QualityTier | null {
		const view = (options.params as { view?: { quality?: string } }).view?.quality;
		if (view && isTier(view)) return view;
		const search = new URLSearchParams(location.search).get('quality');
		return isTier(search) ? search : null;
	}

	/** What a tier draws: its own settings, or the lighter low tier for WebGL in software when nobody asked for a tier by name. */
	private qualityFor(options: SlotOptions, tier: QualityTier): Quality {
		return this.software && !this.asked(options) ? SOFTWARE : QUALITY[tier];
	}

	/** Whether WebGL is drawn in software here (no GPU), asked once of the renderer. */
	private get software(): boolean {
		if (this.softwareRenderer === null) {
			const gl = this.renderer?.getContext();
			const info = gl?.getExtension('WEBGL_debug_renderer_info');
			const name = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
			this.softwareRenderer = isSoftwareRenderer(name);
		}
		return this.softwareRenderer;
	}
	private softwareRenderer: boolean | null = null;

	register(view: HTMLElement, options: SlotOptions) {
		if (this.slot) this.unregister();
		const renderer = this.ensureRenderer();
		if (!renderer) {
			view.dataset.state = 'unsupported';
			return () => {};
		}
		const tier = this.tierFor(options);
		const quality = this.qualityFor(options, tier);
		const labels = new LabelLayer(view.querySelector<HTMLElement>('.stage-labels') ?? view);
		let world: World;
		try {
			const host: WorldHost = {
				labels,
				reducedMotion: () => this.reduced.matches,
				compact: () => view.clientWidth < 480,
				invalidate: () => this.invalidate(),
				rect: () => view.getBoundingClientRect(),
				assets: this.assets,
				quality: () => this.slot?.quality ?? quality
			};
			world = this.factory(host, options.params as never, options.readout as never);
			performance.mark('airflow:world');
		} catch (error) {
			console.error(error);
			labels.dispose();
			view.dataset.state = 'error';
			this.broken = true;
			return () => {};
		}
		if (this.assets) {
			this.environment ??= new PMREMGenerator(renderer).fromEquirectangular(this.assets.sky).texture;
			world.setEnvironment(this.environment);
			performance.mark('airflow:sky');
		}
		const slot: Slot = { view, options, world, labels, post: null, tier, quality, width: 0, height: 0, ratio: 1, claimed: null, camera: new Set(), firstFrame: true, undo: [] };
		this.slot = slot;
		this.applyQuality(slot, tier);
		view.prepend(renderer.domElement);
		this.listen(slot, renderer.domElement);
		this.resizes.observe(view);
		this.resize();
		this.invalidate();
		return () => this.unregister();
	}

	private unregister() {
		const slot = this.slot;
		if (!slot) return;
		this.slot = null;
		cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.resizes.unobserve(slot.view);
		for (const undo of slot.undo) undo();
		slot.post?.dispose();
		slot.labels.dispose();
		slot.world.dispose();
		this.renderer?.domElement.remove();
	}

	invalidate() {
		this.dirty = true;
		this.schedule();
	}

	destroy() {
		this.unregister();
		document.removeEventListener('visibilitychange', this.onVisibility);
		this.resizes.disconnect();
		this.environment?.dispose();
		this.environment = null;
		if (this.assets) disposeLookAssets(this.assets);
		this.renderer?.dispose();
		this.renderer?.forceContextLoss();
		this.renderer?.domElement.remove();
		this.renderer = null;
	}

	private ensureRenderer() {
		if (this.renderer || this.broken) return this.renderer;
		try {
			const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
			renderer.toneMapping = AgXToneMapping;
			renderer.toneMappingExposure = EXPOSURE;
			renderer.shadowMap.enabled = true;
			renderer.shadowMap.type = PCFShadowMap;
			// The sun's shadow is drawn only when something that casts it moves (`World.takeShadowChange`), not every frame.
			renderer.shadowMap.autoUpdate = false;
			renderer.shadowMap.needsUpdate = true;
			const canvas = renderer.domElement;
			canvas.setAttribute('aria-hidden', 'true');
			canvas.addEventListener('webglcontextrestored', () => this.invalidate());
			this.renderer = renderer;
		} catch (error) {
			console.warn('WebGL is not available, so the 3D world is switched off.', error);
			this.broken = true;
		}
		return this.renderer;
	}

	/** Builds the post-processing and sets the pixel ratio and the shadows for a tier. */
	private applyQuality(slot: Slot, tier: QualityTier) {
		const renderer = this.renderer!;
		slot.tier = tier;
		slot.quality = this.qualityFor(slot.options, tier);
		slot.ratio = Math.min(window.devicePixelRatio || 1, slot.quality.pixelRatio);
		renderer.setPixelRatio(slot.ratio);
		slot.world.setQuality(slot.quality);
		slot.post?.dispose();
		slot.post = new Post(renderer, slot.world.scene, slot.world.camera, slot.quality, { width: Math.max(1, slot.width), height: Math.max(1, slot.height), ratio: slot.ratio });
		slot.post.setClipBox(slot.world.aoBox());
		renderer.shadowMap.needsUpdate = true;
		slot.view.dataset.quality = tier;
		this.dirty = true;
	}

	private resize() {
		const slot = this.slot;
		const renderer = this.renderer;
		if (!slot || !renderer) return;
		const width = Math.round(slot.view.clientWidth);
		const height = Math.round(slot.view.clientHeight);
		if (!width || !height) return;
		slot.width = width;
		slot.height = height;
		renderer.setPixelRatio(slot.ratio);
		renderer.setSize(width, height, false);
		slot.post?.setSize(width, height, slot.ratio);
		slot.world.controls.setAspect(width / height);
		// Resizing clears the canvas, so draw before the browser paints rather than show a blank world for a frame.
		this.draw(slot, 0);
		this.invalidate();
	}

	private schedule() {
		if (this.frame || !this.slot || document.hidden) return;
		this.frame = requestAnimationFrame(this.tick);
	}

	private tick = (now: number) => {
		this.frame = 0;
		const slot = this.slot;
		if (!slot || document.hidden) return;
		const dt = this.last ? Math.min(0.05, Math.max(0, (now - this.last) / 1000)) : 1 / 60;
		this.last = now;
		const tier = this.tierFor(slot.options);
		if (tier !== slot.tier) this.applyQuality(slot, tier);
		const moving = slot.world.update(dt);
		if (moving || this.dirty) {
			this.dirty = false;
			this.draw(slot, dt);
		}
		if (moving) this.schedule();
		else this.last = 0;
	};

	private draw(slot: Slot, dt: number) {
		const renderer = this.renderer;
		if (!renderer || !slot.width) return;
		if (slot.world.takeShadowChange()) renderer.shadowMap.needsUpdate = true;
		if (slot.post) slot.post.render(dt);
		else renderer.render(slot.world.scene, slot.world.camera);
		slot.labels.update(slot.world.camera, slot.width, slot.height);
		const { dataset } = slot.view;
		const controls = slot.world.controls;
		const marks: Record<string, string> = {
			yaw: String(controls.yawDegrees),
			pitch: String(controls.pitchDegrees),
			zoom: controls.goal.zoom.toFixed(2),
			focus: `${controls.goal.x.toFixed(2)},${controls.goal.z.toFixed(2)}`
		};
		for (const [key, value] of Object.entries(marks)) if (dataset[key] !== value) dataset[key] = value;
		if (slot.firstFrame) {
			slot.firstFrame = false;
			performance.mark('airflow:first-frame');
			dataset.state = 'live';
			// Milliseconds from the start of the navigation to the first frame of the world: the page's load time as a visitor sees it.
			dataset.firstFrame = String(Math.round(performance.now()));
		}
	}

	private onVisibility = () => {
		if (document.hidden) return;
		this.last = 0;
		this.invalidate();
	};

	/** The pointer's position in normalized device coordinates of the canvas: x and y from -1 to 1, y up. */
	private ndc(event: PointerEvent | MouseEvent, canvas: HTMLElement) {
		const box = canvas.getBoundingClientRect();
		return { x: ((event.clientX - box.left) / box.width) * 2 - 1, y: -(((event.clientY - box.top) / box.height) * 2 - 1) };
	}

	private listen(slot: Slot, canvas: HTMLCanvasElement) {
		const { world, view } = slot;
		const controls = world.controls;
		const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Window, type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) => {
			target.addEventListener(type, handler as EventListener, options);
			slot.undo.push(() => target.removeEventListener(type, handler as EventListener, options));
		};
		canvas.style.touchAction = 'none';

		on(canvas, 'pointerdown', (event) => {
			view.focus({ preventScroll: true });
			const ndc = this.ndc(event, canvas);
			const mouse = event.pointerType === 'mouse';
			// A right or middle press, or Alt with the left, is the camera's: turn and tilt, or pan.
			if (mouse && (event.button === 1 || event.button === 2 || (event.button === 0 && event.altKey))) {
				if (controls.pointerDown(event)) {
					slot.camera.add(event.pointerId);
					canvas.setPointerCapture?.(event.pointerId);
					view.dataset.dragging = 'true';
				}
				if (event.button === 1) event.preventDefault();
				this.invalidate();
				return;
			}
			if (mouse && event.button !== 0) return;
			// A left press or a finger goes to the tools first: a fan or one of its handles, a probe, smoke.
			if (world.input.pointer('down', event, ndc)) {
				slot.claimed = event.pointerId;
				canvas.setPointerCapture?.(event.pointerId);
				this.invalidate();
				return;
			}
			// A finger the tools did not take pans the camera (two pinch and twist). A left press the tools did not take stays theirs to
			// time (a click pins, a hold releases smoke), and is reported as it moves and lifts.
			if (!mouse && controls.pointerDown(event)) {
				slot.camera.add(event.pointerId);
				view.dataset.dragging = 'true';
			}
			canvas.setPointerCapture?.(event.pointerId);
			this.invalidate();
		});

		on(canvas, 'pointermove', (event) => {
			const ndc = this.ndc(event, canvas);
			world.input.pointer('move', event, ndc);
			if (slot.claimed !== event.pointerId) controls.pointerMove(event);
			this.invalidate();
		});

		const end = (event: PointerEvent) => {
			const ndc = this.ndc(event, canvas);
			if (slot.claimed === event.pointerId) {
				slot.claimed = null;
				world.input.pointer('up', event, ndc);
				this.invalidate();
				return;
			}
			world.input.pointer('up', event, ndc);
			controls.pointerUp(event);
			slot.camera.delete(event.pointerId);
			if (!slot.camera.size) delete view.dataset.dragging;
			this.invalidate();
		};
		on(canvas, 'pointerup', end);
		on(canvas, 'pointercancel', end);

		on(canvas, 'pointerleave', (event) => {
			if (slot.claimed !== null) return;
			world.input.pointer('leave', event, this.ndc(event, canvas));
			this.invalidate();
		});

		on(canvas, 'dblclick', (event) => {
			if (controls.flyTo(this.ndc(event, canvas))) this.invalidate();
		});

		on(
			canvas,
			'wheel',
			(event) => {
				if (!controls.wheel(event)) return;
				event.preventDefault();
				this.invalidate();
			},
			{ passive: false }
		);

		// A right drag turns the camera, so the browser's menu stays shut over the world.
		on(canvas, 'contextmenu', (event) => event.preventDefault());

		// The tools take a key first (the cursor in Probe or Emit mode), then the world (C steps the wall mode), then the camera.
		const key = (event: KeyboardEvent) => {
			if (event.target !== view) return;
			const used = world.input.key?.(event) || (event.type === 'keydown' && world.key?.(event)) || controls.key(event);
			if (!used) return;
			event.preventDefault();
			this.invalidate();
		};
		on(view, 'keydown', key);
		on(view, 'keyup', key);
		// Keys held when the page loses focus never send their release, so the camera would pan on for ever.
		const letGo = () => {
			controls.releaseKeys();
			controls.release();
		};
		on(window, 'blur', letGo);
		on(view, 'blur', () => controls.releaseKeys());
	}
}
