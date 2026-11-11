/* Browser side of window-fan-steps.gpu.ts: the window-fan Scenario on GpuBackend, from rest, at the steps the page uses. */
import { DEVICE_MODELS } from '$lib/experiments/airflow/devices/catalog';
import type { FanModel } from '$lib/experiments/airflow/devices/types';
import { planById } from '$lib/experiments/airflow/homes/plans';
import { SCENARIOS } from '$lib/experiments/airflow/scenarios';
import { World } from '$lib/experiments/airflow/sim/world';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';

/* eslint-disable @typescript-eslint/no-explicit-any */

const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
const preset = SCENARIOS.find((s) => s.id === 'window-fan')!;
let shared: GpuContext | null = null;

const create = async (h: number) =>
	World.create(preset.setup, { plans: [planById(preset.setup.plan)!], models, make: async (config, initial) => GpuBackend.create({ ...config }, initial, (shared ??= await GpuContext.create())), h });

/** Steps the Scenario's world from rest for `seconds` at 1/`rate` s, reading the diagnostics after every step, and stops past `limit` m/s. */
async function bounded(h: number, rate: number, seconds: number, limit: number) {
	const world = await create(h);
	let fastest = 0;
	let at = 0;
	for (let n = 1; n <= Math.round(seconds * rate); n++) {
		world.backend.step(1 / rate);
		const { diagnostics } = await world.backend.snapshot({});
		if (!(diagnostics.maxSpeed <= fastest)) [fastest, at] = [diagnostics.maxSpeed, n];
		if (!(diagnostics.maxSpeed < limit)) break;
	}
	const { diagnostics } = await world.backend.snapshot({});
	const g = world.backend.grid;
	world.dispose();
	return { fastest, at, divergence: diagnostics.divergence, cells: `${g.nx}x${g.ny}x${g.nz}` };
}

/** Net flow into the home through an exterior opening, m³/s (tests/solver/scenario-presets.spec.ts `inflow`). */
function inflow(world: World, fields: { u: Float32Array; w: Float32Array }, id: string) {
	const opening = world.raster.openings.find((o) => o.spec.id === id)!;
	const { au, aw } = world.raster.geometry;
	const { h } = world.backend.grid;
	let sum = 0;
	for (const face of opening.faces) sum += (opening.axis === 0 ? fields.u[face.index] * au[face.index] : fields.w[face.index] * aw[face.index]) * h * h;
	return opening.facade === 'west' || opening.facade === 'north' ? sum : -sum;
}

/** Runs the Scenario `seconds` at 1/`rate` s and returns the flow in through the fan's window and the bedroom window, and each room's mean speed. */
async function delivery(h: number, rate: number, seconds: number) {
	const world = await create(h);
	for (let n = 0; n < Math.round(seconds * rate); n++) {
		world.backend.step(1 / rate);
		// Wait for the GPU now and then, as the page does, so its queue stays short.
		if (n % 10 === 9) await world.backend.snapshot({});
	}
	const shot = await world.backend.snapshot({ rooms: true });
	const fields = await world.backend.readFields();
	const result = {
		drawn: inflow(world, fields, preset.setup.devices[0].opening!),
		out: inflow(world, fields, 'bedroom-1-window'),
		rated: (DEVICE_MODELS.find((m) => m.id === preset.setup.devices[0].model) as FanModel).flow.high,
		speeds: Object.fromEntries(world.raster.plan.rooms.map((room, n) => [room.id, shot.rooms![n].speed])),
		fastest: shot.diagnostics.maxSpeed
	};
	world.dispose();
	return result;
}

(window as any).windowFan = { bounded, delivery };
(window as any).harnessReady = true;
