/* Browser side of volume.gpu.ts: the volume snapshot on the GPU against the CPU's, and what a volume read costs on each backend. */
import { DEVICE_MODELS } from '$lib/experiments/airflow/devices/catalog';
import { plans } from '$lib/experiments/airflow/homes/plans';
import { SCENARIOS } from '$lib/experiments/airflow/scenarios';
import { World, type BackendFactory } from '$lib/experiments/airflow/sim/world';
import type { FlowBackend } from '$lib/experiments/airflow/solver/backend';
import { CpuBackend } from '$lib/experiments/airflow/solver/cpu/backend';
import { WorkerBackend, portOfWorker } from '$lib/experiments/airflow/solver/cpu/proxy';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { FLOW_STRIDE, SCALAR_STRIDE, volumeCells, type Volume } from '$lib/experiments/airflow/solver/volume';
import type { PlanId } from '$lib/experiments/airflow/homes/types';
import { blankSetup, type Setup } from '$lib/experiments/airflow/state';

/* eslint-disable @typescript-eslint/no-explicit-any */

const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
let shared: GpuContext | null = null;
const cpu: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const gpu: BackendFactory = async (config, initial) => GpuBackend.create({ ...config, scalarSubsteps: undefined }, initial, (shared ??= await GpuContext.create()));
/** The CPU solver in a real Web Worker, built from the page's own worker script (served at /worker.js by the test). */
const worker: BackendFactory = (config, initial) => WorkerBackend.create(portOfWorker(new Worker('/worker.js', { type: 'module' })), config, initial);

/** The cross-ventilation Scenario, on any plan: its weather and every window and door of the plan open, so the air moves everywhere. */
function breezy(planId: PlanId): Setup {
	const plan = plans.find((p) => p.id === planId)!;
	const scenario = SCENARIOS.find((s) => s.id === 'cross-ventilation')!;
	const setup = blankSetup(plan.id);
	setup.conditions = { ...scenario.setup.conditions };
	setup.openings = Object.fromEntries(plan.openings.map((o) => [o.id, 1]));
	return setup;
}

/** Largest difference over each lane of the two volumes, and the largest magnitude of that lane, to judge it by. */
function compare(a: Volume, b: Volume) {
	const lanes = { u: [0, 0], v: [0, 0], w: [0, 0], air: [0, 0], theta: [0, 0], particulates: [0, 0] } as Record<string, [number, number]>;
	const names = ['u', 'v', 'w', 'air'];
	for (let n = 0; n < volumeCells(b); n++) {
		for (let l = 0; l < 4; l++) {
			const lane = lanes[names[l]];
			lane[0] = Math.max(lane[0], Math.abs(a.flow[FLOW_STRIDE * n + l] - b.flow[FLOW_STRIDE * n + l]));
			lane[1] = Math.max(lane[1], Math.abs(b.flow[FLOW_STRIDE * n + l]));
		}
		for (const [l, name] of [
			[0, 'theta'],
			[1, 'particulates']
		] as const) {
			const lane = lanes[name];
			lane[0] = Math.max(lane[0], Math.abs(a.scalars[SCALAR_STRIDE * n + l] - b.scalars[SCALAR_STRIDE * n + l]));
			lane[1] = Math.max(lane[1], Math.abs(b.scalars[SCALAR_STRIDE * n + l]));
		}
	}
	return Object.fromEntries(Object.entries(lanes).map(([name, [maxAbs, scale]]) => [name, { maxAbs, scale, rel: maxAbs / Math.max(scale, 1e-30) }]));
}

const spec = (v: Volume) => ({ nx: v.nx, ny: v.ny, nz: v.nz, sx: v.sx, sy: v.sy, sz: v.sz, h: v.h });

/**
 * The kernel alone: the same fields written into both backends (random velocities, temperatures and particulates in every cell, so
 * every block's sums and its share of air are exercised), then one volume read from each. Only the order of f32 sums can differ.
 */
async function sameFields(planId: PlanId, h: number) {
	const setup = blankSetup(planId);
	const a = await World.create(setup, { plans, models, make: cpu, h });
	const b = await World.create(setup, { plans, models, make: gpu, h });
	let seed = 99;
	const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
	const fields = await a.backend.readFields();
	for (const name of ['u', 'v', 'w', 'theta'] as const) for (let n = 0; n < fields[name].length; n++) fields[name][n] = random();
	for (let n = 0; n < fields.particulates.length; n++) fields.particulates[n] = Math.abs(random());
	a.backend.writeFields(fields);
	b.backend.writeFields(fields);
	const [va, vb] = await Promise.all([a.backend.snapshot({ volume: true }), b.backend.snapshot({ volume: true })]);
	const result = { cpuSpec: spec(va.volume!), gpuSpec: spec(vb.volume!), lanes: compare(vb.volume!, va.volume!), cells: volumeCells(va.volume!) };
	a.dispose();
	b.dispose();
	return result;
}

/** The same breezy world stepped on both backends, with smoke released: their volumes agree as closely as their fields do. */
async function sameWorld(planId: PlanId, h: number, steps: number) {
	const out: Volume[] = [];
	for (const make of [cpu, gpu]) {
		const world = await World.create(breezy(planId), { plans, models, make, h });
		world.emit({ x: 2.5, y: 1.2, z: 3.5 }, 0.2);
		for (let n = 0; n < steps; n++) {
			world.backend.step(0.02);
			// The GPU's scalar substeps follow its CFL reading, which needs a read now and then.
			if (n % 4 === 3) await world.backend.snapshot({});
		}
		out.push((await world.backend.snapshot({ volume: true })).volume!);
		world.dispose();
	}
	const [a, b] = out;
	let fastest = 0;
	for (let n = 0; n < volumeCells(a); n++) fastest = Math.max(fastest, Math.hypot(a.flow[4 * n], a.flow[4 * n + 1], a.flow[4 * n + 2]));
	return { spec: spec(a), lanes: compare(b, a), fastest };
}

/**
 * What a volume read adds to a snapshot, ms of wall time from asking to having the arrays: the mean of `runs` snapshots with the
 * volume, against the same without, alternating, each after `steps` steps queued as a running page would have them.
 */
async function cost(backend: FlowBackend, runs: number, steps: number) {
	const time = async (volume: boolean) => {
		for (let n = 0; n < steps; n++) backend.step(0.02);
		const start = performance.now();
		const shot = await backend.snapshot({ volume, sliceY: 1.1 });
		const ms = performance.now() - start;
		if (volume && !shot.volume) throw new Error('No volume came back.');
		return ms;
	};
	// Warm up: pipelines, staging buffers, the worker's first allocations.
	for (let n = 0; n < 3; n++) {
		await time(false);
		await time(true);
	}
	let without = 0;
	let withVolume = 0;
	for (let n = 0; n < runs; n++) {
		without += await time(false);
		withVolume += await time(true);
	}
	return { without: without / runs, withVolume: withVolume / runs, extra: (withVolume - without) / runs };
}

async function costs(planId: PlanId, h: number, on: 'gpu' | 'worker' | 'page', runs = 20, steps = 2) {
	const make = on === 'gpu' ? gpu : on === 'worker' ? worker : cpu;
	const world = await World.create(breezy(planId), { plans, models, make, h });
	const result = { plan: planId, h, on, cells: world.backend.grid.cells, volumeCells: 0, ...(await cost(world.backend, runs, steps)) };
	result.volumeCells = volumeCells((await world.backend.snapshot({ volume: true })).volume!);
	// The kernel itself on the GPU, without the read back: timed by the queue.
	if (on === 'gpu') {
		const solver = (world.backend as GpuBackend).solver;
		await solver.device.queue.onSubmittedWorkDone();
		const start = performance.now();
		const count = 20;
		for (let n = 0; n < count; n++) {
			const encoder = solver.device.createCommandEncoder();
			const pass = encoder.beginComputePass();
			solver.volume(pass);
			pass.end();
			solver.device.queue.submit([encoder.finish()]);
		}
		await solver.device.queue.onSubmittedWorkDone();
		(result as any).kernel = (performance.now() - start) / count;
	}
	world.dispose();
	return result;
}

(window as any).volume = { sameFields, sameWorld, costs };
(window as any).harnessReady = true;
