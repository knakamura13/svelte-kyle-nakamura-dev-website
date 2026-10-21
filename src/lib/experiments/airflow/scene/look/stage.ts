import { AgXToneMapping, PCFShadowMap, PMREMGenerator, WebGLRenderer, type Box3, type Camera, type Material, type PerspectiveCamera, type Scene, type Texture, type WebGLRenderTarget } from 'three';
import type { SlotOptions } from '$lib/experiments/engine/controller';
import type { StageHost } from '$lib/experiments/engine/experience.svelte';
import { LabelLayer } from '$lib/experiments/engine/labels';
import type { SceneHost, SceneInput } from '$lib/experiments/engine/types';
import type { LoadHooks } from '../../load';
import type { WarmUp } from '../../sim/session';
import { detectSmallDevice } from '../../sim/device';
import type { SimsCamera } from '../camera/controls';
import { CameraOpening, type Opening } from '../camera/opening';
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
 *
 * The world is not shown until it is ready, while the page's loading screen covers it: every material is compiled first (in parallel,
 * where the browser can), then the world is warmed up out of sight (the simulation measures the device and picks its grid, with
 * nothing drawn meanwhile so the measurement is the solver's alone, and then a few frames are drawn, which compiles the passes after
 * the scene and the air's own, and lets the air get going). Then it is shown, and the opening's camera move plays (`camera/opening.ts`).
 * The host reports each step to `LoadHooks`.
 */

/** How bright the picture is before AgX maps it to the screen. */
const EXPOSURE = 1.0;

/** The least time between two frames where WebGL is drawn in software, ms. */
const SOFTWARE_FRAME_MS = 66;

/** How long the world is drawn out of sight once the simulation is ready, ms: the streaks fill the rooms and every pass has drawn once. */
const SPIN_UP_MS = 700;
/** The longest the warm-up may take, ms: past it the world is shown as it is rather than leave the visitor on the loading screen. */
const WARM_UP_LIMIT_MS = 15_000;

/**
 * Compiles every material in `scene` as the scene is drawn into the post-processing's buffer (`target`: no tone mapping and linear
 * colour, which a program is compiled for), so the first frame does not stop to compile them. Where the browser compiles in the
 * background (`KHR_parallel_shader_compile`) this waits without blocking the page, and `progress` hears the share that is ready.
 */
async function compileScene(renderer: WebGLRenderer, scene: Scene, camera: Camera, target: WebGLRenderTarget | null, progress: (share: number) => void, alive: () => boolean) {
	const previous = renderer.getRenderTarget();
	renderer.setRenderTarget(target);
	let materials: Set<Material>;
	try {
		materials = renderer.compile(scene, camera);
	} finally {
		renderer.setRenderTarget(previous);
	}
	const pending = new Set(materials);
	const total = Math.max(1, pending.size);
	const properties = renderer.properties as unknown as { get(material: Material): { currentProgram?: { isReady(): boolean } } };
	while (alive()) {
		for (const material of pending) {
			const program = properties.get(material).currentProgram;
			if (!program || program.isReady()) pending.delete(material);
		}
		progress(1 - pending.size / total);
		if (!pending.size) return;
		await new Promise((resolve) => setTimeout(resolve, 16));
	}
}

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
	/** How far the world is from ready to show (the simulation's warm-up). Absent: ready at once. */
	warmUp?(): WarmUp;
	/** The opening's camera move for the Home on show, on a view of this shape (width over height), or null for none. */
	opening?(aspect: number): Opening | null;
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
	/** Compiling the materials (nothing is drawn), warming up out of sight, or on show. */
	phase: 'compile' | 'warm-up' | 'live';
	/** When the warm-up began, and when the simulation was first ready during it, ms. */
	warmStart: number;
	warmed: number | null;
	/** Whether the opening plays once the world is on show, and the one playing. */
	playOpening: boolean;
	opening: CameraOpening | null;
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
		private readonly assets: LookAssets | null,
		private readonly hooks?: LoadHooks
	) {
		this.resizes = new ResizeObserver(() => this.resize());
		document.addEventListener('visibilitychange', this.onVisibility);
	}

	/**
	 * The tier the visitor asked for (the store's `view.quality`), or what suits the device: `?quality=` in the address wins over the
	 * guess. Asked every frame, so the guess is made once.
	 */
	private tierFor(options: SlotOptions): QualityTier {
		const asked = this.asked(options);
		if (asked) return asked;
		this.guess ??= chooseQuality({ search: location.search, small: detectSmallDevice(), cores: navigator.hardwareConcurrency, software: this.software });
		return this.guess;
	}
	private guess: QualityTier | null = null;

	/** A tier asked for by name, in the store or the address, rather than guessed. */
	private asked(options: SlotOptions): QualityTier | null {
		const view = (options.params as { view?: { quality?: string } }).view?.quality;
		if (view && isTier(view)) return view;
		this.searched ??= new URLSearchParams(location.search).get('quality') ?? '';
		return isTier(this.searched) ? this.searched : null;
	}
	/** The address's `?quality=`, read once ('' for none). */
	private searched: string | null = null;

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
			this.hooks?.failed();
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
			this.hooks?.failed();
			return () => {};
		}
		try {
			if (this.assets) {
				this.environment ??= new PMREMGenerator(renderer).fromEquirectangular(this.assets.sky).texture;
				world.setEnvironment(this.environment);
				performance.mark('airflow:sky');
			}
		} catch (error) {
			// The sky's lighting could not be made: the world is lit by its sun and fill alone, which is better than no world.
			console.error(error);
		}
		const slot: Slot = {
			view,
			options,
			world,
			labels,
			post: null,
			tier,
			quality,
			width: 0,
			height: 0,
			ratio: 1,
			claimed: null,
			camera: new Set(),
			phase: 'compile',
			warmStart: 0,
			warmed: null,
			playOpening: false,
			opening: null,
			undo: []
		};
		this.slot = slot;
		try {
			this.applyQuality(slot, tier);
		} catch (error) {
			// No post-processing (a GPU that cannot make its buffers): the world is drawn straight to the screen.
			console.error(error);
			slot.post = null;
		}
		view.prepend(renderer.domElement);
		this.listen(slot, renderer.domElement);
		this.resizes.observe(view);
		this.resize();
		this.prepare(slot).catch((error) => {
			// Whatever went wrong getting ready, the visitor is not left on the loading screen: the world is shown as it is at the next frame.
			console.error('The world could not be got ready to show.', error);
			if (this.slot !== slot) return;
			slot.phase = 'warm-up';
			slot.warmStart = -Infinity;
			this.invalidate();
		});
		return () => this.unregister();
	}

	/**
	 * Gets the world ready to show, out of sight: every material compiled in the background, then the scene drawn once into the
	 * post-processing's buffer, then one whole frame. The two draws are what is left to compile, and they hold the page while they do
	 * (the GPU's own pipelines are built as each thing first draws, and so are the shadow map's and the passes' shaders), so they are
	 * two, with the loading screen painted between them. Then the warm-up, which `tick` carries on with until the world is shown.
	 */
	private async prepare(slot: Slot) {
		const renderer = this.renderer!;
		const alive = () => this.slot === slot;
		const target = slot.post?.composer.readBuffer ?? null;
		/** Waits for the next frame to be painted, so the loading screen shows where the load has got before the page is held again. */
		const painted = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
		this.hooks?.report('compile', 0);
		try {
			await compileScene(renderer, slot.world.scene, slot.world.camera, target, (share) => this.hooks?.report('compile', 0.45 * share), alive);
		} catch (error) {
			// Whatever did not compile now compiles as it first draws, under the loading screen still.
			console.warn('The world’s shaders could not be compiled ahead of its first frame.', error);
		}
		if (!alive()) return;
		performance.mark('airflow:compiled');
		await painted();
		if (!alive()) return;
		renderer.setRenderTarget(target);
		renderer.render(slot.world.scene, slot.world.camera);
		renderer.setRenderTarget(null);
		this.hooks?.report('compile', 0.7);
		await painted();
		if (!alive()) return;
		slot.phase = 'warm-up';
		slot.warmStart = performance.now();
		this.draw(slot, 0);
		performance.mark('airflow:drawn');
		this.hooks?.report('compile', 1);
		// How the world opens is settled now, so the warm-up's frames are drawn from where the visitor will first see it, walls and all.
		const mode = this.hooks?.opening() ?? 'none';
		const { controls } = slot.world;
		// A camera the address asked for (`?camera=`) is the view: no opening moves it.
		if (mode !== 'none' && !controls.touched) {
			if (mode === 'end' || this.reduced.matches) {
				const opening = slot.world.opening?.(slot.width / Math.max(1, slot.height));
				if (opening) controls.jumpTo(opening.to);
			} else slot.playOpening = true;
		}
		this.hooks?.report('warm-up', 0);
		this.invalidate();
	}

	/**
	 * One frame of the warm-up: how far the simulation has got, and whether to draw (not while it measures the device). Once it is ready,
	 * the world is drawn out of sight for `SPIN_UP_MS` and then shown; past `WARM_UP_LIMIT_MS` it is shown as it is.
	 */
	private warm(slot: Slot, now: number): { quiet: boolean } {
		const state = slot.world.warmUp?.() ?? { share: 1, measuring: false };
		if (state.share >= 1 && slot.warmed === null) {
			slot.warmed = now;
			performance.mark('airflow:warmed');
		}
		const spun = slot.warmed === null ? 0 : Math.min(1, (now - slot.warmed) / SPIN_UP_MS);
		this.hooks?.report('warm-up', 0.85 * state.share + 0.15 * spun);
		if (spun >= 1 || now - slot.warmStart >= WARM_UP_LIMIT_MS) this.reveal(slot);
		return { quiet: state.measuring };
	}

	/** Shows the world: the loading screen goes, and the opening's drift starts, from the default view of the window's shape now. */
	private reveal(slot: Slot) {
		if (slot.phase === 'live') return;
		slot.phase = 'live';
		const opening = slot.playOpening && !slot.world.controls.touched ? slot.world.opening?.(slot.width / Math.max(1, slot.height)) : null;
		if (opening) slot.opening = new CameraOpening(slot.world.controls, opening);
		slot.playOpening = false;
		performance.mark('airflow:first-frame');
		const { dataset } = slot.view;
		dataset.state = 'live';
		// Milliseconds from the start of the navigation to the world on show: the page's load time as a visitor sees it.
		dataset.firstFrame = String(Math.round(performance.now()));
		this.hooks?.revealed(slot.opening !== null);
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
		// Resizing clears the canvas, so draw before the browser paints rather than show a blank world for a frame. (Under the loading
		// screen there is nothing to see, and a frame drawn while the warm-up measures the device would be measured with it.)
		if (slot.phase === 'live') this.draw(slot, 0);
		this.invalidate();
	}

	private schedule() {
		if (this.frame || !this.slot || document.hidden) return;
		this.frame = requestAnimationFrame(this.tick);
	}

	private tick = (now: number) => {
		this.frame = 0;
		const slot = this.slot;
		// While the materials compile nothing moves: `prepare` asks for the first frame once they are ready.
		if (!slot || document.hidden || slot.phase === 'compile') return;
		// Drawn in software, a frame takes the processor for a long time; at most about 15 a second leaves the page time between them for
		// its timers and the visitor's input.
		if (this.software && this.last && now - this.last < SOFTWARE_FRAME_MS) {
			this.schedule();
			return;
		}
		const real = this.last ? Math.max(0, (now - this.last) / 1000) : 1 / 60;
		const dt = Math.min(0.05, real);
		this.last = now;
		const tier = this.tierFor(slot.options);
		if (tier !== slot.tier) this.applyQuality(slot, tier);
		// The opening moves the camera before the world updates, so the walls are cut for where the camera is this frame. It keeps to the
		// clock, so it takes as long on a device that draws a few frames a second as on one that draws sixty (a quarter of a second at
		// most each frame, so a tab that was hidden picks up where it was).
		if (slot.opening && !slot.opening.update(Math.min(0.25, real))) slot.opening = null;
		let moving = slot.world.update(dt) || slot.opening !== null;
		let quiet = false;
		if (slot.phase === 'warm-up') {
			quiet = this.warm(slot, now).quiet;
			moving = true;
		}
		if ((moving || this.dirty) && !quiet) {
			this.dirty = false;
			this.draw(slot, dt);
		}
		if (moving) this.schedule();
		else this.last = 0;
	};

	private draw(slot: Slot, dt: number) {
		const renderer = this.renderer;
		if (!renderer || !slot.width || slot.phase === 'compile') return;
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

		// Anything the visitor does (a click or a touch anywhere, a key, the wheel) takes the camera from the opening at once: the drift
		// stops where it is, before the input itself is handled, so the input moves the camera from there.
		const takeOver = () => {
			if (!slot.opening) return;
			slot.opening.stop();
			slot.opening = null;
		};
		for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) on(window, type, takeOver, { capture: true, passive: true });

		on(canvas, 'pointerdown', (event) => {
			// The press itself focuses the world (its mousedown focuses the nearest focusable thing, the view), so the keys reach the camera
			// after a click. Focusing it from here instead would count as a script's focus, which Chrome rings as if it came from the keyboard:
			// a blue frame round the whole window after every first click.
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
