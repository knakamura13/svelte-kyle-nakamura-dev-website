import { expect, test } from '@playwright/test';
import { DEVICE_MODELS, FAN_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { PURIFIER_MARKS } from '../../src/lib/experiments/airflow/devices/model';
import { isFree } from '../../src/lib/experiments/airflow/devices/placement';
import type { DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { planById } from '../../src/lib/experiments/airflow/homes/plans';
import { SCENARIOS } from '../../src/lib/experiments/airflow/scenarios';
import { windowOpening } from '../../src/lib/experiments/airflow/scene/deviceMath';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import { LIMITS, MAX_DEVICES, type Setup } from '../../src/lib/experiments/airflow/state';
import { ppmFromUgPerM3 } from '../../src/lib/experiments/airflow/units';

const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const models = new Map<string, DeviceModel>(DEVICE_MODELS.map((m) => [m.id, m]));
/** The coarse grid the page's CPU fallback uses. */
const H = 0.2;

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;
/** A world for a setup, with `smoke` ppm in all of its air at the start, as the page starts a scenario's world. */
const create = (setup: Setup, smoke = 0) =>
	World.create(setup, { plans: [planById(setup.plan)!], models, make: (config, initial) => make(config, { ...initial, particulates: smoke }), h: H });

const run = (world: World, seconds: number, dt = 0.1) => {
	for (let t = 0; t < seconds - 1e-9; t += dt) world.backend.step(dt);
};

/** Each room's PM2.5, µg/m³, by room id. */
const pm25 = async (world: World) => {
	const shot = await world.backend.snapshot({ rooms: true });
	return Object.fromEntries(world.raster.plan.rooms.map((room, n) => [room.id, shot.rooms![n].particulates / ppmFromUgPerM3(1)]));
};

/**
 * How long a room's smoke takes to halve, minutes. A purifier in a closed room takes out the same share of it each minute, so the halving
 * time is the same at any level and a minute and a half of the fall gives it: measured from half a minute in, once the room is stirred.
 */
async function halving(world: World, room: string) {
	run(world, 30);
	const before = (await pm25(world))[room];
	run(world, 90);
	const after = (await pm25(world))[room];
	return (Math.LN2 * 90) / Math.log(before / after) / 60;
}

/** Net flow into the home through an exterior opening, m³/s. */
const inflow = async (world: World, id: string) => {
	const opening = world.raster.openings.find((o) => o.spec.id === id)!;
	const fields = await world.backend.readFields();
	const { au, aw } = world.raster.geometry;
	const { h } = world.backend.grid;
	let sum = 0;
	for (const face of opening.faces) sum += (opening.axis === 0 ? fields.u[face.index] * au[face.index] : fields.w[face.index] * aw[face.index]) * h * h;
	// u runs east and w runs south, so a positive flow through a west or north opening comes in.
	return opening.facade === 'west' || opening.facade === 'north' ? sum : -sum;
};

const total = async (world: World, ids: string[]) => (await Promise.all(ids.map((id) => inflow(world, id)))).reduce((a, b) => a + b, 0);

test.describe('scenario presets', () => {
	test('ids are unique, the copy is written, and every setup names things that exist and stays inside the controls', () => {
		const ids = new Set<string>();
		for (const preset of SCENARIOS) {
			expect(ids.has(preset.id), `${preset.id} is repeated`).toBe(false);
			ids.add(preset.id);
			for (const text of [preset.name, preset.blurb, preset.notice]) expect(text.trim().length).toBeGreaterThan(0);
			const plan = planById(preset.setup.plan);
			expect(plan, `${preset.id}: plan ${preset.setup.plan}`).toBeDefined();
			const known = new Set(plan!.openings.map((o) => o.id));
			for (const [id, amount] of Object.entries(preset.setup.openings)) {
				expect(known.has(id), `${preset.id}: opening ${id}`).toBe(true);
				expect(amount).toBeGreaterThanOrEqual(0);
				expect(amount).toBeLessThanOrEqual(1);
			}
			const c = preset.setup.conditions;
			expect(c.windFrom).toBeGreaterThanOrEqual(0);
			expect(c.windFrom).toBeLessThan(360);
			for (const key of ['windSpeed', 'outdoorTemp', 'indoorTemp', 'outdoorPm25'] as const) {
				expect(c[key], `${preset.id}: ${key}`).toBeGreaterThanOrEqual(LIMITS[key].min);
				expect(c[key], `${preset.id}: ${key}`).toBeLessThanOrEqual(LIMITS[key].max);
			}
			expect(preset.setup.devices.length).toBeLessThanOrEqual(MAX_DEVICES);
			for (const device of preset.setup.devices) {
				expect(models.has(device.model), `${preset.id}: model ${device.model}`).toBe(true);
				if (device.opening) expect(known.has(device.opening), `${preset.id}: window ${device.opening}`).toBe(true);
				// Any other device stands on free floor, as one carried out of the tray would.
				else expect(isFree(plan!, device.x, device.z), `${preset.id}: ${device.id} at ${device.x}, ${device.z}`).toBe(true);
			}
			expect(preset.smoke ?? 0, `${preset.id}: the smoke at the start`).toBeGreaterThanOrEqual(0);
		}
	});

	test('only the stack-effect scenario opens a casement, which passes 0.8 of its frame: one that opens another has its flow and its notice to recheck', () => {
		const opened = SCENARIOS.flatMap((preset) => {
			const plan = planById(preset.setup.plan)!;
			// A window fan holds its window open while it runs.
			const open = new Set([...Object.keys(preset.setup.openings), ...preset.setup.devices.flatMap((d) => (d.opening ? [d.opening] : []))]);
			return plan.openings.filter((o) => o.kind === 'casement' && open.has(o.id)).map((o) => `${preset.id}: ${o.id}`);
		});
		expect(opened).toEqual(['stack-effect: clerestory-window']);
	});

	test('cross-ventilation: the wind comes in at the west windows and leaves at the east ones, and a closed bedroom door stops the flow through that bedroom', async () => {
		const preset = scenario('cross-ventilation');
		const world = await create(preset.setup);
		run(world, 30);
		const west = await total(world, ['living-window-1', 'living-window-2']);
		const east = await total(world, ['bedroom-1-window', 'bedroom-2-window']);
		const first = await inflow(world, 'bedroom-1-window');
		console.log(`cross-ventilation: in ${west.toFixed(3)} m³/s at the west windows, out ${(-east).toFixed(3)} at the east ones, bedroom 1 window ${first.toFixed(3)}`);
		expect(west).toBeGreaterThan(0.1);
		expect(east).toBeLessThan(-0.1);
		expect(Math.abs(west + east) / west).toBeLessThan(0.1);
		expect(first).toBeLessThan(-0.03);

		world.apply({ ...preset.setup, openings: { ...preset.setup.openings, 'bedroom-1-door': 0 } }, 30);
		run(world, 15);
		const closed = await inflow(world, 'bedroom-1-window');
		console.log(`bedroom 1 door closed: window ${closed.toFixed(3)} m³/s`);
		expect(Math.abs(closed)).toBeLessThan(0.2 * Math.abs(first));
		world.dispose();
	});

	test('stack effect: with no wind, cold air comes in at the low windows and warm air leaves at the clerestory', async () => {
		const preset = scenario('stack-effect');
		expect(preset.setup.conditions.windSpeed).toBe(0);
		const world = await create(preset.setup);
		run(world, 30);
		const low = await total(world, ['living-north-window-1', 'living-north-window-2']);
		const high = await inflow(world, 'clerestory-window');
		console.log(`stack effect: in ${low.toFixed(3)} m³/s at the low windows, clerestory ${high.toFixed(3)}`);
		expect(low).toBeGreaterThan(0.02);
		expect(high).toBeLessThan(-0.02);
		expect(Math.abs(low + high) / low).toBeLessThan(0.15);

		// The flow itself, against the standard stack formula for these openings' open areas and heights: Q = Cd A sqrt(2 g H dT / T),
		// with A = A1 A2 / sqrt(A1^2 + A2^2) for two openings in series. The clerestory is a casement, which opens 0.8 of its frame, so it is
		// the smaller area and sets the flow. The solver gives 0.87 of the formula here (0.264 m³/s against 0.302), and gave 0.86 when
		// the casement opened its whole frame (0.306 m³/s against 0.357): the flow follows the open area as the formula does.
		const opening = (id: string) => world.raster.openings.find((o) => o.spec.id === id)!;
		const lowIds = ['living-north-window-1', 'living-north-window-2'];
		const lowArea = lowIds.reduce((sum, id) => sum + opening(id).area(1), 0);
		const highArea = opening('clerestory-window').area(1);
		expect(opening('clerestory-window').spec.kind).toBe('casement');
		expect(highArea, 'the clerestory passes 0.8 of its 1.2 m by 0.45 m frame').toBeCloseTo(1.2 * 0.45 * 0.8, 9);
		const centre = (id: string) => {
			const region = windowOpening(opening(id).spec);
			return (region.y0 + region.y1) / 2;
		};
		const rise = centre('clerestory-window') - centre(lowIds[0]);
		const { indoorTemp, outdoorTemp } = preset.setup.conditions;
		const formula = AIR.cd * ((lowArea * highArea) / Math.hypot(lowArea, highArea)) * Math.sqrt((2 * AIR.g * rise * (indoorTemp - outdoorTemp)) / (indoorTemp + 273.15));
		console.log(`stack effect: the formula gives ${formula.toFixed(3)} m³/s, the solver ${(low / formula).toFixed(3)} of it`);
		expect(low / formula).toBeGreaterThan(0.8);
		expect(low / formula).toBeLessThan(0.95);
		world.dispose();
	});

	test('a fan in the window: with no wind, the fan draws air in at about its rating, it goes toward the hall and bedroom 1 and leaves by the open window there, and turned off the air slows to a drift within a minute', async () => {
		const preset = scenario('window-fan');
		expect(preset.setup.conditions.windSpeed).toBe(0);
		const fan = preset.setup.devices[0];
		const rated = FAN_MODELS.find((m) => m.id === fan.model)!.flow.high;
		const world = await create(preset.setup);
		/** Each room's mean air speed, m/s, by room id. */
		const speeds = async () => {
			const shot = await world.backend.snapshot({ rooms: true });
			return Object.fromEntries(world.raster.plan.rooms.map((room, n) => [room.id, shot.rooms![n].speed]));
		};
		run(world, 30);
		const drawn = await inflow(world, fan.opening!);
		const out = await inflow(world, 'bedroom-1-window');
		console.log(`window fan: ${drawn.toFixed(3)} m³/s in through the fan window (rated ${rated.toFixed(3)} at high), ${out.toFixed(3)} through the bedroom window`);
		expect(drawn).toBeGreaterThan(0.5 * rated);
		expect(drawn).toBeLessThan(1.05 * rated);
		expect(Math.abs(drawn + out) / drawn).toBeLessThan(0.1);

		// The notice says where the air goes: toward the hall and bedroom 1, with the living room and the closed rooms seeing little.
		const moving = await speeds();
		console.log(`window fan, room speeds (m/s): ${Object.entries(moving).map(([id, v]) => `${id} ${v.toFixed(3)}`).join(', ')}`);
		expect(moving.dining).toBeGreaterThan(moving.living);
		expect(moving.hall).toBeGreaterThan(0.1);
		expect(moving['bedroom-1']).toBeGreaterThan(0.1);
		expect(moving['bedroom-2']).toBeLessThan(0.01);
		expect(moving.bathroom).toBeLessThan(0.01);

		// And turned off, the air slows to a drift: a minute later no room is above 10 cm/s and the moving rooms average under 30 % of their running speed.
		world.apply({ ...preset.setup, devices: [{ ...fan, power: 0 }] }, 30);
		run(world, 60);
		expect(Math.abs(await inflow(world, fan.opening!))).toBeLessThan(0.02 * rated);
		const resting = await speeds();
		console.log(`window fan, a minute after it stopped (m/s): ${Object.entries(resting).map(([id, v]) => `${id} ${v.toFixed(3)}`).join(', ')}`);
		const stirred = Object.keys(moving).filter((id) => moving[id] > 0.1);
		const average = (by: Record<string, number>) => stirred.reduce((sum, id) => sum + by[id], 0) / stirred.length;
		for (const [id, speed] of Object.entries(resting)) expect(speed, `${id} a minute after the fan stopped`).toBeLessThan(0.1);
		expect(average(resting) / average(moving)).toBeLessThan(0.3);
		world.dispose();
	});

	test('clearing the smoke: with its door shut, the purifier on High halves the smoke in bedroom 2 in about three and a half minutes on this coarse grid, as on the finest (tests/gpu/scenarios.gpu.ts), and on Low, which the model takes to clean at half the rate, about twice as long', async () => {
		test.setTimeout(600_000);
		const preset = scenario('clearing-smoke');
		const purifier = preset.setup.devices[0];
		expect(purifier.power, 'it starts on High').toBe(PURIFIER_MARKS.high);
		expect(preset.setup.openings['bedroom-2-door'] ?? 0, 'with the bedroom door shut').toBe(0);
		const high = await create(preset.setup, preset.smoke);
		const onHigh = await halving(high, 'bedroom-2');
		high.dispose();
		const low = await create({ ...preset.setup, devices: [{ ...purifier, power: PURIFIER_MARKS.low }] }, preset.smoke);
		const onLow = await halving(low, 'bedroom-2');
		low.dispose();
		console.log(`clearing the smoke: bedroom 2 halves every ${onHigh.toFixed(2)} min on High and ${onLow.toFixed(2)} on Low, ${(onLow / onHigh).toFixed(2)} times as long`);
		expect(onHigh).toBeGreaterThan(3.2);
		expect(onHigh).toBeLessThan(3.9);
		expect(onLow / onHigh).toBeGreaterThan(1.7);
		expect(onLow / onHigh).toBeLessThan(2.2);
	});

	test('clearing the smoke: with the purifier off and the bedroom window open instead, on a still day, the smoke in bedroom 2 takes about ten and a half minutes to halve', async () => {
		test.setTimeout(600_000);
		const preset = scenario('clearing-smoke');
		expect(preset.setup.conditions.windSpeed, 'a still day').toBe(0);
		const instead = { ...preset.setup, devices: [{ ...preset.setup.devices[0], power: 0 }], openings: { ...preset.setup.openings, 'bedroom-2-window': 1 } };
		const world = await create(instead, preset.smoke);
		const minutes = await halving(world, 'bedroom-2');
		world.dispose();
		console.log(`clearing the smoke, the window open instead: bedroom 2 halves every ${minutes.toFixed(2)} min`);
		expect(minutes).toBeGreaterThan(9.5);
		expect(minutes).toBeLessThan(11.5);
	});

	test('the smoky day: with every window shut, the purifier on High halves the smoke in the main room in about five minutes on this coarse grid', async () => {
		const preset = scenario('smoky-day');
		expect(Object.values(preset.setup.openings).every((amount) => amount === 0), 'every opening shut').toBe(true);
		expect(preset.setup.devices[0].power, 'the purifier on High').toBe(PURIFIER_MARKS.high);
		const world = await create(preset.setup, preset.smoke);
		const minutes = await halving(world, 'main');
		world.dispose();
		console.log(`the smoky day, windows shut: the main room halves every ${minutes.toFixed(2)} min`);
		expect(minutes).toBeGreaterThan(4.6);
		expect(minutes).toBeLessThan(5.8);
	});

	test('the smoky day: with the windows open to the breeze, the main room levels off at about three quarters of the smoke outside, even with the purifier on High', async () => {
		test.setTimeout(600_000);
		const preset = scenario('smoky-day');
		const outdoors = preset.setup.conditions.outdoorPm25;
		expect(outdoors, 'the Smoky outdoor air').toBe(150);
		const open = { 'main-east-window-1': 1, 'main-east-window-2': 1, 'main-south-window': 1 };
		const world = await create({ ...preset.setup, openings: { ...preset.setup.openings, ...open } }, preset.smoke);
		run(world, 240);
		const earlier = (await pm25(world)).main;
		run(world, 60);
		const level = (await pm25(world)).main;
		world.dispose();
		console.log(`the smoky day, windows open: the main room is at ${earlier.toFixed(1)} µg/m³ after four minutes and ${level.toFixed(1)} after five, ${(level / outdoors).toFixed(2)} of the smoke outside`);
		expect(level / outdoors).toBeGreaterThan(0.68);
		expect(level / outdoors).toBeLessThan(0.8);
		expect(Math.abs(earlier - level), 'levelled off: under 3 µg/m³ of change in its fifth minute').toBeLessThan(3);
	});
});
