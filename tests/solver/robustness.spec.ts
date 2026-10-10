import { expect, test } from '@playwright/test';
import { FAN_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { isFree, newDevice } from '../../src/lib/experiments/airflow/devices/placement';
import { CFM, type DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import type { HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { blankSetup, LIMITS, type DeviceState, type Setup } from '../../src/lib/experiments/airflow/state';

/**
 * A visitor can open any combination of doors and windows in any weather, put fans and purifiers anywhere, and change
 * all of it while the air is moving. The solver has to stay finite and nearly divergence-free through all of it, so
 * each plan is run with random setups.
 */

/** The catalog's fans, and a stand-in purifier because the catalog has none yet. */
const deviceModels: DeviceModel[] = [
	...FAN_MODELS,
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
const deviceMap = new Map(deviceModels.map((m) => [m.id, m]));

const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
/** Seeds per plan. A wider sweep for hunting instabilities: `ROBUST_TRIALS=40 yarn test:solver tests/solver/robustness.spec.ts`. Every failing seed is reported, not only the first. */
const TRIALS = Number(process.env.ROBUST_TRIALS ?? 5);
const DT = 1 / 20;
/** Cell size, m. A finer one for hunting instabilities: `ROBUST_H=0.1`. The page's CPU fallback uses about 0.2 and the GPU path 0.05 to 0.1. */
const H = Number(process.env.ROBUST_H ?? 0.2);

/** A small seeded generator (mulberry32), so a failure can be reproduced from its seed. */
function random(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const between = (rand: () => number, { min, max, step }: { min: number; max: number; step: number }) => min + Math.floor((rand() * (max - min)) / step + 0.5) * step;

const openingsFor = (plan: HomePlan, rand: () => number) => {
	const openings: Record<string, number> = {};
	for (const opening of plan.openings) {
		const r = rand();
		openings[opening.id] = r < 0.5 ? 0 : r < 0.75 ? 0.5 : 1;
	}
	return openings;
};

const setupFor = (plan: HomePlan, rand: () => number): Setup => ({
	...blankSetup(plan.id),
	furniture: rand() < 0.7,
	openings: openingsFor(plan, rand),
	conditions: {
		windFrom: Math.floor(rand() * 24) * 15,
		windSpeed: between(rand, LIMITS.windSpeed),
		outdoorTemp: between(rand, LIMITS.outdoorTemp),
		indoorTemp: between(rand, LIMITS.indoorTemp),
		outdoorPm25: between(rand, LIMITS.outdoorPm25)
	}
});

const uniform = (rand: () => number, { min, max }: { min: number; max: number }) => min + rand() * (max - min);

/** One to five devices at random places, aims, powers and oscillation settings. */
const devicesFor = (plan: HomePlan, rand: () => number): DeviceState[] => {
	const devices: DeviceState[] = [];
	const count = 1 + Math.floor(rand() * 5);
	for (let n = 0; n < count; n++) {
		const made = newDevice(plan, deviceModels[Math.floor(rand() * deviceModels.length)], devices);
		if (!('device' in made)) continue;
		const device = made.device;
		device.power = [0, 1 / 3, 2 / 3, 1, rand()][Math.floor(rand() * 5)];
		if (device.opening) {
			device.intake = rand() < 0.5;
		} else {
			device.yaw = Math.floor(rand() * 360);
			device.tilt = Math.round(uniform(rand, LIMITS.tilt));
			for (let attempt = 0; attempt < 40; attempt++) {
				const x = 0.5 + rand() * (plan.width - 1);
				const z = 0.5 + rand() * (plan.depth - 1);
				if (!isFree(plan, x, z) || devices.some((d) => Math.hypot(d.x - x, d.z - z) < 0.9)) continue;
				device.x = x;
				device.z = z;
				break;
			}
			device.oscillation = { on: rand() < 0.5, sweep: Math.round(uniform(rand, LIMITS.oscillationSweep)), period: Math.round(uniform(rand, LIMITS.oscillationPeriod)) };
		}
		devices.push(device);
	}
	return devices;
};

const finite = (array: Float32Array) => {
	for (let n = 0; n < array.length; n++) if (!Number.isFinite(array[n])) return false;
	return true;
};

/** Plans known to fail this run: remove a plan here when its failure is fixed. The one-bedroom fails at seed 1004 (no wind, −5 °C outside, divergence 0.18). */
const KNOWN_UNSTABLE = new Set<string>([]);

for (const plan of plans) {
	test(`${plan.name}: random openings and weather, changed mid-run, keep the solver finite and divergence-free`, async () => {
		test.fixme(KNOWN_UNSTABLE.has(plan.id), 'known issue 1 in docs/plans/2026-10-07-airflow-status.md');
		test.setTimeout((60000 + TRIALS * 20000) * Math.max(1, (0.2 / H) ** 3));
		for (let trial = 0; trial < TRIALS; trial++) {
			const seed = plans.indexOf(plan) * 1000 + trial + 1;
			const rand = random(seed);
			const setup = setupFor(plan, rand);
			const world = await World.create(setup, { plans: [plan], models: new Map(), make, h: H });
			for (let step = 0; step < 40; step++) world.backend.step(DT);
			// Now the visitor opens and closes things while the air is moving.
			const changed = { ...setup, openings: openingsFor(plan, rand) };
			world.apply(changed, 40 * DT);
			for (let step = 0; step < 60; step++) world.backend.step(DT);
			const { diagnostics } = await world.backend.snapshot({});
			const fields = await world.backend.readFields();
			const where = `${plan.id}, seed ${seed}, wind ${setup.conditions.windSpeed} m/s from ${setup.conditions.windFrom}°, ${setup.conditions.outdoorTemp} °C outside`;
			if (process.env.ROBUST_VERBOSE) console.log(`${where}: fastest ${diagnostics.maxSpeed.toFixed(1)} m/s, divergence ${diagnostics.divergence.toExponential(1)}`);
			expect(fields.u.length, where).toBeGreaterThan(0);
			for (const name of ['u', 'v', 'w', 'p', 'theta'] as const) expect.soft(finite(fields[name]), `${where}: ${name} is finite`).toBe(true);
			expect.soft(diagnostics.maxSpeed, `${where}: fastest air`).toBeLessThan(40);
			expect.soft(diagnostics.divergence, `${where}: divergence`).toBeLessThan(0.05);
			world.dispose();
		}
	});
}

for (const plan of plans) {
	test(`${plan.name}: random fans and purifiers, turned and re-aimed mid-run, keep the solver finite and divergence-free`, async () => {
		test.fixme(KNOWN_UNSTABLE.has(plan.id), 'known issue 1 in docs/plans/2026-10-07-airflow-status.md');
		test.setTimeout((60000 + TRIALS * 20000) * Math.max(1, (0.2 / H) ** 3));
		for (let trial = 0; trial < TRIALS; trial++) {
			const seed = 50000 + plans.indexOf(plan) * 1000 + trial;
			const rand = random(seed);
			const setup: Setup = { ...setupFor(plan, rand), devices: devicesFor(plan, rand) };
			const world = await World.create(setup, { plans: [plan], models: deviceMap, make, h: H });
			let time = 0;
			const advance = (steps: number) => {
				for (let n = 0; n < steps; n++) {
					world.updateOscillation(time);
					world.backend.step(DT);
					time += DT;
				}
			};
			advance(40);
			// The visitor turns the dials: a new power for every device, a new aim for the freestanding ones, another mix of openings.
			const changed: Setup = {
				...setup,
				openings: openingsFor(plan, rand),
				devices: setup.devices.map((d) => ({ ...d, power: rand(), yaw: d.opening || rand() < 0.5 ? d.yaw : Math.floor(rand() * 360) }))
			};
			world.apply(changed, time);
			advance(60);
			const { diagnostics } = await world.backend.snapshot({});
			const fields = await world.backend.readFields();
			const list = setup.devices.map((d) => `${d.model}${d.opening ? ` in ${d.opening}` : ` at ${d.x.toFixed(1)},${d.z.toFixed(1)}`}`).join('; ');
			const where = `${plan.id}, seed ${seed}, wind ${setup.conditions.windSpeed} m/s, devices: ${list}`;
			if (process.env.ROBUST_VERBOSE) console.log(`${where}: fastest ${diagnostics.maxSpeed.toFixed(1)} m/s, divergence ${diagnostics.divergence.toExponential(1)}`);
			for (const name of ['u', 'v', 'w', 'p', 'theta', 'particulates'] as const) expect.soft(finite(fields[name]), `${where}: ${name} is finite`).toBe(true);
			expect.soft(diagnostics.maxSpeed, `${where}: fastest air`).toBeLessThan(40);
			expect.soft(diagnostics.divergence, `${where}: divergence`).toBeLessThan(0.05);
			world.dispose();
		}
	});
}

/**
 * The instability this guards against grew by a fixed factor each step (1.65 on the one-bedroom, 1.08 on the studio) from
 * a tiny start, so a short run can look fine. Thirty simulated seconds in a steady wind, and in still cold air where only
 * buoyancy pushes, must stay bounded.
 */
for (const plan of plans) {
	test(`${plan.name}: thirty simulated seconds in a steady wind, and in still cold air, stay bounded`, async () => {
		test.setTimeout(150000 * Math.max(1, (0.2 / H) ** 3));
		for (const [name, wind, outside] of [['wind 3 m/s', 3, 15], ['still, -5 C', 0, -5]] as const) {
			const setup: Setup = { ...blankSetup(plan.id), conditions: { windFrom: 270, windSpeed: wind, outdoorTemp: outside, indoorTemp: 21, outdoorPm25: 0 } };
			for (const opening of plan.openings.filter((o) => o.kind !== 'door').slice(0, 3)) setup.openings[opening.id] = 1;
			const world = await World.create(setup, { plans: [plan], models: new Map(), make, h: H });
			const trace: string[] = [];
			for (let step = 1; step <= 600; step++) {
				world.backend.step(DT);
				if (step % 100 !== 0) continue;
				const { diagnostics } = await world.backend.snapshot({});
				trace.push(`${step}: ${diagnostics.maxSpeed.toFixed(2)} m/s, ${diagnostics.divergence.toExponential(1)}`);
				expect.soft(Number.isFinite(diagnostics.maxSpeed) && diagnostics.maxSpeed < 10, `${plan.id}, ${name}, h ${H}, step ${step}: fastest air ${diagnostics.maxSpeed}`).toBe(true);
				expect.soft(diagnostics.divergence, `${plan.id}, ${name}, h ${H}, step ${step}: divergence`).toBeLessThan(0.01);
			}
			if (process.env.ROBUST_VERBOSE) console.log(`${plan.id}, ${name}, h ${H}: ${trace.join('  ')}`);
			world.dispose();
		}
	});
}
