import { expect, test } from '@playwright/test';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import type { Setup } from '../../src/lib/experiments/airflow/state';
import { deviceMap, random, setupFor } from './randomSetups';

/**
 * Regressions found by running the random stress at finer cells than the page's CPU fallback uses (0.15 m and finer, where
 * the GPU path mostly runs). Both were invisible at 0.2 m and have one cause: the multigrid's coarse operator (see
 * `PressureSolver`). They were drawn by the seeds of `randomSetups.ts`; the second keeps the setup its seed drew then.
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
		// Both Air King 9155 window fans blow in at full power and one window is open, so the fans work near stall. It ran away at
		// 0.15 m and finer, whatever the cycle count, time step or wind, with the same coarse operator; it was first taken for the fan
		// curve's steep slope near stall, but lifting that floor changed nothing once the operator was right. This is the setup the
		// studio's seed 50001 drew before the furniture's boxes shrank to their models (2026-10-28); the seed draws another since.
		test.setTimeout(180000);
		const plan = plans.find((p) => p.id === 'studio')!;
		const setup: Setup = {
			plan: 'studio',
			furniture: true,
			openings: { 'front-door': 0, 'bathroom-door': 0, 'kitchen-window': 0, 'main-east-window-1': 0, 'main-east-window-2': 0, 'main-south-window': 1 },
			conditions: { windFrom: 45, windSpeed: 9.5, outdoorTemp: 20, indoorTemp: 20.5, outdoorPm25: 305 },
			devices: [
				{ id: 'd1', model: 'air-king-9126', x: 0.5409046815708279, y: 0, z: 2.2071998024359347, yaw: 69, tilt: 48, power: 2 / 3, height: 0.889, oscillation: { on: true, sweep: 68, period: 14 } },
				{ id: 'd2', model: 'air-king-9155', x: 1.2, y: 1.05, z: 5.4, yaw: 0, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 }, opening: 'kitchen-window', intake: true },
				{ id: 'd3', model: 'air-king-9155', x: 7.8, y: 0.9, z: 1.5, yaw: 270, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 }, opening: 'main-east-window-1', intake: true }
			]
		};
		for (const h of [0.2, 0.15, 0.1]) {
			const world = await World.create(setup, { plans: [plan], models: deviceMap, make, h });
			const ran = await runaway(world, 60);
			expect.soft(ran, `h ${h}: the air ran away at step ${ran?.step} (${ran?.fastest} m/s)`).toBeNull();
			world.dispose();
		}
	});
});
