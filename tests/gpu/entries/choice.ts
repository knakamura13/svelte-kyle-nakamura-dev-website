/* Browser side of choice.gpu.ts: the choice of backend and the session on a real WebGPU device that is destroyed while it runs. */
import { plans } from '$lib/experiments/airflow/homes/plans';
import { emptyReadout } from '$lib/experiments/airflow/readouts';
import { chooseBackend } from '$lib/experiments/airflow/sim/backends';
import { SimulationSession, type SessionParams } from '$lib/experiments/airflow/sim/session';
import { World } from '$lib/experiments/airflow/sim/world';
import type { BackendFailure } from '$lib/experiments/airflow/solver/backend';
import type { GpuBackend } from '$lib/experiments/airflow/solver/gpu/backend';
import { blankSetup, DEFAULT_CLOCK, DEFAULT_VIEW } from '$lib/experiments/airflow/state';
import { inMemoryWorker } from '../../solver/channel';

/* eslint-disable @typescript-eslint/no-explicit-any */

const studio = plans.find((plan) => plan.id === 'studio')!;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (done: () => boolean, what: string, timeout = 20_000) => {
	const deadline = Date.now() + timeout;
	while (!done()) {
		if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
		await pause(10);
	}
};

/** The worker, in this page behind a message channel: what the page would start with `new Worker`, without a second script to serve. */
const spawn = () => inMemoryWorker().port;

/** Collects what the code under test says to the console. */
function listen() {
	const said = { warnings: [] as string[], errors: [] as string[] };
	const [warn, error] = [console.warn, console.error];
	console.warn = (...args: unknown[]) => said.warnings.push(args.join(' '));
	console.error = (...args: unknown[]) => said.errors.push(args.join(' '));
	return { said, restore: () => ((console.warn = warn), (console.error = error)) };
}

/** The device is the choice's first pick; destroying it under a running world reports the loss, and the choice moves to the worker. */
async function lostDeviceMovesTheChoiceToTheWorker() {
	const log = listen();
	try {
		const choice = chooseBackend({ spawn });
		const first = await choice.cellSize(studio);
		const world = await World.create(blankSetup('studio'), { plans, models: new Map(), make: choice.make, h: first });
		const failures: BackendFailure[] = [];
		world.backend.onFailure?.((failure) => failures.push(failure));
		for (let n = 0; n < 5; n++) world.backend.step(0.02);
		const shot = await world.backend.snapshot({});
		const before = { kind: world.backend.kind, h: first, steps: shot.diagnostics.steps, failures: failures.length };

		// Whatever takes a device away: it is gone, with the backend running on it.
		(world.backend as GpuBackend).solver.context.device.destroy();
		await until(() => failures.length > 0, 'the loss to be reported');
		const second = await choice.cellSize(studio);
		const next = await World.create(blankSetup('studio'), { plans, models: new Map(), make: choice.make, h: second });
		for (let n = 0; n < 5; n++) next.backend.step(0.02);
		const after = await next.backend.snapshot({});
		const result = {
			before,
			failures,
			after: { kind: next.backend.kind, h: second, steps: after.diagnostics.steps, finite: Number.isFinite(after.diagnostics.maxSpeed) },
			warnings: log.said.warnings,
			errors: log.said.errors
		};
		world.dispose();
		next.dispose();
		choice.dispose();
		return result;
	} finally {
		log.restore();
	}
}

/** The page's whole path: the session on the choice, a real device destroyed while it runs, and what the visitor is left with. */
async function sessionSurvivesALostDevice() {
	const log = listen();
	try {
		const choice = chooseBackend({ spawn });
		const params: SessionParams = {
			setup: blankSetup('studio'),
			view: { ...DEFAULT_VIEW, units: 'metric' },
			clock: { ...DEFAULT_CLOCK },
			probes: [],
			emission: { strength: 0.5, active: false },
			restarts: 0,
			startingSmoke: 0
		};
		const readout = emptyReadout();
		const announced: string[] = [];
		const session = new SimulationSession({
			params,
			plans,
			models: [],
			make: choice.make,
			cellSize: (plan) => choice.cellSize(plan),
			readout,
			invalidate: () => {},
			reducedMotion: () => false,
			announce: (message) => announced.push(message)
		});
		const frames = async (count: number) => {
			for (let n = 0; n < count; n++) {
				session.update(1 / 60);
				await pause(20);
			}
		};
		await until(() => (session.update(1 / 60), session.world !== null), 'the first world');
		await frames(20);
		const first = { backend: readout.physics.backend, cellSize: readout.physics.cellSize, status: readout.status, time: session.simTime, slice: !!session.latest.slice };
		const firstWorld = session.world;

		(firstWorld!.backend as GpuBackend).solver.context.device.destroy();
		await until(() => session.world !== firstWorld, 'the dead world to be dropped');
		const dropped = { world: session.world === null, status: readout.status, announced: [...announced] };

		await until(() => (session.update(1 / 60), session.world !== null), 'the world on the worker');
		await frames(30);
		const second = { backend: readout.physics.backend, cellSize: readout.physics.cellSize, status: readout.status, reduced: readout.physics.reducedDetail, time: session.simTime, slice: !!session.latest.slice, maxSpeed: readout.physics.maxSpeed };
		const result = { first, dropped, second, warnings: log.said.warnings, errors: log.said.errors };
		session.dispose();
		choice.dispose();
		return result;
	} finally {
		log.restore();
	}
}

(window as any).choice = { lostDeviceMovesTheChoiceToTheWorker, sessionSurvivesALostDevice };
(window as any).harnessReady = true;
