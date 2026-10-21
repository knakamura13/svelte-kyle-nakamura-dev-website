import { PerspectiveCamera, Scene } from 'three';
import { disposeTree, studio } from '$lib/experiments/engine/kit';
import type { Label } from '$lib/experiments/engine/labels';
import type { RigSetup, SceneFactory } from '$lib/experiments/engine/types';
import type { DeviceModel } from '../devices/types';
import type { HomePlan } from '../homes/types';
import type { AirflowReadout } from '../readouts';
import { chooseBackend } from '../sim/backends';
import { cellFromSearch, detectSmallDevice } from '../sim/device';
import { SimulationSession, type SessionParams } from '../sim/session';
import { effectiveOpenings } from '../sim/world';
import type { OverlayId, Quality } from '../state';
import { createAir } from './air';
import { DeviceEditor, type Grab } from './deviceEditor';
import { DeviceMeshes } from './deviceMeshes';
import type { Point3 } from './deviceMath';
import { Dollhouse, dollhouseRig } from './dollhouse';
import { AirflowInput } from './input';
import { chooseQuality, type QualityTier } from './look/quality';
import { Markers } from './markers';
import { pointOnPlane, pointOnSurface } from './pick';

/** The Stage's tint: the site's mist, so the 3D view matches the page around it. */
const TINT = 0xdde7ee;

/** How far outside the footprint the compass letters sit, m: past the outside walls, which are 0.2 m thick. */
const COMPASS_OFFSET = 0.7;

/**
 * What the scene reads and calls. The page's `AirflowExperience` is this object: the scene reads `setup`, `view`,
 * `clock`, `probes`, `emission` and the rest each frame, and writes `readout`.
 */
export interface AirflowSceneParams extends SessionParams {
	plans: readonly HomePlan[];
	models: readonly DeviceModel[];
	/** Pins a probe at a point of the slice. Returns its id, or null when the home already holds the most it allows. */
	pin(point: Point3): string | null;
	/** Takes back a probe that was pinned by mistake, without a word. */
	unpin(id: string, quiet?: boolean): void;
	/** Says whether smoke is being released; the point it comes from goes to the session. */
	setEmitting(on: boolean): void;
	/** Tells a screen reader something the simulation did on its own. */
	announce(message: string): void;
	/** The device whose handles are showing, and the one being dragged from the Dock's tray with where it would land (null for neither). */
	selected: string | null;
	drag: { model: string; x: number; y: number; z: number; ok: boolean; reason: string | null } | null;
	selectDevice(id: string | null): void;
	/** Moves a placed device to where the pointer took it, turns it to face a bearing, aims it up or down. Each says what it did, politely, once the visitor stops. */
	moveDevice(id: string, x: number, z: number): string | null;
	turnDevice(id: string, yaw: number): void;
	aimDevice(id: string, tilt: number): void;
	/** What the Dock needs from the Stage to drag a device in from its tray: whether a screen point is over the Stage, and the floor or furniture it is over. */
	bridge: { pick?: (clientX: number, clientY: number) => Point3 | null; over?: (clientX: number, clientY: number) => boolean };
}

/** Everything that belongs to one home, so a new plan swaps it as a piece. */
interface House {
	plan: HomePlan;
	dollhouse: Dollhouse;
	labels: Label[];
}

/**
 * The airflow Stage: the home as a dollhouse with the simulation drawn into it: the air (scene/air: streaks that ride it, the
 * smoke, and the overlays, which colour the streaks), the fans and purifiers, and the rings and pins the visitor places. No plane is
 * drawn. The pointer and the keys read the air at the slice's height, pin probes and release smoke there (`input.ts`); the slice is
 * still read for that, and for the hover readout. Everything is in the solver's metres, so nothing is converted between the two.
 *
 * It owns the `SimulationSession`: that builds the world and steps it each frame this runs, and this draws the newest
 * snapshot it has. A home or a restart that needs a new world keeps the old air out of the way until the new world's first
 * volume, so the air of one home never lies over another.
 */
export const createAirflowScene: SceneFactory<AirflowSceneParams, AirflowReadout> = (host, params, readout) => {
	const scene = new Scene();
	// The rig pulls the camera back by the home's width on a narrow Stage (77 m for the house at 390 px), so the kit's usual
	// fog would wash the home out. The kit's floor pool sits inside the dollhouse, whose plinth runs down to -0.16.
	studio(scene, TINT, { pool: 22, poolY: -0.17, fog: [200, 500] });
	const camera = new PerspectiveCamera(30, 1, 0.1, 400);
	const models = new Map(params.models.map((model) => [model.id, model]));
	const planOf = (id: string) => params.plans.find((plan) => plan.id === id) ?? params.plans[0];

	// The grid is the device's to say: measured by the tuner, the coarsest on a phone or a small tablet, or exactly what `?cell=0.15` asks for.
	const backend = chooseBackend({ small: detectSmallDevice(), fixedCell: cellFromSearch(location.search) });
	// The air is drawn from a volume of the whole box (scene/air), so the backend's own tracers and smoke particles are not kept.
	const session = new SimulationSession({
		params,
		plans: params.plans,
		models: params.models,
		make: backend.make,
		cellSize: (plan) => backend.cellSize(plan),
		tuning: backend,
		readout,
		invalidate: host.invalidate,
		reducedMotion: host.reducedMotion,
		announce: (message) => params.announce(message),
		particles: false,
		volume: true
	});
	const devices = new DeviceMeshes(models);
	const markers = new Markers(host.labels);
	scene.add(devices.group, markers.group);
	/** The tier `auto` stands for on this device, worked out once. */
	const autoTier = chooseQuality({ search: location.search, small: detectSmallDevice(), cores: navigator.hardwareConcurrency });
	const tierOf = (quality: Quality): QualityTier => (quality === 'auto' ? autoTier : quality);

	function buildHouse(plan: HomePlan): House {
		const dollhouse = new Dollhouse(plan, { furniture: params.setup.furniture, tint: TINT });
		scene.add(dollhouse.group);
		const labels: Label[] = dollhouse.roomAnchors.map((anchor) => {
			const label = host.labels.add({ name: anchor.name, tone: 'room', side: 'above' });
			label.position.copy(anchor.position);
			return label;
		});
		const letters: [string, number, number][] = [
			['N', plan.width / 2, -COMPASS_OFFSET],
			['E', plan.width + COMPASS_OFFSET, plan.depth / 2],
			['S', plan.width / 2, plan.depth + COMPASS_OFFSET],
			['W', -COMPASS_OFFSET, plan.depth / 2]
		];
		for (const [name, x, z] of letters) {
			const label = host.labels.add({ name, tone: 'compass', side: 'above' });
			label.position.set(x, 0, z);
			labels.push(label);
		}
		return { plan, dollhouse, labels };
	}

	function disposeHouse(old: House) {
		for (const label of old.labels) host.labels.remove(label);
		old.dollhouse.dispose();
	}

	let house = buildHouse(planOf(params.setup.plan));
	const air = createAir({
		scene,
		camera,
		world: () => (session.world?.raster.plan.id === house.plan.id ? session.world : null),
		muted: () => [house.dollhouse.group, devices.group],
		quality: tierOf(params.view.quality)
	});
	let overlay: { kind: OverlayId; sensitivity: number } | null = null;
	let quality = params.view.quality;
	const editor = new DeviceEditor({
		camera,
		devices,
		models,
		height: () => host.rect().height,
		surfaces: () => house.dollhouse.pickables,
		footprint: () => house.plan,
		select: (id) => params.selectDevice(id),
		move: (id, x, z) => void params.moveDevice(id, x, z),
		turn: (id, yaw) => params.turnDevice(id, yaw),
		aim: (id, tilt) => params.aimDevice(id, tilt)
	});
	scene.add(editor.group);
	// The Dock drags a device in from its tray: it asks the Stage where a point on the screen lands, in the Stage's own metres.
	const ndcOf = (clientX: number, clientY: number) => {
		const box = host.rect();
		return { x: ((clientX - box.left) / box.width) * 2 - 1, y: -(((clientY - box.top) / box.height) * 2 - 1) };
	};
	params.bridge.over = (clientX, clientY) => {
		const box = host.rect();
		return clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
	};
	params.bridge.pick = (clientX, clientY) => pointOnSurface(camera, ndcOf(clientX, clientY), house.plan, house.dollhouse.pickables);
	let openings = '';
	let mode = params.view.mode;
	let framed: { plan: string; topDown: boolean; setup: RigSetup } | null = null;
	let lastUpdate = 0;

	/** The height the pointer reads the air at, pins a probe and releases smoke: the cell layer the slice snapped to, or the height asked for before the first slice. Nothing is drawn there. */
	const planeY = () => session.latest.slice?.y ?? params.view.sliceHeight;

	const input = new AirflowInput({
		mode: () => params.view.mode,
		pick: (at) => pointOnPlane(camera, at, planeY(), house.plan, house.dollhouse.pickables),
		plane: () => ({ width: house.plan.width, depth: house.plan.depth, y: planeY() }),
		read: (point) => session.hover(point.x, point.z),
		hover: (point, reading) => {
			markers.setHover(point);
			readout.hover = reading;
		},
		pin: (point) => params.pin(point),
		unpin: (id) => params.unpin(id, true),
		emit: (point) => {
			session.setEmitPoint(point);
			params.setEmitting(point !== null);
			markers.setSmoke(point);
		},
		now: () => performance.now(),
		grab: (at) => editor.grabAt(at, params.selected),
		dragGrab: (grab, at, phase) => {
			const held = grab as Grab;
			editor.dragTo(held, at, phase, params.setup.devices.find((d) => d.id === held.id));
		}
	});

	return {
		scene,
		camera,
		rig: dollhouseRig(house.plan, params.view.topDown),
		input,
		framing() {
			const { topDown } = params.view;
			if (!framed || framed.plan !== house.plan.id || framed.topDown !== topDown) framed = { plan: house.plan.id, topDown, setup: dollhouseRig(house.plan, topDown) };
			return framed.setup;
		},
		update(dt) {
			const { setup, view } = params;
			if (setup.plan !== house.plan.id) {
				input.reset();
				disposeHouse(house);
				house = buildHouse(planOf(setup.plan));
				openings = '';
			}
			if (view.mode !== mode) {
				mode = view.mode;
				input.reset();
			}
			const reduced = host.reducedMotion();
			// The Stage caps the `dt` it hands over at 50 ms so that an animation never jumps. The session and the tuner want how long the frame really
			// took: a page drawing at 8 frames a second is not at 20, and a tab that was hidden for a minute is not one slow frame.
			const now = performance.now();
			const real = lastUpdate ? (now - lastUpdate) / 1000 : dt;
			lastUpdate = now;
			let moving = session.update(real);

			// The home follows the setup: furniture, plan view, and every door and window as far open as the solver has it.
			const { dollhouse } = house;
			dollhouse.setTopDown(view.topDown);
			dollhouse.setFurniture(setup.furniture);
			const amounts = Object.fromEntries(effectiveOpenings(house.plan, setup, models));
			const signature = JSON.stringify(amounts);
			if (signature !== openings) {
				openings = signature;
				dollhouse.setOpenings(amounts);
			}

			// The newest volume, but only once it is of this home. No plane is drawn: the air fills the rooms instead (scene/air). The
			// slice is still read, for the hover readout and the height a probe or a puff of smoke is placed at.
			const { latest, world } = session;
			const live = !!world && world.raster.plan.id === house.plan.id;
			if (!overlay || overlay.kind !== view.overlay || overlay.sensitivity !== view.sensitivity) {
				overlay = { kind: view.overlay, sensitivity: view.sensitivity };
				air.setOverlay(view.overlay, { sensitivity: view.sensitivity });
			}
			if (view.quality !== quality) {
				quality = view.quality;
				air.setQuality(tierOf(quality));
			}
			air.setStreaks(view.tracers);
			// The streaks move with the air in real time, as the air would carry them; a paused clock holds them where they are.
			if (air.update(live ? latest.volume : null, params.clock.paused ? 0 : Math.min(real, 0.05))) moving = true;

			devices.update(setup.devices, session.simTime, planeY(), params.selected);
			editor.update(setup.devices.find((d) => d.id === params.selected));
			editor.setGhost(params.drag);
			markers.syncProbes(params.probes, readout.probes, view.units);
			markers.update(dt, reduced);

			// Settle the walls at the camera (all at once for reduced motion), and keep drawing while anything still moves.
			const easing = dollhouse.update(camera, reduced ? Infinity : dt);
			if (input.tick()) moving = true;
			return moving || easing || markers.animating;
		},
		dispose() {
			input.reset();
			readout.hover = null;
			air.dispose();
			session.dispose();
			backend.dispose();
			disposeHouse(house);
			markers.dispose();
			editor.dispose();
			devices.dispose();
			disposeTree(scene);
		}
	};
};
