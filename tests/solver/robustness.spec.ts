import { expect, test } from '@playwright/test';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { blankSetup, type Setup } from '../../src/lib/experiments/airflow/state';
import { deviceMap, devicesFor, openingsFor, random, setupFor } from './randomSetups';

/**
 * A visitor can open any combination of doors and windows in any weather, put fans and purifiers anywhere, and change
 * all of it while the air is moving. The solver has to stay finite and nearly divergence-free through all of it, so
 * each plan is run with random setups (`randomSetups.ts`).
 *
 * Environment: `ROBUST_TRIALS` seeds per plan (default 5), `ROBUST_H` cell size in metres (default 0.2: the page's CPU
 * fallback uses about 0.2 and the GPU path 0.05 to 0.1), `ROBUST_VERBOSE=1` to print each seed's fastest air.
 * Every failing seed is reported, not only the first.
 */

const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const TRIALS = Number(process.env.ROBUST_TRIALS ?? 5);
const DT = 1 / 20;
const H = Number(process.env.ROBUST_H ?? 0.2);
/** Specific seeds to run instead of the first `ROBUST_TRIALS`, for reproducing a failure: `ROBUST_SEEDS=1004,52004`. */
const ONLY = process.env.ROBUST_SEEDS?.split(',').map(Number);
/** The seeds a plan's test runs: `base + 1000 × plan + trial + offset`, or those of `ROBUST_SEEDS` that fall in its range. */
const seeds = (base: number, planIndex: number, offset: number) => {
	const first = base + planIndex * 1000;
	return ONLY ? ONLY.filter((seed) => seed >= first && seed < first + 1000) : Array.from({ length: TRIALS }, (_, trial) => first + trial + offset);
};
/** Time allowed for a test, scaled with the cost of a finer grid. */
const allowed = (ms: number) => ms * Math.max(1, (0.2 / H) ** 3);

/** The fastest air allowed at any step, m/s. Room air never comes near it, so passing it means the solution has run away. */
const RUNAWAY = 40;

const finite = (array: Float32Array) => {
	for (let n = 0; n < array.length; n++) if (!Number.isFinite(array[n])) return false;
	return true;
};

/**
 * Steps `world` `count` times, from step number `first`, and stops at the first step where the air has run away. A blown-up
 * case then ends at once, where the solver's own substep count could spend minutes on each further step. Returns where it
 * stopped, or null when it ran through.
 */
async function advance(world: World, count: number, first = 0, tick?: (step: number) => void) {
	for (let n = 0; n < count; n++) {
		tick?.(first + n);
		world.backend.step(DT);
		const { diagnostics } = await world.backend.snapshot({});
		if (!Number.isFinite(diagnostics.maxSpeed) || diagnostics.maxSpeed > RUNAWAY) return { step: first + n + 1, fastest: diagnostics.maxSpeed };
	}
	return null;
}

/** What is left to check at the end of a run that did not run away. */
async function check(world: World, where: string, names: readonly ('u' | 'v' | 'w' | 'p' | 'theta' | 'particulates')[]) {
	const { diagnostics } = await world.backend.snapshot({});
	const fields = await world.backend.readFields();
	if (process.env.ROBUST_VERBOSE) console.log(`${where}: fastest ${diagnostics.maxSpeed.toFixed(1)} m/s, divergence ${diagnostics.divergence.toExponential(1)}`);
	for (const name of names) expect.soft(finite(fields[name]), `${where}: ${name} is finite`).toBe(true);
	expect.soft(diagnostics.divergence, `${where}: divergence`).toBeLessThan(0.05);
}

for (const plan of plans) {
	test(`${plan.name}: random openings and weather, changed mid-run, keep the solver finite and divergence-free`, async () => {
		test.setTimeout(allowed(60000 + TRIALS * 20000));
		for (const seed of seeds(0, plans.indexOf(plan), 1)) {
			const rand = random(seed);
			const setup = setupFor(plan, rand);
			const where = `${plan.id}, seed ${seed}, h ${H}, wind ${setup.conditions.windSpeed} m/s from ${setup.conditions.windFrom}°, ${setup.conditions.outdoorTemp} °C outside`;
			const world = await World.create(setup, { plans: [plan], models: new Map(), make, h: H });
			let ran = await advance(world, 40);
			if (!ran) {
				// Now the visitor opens and closes things while the air is moving.
				world.apply({ ...setup, openings: openingsFor(plan, rand) }, 40 * DT);
				ran = await advance(world, 60, 40);
			}
			expect.soft(ran, `${where}: the air ran away at step ${ran?.step} (${ran?.fastest} m/s)`).toBeNull();
			if (!ran) await check(world, where, ['u', 'v', 'w', 'p', 'theta']);
			world.dispose();
		}
	});
}

for (const plan of plans) {
	test(`${plan.name}: random fans and purifiers, turned and re-aimed mid-run, keep the solver finite and divergence-free`, async () => {
		test.setTimeout(allowed(60000 + TRIALS * 20000));
		for (const seed of seeds(50000, plans.indexOf(plan), 0)) {
			const rand = random(seed);
			const setup: Setup = { ...setupFor(plan, rand), devices: devicesFor(plan, rand) };
			const list = setup.devices.map((d) => `${d.model}${d.opening ? ` in ${d.opening}` : ` at ${d.x.toFixed(1)},${d.z.toFixed(1)}`}`).join('; ');
			const where = `${plan.id}, seed ${seed}, h ${H}, wind ${setup.conditions.windSpeed} m/s, devices: ${list}`;
			const world = await World.create(setup, { plans: [plan], models: deviceMap, make, h: H });
			const oscillate = (step: number) => world.updateOscillation(step * DT);
			let ran = await advance(world, 40, 0, oscillate);
			if (!ran) {
				// The visitor turns the dials: a new power for every device, a new aim for the freestanding ones, another mix of openings.
				const changed: Setup = {
					...setup,
					openings: openingsFor(plan, rand),
					devices: setup.devices.map((d) => ({ ...d, power: rand(), yaw: d.opening || rand() < 0.5 ? d.yaw : Math.floor(rand() * 360) }))
				};
				world.apply(changed, 40 * DT);
				ran = await advance(world, 60, 40, oscillate);
			}
			expect.soft(ran, `${where}: the air ran away at step ${ran?.step} (${ran?.fastest} m/s)`).toBeNull();
			if (!ran) await check(world, where, ['u', 'v', 'w', 'p', 'theta', 'particulates']);
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
		test.setTimeout(allowed(150000));
		for (const [name, wind, outside] of [['wind 3 m/s', 3, 15], ['still, -5 C', 0, -5]] as const) {
			const setup: Setup = { ...blankSetup(plan.id), conditions: { windFrom: 270, windSpeed: wind, outdoorTemp: outside, indoorTemp: 21, outdoorPm25: 0 } };
			for (const opening of plan.openings.filter((o) => o.kind !== 'door').slice(0, 3)) setup.openings[opening.id] = 1;
			const world = await World.create(setup, { plans: [plan], models: new Map(), make, h: H });
			const trace: string[] = [];
			for (let block = 0; block < 6; block++) {
				const ran = await advance(world, 100, block * 100);
				expect.soft(ran, `${plan.id}, ${name}, h ${H}: the air ran away at step ${ran?.step} (${ran?.fastest} m/s)`).toBeNull();
				if (ran) break;
				const { diagnostics } = await world.backend.snapshot({});
				trace.push(`${(block + 1) * 100}: ${diagnostics.maxSpeed.toFixed(2)} m/s, ${diagnostics.divergence.toExponential(1)}`);
				expect.soft(diagnostics.maxSpeed, `${plan.id}, ${name}, h ${H}, step ${(block + 1) * 100}: fastest air`).toBeLessThan(10);
				expect.soft(diagnostics.divergence, `${plan.id}, ${name}, h ${H}, step ${(block + 1) * 100}: divergence`).toBeLessThan(0.01);
			}
			if (process.env.ROBUST_VERBOSE) console.log(`${plan.id}, ${name}, h ${H}: ${trace.join('  ')}`);
			world.dispose();
		}
	});
}
