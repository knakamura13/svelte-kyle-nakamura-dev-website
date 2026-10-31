/* Browser side of scenarios.gpu.ts: the purifier Scenarios on GpuBackend at the page's finest grid, stepped as the page steps them. */
import { World, type BackendFactory } from '$lib/experiments/airflow/sim/world';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { plans } from '$lib/experiments/airflow/homes/plans';
import { DEVICE_MODELS } from '$lib/experiments/airflow/devices/catalog';
import { PURIFIER_MARKS } from '$lib/experiments/airflow/devices/model';
import { SCENARIOS } from '$lib/experiments/airflow/scenarios';
import { ppmFromUgPerM3 } from '$lib/experiments/airflow/units';
import type { Setup } from '$lib/experiments/airflow/state';

/* eslint-disable @typescript-eslint/no-explicit-any */

const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
let shared: GpuContext | null = null;

/** The page's step: at most a twentieth of a second, and at most three cells at the fastest air (sim/session.ts `advance`). */
const stable = (h: number, maxSpeed: number) => Math.min(1 / 20, (3 * h) / Math.max(maxSpeed, 0.5));

/** Each purifier Scenario and its variants, as tests/solver/scenario-presets.spec.ts makes them, with the room each notice is about. */
function variant(name: string): { setup: Setup; smoke: number; room: string } {
	const clearing = SCENARIOS.find((s) => s.id === 'clearing-smoke')!;
	const smoky = SCENARIOS.find((s) => s.id === 'smoky-day')!;
	const copy = (setup: Setup) => JSON.parse(JSON.stringify(setup)) as Setup;
	switch (name) {
		case 'clearing-high':
			return { setup: copy(clearing.setup), smoke: clearing.smoke!, room: 'bedroom-2' };
		case 'clearing-low': {
			const setup = copy(clearing.setup);
			setup.devices[0].power = PURIFIER_MARKS.low;
			return { setup, smoke: clearing.smoke!, room: 'bedroom-2' };
		}
		case 'clearing-window': {
			const setup = copy(clearing.setup);
			setup.devices[0].power = 0;
			setup.openings['bedroom-2-window'] = 1;
			return { setup, smoke: clearing.smoke!, room: 'bedroom-2' };
		}
		case 'smoky-shut':
			return { setup: copy(smoky.setup), smoke: smoky.smoke!, room: 'main' };
		case 'smoky-open': {
			const setup = copy(smoky.setup);
			Object.assign(setup.openings, { 'main-east-window-1': 1, 'main-east-window-2': 1, 'main-south-window': 1 });
			return { setup, smoke: smoky.smoke!, room: 'main' };
		}
	}
	throw new Error(`No variant called ${name}.`);
}

/** Runs a variant at cell size `h` and returns its room's PM2.5, µg/m³, at each of `times` (simulated seconds, ascending), and whether every reading was finite. */
async function pm25(name: string, h: number, times: number[]) {
	const { setup, smoke, room } = variant(name);
	const make: BackendFactory = async (config, initial) => GpuBackend.create({ ...config }, { ...initial, particulates: smoke }, (shared ??= await GpuContext.create()));
	const world = await World.create(setup, { plans, models, make, h });
	const index = world.raster.plan.rooms.findIndex((r) => r.id === room);
	const readings: number[] = [];
	let finite = true;
	let maxSpeed = 0;
	let time = 0;
	let read = 0;
	for (const at of times) {
		while (time < at - 1e-9) {
			const dt = Math.min(stable(h, maxSpeed), at - time);
			world.backend.step(dt);
			time += dt;
			// The page reads the fastest air back as it goes; twice a simulated second is often enough to keep the step stable.
			if (time - read >= 0.5) {
				maxSpeed = (await world.backend.snapshot({})).diagnostics.maxSpeed;
				read = time;
				if (!Number.isFinite(maxSpeed)) finite = false;
			}
		}
		const shot = await world.backend.snapshot({ rooms: true });
		const value = shot.rooms![index].particulates / ppmFromUgPerM3(1);
		if (!Number.isFinite(value)) finite = false;
		readings.push(value);
	}
	const cells = world.backend.grid.cells;
	world.dispose();
	return { readings, finite, cells };
}

(window as any).scenarios = { pm25 };
(window as any).harnessReady = true;
