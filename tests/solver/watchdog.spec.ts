import { expect, test } from '@playwright/test';
import { planById } from '../../src/lib/experiments/airflow/homes/plans';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import { fluidFor } from '../../src/lib/experiments/airflow/sim/world';
import type { BackendFailure } from '../../src/lib/experiments/airflow/solver/backend';
import { WATCHDOG_LATE, WATCHDOG_SILENCE, WATCHDOG_TICK, WorkerBackend, type WatchdogTimer } from '../../src/lib/experiments/airflow/solver/cpu/proxy';
import type { SolverConfig } from '../../src/lib/experiments/airflow/solver/types';
import { blankSetup } from '../../src/lib/experiments/airflow/state';
import { inMemoryWorker, until } from './channel';

/**
 * The worker's watchdog (#59): a worker the browser kills sends no error event, it just stops answering. While something is unanswered,
 * the page counts the silence from timer ticks that come on time, and after about 8 s fails the backend as `crashed`. A tick that comes
 * late (the machine slept) is not silence. The timer here is fake: the test moves its clock and fires its ticks by hand.
 */

function makeConfig(): SolverConfig {
	const setup = blankSetup('studio');
	const raster = rasterizePlan(planById('studio')!, 0.3, { furniture: setup.furniture });
	return { grid: raster.spec, fluid: fluidFor(setup), geometry: raster.geometry };
}

/** A timer whose clock moves only when the test says. `run` fires a tick every `WATCHDOG_TICK` for `ms`, `late` one tick after `ms` of nothing. */
function fakeTimer() {
	let now = 1000;
	let tick: (() => void) | null = null;
	const timer: WatchdogTimer = {
		now: () => now,
		every(ms, next) {
			expect(ms).toBe(WATCHDOG_TICK);
			tick = next;
			return () => (tick = null);
		}
	};
	return {
		timer,
		get running() {
			return tick !== null;
		},
		run(ms: number) {
			for (let t = 0; t < ms; t += WATCHDOG_TICK) {
				now += WATCHDOG_TICK;
				tick?.();
			}
		},
		late(ms: number) {
			now += ms;
			tick?.();
		}
	};
}

/** A backend on an in-memory worker, its fake timer, and every failure it reported. */
async function watched() {
	const worker = inMemoryWorker();
	const clock = fakeTimer();
	const backend = await WorkerBackend.create(worker.port, makeConfig(), undefined, { timer: clock.timer });
	const failures: BackendFailure[] = [];
	backend.onFailure((failure) => failures.push(failure));
	return { worker, clock, backend, failures };
}

test.describe('the worker watchdog', () => {
	test('a worker that stops answering with a step unfinished fails as crashed after about 8 s of silence, and is stopped', async () => {
		const { worker, clock, backend, failures } = await watched();
		expect(clock.running, 'the watchdog runs once the solver is built').toBe(true);
		// The worker dies quietly: whatever it would say never arrives.
		worker.hold(true);
		backend.step(0.02);
		const read = backend.snapshot({});
		read.catch(() => {});
		clock.run(WATCHDOG_SILENCE - WATCHDOG_TICK);
		expect(failures, 'not yet: 7.5 s').toEqual([]);
		clock.run(WATCHDOG_TICK);
		expect(failures).toHaveLength(1);
		expect(failures[0].reason).toBe('crashed');
		expect(failures[0].message).toContain('stopped answering');
		await expect(read, 'the read that was waiting is rejected').rejects.toThrow('stopped answering');
		expect(worker.terminated).toBe(true);
		expect(clock.running, 'the watchdog stops with the backend').toBe(false);
		expect(backend.stepsInFlight).toBe(0);
	});

	test('a tick that comes late, after the machine slept, is not silence: the count starts again from it', async () => {
		const { worker, clock, backend, failures } = await watched();
		worker.hold(true);
		backend.step(0.02);
		clock.run(6000);
		// A minute asleep, and the first tick after it.
		clock.late(60_000);
		clock.run(6000);
		expect(failures, '6 s, a sleep, and 6 s is not 8 s of silence').toEqual([]);
		clock.run(2000);
		expect(failures.map((f) => f.reason)).toEqual(['crashed']);
		backend.dispose();
	});

	test('a tick just inside the late limit still counts, and one just past it does not', async () => {
		const { worker, clock, backend, failures } = await watched();
		worker.hold(true);
		backend.step(0.02);
		clock.run(WATCHDOG_SILENCE - 2 * WATCHDOG_LATE);
		clock.late(WATCHDOG_LATE);
		clock.late(WATCHDOG_LATE);
		expect(failures.map((f) => f.reason), 'two slow ticks inside the limit make up the 8 s').toEqual(['crashed']);

		const second = await watched();
		second.worker.hold(true);
		second.backend.step(0.02);
		second.clock.run(WATCHDOG_SILENCE - WATCHDOG_TICK);
		second.clock.late(WATCHDOG_LATE + 1);
		second.clock.run(WATCHDOG_TICK);
		expect(second.failures, 'a tick past the limit started the count again').toEqual([]);
		backend.dispose();
		second.backend.dispose();
	});

	test('a worker that answers is never silent: each reply starts the count again', async () => {
		const { worker, clock, backend, failures } = await watched();
		worker.hold(true);
		for (let round = 0; round < 4; round++) {
			backend.step(0.02);
			clock.run(6000);
			// The worker was only slow: its replies come in.
			worker.hold(false);
			await until(() => backend.stepsInFlight === 0, 'the step to be acknowledged');
			worker.hold(true);
		}
		expect(failures, '24 s of a slow worker, none of it 8 s without a reply').toEqual([]);
		backend.dispose();
	});

	test('a worker with nothing to answer is not watched: a minute of quiet is not a failure', async () => {
		const { clock, backend, failures } = await watched();
		clock.run(60_000);
		expect(failures).toEqual([]);
		// And the minute it was idle does not count toward the next silence.
		backend.step(0.02);
		await until(() => backend.stepsInFlight === 0, 'the step to be acknowledged');
		clock.run(WATCHDOG_SILENCE);
		expect(failures).toEqual([]);
		backend.dispose();
		expect(clock.running, 'dispose stops the watchdog').toBe(false);
	});

	test('a worker that cannot build the solver is never watched', async () => {
		const worker = inMemoryWorker(() => {
			throw new Error('the grid does not fit in memory');
		});
		const clock = fakeTimer();
		await expect(WorkerBackend.create(worker.port, makeConfig(), undefined, { timer: clock.timer })).rejects.toThrow('the grid does not fit in memory');
		expect(clock.running).toBe(false);
	});
});
