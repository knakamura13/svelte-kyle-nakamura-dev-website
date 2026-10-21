import { PerspectiveCamera, Scene } from 'three';
import { disposeTree } from '$lib/experiments/engine/kit';
import type { Label } from '$lib/experiments/engine/labels';
import type { DeviceModel } from '../devices/types';
import type { HomePlan } from '../homes/types';
import type { AirflowReadout } from '../readouts';
import type { Target } from '../state';
import { chooseBackend } from '../sim/backends';
import { cellFromSearch, detectSmallDevice } from '../sim/device';
import { SimulationSession, type SessionParams } from '../sim/session';
import { effectiveOpenings } from '../sim/world';
import type { OverlayId, View } from '../state';
import { createAir } from './air';
import { FOV, SimsCamera } from './camera/controls';
import { cameraFromSearch } from './camera/sims';
import { DeviceEditor, type Grab } from './deviceEditor';
import type { Point3 } from './deviceMath';
import { DeviceMeshes } from './deviceMeshes';
import { AirflowInput } from './input';
import { Home } from './look/home';
import { Lighting } from './look/lighting';
import { Materials } from './look/materials';
import type { World, WorldHost } from './look/stage';
import { Markers } from './markers';
import { pointOnPlane, pointOnSurface } from './pick';
import { Selection, ToolInput, type DragPreview, type SelectionParams } from './selection';
import { nextWallMode } from './walls/cutaway';

/** How far outside the footprint the compass letters sit, m: past the outside walls and the planting along them, clear of the rooms' names. */
const COMPASS_OFFSET = 1.8;

/** Room names and compass letters show only this far out (zoom 0 is eye level, 1 bird's-eye): close in they would be in the way. */
const LABEL_ZOOM = 0.7;

/** Where a device's ring and arrow are drawn: just over the floor, round its feet. */
const FLOOR_SYMBOLS = 0.02;

/**
 * What the scene reads and calls. The page's `AirflowExperience` is this object: the scene reads `setup`, `view`,
 * `clock`, `probes`, `emission` and the rest each frame, and writes `readout`.
 */
export interface AirflowSceneParams extends SessionParams, SelectionParams {
	/** A device the HUD is carrying, which a click puts down instead of choosing what is under it. */
	carry: object | null;
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
	/** The device whose handles are showing, and the one the HUD is carrying with where it would land (null for neither). */
	selected: string | null;
	drag: DragPreview | null;
	selectDevice(id: string | null): void;
	/** Moves a placed device to where the pointer took it, turns it to face a bearing, aims it up or down. Each says what it did, politely, once the visitor stops. */
	moveDevice(id: string, x: number, z: number): string | null;
	turnDevice(id: string, yaw: number): void;
	aimDevice(id: string, tilt: number): void;
	/** What the HUD needs from the world: the floor or furniture under a screen point (for a device it carries), and where a thing's menu hangs. */
	bridge: {
		pick?: (clientX: number, clientY: number) => Point3 | null;
		anchor?: (target: Target) => { x: number; y: number } | null;
	};
}

/** Everything that belongs to one home, so a new plan swaps it as a piece. */
interface House {
	plan: HomePlan;
	home: Home;
	labels: Label[];
}

/**
 * The airflow world: the Home (`look/home.ts`: painted walls that cut away, floors, furniture, the lawn and the planting) in late
 * afternoon light (`look/lighting.ts`), with the live simulation in it: the air (`air/`: streaks that ride it through the whole
 * volume of the rooms, the smoke lit by the sun, and the overlays, which colour the streaks), the fans and purifiers, and the rings
 * and pins the visitor places. No plane is drawn anywhere. The Sims camera (`camera/controls.ts`) frames it; the host
 * (`look/stage.ts`) draws it and hands it the input. Everything is in the solver's metres, so nothing is converted between the two.
 *
 * It owns the `SimulationSession`: that builds the world and steps it each frame this runs, and this draws the newest
 * snapshot it has. A home or a restart that needs a new world keeps the old air out of the way until the new world's first
 * volume, so the air of one home never shows over another.
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
		announce: (message) => params.announce(message),
		// The air is drawn from a volume of the whole box (`air/`), so the backend keeps no tracers or smoke particles of its own.
		particles: false,
		volume: true
	});
	const devices = new DeviceMeshes(models);
	const markers = new Markers(host.labels);
	scene.add(devices.group, markers.group);

	function buildHouse(plan: HomePlan): House {
		const home = new Home(plan, materials, host.assets, { furniture: params.setup.furniture });
		scene.add(home.group);
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
		return { plan, home, labels };
	}

	function disposeHouse(old: House) {
		for (const label of old.labels) host.labels.remove(label);
		old.home.dispose();
	}

	let house = buildHouse(planOf(params.setup.plan));
	// The air: streaks that ride the solver's air, the smoke lit by the world's sun, and the overlays. Under an overlay the Home and
	// the devices are muted a little, so its colours stand out of the world.
	const air = createAir({
		scene,
		camera,
		world: () => (session.world?.raster.plan.id === house.plan.id ? session.world : null),
		muted: () => [house.home.group, devices.group],
		sun: lighting.sun,
		quality: host.quality().tier,
		look: host.quality().air
	});
	let overlay: { kind: OverlayId; sensitivity: number } | null = null;
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
	// The HUD: what a click chooses, the outlines of the chosen and hovered things, the carried ghost, where a menu hangs, and clicks that
	// follow the tool. A click stops at a wall that stands, and an Opening in a wall that is cut away cannot be chosen.
	const selection = new Selection({
		camera,
		rect: host.rect,
		plan: () => house.plan,
		models,
		params,
		walls: () => ({ boxes: house.home.walls.standingBoxes(), cut: (id) => house.home.walls.openingCut(id) })
	});
	scene.add(selection.group);
	params.bridge.anchor = (target) => selection.anchor(target);
	// The HUD carries a device in from its catalog: it asks the world where a point on the screen lands, in the world's own metres.
	const ndcOf = (clientX: number, clientY: number) => {
		const box = host.rect();
		return { x: ((clientX - box.left) / box.width) * 2 - 1, y: -(((clientY - box.top) / box.height) * 2 - 1) };
	};
	// A carried device lands on the floor or furniture under the pointer, unless a standing wall is in the way.
	params.bridge.pick = (clientX, clientY) => {
		const point = pointOnSurface(camera, ndcOf(clientX, clientY), house.plan, house.home.pickables);
		return point && !selection.walled(point) ? point : null;
	};
	let openings = '';
	let mode = params.view.mode;
	let lastUpdate = 0;

	/** The height the pointer reads the air at, pins a probe and releases smoke: the cell layer the slice snapped to, or the height asked for before the first slice. Nothing is drawn there. */
	const planeY = () => session.latest.slice?.y ?? params.view.sliceHeight;

	const input = new AirflowInput({
		mode: () => params.view.mode,
		pick: (at) => {
			const point = pointOnPlane(camera, at, planeY(), house.plan, house.home.pickables);
			return point && !selection.walled(point) ? point : null;
		},
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

	const tools = new ToolInput(input, {
		tool: () => params.tool,
		pickAt: (at, kinds) => selection.pickAt(at, kinds),
		grab: (at) => {
			const grab = editor.grabAt(at, params.selected);
			return grab && { device: grab.id, body: grab.part === 'body' };
		},
		select: (target, menu) => params.select(target, menu),
		hover: (target) => params.hover(target),
		carrying: () => !!params.carry
	});

	return {
		scene,
		camera,
		controls,
		input: tools,
		setEnvironment(environment) {
			if (host.assets) lighting.setSky(host.assets.sky, environment);
		},
		setQuality(quality) {
			lighting.setQuality(quality);
			// The air follows the tier: fewer streaks on medium and low, and puffs for the smoke on low, drawn as the tier asks (`quality.air`).
			air.setQuality(quality.tier, quality.air);
		},
		takeShadowChange: () => house.home.takeShadowChange(),
		aoBox: () => house.home.aoBox(),
		key(event) {
			// C steps the walls through cutaway, up and down, as the bottom bar's wall modes do.
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
			}
			if (view.mode !== mode) {
				mode = view.mode;
				input.reset();
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

			// The newest volume, but only once it is of this home. No plane is drawn: the air fills the rooms instead (`air/`). The slice
			// is still read, for the hover readout and the height a probe or a puff of smoke is placed at.
			const { latest, world } = session;
			const live = !!world && world.raster.plan.id === house.plan.id;
			if (!overlay || overlay.kind !== view.overlay || overlay.sensitivity !== view.sensitivity) {
				overlay = { kind: view.overlay, sensitivity: view.sensitivity };
				air.setOverlay(view.overlay, { sensitivity: view.sensitivity });
			}
			air.setStreaks(view.tracers);
			// The streaks move with the air in real time, as the air would carry them; a paused clock holds them where they are.
			if (air.update(live ? latest.volume : null, params.clock.paused ? 0 : Math.min(real, 0.05))) moving = true;

			// A device's ring and arrow lie round its feet.
			devices.update(setup.devices, session.simTime, FLOOR_SYMBOLS, params.selected);
			editor.update(setup.devices.find((d) => d.id === params.selected));
			if (selection.update(dt, reduced)) moving = true;
			markers.syncProbes(params.probes, readout.probes, view.units);
			markers.update(dt, reduced);

			if (input.tick()) moving = true;
			return moving || turning || easing || markers.animating;
		},
		dispose() {
			input.reset();
			readout.hover = null;
			air.dispose();
			session.dispose();
			backend.dispose();
			disposeHouse(house);
			markers.dispose();
			selection.dispose();
			editor.dispose();
			devices.dispose();
			lighting.dispose();
			materials.dispose();
			disposeTree(scene);
		}
	};
}
