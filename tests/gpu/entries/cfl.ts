/*
 * Browser side of cfl.gpu.ts: the page's session on the real device and the browser's own animation frames, set up as the page sets it up
 * (the auto-tuner and its warm-up, a volume read and no particles), through the clock's states one after another: running, paused, resumed,
 * five and twenty times real time, a restart and a step down. Every GPU step's scalar substeps are recorded with the CFL reading they were
 * sized from: how many steps old it was, or that there was none, and how many steps of the particulate log no read has taken yet.
 */
import { DEVICE_MODELS } from '$lib/experiments/airflow/devices/catalog';
import { plans } from '$lib/experiments/airflow/homes/plans';
import { emptyReadout } from '$lib/experiments/airflow/readouts';
import { SCENARIOS } from '$lib/experiments/airflow/scenarios';
import { chooseBackend } from '$lib/experiments/airflow/sim/backends';
import { SimulationSession, type SessionParams } from '$lib/experiments/airflow/sim/session';
import { CELL_SIZES, cellsOf } from '$lib/experiments/airflow/sim/tuner';
import type { FlowBackend } from '$lib/experiments/airflow/solver/backend';
import { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { LOG_CAPACITY, MAX_SCALAR_SUBSTEPS } from '$lib/experiments/airflow/solver/gpu/solver';
import { DEFAULT_CLOCK, DEFAULT_VIEW, type Clock, type Setup } from '$lib/experiments/airflow/state';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** One GPU step as the backend sized it. */
interface StepRecord {
	world: number;
	phase: string;
	/** The step's index in its world, from 0. */
	step: number;
	/** How many steps old the CFL reading was (0: measured at the start of this step), or null with no reading at all. */
	age: number | null;
	substeps: number;
	/** Steps of the particulate log that no read had taken when this step was sent. */
	unlogged: number;
	/** The CFL speed last read back, and the speed the step was sized for (the reading enlarged for its age), m/s; and the step, s. */
	reading: number;
	speed: number;
	dt: number;
}

/**
 * One CFL reading as it reached the backend: the speed of the air after `at` steps. A step's scalar substeps carry the air the step
 * ends with (they run last, on the projected velocity), so the reading at step + 1 is the speed those substeps really had.
 */
interface ReadingRecord {
	world: number;
	at: number;
	speed: number;
}

/** One snapshot as the backend encoded it: how many steps of the log it took, and the fastest air it found, m/s. */
interface ReadRecord {
	world: number;
	phase: string;
	took: number;
	maxSpeed: number;
}

/** Calls `frame` for every animation frame with the real seconds it took, until `done` says so. */
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

/** Records every step and read of a GPU backend, by wrapping the solver's substep rule and the backend's snapshot. Private state is read for the record only. */
function watch(backend: GpuBackend, world: number, phase: () => string, steps: StepRecord[], reads: ReadRecord[], readings: ReadingRecord[]) {
	const solver = backend.solver as any;
	const inner = solver.scalarSubsteps.bind(solver);
	const b = backend as any;
	// Every reading the backend takes in sets `cflMeasuredAt`, after `cflSpeed`.
	let measuredAt: number = b.cflMeasuredAt;
	Object.defineProperty(b, 'cflMeasuredAt', {
		get: () => measuredAt,
		set: (at: number) => {
			measuredAt = at;
			readings.push({ world, at, speed: b.cflSpeed });
		}
	});
	solver.scalarSubsteps = (dt: number, speed: number, safety?: number) => {
		const substeps = inner(dt, speed, safety);
		const measuredAt: number = b.cflMeasuredAt;
		steps.push({ world, phase: phase(), step: b.steps, age: Number.isFinite(measuredAt) ? b.steps - measuredAt : null, substeps, unlogged: b.steps - b.logged, reading: b.cflSpeed, speed, dt });
		return substeps;
	};
	const snapshot = backend.snapshot.bind(backend);
	backend.snapshot = async (request) => {
		const record: ReadRecord = { world, phase: phase(), took: b.steps - b.logged, maxSpeed: NaN };
		reads.push(record);
		const shot = await snapshot(request);
		record.maxSpeed = shot.diagnostics.maxSpeed;
		return shot;
	};
}

export interface Phase {
	name: string;
	/** Seconds the phase lasts. */
	seconds: number;
	/** What the clock is set to as the phase starts. */
	clock: Clock;
	/** A restart at the phase's start: the air starts over from rest. */
	restart?: boolean;
	/** A step down to the next coarser grid at the phase's start, as the tuner asks of a device that fell behind: the air carries on. */
	stepDown?: boolean;
}

/** The phases the test runs, in order. */
export const PHASES: Phase[] = [
	{ name: 'running 1x', seconds: 4, clock: { paused: false, speed: 1 } },
	{ name: 'paused', seconds: 2, clock: { paused: true, speed: 1 } },
	{ name: 'resumed 1x', seconds: 3, clock: { paused: false, speed: 1 } },
	{ name: 'running 5x', seconds: 3, clock: { paused: false, speed: 5 } },
	{ name: 'running 20x', seconds: 5, clock: { paused: false, speed: 20 } },
	{ name: 'paused at 20x', seconds: 2, clock: { paused: true, speed: 20 } },
	{ name: 'resumed 20x', seconds: 3, clock: { paused: false, speed: 20 } },
	{ name: 'restarted at 20x', seconds: 3, clock: { paused: false, speed: 20 }, restart: true },
	{ name: 'stepped down at 20x', seconds: 4, clock: { paused: false, speed: 20 }, stepDown: true }
];

/** The next coarser cell size the tuner knows, or null at the coarsest. */
function coarser(h: number) {
	const sizes = CELL_SIZES as readonly number[];
	const at = sizes.findIndex((size) => Math.abs(size - h) < 1e-9);
	return at > 0 ? sizes[at - 1] : null;
}

/**
 * Runs the Scenario `scenario` on the real device through `phases`, as the page runs it, and returns every GPU step and read. `fixedCell`
 * pins the grid (no warm-up), as `?cell=` does.
 */
async function run(scenario: string, options: { fixedCell?: number; phases?: Phase[] } = {}) {
	const phases = options.phases ?? PHASES;
	const found = SCENARIOS.find((s) => s.id === scenario)!;
	const choice = chooseBackend({ fixedCell: options.fixedCell });
	// A step down is the tuner's to ask for, after a minute of a device falling behind. Here it is asked for at once: the tuner is told
	// the device holds only the next coarser grid's cells, and its next frame says to switch, as `Tuner.observe` would.
	let stepDown: number | null = null;
	const tuning = {
		...choice,
		observe: (kind: 'webgpu' | 'cpu', sample: { dt: number; rate: number | null; paused: boolean }) => {
			if (stepDown !== null) {
				const size = stepDown;
				stepDown = null;
				(choice.tuners[kind] as any).budget = cellsOf(plans.find((p) => p.id === found.setup.plan)!, size);
				return { size, direction: 'coarser' as const, message: 'Switched to a coarser grid: the test asked for it.' };
			}
			return choice.observe(kind, sample);
		}
	};
	const params: SessionParams = {
		setup: structuredClone(found.setup) as Setup,
		view: { ...DEFAULT_VIEW, units: 'metric', ...(found.view ?? {}) },
		// The Scenario's own clock until the first phase starts, as the page opens it.
		clock: { ...DEFAULT_CLOCK, ...found.clock },
		probes: [],
		emission: { strength: 0.5, active: false },
		restarts: 0,
		startingSmoke: found.smoke ?? 0
	};
	const readout = emptyReadout();
	const steps: StepRecord[] = [];
	const reads: ReadRecord[] = [];
	const readings: ReadingRecord[] = [];
	const worlds: { world: number; kind: string; cells: number; h: number; phase: string }[] = [];
	let phase = 'warm-up';
	let made = 0;
	const errors: string[] = [];
	const error = console.error;
	console.error = (...args: unknown[]) => errors.push(args.join(' '));
	const session = new SimulationSession({
		params,
		plans,
		models: DEVICE_MODELS,
		make: async (config, initial) => {
			const backend: FlowBackend = await choice.make(config, initial);
			const world = made++;
			worlds.push({ world, kind: backend.kind, cells: backend.grid.cells, h: config.grid.h, phase });
			if (backend instanceof GpuBackend) watch(backend, world, () => phase, steps, reads, readings);
			return backend;
		},
		cellSize: (p) => choice.cellSize(p),
		tuning: options.fixedCell === undefined ? tuning : undefined,
		readout,
		invalidate: () => {},
		reducedMotion: () => false,
		particles: false,
		volume: true
	});
	try {
		// The loading screen: the warm-up, then the world on show.
		await animate(
			(dt) => session.update(dt),
			() => session.warmUp().share >= 1
		);
		let shownAt = -1;
		let index = -1;
		let phaseStart = 0;
		await animate(
			(dt, t) => {
				if (shownAt < 0) shownAt = t;
				const at = t - shownAt;
				if (index < 0 || at - phaseStart >= phases[index].seconds) {
					index++;
					if (index >= phases.length) return;
					phaseStart = at;
					const next = phases[index];
					phase = next.name;
					params.clock = { ...next.clock };
					if (next.restart) params.restarts++;
					if (next.stepDown && session.world) stepDown = coarser(session.world.raster.spec.h);
				}
				session.update(dt);
			},
			() => index >= phases.length
		);
		return { worlds, steps, reads, readings, errors, inFlightLimit: (session.world?.backend as any)?.maxInFlight ?? null, cap: MAX_SCALAR_SUBSTEPS, logCapacity: LOG_CAPACITY };
	} finally {
		session.dispose();
		choice.dispose();
		console.error = error;
	}
}

(window as any).cfl = { run, PHASES };
(window as any).harnessReady = true;
