import { expect, test } from '@playwright/test';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import { emptyReadout } from '../../src/lib/experiments/airflow/readouts';
import { SimulationSession, type SessionParams } from '../../src/lib/experiments/airflow/sim/session';
import type { BackendFactory, World } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { DEFAULT_CLOCK, DEFAULT_VIEW, blankSetup } from '../../src/lib/experiments/airflow/state';

/**
 * What the Weather and the Openings and furniture groups do to the air, with the page's own driver: the groups write the setup
 * (`setCondition`, `setOpening`, `setFurniture` assign into `setup`, and a new starting temperature also bumps `restarts`), and the
 * session reads it every frame, applies what the solver can take while it runs, and builds a new world for what it cannot. The
 * air is the studio's, on the CPU solver at 0.3 m cells, with the front door (west) and the east window as a way through.
 */

const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const studio = planById('studio')!;
const FRAME = 1 / 60;
const WAY_THROUGH = { 'front-door': 1, 'main-east-window-1': 1 };

function makeSession() {
	const params: SessionParams = {
		setup: blankSetup('studio'),
		view: { ...DEFAULT_VIEW, units: 'metric' },
		clock: { ...DEFAULT_CLOCK },
		probes: [],
		emission: { strength: 0.5, active: false },
		restarts: 0,
		startingSmoke: 0
	};
	// Calm, so that the air starts at rest and every change below is the one under test.
	params.setup.conditions = { windFrom: 270, windSpeed: 0, outdoorTemp: 21, indoorTemp: 21, outdoorPm25: 0 };
	const session = new SimulationSession({ params, plans, models: [], make, cellSize: () => 0.3, readout: emptyReadout(), invalidate: () => {}, reducedMotion: () => false });
	return { session, params };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Draws frames until the session has a world, and returns it. */
async function start(session: SimulationSession) {
	const deadline = Date.now() + 30000;
	while (!session.world && Date.now() < deadline) {
		session.update(FRAME);
		await pause(5);
	}
	expect(session.world, 'the world was built').not.toBeNull();
	return session.world!;
}

/** One frame: the session reads the setup and hands the solver what changed. */
const frame = (session: SimulationSession) => session.update(FRAME);

const run = (world: World, seconds: number, dt = 0.05) => {
	for (let t = 0; t < seconds - 1e-9; t += dt) world.backend.step(dt);
};

/** Mean speed over the slice at 1.2 m, m/s. */
async function meanSpeed(world: World) {
	const { slice } = await world.backend.snapshot({ sliceY: 1.2 });
	let sum = 0;
	let count = 0;
	for (let n = 0; n < slice!.speed.length; n++) if (slice!.fluid[n]) (sum += slice!.speed[n]), count++;
	return sum / count;
}

/** The air of the whole Home: its mean temperature (kelvin above the starting indoor temperature) and particulates (ppm by mass), weighted by room volume. */
async function airOfTheHome(world: World) {
	const { rooms } = await world.backend.snapshot({ rooms: true });
	let volume = 0;
	let theta = 0;
	let particulates = 0;
	for (const room of rooms!) {
		volume += room.volume;
		theta += room.volume * room.theta;
		particulates += room.volume * room.particulates;
	}
	return { theta: theta / volume, particulates: particulates / volume };
}

test.describe('the weather and the Openings, from the Dock to the air', () => {
	test.describe.configure({ timeout: 120000 });

	test('a change of weather or of an Opening is applied to the running world in place; a new starting temperature, or the furniture, starts the air over', async () => {
		const { session, params } = makeSession();
		const world = await start(session);
		run(world, 2);
		for (const change of [
			(c: typeof params.setup.conditions) => (c.windSpeed = 6),
			(c: typeof params.setup.conditions) => (c.windFrom = 180),
			(c: typeof params.setup.conditions) => (c.outdoorTemp = 2),
			(c: typeof params.setup.conditions) => (c.outdoorPm25 = 90)
		]) {
			change(params.setup.conditions);
			frame(session);
			expect(session.world, 'the same world, still running').toBe(world);
			expect(world.current.conditions).toEqual(params.setup.conditions);
		}
		params.setup.openings['main-south-window'] = 0.4;
		frame(session);
		expect(session.world).toBe(world);
		expect(world.current.openings['main-south-window']).toBe(0.4);
		expect(session.simTime, 'the clock has not been set back').toBeGreaterThan(0);

		// What Setting a new starting temperature does in the experience: the value, and a restart.
		params.setup.conditions.indoorTemp = 25;
		params.restarts++;
		let rebuilt = Date.now() + 30000;
		while (session.world === world && Date.now() < rebuilt) {
			frame(session);
			await pause(5);
		}
		const warmer = session.world!;
		expect(warmer, 'a new world').not.toBe(world);
		expect(warmer.current.conditions.indoorTemp).toBe(25);
		expect(warmer.fluid.beta, 'buoyancy is referenced to the new starting temperature').toBeCloseTo(1 / (25 + 273.15), 12);
		expect(session.simTime, 'and the clock starts again').toBeLessThan(1);

		params.setup.furniture = false;
		rebuilt = Date.now() + 30000;
		while (session.world === warmer && Date.now() < rebuilt) {
			frame(session);
			await pause(5);
		}
		expect(session.world, 'the furniture is built into the box, so a new world').not.toBe(warmer);
		expect(session.world!.current.furniture).toBe(false);
		session.dispose();
	});

	test('the wind drives air through an open door and window when it rises, and the air settles when it drops', async () => {
		const { session, params } = makeSession();
		Object.assign(params.setup.openings, WAY_THROUGH);
		const world = await start(session);
		run(world, 6);
		const calm = await meanSpeed(world);
		expect(calm, 'no wind, no push').toBeLessThan(0.02);

		params.setup.conditions.windSpeed = 6;
		frame(session);
		expect(session.world).toBe(world);
		run(world, 20);
		const windy = await meanSpeed(world);
		expect(windy, 'a 6 m/s west wind through a door and a window').toBeGreaterThan(0.15);
		expect(windy / Math.max(calm, 1e-3)).toBeGreaterThan(8);

		params.setup.conditions.windSpeed = 0;
		frame(session);
		expect(session.world).toBe(world);
		// The jet through the door dies away slowly in a room with both openings open: about 0.11 of 0.19 m/s after 10 s and 0.054 after 40 s.
		run(world, 40);
		const settled = await meanSpeed(world);
		console.log(`mean speed at 1.2 m: calm ${calm.toFixed(4)}, 6 m/s wind ${windy.toFixed(3)}, 40 s after the wind drops ${settled.toFixed(3)} m/s`);
		expect(settled, 'the air settles').toBeLessThan(0.4 * windy);
		session.dispose();
	});

	test('the direction of the wind matters: from the west it goes through a door in the west wall and a window in the east wall, from the north it does not', async () => {
		const { session, params } = makeSession();
		Object.assign(params.setup.openings, WAY_THROUGH);
		params.setup.conditions.windSpeed = 6;
		const world = await start(session);
		run(world, 20);
		const fromWest = await meanSpeed(world);
		expect(fromWest).toBeGreaterThan(0.15);

		// From the north both walls with an opening are side walls and sucked alike, so nothing pushes the air through: it dies away as it does in calm air.
		params.setup.conditions.windFrom = 0;
		frame(session);
		expect(session.world).toBe(world);
		run(world, 40);
		const fromNorth = await meanSpeed(world);
		console.log(`mean speed at 1.2 m with a 6 m/s wind: from the west ${fromWest.toFixed(3)}, 40 s after it turns to the north ${fromNorth.toFixed(3)} m/s`);
		expect(fromNorth, 'the same wind, from the side').toBeLessThan(fromWest / 2);
		session.dispose();
	});

	test('the outdoor temperature changes the temperature of the air that comes in, and the outdoor PM2.5 brings particulates in', async () => {
		const { session, params } = makeSession();
		Object.assign(params.setup.openings, WAY_THROUGH);
		params.setup.conditions.windSpeed = 6;
		const world = await start(session);
		run(world, 30);
		const before = await airOfTheHome(world);
		expect(Math.abs(before.theta), 'outdoors as warm as indoors').toBeLessThan(0.05);
		expect(before.particulates, 'clean outdoors').toBeLessThan(1e-6);

		params.setup.conditions.outdoorTemp = 1;
		params.setup.conditions.outdoorPm25 = 240;
		frame(session);
		expect(session.world).toBe(world);
		run(world, 40);
		const after = await airOfTheHome(world);
		console.log(`the Home's air 40 s after 1 °C and 240 µg/m³ come in on a 6 m/s wind: ${after.theta.toFixed(2)} K from its start, ${after.particulates.toFixed(3)} ppm of particulates`);
		expect(after.theta, 'colder air came in').toBeLessThan(-3);
		// 240 µg/m³ is 0.2 ppm by mass; a Home with a wind through it has taken in a good part of that.
		expect(after.particulates, 'and smoke with it').toBeGreaterThan(0.03);
		session.dispose();
	});

	test('the furniture is solid for the solver: a world without it has more air in it', async () => {
		const withFurniture = makeSession();
		const bare = makeSession();
		bare.params.setup.furniture = false;
		const [a, b] = [await start(withFurniture.session), await start(bare.session)];
		expect(a.backend.fluidCells).toBeLessThan(b.backend.fluidCells);
		expect(studio.furniture.length).toBeGreaterThan(0);
		withFurniture.session.dispose();
		bare.session.dispose();
	});
});
