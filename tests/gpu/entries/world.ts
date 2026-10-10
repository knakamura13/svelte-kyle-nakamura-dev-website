/* Browser side of world.gpu.ts: the same World on CpuBackend and on GpuBackend, compared through the backend interface. */
import { World, type BackendFactory } from '$lib/experiments/airflow/sim/world';
import { CpuBackend } from '$lib/experiments/airflow/solver/cpu/backend';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { plans } from '$lib/experiments/airflow/homes/plans';
import { DEVICE_MODELS } from '$lib/experiments/airflow/devices/catalog';
import { SCENARIOS } from '$lib/experiments/airflow/scenarios';
import { blankSetup, type Setup } from '$lib/experiments/airflow/state';
import type { FlowBackend } from '$lib/experiments/airflow/solver/backend';

/* eslint-disable @typescript-eslint/no-explicit-any */

const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
let shared: GpuContext | null = null;
const cpu: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const gpu: BackendFactory = async (config, initial) => GpuBackend.create({ ...config, scalarSubsteps: undefined }, initial, (shared ??= await GpuContext.create()));

function compareArrays(pairs: [ArrayLike<number>, ArrayLike<number>][]) {
	let maxAbs = 0;
	let scale = 0;
	for (const [a, b] of pairs)
		for (let n = 0; n < b.length; n++) {
			scale = Math.max(scale, Math.abs(b[n]));
			maxAbs = Math.max(maxAbs, Math.abs(a[n] - b[n]));
		}
	return { maxAbs, scale, rel: maxAbs / Math.max(scale, 1e-30) };
}

/** Two-bedroom home, 4 m/s west wind, a living room window and a bedroom window open (with its door), one catalog fan. */
function windySetup(): Setup {
	const setup = blankSetup('two-bedroom');
	setup.conditions = { ...setup.conditions, windFrom: 270, windSpeed: 4, outdoorTemp: 21, indoorTemp: 21, outdoorPm25: 0 };
	setup.openings = { 'living-window-1': 1, 'bedroom-1-window': 1, 'bedroom-1-door': 1 };
	setup.devices = [
		{ id: 'f1', model: DEVICE_MODELS[0].id, x: 2.4, z: 5.4, y: 0, yaw: 90, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 } } as any
	];
	return setup;
}

async function run(setup: Setup, make: BackendFactory, h: number, steps: number, dt: number) {
	const world = await World.create(setup, { plans, models, make, h });
	for (let s = 0; s < steps; s++) world.backend.step(dt);
	return world;
}

async function windyHome(steps: number, h: number, dt: number) {
	const a = await run(windySetup(), cpu, h, steps, dt);
	const b = await run(windySetup(), gpu, h, steps, dt);
	const [sa, sb] = await Promise.all([a.backend.snapshot({ sliceY: 1.1, rooms: true }), b.backend.snapshot({ sliceY: 1.1, rooms: true })]);
	const slice = compareArrays([
		[sb.slice!.u, sa.slice!.u],
		[sb.slice!.v, sa.slice!.v],
		[sb.slice!.w, sa.slice!.w],
		[sb.slice!.speed, sa.slice!.speed]
	]);
	const d = (x: any) => ({ maxSpeed: x.maxSpeed, divergence: x.divergence, cfl: x.cfl, inAir: x.mass.inAir, steps: x.steps, time: x.time });
	const result = {
		kind: [a.backend.kind, b.backend.kind],
		cells: a.backend.grid.cells,
		fluidCells: [a.backend.fluidCells, b.backend.fluidCells],
		slice,
		sliceTheta: compareArrays([[sb.slice!.theta, sa.slice!.theta]]),
		fluid: compareArrays([[sb.slice!.fluid, sa.slice!.fluid]]),
		diagnostics: { cpu: d(sa.diagnostics), gpu: d(sb.diagnostics) },
		fanFlow: { cpu: Array.from(sa.fanFlow), gpu: Array.from(sb.fanFlow) },
		rooms: compareArrays([
			[sb.rooms!.map((r) => r.speed), sa.rooms!.map((r) => r.speed)],
			[sb.rooms!.map((r) => r.volume), sa.rooms!.map((r) => r.volume)]
		])
	};
	// The rest of the interface: point samples, particles in a snapshot, and a readFields/writeFields round trip.
	const points = new Float32Array([1.2, 1.1, 4.2, 2.4, 1.5, 5.4, 6.9, 0.9, 6.0, 10.5, 1.8, 6.0, 3.0, 2.0, 1.5]);
	const [pa, pb] = await Promise.all([a.backend.samplePoints(points), b.backend.samplePoints(points)]);
	b.backend.configureParticles({ tracers: 500, smoke: 300, scale: 50, seed: 3 });
	for (let f = 0; f < 10; f++) b.backend.stepParticles(1 / 60);
	const withParticles = await b.backend.snapshot({ particles: true });
	const before = await b.backend.readFields();
	b.backend.writeFields({ ...before, u: before.u.map((x) => 2 * x) });
	const doubled = await b.backend.readFields();
	b.backend.writeFields(before);
	const restored = await b.backend.readFields();
	const extra = {
		samples: compareArrays([[pb, pa]]),
		sampleCount: [pa.length, pb.length],
		tracers: withParticles.tracers?.length ?? -1,
		smoke: withParticles.smoke?.length ?? -1,
		tracersFinite: Array.from(withParticles.tracers ?? []).every(Number.isFinite),
		writeDoubled: compareArrays([[doubled.u, before.u.map((x) => 2 * x)]]),
		writeRestored: compareArrays([
			[restored.u, before.u],
			[restored.p, before.p],
			[restored.theta, before.theta]
		])
	};
	a.dispose();
	b.dispose();
	return { ...result, ...extra };
}

/** Flow in through the windows on one facade, m³/s, from the fields (positive into the home). */
function facadeFlow(world: World, fields: { u: Float32Array; w: Float32Array }, facade: string) {
	const g = world.backend.grid;
	let flow = 0;
	for (const opening of world.raster.openings) {
		if (opening.facade !== facade) continue;
		const field = opening.axis === 0 ? fields.u : fields.w;
		const open = opening.axis === 0 ? world.raster.geometry.au : world.raster.geometry.aw;
		const sign = facade === 'west' || facade === 'south' ? 1 : -1;
		for (const face of opening.faces) flow += sign * field[face.index] * g.h * g.h * open[face.index];
	}
	return flow;
}

async function crossVentilation(seconds: number, h: number) {
	const scenario = SCENARIOS.find((s) => s.id === 'cross-ventilation')!;
	const dt = 0.05;
	const steps = Math.round(seconds / dt);
	const out: Record<string, { west: number; east: number }> = {};
	for (const [name, make] of [
		['cpu', cpu],
		['gpu', gpu]
	] as const) {
		const world = await run(structuredClone(scenario.setup), make, h, steps, dt);
		const fields = await world.backend.readFields();
		const snap = await world.backend.snapshot({});
		let maxU = 0;
		for (const x of fields.u) maxU = Math.max(maxU, Math.abs(x));
		out[name] = { west: facadeFlow(world, fields, 'west'), east: facadeFlow(world, fields, 'east'), maxU, maxSpeed: snap.diagnostics.maxSpeed, steps: snap.diagnostics.steps, windows: world.raster.openings.filter((o) => o.facade === 'west' || o.facade === 'east').map((o) => o.spec.id + ':' + o.faces.length).join(',') } as any;
		world.dispose();
	}
	return out;
}

/**
 * Wall time per step of the house plan on the GPU backend, after a warm-up. `tight`: steps submitted back to back with
 * nothing awaited, so no CFL reading arrives and every step takes the most scalar substeps (64). `paced`: batches of
 * `batch` steps with the queue awaited after each batch, as a page does between frames, so the substep count follows
 * the flow; this includes the wait for each batch, so it slightly overstates the GPU time.
 */
async function houseStepTime(h: number, steps: number, mode: 'tight' | 'paced' = 'tight', batch = 4) {
	const setup = blankSetup('house');
	setup.conditions = { ...setup.conditions, windFrom: 270, windSpeed: 4 };
	const world = await World.create(setup, { plans, models, make: gpu, h });
	const backend = world.backend as FlowBackend & { solver: any };
	const device = backend.solver.device;
	const dt = 0.05;
	const run = async (count: number) => {
		for (let s = 0; s < count; s++) {
			backend.step(dt);
			if (mode === 'paced' && (s + 1) % batch === 0) {
				await device.queue.onSubmittedWorkDone();
				// Let the CFL read-back's callback run.
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}
		await device.queue.onSubmittedWorkDone();
	};
	await run(8);
	const start = performance.now();
	await run(steps);
	const ms = (performance.now() - start) / steps;
	const { nx, ny, nz } = backend.grid;
	const result = { h, mode, nx, ny, nz, cells: backend.grid.cells, fluidCells: backend.fluidCells, ms };
	world.dispose();
	return result;
}

/** GpuBackend's profiling readout on the house plan: per kernel group, ms, averaged over the profiled steps. */
async function houseProfile(h: number) {
	const setup = blankSetup('house');
	setup.conditions = { ...setup.conditions, windFrom: 270, windSpeed: 4 };
	const make: BackendFactory = (config, initial) => GpuBackend.create({ ...config, scalarSubsteps: undefined }, initial, undefined, { profile: true });
	const world = await World.create(setup, { plans, models, make, h });
	const backend = world.backend as GpuBackend;
	backend.solver.device.pushErrorScope('validation');
	for (let s = 0; s < 40; s++) backend.step(0.05);
	const error = await backend.solver.device.popErrorScope();
	const groups = await backend.profile();
	world.dispose();
	return { validation: error ? error.message : '', groups };
}

(window as any).world = { windyHome, crossVentilation, houseStepTime, houseProfile };
(window as any).harnessReady = true;
