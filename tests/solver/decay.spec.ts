import { expect, test } from '@playwright/test';
import { FAN_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { newDevice } from '../../src/lib/experiments/airflow/devices/placement';
import type { DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { planById } from '../../src/lib/experiments/airflow/homes/plans';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { blankSetup } from '../../src/lib/experiments/airflow/state';

/**
 * A room with nothing pushing on its air lets it come to rest. The kinetic energy of the flow, in the solver's own norm
 * (the open-weighted squares of the face velocities, which the pressure projection can only lower), may fall, and must
 * never grow once the fan has stopped. A solver that feeds energy back into a closed room (the velocity advection did,
 * with the full MacCormack correction) shows a sustained circulation that nothing started and nothing drives, and the
 * room's air never settles.
 */

const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const box = FAN_MODELS.find((m) => m.kind === 'box-fan')!;
const models = new Map<string, DeviceModel>([[box.id, box]]);
const plan = planById('studio')!;
const DT = 0.05;

/** The staggered grid's kinetic energy per unit mass, m²/s² times m³: ½ Σ a·u² over the face lattices, times the cell volume. */
async function faceEnergy(world: World) {
	const fields = await world.backend.readFields();
	const { nx, ny, nz, sx, sxy, cellVolume } = world.backend.grid;
	const { au, av, aw } = world.raster.geometry;
	let sum = 0;
	for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) sum += au[i + sx * j + sxy * k] * fields.u[i + sx * j + sxy * k] ** 2;
	for (let k = 0; k < nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) sum += av[i + sx * j + sxy * k] * fields.v[i + sx * j + sxy * k] ** 2;
	for (let k = 0; k <= nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) sum += aw[i + sx * j + sxy * k] * fields.w[i + sx * j + sxy * k] ** 2;
	return 0.5 * sum * cellVolume;
}

test.describe('a closed room at rest', () => {
	test.describe.configure({ timeout: 240000 });

	test('settles after its fan stops: the kinetic energy never grows again, and is nearly gone a minute later', async () => {
		const made = newDevice(plan, box, []);
		if (!('device' in made)) throw new Error(made.reason);
		const fan = { ...made.device, power: 1 };
		// Every opening shut, the same temperature inside and out, no wind: the fan is the only thing that ever moves the air.
		const shut = Object.fromEntries(plan.openings.map((o) => [o.id, 0]));
		const setup = { ...blankSetup(plan.id), devices: [fan], openings: shut, conditions: { ...blankSetup(plan.id).conditions, windSpeed: 0, outdoorTemp: 21, indoorTemp: 21 } };
		const world = await World.create(setup, { plans: [plan], models, make, h: 0.2 });
		try {
			let time = 0;
			while (time < 20 - 1e-9) {
				world.backend.step(DT);
				time += DT;
			}
			const running = await faceEnergy(world);
			expect(running, 'the fan stirred the room').toBeGreaterThan(0.05);

			world.apply({ ...setup, devices: [{ ...fan, power: 0 }] }, time);
			const samples: number[] = [];
			for (let second = 1; second <= 80; second++) {
				for (let n = 0; n < Math.round(1 / DT); n++) world.backend.step(DT);
				samples.push(await faceEnergy(world));
			}
			const worst = samples.slice(5).reduce((growth, e, n) => Math.max(growth, e / samples[n + 4]), 0);
			console.log(`energy with the fan on ${running.toExponential(2)}; 1 s after ${samples[0].toExponential(2)}; 40 s ${samples[39].toExponential(2)}; 80 s ${samples[79].toExponential(2)}; largest one-second growth after 5 s: ${((worst - 1) * 100).toFixed(2)} %`);
			expect(worst, 'no second of the decay is a second of growth').toBeLessThan(1.02);
			expect(samples[59], 'a minute after the fan stopped').toBeLessThan(0.1 * samples[4]);
		} finally {
			world.dispose();
		}
	});
});
