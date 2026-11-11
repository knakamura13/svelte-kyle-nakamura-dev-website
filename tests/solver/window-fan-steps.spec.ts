import { expect, test } from '@playwright/test';
import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import type { DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { planById } from '../../src/lib/experiments/airflow/homes/plans';
import { SCENARIOS } from '../../src/lib/experiments/airflow/scenarios';
import { World } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';

/**
 * Issue 91: the window-fan Scenario's intake fan ran away at the page's 1× step, 1/60 s, on the cells a fast GPU picks. Its face went
 * from still air to the fan's free-delivery speed in one step, and the pressure that accelerates the air beside it in that step grows as
 * the step shrinks: past the fan's 25 Pa shut-off at 1/30 s and shorter on 0.1 m cells. The stalled face then held the room near that
 * pressure and fed the air from it, and the fastest air passed 13 m/s by step 11 and 160 m/s by step 21 at 0.1 m and 1/60 s. Now the face
 * eases toward its curve over `FAN_SPIN_UP`, as a fan disk's push does.
 *
 * Each case runs the Scenario's world from rest for a second and a half, through the fan's spin-up, at a step the page uses: 1/120 s
 * (2× frame rate), 1/60 s (a frame at 1×) and 1/30 s. tests/gpu/window-fan-steps.gpu.ts runs the same cases on the GPU.
 */

const models = new Map<string, DeviceModel>(DEVICE_MODELS.map((m) => [m.id, m]));
const preset = SCENARIOS.find((s) => s.id === 'window-fan')!;
const SECONDS = 1.5;
/**
 * The fastest air allowed at any step, m/s: twice the Air King 9155's free-delivery speed through its window (2470 cfm over the 0.63 m²
 * the window opens, 1.85 m/s). The running fan's jet stays under 1.7 m/s; the runaway passed this within ten steps.
 */
const FASTEST = 3.7;

for (const h of [0.15, 0.1, 0.075])
	for (const rate of [120, 60, 30])
		test(`the window-fan Scenario stays bounded from rest on ${h} m cells at a step of 1/${rate} s`, async () => {
			test.setTimeout(300_000);
			const world = await World.create(preset.setup, { plans: [planById(preset.setup.plan)!], models, make: (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial), h });
			let fastest = 0;
			let at = 0;
			for (let n = 1; n <= Math.round(SECONDS * rate); n++) {
				world.backend.step(1 / rate);
				const { diagnostics } = await world.backend.snapshot({});
				if (!(diagnostics.maxSpeed <= fastest)) [fastest, at] = [diagnostics.maxSpeed, n];
				if (!(diagnostics.maxSpeed < FASTEST)) break;
			}
			const { diagnostics } = await world.backend.snapshot({});
			console.log(`window fan, ${h} m, 1/${rate} s: fastest ${fastest.toFixed(2)} m/s at step ${at}, divergence ${diagnostics.divergence.toExponential(1)}`);
			expect(fastest, `fastest air, at step ${at}`).toBeLessThan(FASTEST);
			expect(diagnostics.divergence).toBeLessThan(0.05);
			world.dispose();
		});
