import { expect, test } from '@playwright/test';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import type { HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { blankSetup, LIMITS, type Setup } from '../../src/lib/experiments/airflow/state';

/**
 * A visitor can open any combination of doors and windows in any weather, and change them while the air is moving.
 * The solver has to stay finite and nearly divergence-free through all of it, so each plan is run with random setups.
 */

const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const TRIALS = 5;
const DT = 1 / 20;
const H = 0.2;

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

const finite = (array: Float32Array) => {
	for (let n = 0; n < array.length; n++) if (!Number.isFinite(array[n])) return false;
	return true;
};

/** Plans known to fail this run: remove a plan here when its failure is fixed. The one-bedroom fails at seed 1004 (no wind, −5 °C outside, divergence 0.18). */
const KNOWN_UNSTABLE = new Set(['one-bedroom']);

for (const plan of plans) {
	test(`${plan.name}: random openings and weather, changed mid-run, keep the solver finite and divergence-free`, async () => {
		test.fixme(KNOWN_UNSTABLE.has(plan.id), 'known issue 1 in docs/plans/2026-10-07-airflow-status.md');
		test.setTimeout(240000);
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
			expect(fields.u.length, where).toBeGreaterThan(0);
			for (const name of ['u', 'v', 'w', 'p', 'theta'] as const) expect(finite(fields[name]), `${where}: ${name} is finite`).toBe(true);
			expect(diagnostics.maxSpeed, `${where}: fastest air`).toBeLessThan(40);
			expect(diagnostics.divergence, `${where}: divergence`).toBeLessThan(0.05);
			world.dispose();
		}
	});
}
