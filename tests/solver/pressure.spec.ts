import { expect, test } from '@playwright/test';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import type { Setup } from '../../src/lib/experiments/airflow/state';
import { deviceMap, devicesFor, random, setupFor } from './randomSetups';

/**
 * Regressions found by running the random stress at finer cells than the page's CPU fallback uses (0.15 m and finer, where
 * the GPU path mostly runs). Both were invisible at 0.2 m and have one cause: the multigrid's coarse operator (see
 * `PressureSolver`). The seeds are those of `randomSetups.ts`.
 */

const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const DT = 1 / 20;
const RUNAWAY = 40;

/** Steps `world` and returns where the air ran away (over 40 m/s, or not a number), or null if it ran through. */
async function runaway(world: World, steps: number) {
	for (let step = 1; step <= steps; step++) {
		world.backend.step(DT);
		const { diagnostics } = await world.backend.snapshot({});
		if (!Number.isFinite(diagnostics.maxSpeed) || diagnostics.maxSpeed > RUNAWAY) return { step, fastest: diagnostics.maxSpeed };
	}
	return null;
}

test.describe('stability at fine cells', () => {
	test('the one-bedroom plan at 0.15 m stays bounded whatever the number of pressure cycles', async () => {
		// Seed 1004: no wind, −5 °C outside, a few windows half open. With the coarse operator halved at interior faces
		// (rediscretised, not Galerkin) the coarse correction was about twice too large, smooth pressure errors flipped sign
		// each cycle, and the solve ran away at three and five cycles and not at four and six.
		test.setTimeout(180000);
		const plan = plans.find((p) => p.id === 'one-bedroom')!;
		for (const cycles of [2, 3, 4, 5, 6]) {
			const world = await World.create(setupFor(plan, random(1004)), { plans: [plan], models: new Map(), make, h: 0.15, config: { pressure: { cycles } } });
			const ran = await runaway(world, 60);
			expect.soft(ran, `${cycles} cycles: the air ran away at step ${ran?.step} (${ran?.fastest} m/s)`).toBeNull();
			world.dispose();
		}
	});

	test('two intake window fans against one small open window stay bounded at 0.15 m and 0.1 m', async () => {
		// Studio seed 50001: both Air King 9155 window fans blow in at full power and one window is open, so the fans work
		// near stall. It ran away at 0.15 m and finer, whatever the cycle count, time step or wind, with the same coarse
		// operator; it was first taken for the fan curve's steep slope near stall, but lifting that floor changed nothing
		// once the operator was right.
		test.setTimeout(180000);
		const plan = plans.find((p) => p.id === 'studio')!;
		for (const h of [0.2, 0.15, 0.1]) {
			const rand = random(50001);
			const setup: Setup = { ...setupFor(plan, rand), devices: devicesFor(plan, rand) };
			expect(setup.devices.filter((d) => d.opening && d.intake && d.power === 1)).toHaveLength(2);
			const world = await World.create(setup, { plans: [plan], models: deviceMap, make, h });
			const ran = await runaway(world, 60);
			expect.soft(ran, `h ${h}: the air ran away at step ${ran?.step} (${ran?.fastest} m/s)`).toBeNull();
			world.dispose();
		}
	});
});
