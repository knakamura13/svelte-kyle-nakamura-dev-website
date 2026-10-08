import { expect, test } from '@playwright/test';
import { CFM, type DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { FACADE_BEARING, WIND_AT_EAVES, windPressureCoefficient } from '../../src/lib/experiments/airflow/homes/weather';
import type { HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { blankSetup, type DeviceState, type Setup } from '../../src/lib/experiments/airflow/state';

/** A 6 m × 3 m room with a casement window in each short wall: the smallest home that has a through-flow. */
const plan: HomePlan = {
	id: 'studio',
	name: 'Test room',
	blurb: '',
	width: 6,
	depth: 3,
	ceiling: 2.4,
	rooms: [{ id: 'room', name: 'Room', rects: [{ x: 0, z: 0, w: 6, d: 3 }] }],
	walls: [],
	furniture: [],
	openings: [
		{ id: 'west', name: 'West window', kind: 'casement', placement: { facade: 'west', center: 1.5 }, width: 1.2, height: 1.2, sill: 0.9, maxOpen: 1, anchor: 'start' },
		{ id: 'east', name: 'East window', kind: 'casement', placement: { facade: 'east', center: 1.5 }, width: 1.2, height: 1.2, sill: 0.9, maxOpen: 1, anchor: 'start' }
	]
};

const models: DeviceModel[] = [
	{ id: 'box', name: 'Box fan', kind: 'box-fan', body: { width: 0.5, depth: 0.15, height: 0.55 }, source: 'test', diameter: 0.45, flow: { low: 800 * CFM, medium: 1200 * CFM, high: 1600 * CFM } },
	{ id: 'window', name: 'Window fan', kind: 'window-fan', body: { width: 0.6, depth: 0.15, height: 0.3 }, source: 'test', diameter: 0.25, flow: { low: 300 * CFM, medium: 400 * CFM, high: 500 * CFM }, shutoff: 30 },
	{
		id: 'purifier',
		name: 'Purifier',
		kind: 'air-purifier',
		size: 'medium',
		body: { width: 0.3, depth: 0.3, height: 0.6 },
		source: 'test',
		cadr: { sleep: 40 * CFM, low: 80 * CFM, medium: 160 * CFM, high: 240 * CFM },
		inlet: { from: 0.1, to: 0.35 },
		outletDiameter: 0.2
	}
];

const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const modelMap = new Map(models.map((m) => [m.id, m]));
const create = (setup: Setup, h = 0.3) => World.create(setup, { plans: [plan], models: modelMap, make, h });

const device = (overrides: Partial<DeviceState>): DeviceState => ({
	id: 'd1',
	model: 'box',
	x: 3,
	z: 1.5,
	y: 0,
	yaw: 90,
	tilt: 0,
	power: 1,
	height: 0,
	oscillation: { on: false, sweep: 90, period: 8 },
	...overrides
});

const run = (world: World, seconds: number, dt = 0.1) => {
	for (let t = 0; t < seconds - 1e-9; t += dt) world.backend.step(dt);
};

/** Mean speed in the slice at 1.2 m. */
const meanSpeed = async (world: World) => {
	const { slice } = await world.backend.snapshot({ sliceY: 1.2 });
	let sum = 0;
	let count = 0;
	for (let n = 0; n < slice!.speed.length; n++) if (slice!.fluid[n]) (sum += slice!.speed[n]), count++;
	return sum / count;
};

test.describe('a world for a setup', () => {
	test('windows closed: no wind gets in; open both with a west wind: the flow matches the orifice formula for the wind pressures', async () => {
		const setup = blankSetup('studio');
		setup.conditions = { windFrom: 270, windSpeed: 6, outdoorTemp: 21, indoorTemp: 21, outdoorPm25: 0 };
		const world = await create(setup);
		run(world, 8);
		expect(await meanSpeed(world)).toBeLessThan(1e-3);

		world.apply({ ...setup, openings: { west: 1, east: 1 } }, 0);
		run(world, 20);
		// What the solver was given: ½ρU² at the eaves times each short wall's coefficient.
		const eaves = 6 * WIND_AT_EAVES;
		const dynamic = 0.5 * AIR.rho * eaves * eaves;
		const windward = dynamic * windPressureCoefficient(270 - FACADE_BEARING.west, 0.5);
		const leeward = dynamic * windPressureCoefficient(270 - FACADE_BEARING.east, 0.5);
		const area = 1.2 * 1.2;
		const analytic = AIR.cd * (area / Math.SQRT2) * Math.sqrt((2 * (windward - leeward)) / AIR.rho);
		const rate = world.raster.openings.find((o) => o.spec.id === 'west')!;
		const g = world.backend.grid;
		const fields = await world.backend.readFields();
		let into = 0;
		for (const face of rate.faces) into += fields.u[face.index] * g.h * g.h * world.raster.geometry.au[face.index];
		console.log(`through-flow ${into.toFixed(3)} m³/s, orifice formula ${analytic.toFixed(3)} (${((into / analytic) * 100).toFixed(1)} %)`);
		expect(into / analytic).toBeGreaterThan(0.9);
		expect(into / analytic).toBeLessThan(1.05);
		expect(await meanSpeed(world)).toBeGreaterThan(0.2);
		world.dispose();
	});

	test('changes that need a new box say so; others apply in place', async () => {
		const world = await create(blankSetup('studio'));
		expect(world.canApply({ ...blankSetup('studio'), openings: { west: 0.5 } })).toBe(true);
		expect(world.canApply({ ...blankSetup('studio'), furniture: false })).toBe(false);
		const colder = blankSetup('studio');
		colder.conditions = { ...colder.conditions, indoorTemp: 18 };
		expect(world.canApply(colder)).toBe(false);
		expect(() => world.apply(colder, 0)).toThrow();
		world.dispose();
	});

	test('a box fan moves air, in proportion to its power, and its measured flow is reported', async () => {
		const setup = blankSetup('studio');
		setup.devices = [device({ power: 0.34 })];
		const slow = await create(setup);
		run(slow, 8);
		setup.devices = [device({ power: 1 })];
		const fast = await create(setup);
		run(fast, 8);
		const shot = await fast.backend.snapshot({});
		const flow = shot.fanFlow[fast.fanIndexOf('d1')!];
		console.log(`box fan at full power: ${flow.toFixed(3)} m³/s (rated ${(1600 * CFM).toFixed(3)})`);
		expect(flow).toBeGreaterThan(0.3 * 1600 * CFM);
		expect(await meanSpeed(fast)).toBeGreaterThan(1.5 * (await meanSpeed(slow)));
		slow.dispose();
		fast.dispose();
	});

	test('a window fan draws air through the room, and one that is off shuts its window', async () => {
		const setup = blankSetup('studio');
		setup.openings = { east: 1 };
		setup.devices = [device({ model: 'window', opening: 'west', intake: true, x: 0, z: 1.5, y: 0.9, yaw: 90 })];
		const on = await create(setup);
		run(on, 15);
		const west = on.raster.openings.find((o) => o.spec.id === 'west')!;
		const fields = await on.backend.readFields();
		const g = on.backend.grid;
		const flow = west.faces.reduce((sum, face) => sum + fields.u[face.index] * g.h * g.h * on.raster.geometry.au[face.index], 0);
		console.log(`window fan: ${flow.toFixed(3)} m³/s (rated ${(500 * CFM).toFixed(3)} at high)`);
		expect(flow).toBeGreaterThan(0.1);
		setup.devices = [device({ model: 'window', opening: 'west', intake: true, x: 0, z: 1.5, y: 0.9, yaw: 90, power: 0 })];
		on.apply(setup, 0);
		run(on, 10);
		const closed = await on.backend.readFields();
		const after = west.faces.reduce((sum, face) => sum + Math.abs(closed.u[face.index]), 0);
		expect(after).toBeLessThan(1e-3);
		on.dispose();
	});

	test('smoke released at a point shows up there, a purifier takes it out faster, and the mass balance holds', async () => {
		const setup = blankSetup('studio');
		const plain = await create(setup);
		plain.emit({ x: 3, y: 1.2, z: 1.5 }, 2 / 60);
		run(plain, 6);
		plain.emit(null, 0);
		const first = await plain.backend.snapshot({ sliceY: 1.2 });
		const cell = Math.floor(3 / 0.3) + first.slice!.nx * Math.floor(1.5 / 0.3);
		expect(first.slice!.particulates[cell]).toBeGreaterThan(0.05);
		run(plain, 240);
		const withoutPurifier = (await plain.backend.snapshot({})).diagnostics.mass.inAir;

		setup.devices = [device({ model: 'purifier', x: 3.6, z: 1.5, yaw: 0, power: 1 })];
		const cleaned = await create(setup);
		cleaned.emit({ x: 3, y: 1.2, z: 1.5 }, 2 / 60);
		run(cleaned, 6);
		cleaned.emit(null, 0);
		run(cleaned, 240);
		const shot = await cleaned.backend.snapshot({});
		console.log(`smoke left after 246 s: ${withoutPurifier.toFixed(3)} mg without a purifier, ${shot.diagnostics.mass.inAir.toFixed(3)} mg with one`);
		// A purifier at 160 cfm (CADR 0.0755 m³/s) in a 43 m³ room turns over 0.6 % of the air a second, so it clears about half in four minutes.
		expect(shot.diagnostics.mass.inAir).toBeLessThan(0.75 * withoutPurifier);
		const { mass } = shot.diagnostics;
		const gained = mass.initial + mass.emitted + mass.inflow;
		expect(Math.abs(gained - (mass.inAir + mass.outflow + mass.removed + mass.deposited)) / gained).toBeLessThan(1e-3);
		plain.dispose();
		cleaned.dispose();
	});
});
