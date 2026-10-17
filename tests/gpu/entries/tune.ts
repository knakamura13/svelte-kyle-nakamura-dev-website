/* Browser side of tune.gpu.ts: the real session on the real device and the browser's own animation frames, with the auto-tuner wired as the page wires it. */
import { plans } from '$lib/experiments/airflow/homes/plans';
import { emptyReadout } from '$lib/experiments/airflow/readouts';
import { chooseBackend, type BackendChoice } from '$lib/experiments/airflow/sim/backends';
import { SimulationSession, type SessionParams } from '$lib/experiments/airflow/sim/session';
import { cellsOf, type BackendKind } from '$lib/experiments/airflow/sim/tuner';
import { World } from '$lib/experiments/airflow/sim/world';
import type { FlowBackend } from '$lib/experiments/airflow/solver/backend';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { GpuContext } from '$lib/experiments/airflow/solver/gpu/context';
import { portOfWorker } from '$lib/experiments/airflow/solver/cpu/proxy';
import { GpuSolverError } from '$lib/experiments/airflow/solver/gpu/errors';
import { blankSetup, DEFAULT_CLOCK, DEFAULT_VIEW } from '$lib/experiments/airflow/state';

/* eslint-disable @typescript-eslint/no-explicit-any */

const plan = (id: string) => plans.find((p) => p.id === id)!;
const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
};
/** The mean of the values that exist: the session reports no rate until its first reading, and a run that is short enough has frames from before it. */
const mean = (values: number[]) => {
	const known = values.filter((value) => Number.isFinite(value));
	return known.length ? known.reduce((a, b) => a + b, 0) / known.length : NaN;
};

/** Collects what the code under test says to the console. */
function listen() {
	const said = { warnings: [] as string[], errors: [] as string[] };
	const [warn, error] = [console.warn, console.error];
	console.warn = (...args: unknown[]) => said.warnings.push(args.join(' '));
	console.error = (...args: unknown[]) => said.errors.push(args.join(' '));
	return { said, restore: () => ((console.warn = warn), (console.error = error)) };
}

/**
 * Calls `frame` for every animation frame, as the Stage does, with the seconds the frame really took (the Stage caps what it hands a
 * scene at 50 ms, and the scene works the real time out again, so this is what the session is told) and the seconds since the first.
 */
function animate(frame: (dt: number, t: number) => void, done: (t: number) => boolean) {
	return new Promise<void>((resolve) => {
		let first = 0;
		let last = 0;
		const tick = (now: number) => {
			if (!first) first = last = now;
			const dt = (now - last) / 1000;
			last = now;
			const t = (now - first) / 1000;
			if (dt > 0) frame(dt, t);
			if (done(t)) resolve();
			else requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
}

export interface RunOptions {
	/** Which backend: the GPU, or the worker (the solver's own, started from the script the harness serves). */
	kind?: BackendKind;
	/** The clock's speed. */
	speed?: 1 | 5 | 20;
	/** The longest to run, s, and how long the grid must have stood still (with the tuner settled) for the run to be over. */
	seconds?: number;
	quiet?: number;
	/** A cell size to pin (`?cell=`), a phone, and the most unfinished steps to leave with the GPU, for a run that tries another. */
	fixedCell?: number;
	small?: boolean;
	limit?: number;
	/** Whether to keep drawing frames after the run, to see how deep the GPU's queue is: pauses the clock and times the device catching up. */
	drain?: boolean;
}

/** The session on the choice, as the page builds them. `tuning` is the choice, so the frames the session draws are the ones the tuner is told. */
function build(planId: string, options: RunOptions) {
	const kind = options.kind ?? 'webgpu';
	const choice = chooseBackend({
		...(kind === 'cpu' ? { openGpu: () => Promise.reject(new GpuSolverError('no-webgpu', 'The test runs the processor.')) } : {}),
		// The solver's own worker script, bundled and served by the harness: the same code the page starts, on a thread of its own.
		spawn: () => portOfWorker(new Worker('/worker.js', { type: 'module', name: 'airflow solver' })),
		small: options.small,
		fixedCell: options.fixedCell
	});
	const params: SessionParams = {
		setup: blankSetup(planId as any),
		view: { ...DEFAULT_VIEW, units: 'metric' },
		clock: { ...DEFAULT_CLOCK, speed: options.speed ?? 1 },
		probes: [],
		emission: { strength: 0.5, active: false },
		restarts: 0,
		startingSmoke: 0
	};
	const readout = emptyReadout();
	const announced: string[] = [];
	const made: FlowBackend[] = [];
	const session = new SimulationSession({
		params,
		plans,
		models: [],
		make: async (config, initial) => {
			const backend = await choice.make(config, initial);
			if (options.limit !== undefined && 'maxInFlight' in backend) (backend as any).maxInFlight = options.limit;
			made.push(backend);
			return backend;
		},
		cellSize: (p) => choice.cellSize(p),
		tuning: choice,
		readout,
		invalidate: () => {},
		reducedMotion: () => false,
		announce: (message) => announced.push(message)
	});
	return { choice, kind, params, readout, announced, session, made };
}

/**
 * One Home on the real device, from the first frame until the tuner has settled and the grid has stood still for `quiet` seconds (or `seconds`
 * have gone by): every size it ran, when it changed, how fast the page drew, and how much of real time the solver kept up with.
 */
async function tuneRun(planId: string, options: RunOptions = {}) {
	const { seconds = 60, quiet = 6 } = options;
	const log = listen();
	const { choice, kind, readout, announced, session, params } = build(planId, options);
	try {
		const changes: { at: number; size: number; cells: number; message: string }[] = [];
		const frames: { t: number; dt: number; rate: number; inFlight: number }[] = [];
		let lastChange = 0;
		let seen = -1;
		const tuner = choice.tuners[kind];
		await animate(
			(dt, t) => {
				session.update(dt);
				const size = readout.physics.cellSize;
				if (size !== null && size !== seen) {
					seen = size;
					lastChange = t;
					changes.push({ at: t, size, cells: session.world!.backend.grid.cells, message: announced.at(-1) ?? '' });
				}
				frames.push({ t, dt, rate: readout.physics.rate ?? NaN, inFlight: session.world?.backend.stepsInFlight ?? 0 });
			},
			(t) => t >= seconds || (t > 8 && changes.length > 0 && tuner.isSettled && t - lastChange >= quiet)
		);
		const t = frames.at(-1)?.t ?? 0;
		const drawn = frames.filter((f) => f.t > 1);
		const last = frames.filter((f) => f.t > t - 3);
		const result: Record<string, unknown> = {
			plan: planId,
			kind,
			speed: params.clock.speed,
			changes,
			finalSize: seen,
			finalCells: changes.at(-1)?.cells ?? 0,
			settled: tuner.isSettled,
			cellBudget: tuner.cellBudget,
			lastChangeAt: lastChange,
			seconds: t,
			fps: { median: 1 / median(drawn.map((f) => f.dt)), mean: drawn.length / drawn.reduce((a, f) => a + f.dt, 0), slowest: Math.min(...drawn.map((f) => 1 / f.dt)), over50ms: drawn.filter((f) => f.dt > 0.05).length, frames: drawn.length },
			rate: mean(last.map((f) => f.rate)),
			maxInFlight: Math.max(0, ...frames.map((f) => f.inFlight)),
			limit: (session.world?.backend as any)?.maxInFlight ?? null,
			tuning: readout.tuning,
			announced,
			errors: log.said.errors,
			warnings: log.said.warnings
		};
		if (options.drain && kind === 'webgpu') {
			// How deep the queue is, measured by something other than the backend's own count: no more frames, so no more work, and the device is timed finishing what it has.
			const device = (session.world!.backend as GpuBackend).solver.device;
			const started = performance.now();
			await device.queue.onSubmittedWorkDone();
			result.drainMs = performance.now() - started;
		}
		return result;
	} finally {
		session.dispose();
		choice.dispose();
		log.restore();
	}
}

let shared: GpuContext | null = null;

/**
 * What a step costs on the device for a Home at a cell size, and what building the world costs (the rasterizing is in this thread). Steps go in
 * batches of four with the queue awaited after each, as a page does between frames: that is what the page pays, and it counts the wait.
 */
async function stepCost(planId: string, h: number, steps = 40) {
	const setup = blankSetup(planId as any);
	const context = (shared ??= await GpuContext.create());
	const built = performance.now();
	const world = await World.create(setup, { plans, models: new Map(), make: (config, initial) => GpuBackend.create(config, initial, context), h });
	const buildMs = performance.now() - built;
	const backend = world.backend as GpuBackend;
	const dt = 0.05;
	const run = async (count: number) => {
		let encoding = 0;
		for (let s = 0; s < count; s++) {
			const before = performance.now();
			backend.step(dt);
			encoding += performance.now() - before;
			if ((s + 1) % 4 === 0) {
				await context.device.queue.onSubmittedWorkDone();
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}
		await context.device.queue.onSubmittedWorkDone();
		return encoding;
	};
	await run(12);
	const start = performance.now();
	const encoding = await run(steps);
	const ms = (performance.now() - start) / steps;
	const cells = backend.grid.cells;
	world.dispose();
	return { plan: planId, h, cells, fluidCells: backend.fluidCells, ms, encodeMs: encoding / steps, buildMs };
}

/** The cells of a Home at each size, for the table. */
const cellsFor = (planId: string, h: number) => cellsOf(plan(planId), h);

(window as any).tune = { tuneRun, stepCost, cellsFor };
(window as any).harnessReady = true;

export type { BackendChoice };
