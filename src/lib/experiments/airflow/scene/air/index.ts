import { AmbientLight, Color, DirectionalLight, Group, HemisphereLight, Vector3, type Object3D, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import type { World } from '../../sim/world';
import type { Volume } from '../../solver/volume';
import type { OverlayId } from '../../state';
import type { QualityTier } from '../look/quality';
import { RENDER_ORDER } from '../renderOrder';
import { DepthPrepass } from './depth';
import { AirFields } from './fields';
import { MarchTarget } from './march';
import { solidMask, type SolidMask } from './mask';
import { Mute, Overlay } from './overlay';
import { SMOKE_STEPS, SmokePuffs, SmokeVolume, smokeBounds, type PuffLook, type SmokeLighting } from './smokeVolume';
import { STREAK_COUNTS, STREAK_PIXELS, Streaks, type StreakLook } from './streaks';

export { STREAK_AIR, overlayLegend, streakColor, type OverlayLegend, type OverlayLegendOptions } from './legend';
export { STREAK_COUNTS } from './streaks';

/**
 * The air, drawn from the solver: streaks that ride the simulated air through every room, and the PM2.5 as smoke. An overlay (Air
 * speed, Temperature or Smoke) colours the streaks by its quantity, with a faint haze of the same colours through the rooms, and
 * mutes the world's colours a little; Off adds nothing. No plane is drawn. Everything that moves here moves because the solver's air
 * does; nothing drifts on its own.
 *
 * The scene hands it each volume the session reads (`SessionOptions.volume`) with the real seconds the air should move this frame
 * (0 while the clock is paused, which holds the streaks still). Its GPU work (moving the streaks, the depth pre-pass that the smoke
 * and the haze stop at) runs at the start of each render of `camera`, from the scene's `onBeforeRender`, because that is where
 * the renderer is to be had; any other render of the scene (a pass with an override material, another camera) leaves the air out.
 */

export interface AirOptions {
	scene: Scene;
	camera: PerspectiveCamera;
	/** The running world, whose geometry keeps the streaks out of walls and furniture, or null before there is one. */
	world: () => World | null;
	/** What is muted a little while an overlay is on: the home, its furniture and the devices. */
	muted?: () => Iterable<Object3D>;
	/** The sun the smoke is lit by. Absent: the brightest directional light in the scene, looked for again now and then. */
	sun?: DirectionalLight;
	quality?: QualityTier;
	/** What the tier asks of the air's look beyond its defaults (`look/quality.ts`). */
	look?: AirLook;
}

/**
 * What a quality tier may ask of the air's look, where it differs from the air's defaults for that tier: the streaks' number, the
 * narrowest and widest they are drawn (CSS pixels), their opacity and tails, and the smoke puffs' number, size and opacity. A phone's
 * low tier draws fewer, coarser pixels, so it asks for bolder air.
 */
export interface AirLook {
	streaks?: StreakLook & { count?: number; pixels?: readonly [number, number] };
	puffs?: PuffLook;
}

export interface Air {
	/** Everything the air draws; the scene holds it. */
	readonly group: Group;
	/** Takes the newest volume (null when there is none of the running world) and moves the air on by `dt` real seconds. Returns true while it needs frames to settle. */
	update(volume: Volume | null, dt: number): boolean;
	/** Off, or the quantity the overlay colours the streaks and the haze by, at the view's sensitivity (default 0.5). */
	setOverlay(kind: OverlayId, options?: { sensitivity?: number }): void;
	/** The tier's streak count and smoke (puffs on low), and what it asks of the look (`AirLook`). */
	setQuality(tier: QualityTier, look?: AirLook): void;
	/** Whether the streaks are drawn (the Dock's Tracers). */
	setStreaks(on: boolean): void;
	dispose(): void;
}

/** How often the lights are looked for again, in updates: a light added or replaced is picked up within a second. */
const LIGHT_REFRESH = 60;

const from = new Vector3();
const to = new Vector3();
const part = new Color();

/** The sun and the sky as three.js lights them, in the units a lit surface reads them in (radiance from a white Lambert surface). */
function readLights(scene: Scene, out: SmokeLighting, found: { sun: DirectionalLight | null; fills: (HemisphereLight | AmbientLight)[] }) {
	const sun = found.sun;
	if (sun && sun.parent) {
		sun.getWorldPosition(from);
		sun.target.getWorldPosition(to);
		out.sunDirection.subVectors(from, to).normalize();
		out.sun.copy(sun.color).multiplyScalar(sun.intensity / Math.PI);
	} else {
		out.sunDirection.set(-0.4, 0.75, 0.5).normalize();
		out.sun.setRGB(0.6, 0.58, 0.55);
	}
	out.sky.setRGB(0, 0, 0);
	for (const fill of found.fills) {
		if (!fill.parent || !fill.visible) continue;
		if (fill instanceof HemisphereLight) part.copy(fill.color).add(fill.groundColor).multiplyScalar(0.5 * fill.intensity / Math.PI);
		else part.copy(fill.color).multiplyScalar(fill.intensity / Math.PI);
		out.sky.add(part);
	}
	// An environment map lights the world as well; it is not read, only taken as a soft sky of its intensity.
	if (scene.environment) out.sky.add(part.setScalar(0.35 * (scene.environmentIntensity ?? 1)));
	if (out.sky.r + out.sky.g + out.sky.b < 0.05) out.sky.setRGB(0.32, 0.33, 0.35);
}

/** The sun (the one given, or the brightest directional light) and the fills that light the smoke. */
function findLights(scene: Scene, given?: DirectionalLight) {
	let sun: DirectionalLight | null = given ?? null;
	const fills: (HemisphereLight | AmbientLight)[] = [];
	scene.traverseVisible((object) => {
		if (object instanceof DirectionalLight && !given && (!sun || object.intensity > sun.intensity)) sun = object;
		else if (object instanceof HemisphereLight || object instanceof AmbientLight) fills.push(object);
	});
	return { sun: sun as DirectionalLight | null, fills };
}

export function createAir(options: AirOptions): Air {
	const { scene, camera } = options;
	const group = new Group();
	group.name = 'air';
	scene.add(group);

	const fields = new AirFields();
	const depth = new DepthPrepass();
	const march = new MarchTarget(depth.uniforms);
	let tier: QualityTier = options.quality ?? 'high';
	let look: AirLook = options.look ?? {};
	let precise = true;
	const streaks = new Streaks(look.streaks?.count ?? STREAK_COUNTS[tier], fields, precise);
	streaks.setPixels(look.streaks?.pixels ?? STREAK_PIXELS[tier]);
	streaks.setLook(look.streaks);
	const smoke = new SmokeVolume(fields, depth.uniforms, march.size);
	const overlay = new Overlay(fields, depth.uniforms, march.size);
	let puffs: SmokePuffs | null = null;
	// Every lit material of the world gets the mute's line before it is first drawn, so an overlay never waits for a shader.
	const mute = new Mute();
	if (options.muted) mute.prepare(options.muted());
	// The overlay's haze, then the smoke over it, are marched into their own target; that is laid over the world, and the streaks over all.
	overlay.mesh.renderOrder = 0;
	smoke.mesh.renderOrder = 1;
	march.scene.add(overlay.mesh, smoke.mesh);
	march.composite.renderOrder = RENDER_ORDER.march;
	streaks.mesh.renderOrder = RENDER_ORDER.streaks;
	group.add(march.composite, streaks.mesh);

	let world: World | null = null;
	let revision = -1;
	let mask: SolidMask | null = null;
	let pending = 0;
	let prepared = false;
	let configured = false;
	let busy = false;
	let showStreaks = true;
	let sensitivity = 0.5;
	let kind: OverlayId = 'off';
	let lights = findLights(scene, options.sun);
	let sinceLights = 0;
	const lighting: SmokeLighting = { sunDirection: new Vector3(0, 1, 0), sun: new Color(), sky: new Color() };
	const box = new Vector3(1, 1, 1);
	let finest = 0.15;

	const setSmokeMode = () => {
		const low = tier === 'low';
		// A tier that asks for another number of puffs gets a new set of them.
		if (puffs && low && look.puffs?.count !== undefined && puffs.field.count !== look.puffs.count) {
			group.remove(puffs.mesh);
			puffs.dispose();
			puffs = null;
		}
		if (low && !puffs) {
			puffs = new SmokePuffs(fields, precise, look.puffs?.count);
			puffs.setLook(look.puffs);
			puffs.mesh.renderOrder = RENDER_ORDER.puffs;
			group.add(puffs.mesh);
			if (fields.newest && world) puffs.births(fields.newest, world.raster);
		} else if (!low && puffs) {
			group.remove(puffs.mesh);
			puffs.dispose();
			puffs = null;
		}
		smoke.setMaxSteps(low ? 1 : SMOKE_STEPS[tier as 'high' | 'medium']);
	};
	setSmokeMode();

	/** The GPU's part of a frame, at the start of a render of the camera: the streaks move, then the depth that the marches stop at. */
	const previous = scene.onBeforeRender;
	// A scene's hook is called with the renderer, the scene, the camera and the render target, though it is typed as an object's.
	scene.onBeforeRender = function (this: Scene, ...args: Parameters<Scene['onBeforeRender']>) {
		previous.apply(this, args);
		const [renderer, , renderedCamera] = args;
		if (busy) return;
		const main = renderedCamera === camera && scene.overrideMaterial === null;
		group.visible = main && fields.ready && world !== null;
		if (!group.visible || prepared) return;
		prepared = true;
		busy = true;
		const target0 = renderer.getRenderTarget();
		const face = renderer.getActiveCubeFace();
		const level = renderer.getActiveMipmapLevel();
		try {
			if (!configured) configure(renderer);
			if (streaks.mesh.visible) streaks.step(renderer, pending);
			if (puffs) puffs.step(renderer, pending);
			pending = 0;
			if ((smoke.mesh.visible && !puffs) || overlay.mesh.visible) {
				depth.render(renderer, scene, camera, group);
				march.render(renderer, camera);
			} else march.composite.visible = false;
		} finally {
			renderer.setRenderTarget(target0, face, level);
			busy = false;
		}
	};

	/** What the GPU allows, once: linear filtering of float volumes, and float particle state. */
	function configure(renderer: WebGLRenderer) {
		configured = true;
		fields.useHalfFloats(!renderer.extensions.has('OES_texture_float_linear'));
		march.setPrecision(renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
		if (!renderer.extensions.has('EXT_color_buffer_float')) {
			precise = false;
			console.warn('This GPU cannot draw into float textures, so the streaks keep their positions at half precision.');
			streaks.setCount(streaks.count, false);
			if (puffs) {
				group.remove(puffs.mesh);
				puffs.dispose();
				puffs = null;
				setSmokeMode();
			}
		}
	}

	function adoptWorld(next: World | null) {
		world = next;
		revision = -1;
		fields.clear();
		streaks.reset();
		puffs?.reset();
		smoke.mesh.visible = false;
	}

	return {
		group,
		update(volume, dt) {
			prepared = false;
			if (options.muted) mute.prepare(options.muted());
			const running = options.world();
			if (running !== world) adoptWorld(running);
			if (!world) return false;
			const { raster } = world;
			const { spec } = raster;
			// A volume of another grid (the world before this one) is not drawn over this one.
			if (!volume || volume.h !== spec.h || volume.nx * volume.sx < spec.nx || volume.ny * volume.sy < spec.ny || volume.nz * volume.sz < spec.nz) return false;
			if (world.revision !== revision) {
				revision = world.revision;
				mask = solidMask(spec, raster.geometry, mask);
				fields.setMask(mask, { width: raster.plan.width, ceiling: raster.plan.ceiling, depth: raster.plan.depth });
				box.set(raster.plan.width, raster.plan.ceiling, raster.plan.depth);
				finest = Math.min(volume.sx, volume.sy, volume.sz) * volume.h;
				overlay.setBox(box, finest);
			}
			const now = performance.now() / 1000;
			if (volume !== fields.newest) {
				fields.push(volume, now);
				streaks.births(volume, raster);
				puffs?.births(volume, raster);
				smoke.setBounds(smokeBounds(fields.older && fields.older !== volume ? [fields.older, volume] : [volume]), box, finest);
			}
			const blend = fields.tick(now);
			pending = Math.min(0.1, pending + Math.max(0, dt));
			// The smoke's detail rides the air as the streaks do, and holds still with them while the clock is paused.
			smoke.advance(dt);
			if (++sinceLights >= LIGHT_REFRESH || (lights.sun && !lights.sun.parent)) {
				lights = findLights(scene, options.sun);
				sinceLights = 0;
			}
			readLights(scene, lighting, lights);
			smoke.setLighting(lighting);
			puffs?.setLighting(lighting);
			// Puffs drawn at low quality stand in for the volume.
			if (puffs) smoke.mesh.visible = false;
			return blend < 1;
		},
		setOverlay(next, settings = {}) {
			kind = next;
			if (settings.sensitivity !== undefined) sensitivity = settings.sensitivity;
			overlay.setKind(next, sensitivity);
			streaks.setOverlay(next, sensitivity);
			if (next === 'off') mute.restore();
			else if (options.muted) mute.apply();
		},
		setQuality(next, nextLook = {}) {
			if (next === tier && nextLook === look) return;
			tier = next;
			look = nextLook;
			streaks.setCount(look.streaks?.count ?? STREAK_COUNTS[tier]);
			streaks.setPixels(look.streaks?.pixels ?? STREAK_PIXELS[tier]);
			streaks.setLook(look.streaks);
			puffs?.setLook(look.puffs);
			setSmokeMode();
		},
		setStreaks(on) {
			showStreaks = on;
			streaks.mesh.visible = showStreaks;
		},
		dispose() {
			scene.onBeforeRender = previous;
			mute.restore();
			scene.remove(group);
			streaks.dispose();
			smoke.dispose();
			puffs?.dispose();
			overlay.dispose();
			march.dispose();
			depth.dispose();
			fields.dispose();
		}
	};
}
