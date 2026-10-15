import { expect, test } from '@playwright/test';
import { DEVICE_MODELS, FAN_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import type { DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { planById } from '../../src/lib/experiments/airflow/homes/plans';
import { SCENARIOS } from '../../src/lib/experiments/airflow/scenarios';
import { windowOpening } from '../../src/lib/experiments/airflow/scene/deviceMath';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import { LIMITS, MAX_DEVICES, type Setup } from '../../src/lib/experiments/airflow/state';

const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const models = new Map<string, DeviceModel>(DEVICE_MODELS.map((m) => [m.id, m]));
/** The coarse grid the page's CPU fallback uses. */
const H = 0.2;

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const create = (setup: Setup) => World.create(setup, { plans: [planById(setup.plan)!], models, make, h: H });

const run = (world: World, seconds: number, dt = 0.1) => {
	for (let t = 0; t < seconds - 1e-9; t += dt) world.backend.step(dt);
};

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
			}
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
});
