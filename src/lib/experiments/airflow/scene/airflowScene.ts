import { PerspectiveCamera, Scene } from 'three';
import { disposeTree } from '$lib/experiments/engine/kit';
import type { Label } from '$lib/experiments/engine/labels';
import type { DeviceModel } from '../devices/types';
import type { HomePlan } from '../homes/types';
import type { AirflowReadout } from '../readouts';
import { chooseBackend } from '../sim/backends';
import { cellFromSearch, detectSmallDevice } from '../sim/device';
import { SMOKE, SMOKE_DENSE, SimulationSession, TRACERS, type SessionParams } from '../sim/session';
import { effectiveOpenings } from '../sim/world';
import type { View } from '../state';
import { ARROW_SPACING, DirectionArrows } from './arrows';
import { FOV, SimsCamera } from './camera/controls';
import { PITCH_MAX, cameraFromSearch, clampTilt, pitchAt } from './camera/sims';
import { DeviceEditor, type Grab } from './deviceEditor';
import type { Point3 } from './deviceMath';
import { DeviceMeshes } from './deviceMeshes';
import { AirflowInput } from './input';
import { Home } from './look/home';
import { Lighting } from './look/lighting';
import { Materials } from './look/materials';
import type { World, WorldHost } from './look/stage';
import { Markers } from './markers';
import { SmokePoints, TracerPoints } from './particles';
import { pointOnPlane, pointOnSurface } from './pick';
import { SliceLayer } from './sliceLayer';
import { nextWallMode } from './walls/cutaway';

/** On a compact Stage the arrows sit twice as far apart, so each stays a readable size. */
const COMPACT_SPACING = ARROW_SPACING * 2;

/** How far outside the footprint the compass letters sit, m: past the outside walls, which are 0.2 m thick. */
const COMPASS_OFFSET = 0.9;

/** Room names and compass letters show only this far out (zoom 0 is eye level, 1 bird's-eye): close in they would be in the way. */
const LABEL_ZOOM = 0.55;

/** Where a device's symbol is drawn while the slice is off: just over the floor, round its feet. */
const FLOOR_SYMBOLS = 0.02;

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
	/** Changes how the visitor is looking (the walls' C key steps `walls`). */
	setView(patch: Partial<View>): void;
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
	home: Home;
	slice: SliceLayer;
	arrows: DirectionArrows;
	spacing: number;
	labels: Label[];
}

/**
 * The airflow world: the Home (`look/home.ts`: painted walls that cut away, floors, furniture, the lawn and the planting) in late
 * afternoon light (`look/lighting.ts`), with the live simulation in it: tracers that drift with the air and smoke, through the whole
 * volume of the rooms, the fans and purifiers, the rings and pins the visitor places, and, when the visitor turns it on, the slice
 * plane coloured by the layer they picked. The Sims camera (`camera/controls.ts`) frames it; the host (`look/stage.ts`) draws it and
 * hands it the input. Everything is in the solver's metres, so nothing is converted between the two.
 *
 * It owns the `SimulationSession`: that builds the world and steps it each frame this runs, and this draws the newest
 * snapshot it has. A home or a restart that needs a new world keeps the old picture out of the way (`live`) until the new
 * world has its first slice, so the air never shows over a different home.
 */
export function createAirflowScene(host: WorldHost, params: AirflowSceneParams, readout: AirflowReadout): World {
	const scene = new Scene();
	const camera = new PerspectiveCamera(FOV, 1, 0.05, 600);
	const lighting = new Lighting(scene);
	const materials = new Materials(host.quality().anisotropy, host.assets);
	const models = new Map(params.models.map((model) => [model.id, model]));
	const planOf = (id: string) => params.plans.find((plan) => plan.id === id) ?? params.plans[0];

	// The grid is the device's to say: measured by the tuner, the coarsest on a phone or a small tablet, or exactly what `?cell=0.15` asks for.
	const backend = chooseBackend({ small: detectSmallDevice(), fixedCell: cellFromSearch(location.search) });
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
		announce: (message) => params.announce(message)
	});
	const tracers = new TracerPoints(TRACERS);
	const smoke = new SmokePoints(SMOKE);
	const devices = new DeviceMeshes(models);
	const markers = new Markers(host.labels);
	scene.add(tracers.points, smoke.points, devices.group, markers.group);

	function buildHouse(plan: HomePlan): House {
		const home = new Home(plan, materials, host.assets, { furniture: params.setup.furniture });
		const slice = new SliceLayer(plan.width, plan.depth);
		const spacing = host.compact() ? COMPACT_SPACING : ARROW_SPACING;
		const arrows = new DirectionArrows(plan.width, plan.depth, spacing);
		scene.add(home.group, slice.mesh, arrows.mesh);
		lighting.fit(home.bounds);
		const labels: Label[] = home.roomAnchors.map((anchor) => {
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
		return { plan, home, slice, arrows, spacing, labels };
	}

	function disposeHouse(old: House) {
		for (const label of old.labels) host.labels.remove(label);
		scene.remove(old.slice.mesh, old.arrows.mesh);
		old.home.dispose();
		old.slice.dispose();
		old.arrows.dispose();
	}

	let house = buildHouse(planOf(params.setup.plan));
	const controls = new SimsCamera(
		camera,
		{
			reducedMotion: host.reducedMotion,
			size: () => {
				const box = host.rect();
				return { width: box.width, height: box.height };
			},
			// A double click flies to the floor of the Home under the pointer.
			floorAt: (ndc) => pointOnPlane(camera, ndc, 0, house.plan)
		},
		house.home.bounds
	);
	// A QA link (and the check-in screenshots) can start the camera anywhere: `?camera=x,z,heading,zoom,tilt`.
	const asked = cameraFromSearch(location.search);
	if (asked) controls.jumpTo(asked);
	/** Where the camera is and what it looks at, for the cutaway. */
	const look = () => ({ camera: { x: controls.pose.position[0], z: controls.pose.position[2] }, focus: controls.focus, zoom: controls.state.zoom });
	// The walls start where the first view wants them, not standing and then dropping as the world appears.
	house.home.update(look(), params.view.walls, 0, true);

	const editor = new DeviceEditor({
		camera,
		devices,
		models,
		height: () => host.rect().height,
		surfaces: () => house.home.pickables,
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
	params.bridge.pick = (clientX, clientY) => pointOnSurface(camera, ndcOf(clientX, clientY), house.plan, house.home.pickables);
	let openings = '';
	let version = -1;
	let sensitivity = NaN;
	let mode = params.view.mode;
	let topDown = params.view.topDown;
	let lastUpdate = 0;

	/** Height of the slice plane as drawn: the cell layer the solver snapped to, or the requested height before the first slice. */
	const planeY = () => session.latest.slice?.y ?? params.view.sliceHeight;

	const input = new AirflowInput({
		mode: () => params.view.mode,
		pick: (at) => pointOnPlane(camera, at, planeY(), house.plan, house.home.pickables),
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

	/** The old Top-down switch, until the HUD replaces it: straight down from bird's-eye with north up, and back to the default view. */
	function followTopDown(on: boolean) {
		if (on) {
			controls.setZoom(1);
			controls.goal.yaw = 0;
			controls.goal.tilt = clampTilt(PITCH_MAX - pitchAt(1), 1);
		} else controls.reset();
	}

	return {
		scene,
		camera,
		controls,
		input,
		setEnvironment(environment) {
			if (host.assets) lighting.setSky(host.assets.sky, environment);
		},
		setQuality(quality) {
			lighting.setQuality(quality);
		},
		takeShadowChange: () => house.home.takeShadowChange(),
		aoBox: () => house.home.aoBox(),
		key(event) {
			// The temporary C key steps the walls through cutaway, up and down, until the HUD's bottom bar has the toggle.
			if (event.key !== 'c' && event.key !== 'C') return false;
			if (event.altKey || event.ctrlKey || event.metaKey) return false;
			params.setView({ walls: nextWallMode(params.view.walls) });
			return true;
		},
		update(dt) {
			const { setup, view } = params;
			if (setup.plan !== house.plan.id) {
				input.reset();
				disposeHouse(house);
				house = buildHouse(planOf(setup.plan));
				controls.setBounds(house.home.bounds);
				house.home.update(look(), view.walls, 0, true);
				openings = '';
				version = -1;
			}
			const spacing = host.compact() ? COMPACT_SPACING : ARROW_SPACING;
			if (spacing !== house.spacing) {
				scene.remove(house.arrows.mesh);
				house.arrows.dispose();
				house.arrows = new DirectionArrows(house.plan.width, house.plan.depth, spacing);
				house.spacing = spacing;
				scene.add(house.arrows.mesh);
				version = -1;
			}
			if (view.mode !== mode) {
				mode = view.mode;
				input.reset();
			}
			if (view.topDown !== topDown) {
				topDown = view.topDown;
				followTopDown(topDown);
			}
			const reduced = host.reducedMotion();
			// The host caps the `dt` it hands over at 50 ms so that an animation never jumps. The session and the tuner want how long the frame really
			// took: a page drawing at 8 frames a second is not at 20, and a tab that was hidden for a minute is not one slow frame.
			const now = performance.now();
			const real = lastUpdate ? (now - lastUpdate) / 1000 : dt;
			lastUpdate = now;
			let moving = session.update(real);

			// The camera first, so the walls are cut for where it is now.
			const turning = controls.update(dt);
			const { home } = house;
			home.setFurniture(setup.furniture);
			const amounts = Object.fromEntries(effectiveOpenings(house.plan, setup, models));
			const signature = JSON.stringify(amounts);
			if (signature !== openings) {
				openings = signature;
				home.setOpenings(amounts);
			}
			const easing = home.update(look(), view.walls, dt, reduced);
			const named = controls.state.zoom > LABEL_ZOOM;
			for (const label of house.labels) label.enabled = named;

			// The newest snapshot, but only once it is of this home.
			const { latest, world } = session;
			const live = !!latest.slice && !!world && world.raster.plan.id === house.plan.id;
			house.slice.mesh.visible = live && view.slice;
			house.arrows.mesh.visible = live && view.slice && view.layer === 'direction';
			tracers.setVisible(live && view.tracers);
			smoke.setVisible(live);
			if (live) {
				const slice = latest.slice!;
				const scale = { sensitivity: view.sensitivity, baseline: 0 };
				if (view.slice) {
					house.slice.setHeight(slice.y);
					house.slice.update(slice, view.layer, scale);
					house.arrows.setHeight(slice.y);
					if (view.layer === 'direction') house.arrows.update(slice, scale);
				}
				// The particles only need uploading when there are new positions, or the speed scale moved under the tracers.
				if (latest.version !== version || scale.sensitivity !== sensitivity) {
					version = latest.version;
					sensitivity = scale.sensitivity;
					if (latest.tracers) tracers.update(latest.tracers, scale);
					if (latest.smoke) smoke.update(latest.smoke, { dense: SMOKE_DENSE });
				}
			}

			// A device's ring and arrow lie on the slice while it shows (it hides what stands below it), and round its feet while it does not.
			devices.update(setup.devices, session.simTime, view.slice ? planeY() : FLOOR_SYMBOLS, params.selected);
			editor.update(setup.devices.find((d) => d.id === params.selected));
			editor.setGhost(params.drag);
			markers.syncProbes(params.probes, readout.probes, view.units);
			markers.update(dt, reduced);

			if (input.tick()) moving = true;
			return moving || turning || easing || markers.animating;
		},
		dispose() {
			input.reset();
			readout.hover = null;
			session.dispose();
			backend.dispose();
			disposeHouse(house);
			markers.dispose();
			editor.dispose();
			devices.dispose();
			tracers.dispose();
			smoke.dispose();
			lighting.dispose();
			materials.dispose();
			disposeTree(scene);
		}
	};
}
