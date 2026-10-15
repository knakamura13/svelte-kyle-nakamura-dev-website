import { expect, test } from '@playwright/test';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import type { HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { emptyReadout } from '../../src/lib/experiments/airflow/readouts';
import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { chooseBackend } from '../../src/lib/experiments/airflow/sim/backends';
import { SimulationSession, type SessionOptions, type SessionParams } from '../../src/lib/experiments/airflow/sim/session';
import { Tuner, type BackendKind, type FrameSample, type Retune, type Tuning } from '../../src/lib/experiments/airflow/sim/tuner';
import type { BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { BackendUnavailable, type BackendFailure } from '../../src/lib/experiments/airflow/solver/backend';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { WorkerBackend } from '../../src/lib/experiments/airflow/solver/cpu/proxy';
import { GpuSolverError } from '../../src/lib/experiments/airflow/solver/gpu/errors';
import { blankSetup, DEFAULT_CLOCK, DEFAULT_VIEW, type Setup } from '../../src/lib/experiments/airflow/state';
import { inMemoryWorker } from './channel';

/** The page's runtime driver, run with a fake clock: each `update(dt)` is one drawn frame of `dt` real seconds. */

const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const studio = planById('studio')!;
const FRAME = 1 / 60;

const makeSession = (
	tweak?: (params: SessionParams) => void,
	factory: BackendFactory = make,
	cellSize: (plan: HomePlan) => number | Promise<number> = () => 0.2,
	extra: Partial<SessionOptions> = {}
) => {
	const params: SessionParams = {
		setup: blankSetup('studio'),
		view: { ...DEFAULT_VIEW, units: 'metric' },
		clock: { ...DEFAULT_CLOCK },
		probes: [],
		emission: { strength: 0.5, active: false },
		restarts: 0,
		startingSmoke: 0
	};
	tweak?.(params);
	const readout = emptyReadout();
	const invalidated = { count: 0 };
	const announced: string[] = [];
	const session = new SimulationSession({ params, plans, models: [], make: factory, cellSize, readout, invalidate: () => invalidated.count++, reducedMotion: () => false, announce: (message) => announced.push(message), ...extra });
	return { session, params, readout, invalidated, announced };
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Lets the snapshot reads that the last frames asked for finish. */
const settle = async () => {
	for (let n = 0; n < 6; n++) await pause(5);
};

/** Draws frames until the session has built its world. */
const start = async (session: SimulationSession) => {
	const deadline = Date.now() + 30000;
	while (!session.world && Date.now() < deadline) {
		session.update(FRAME);
		await pause(5);
	}
	expect(session.world, 'the world was built').not.toBeNull();
};

/** Draws `frames` frames of `dt` real seconds, letting each one's snapshot read finish. */
const draw = async (session: SimulationSession, frames: number, dt = FRAME) => {
	for (let n = 0; n < frames; n++) {
		session.update(dt);
		await settle();
	}
};

test.describe('simulation session', () => {
	test.describe.configure({ timeout: 120000 });

	test('builds a world on the first frame and says what it is running on', async () => {
		const { session, readout, invalidated } = makeSession();
		expect(readout.status).toBe('loading');
		await start(session);
		expect(readout.status).toBe('running');
		expect(readout.physics.backend).toBe('cpu');
		expect(readout.physics.cellSize).toBe(0.2);
		expect(readout.physics.cells).toBeGreaterThan(1000);
		expect(readout.physics.reducedDetail).toBe(true);
		expect(invalidated.count).toBeGreaterThan(0);
		session.dispose();
	});

	test('simulated time advances by no more than the clock asks for, and faster at a higher speed', async () => {
		const slow = makeSession();
		await start(slow.session);
		const from = slow.session.simTime;
		for (let n = 0; n < 60; n++) slow.session.update(FRAME);
		const slowTime = slow.session.simTime - from;
		expect(slowTime).toBeGreaterThan(0);
		expect(slowTime).toBeLessThanOrEqual(60 * FRAME + 1e-6);

		const fast = makeSession((p) => (p.clock.speed = 5));
		await start(fast.session);
		const fastFrom = fast.session.simTime;
		for (let n = 0; n < 60; n++) fast.session.update(FRAME);
		const fastTime = fast.session.simTime - fastFrom;
		expect(fastTime).toBeLessThanOrEqual(60 * FRAME * 5 + 1e-6);
		expect(fastTime).toBeGreaterThan(1.5 * slowTime);
		slow.session.dispose();
		fast.session.dispose();
	});

	test('a frame that took a long time (a tab coming back) advances at most a tenth of a second', async () => {
		const { session } = makeSession();
		await start(session);
		const before = session.simTime;
		session.update(10);
		const advanced = session.simTime - before;
		expect(advanced).toBeGreaterThan(0);
		expect(advanced).toBeLessThanOrEqual(0.1 + 1e-6);
		session.dispose();
	});

	test('paused: time stands still, the status says so, and the session stops asking for frames once the picture has caught up', async () => {
		const { session, params, readout } = makeSession();
		await start(session);
		await draw(session, 10);
		params.clock.paused = true;
		const frozen = session.simTime;
		let more = true;
		for (let n = 0; n < 40 && more; n++) {
			more = session.update(FRAME);
			await settle();
		}
		expect(session.simTime).toBe(frozen);
		expect(readout.status).toBe('paused');
		expect(more).toBe(false);
		params.clock.paused = false;
		expect(session.update(FRAME)).toBe(true);
		expect(readout.status).toBe('running');
		session.dispose();
	});

	test('the slice, the hover reading, a pinned probe and the per-room numbers all arrive from the solver', async () => {
		const { session, params, readout } = makeSession((p) => (p.probes = [{ id: 'p1', x: 5.1, y: 1.1, z: 2.7 }]));
		await start(session);
		// A frame of 0.6 s asks for the per-room pass as well; its simulated step is capped at a tenth of a second.
		await draw(session, 12, 0.6);
		const { slice } = session.latest;
		expect(slice).not.toBeNull();
		expect(slice!.y).toBeCloseTo(params.view.sliceHeight, 0);
		const hover = session.hover(5.1, 2.7);
		expect(hover).not.toBeNull();
		for (const value of [hover!.speed, hover!.temperature, hover!.particulates]) expect(Number.isFinite(value)).toBe(true);
		expect(Math.abs(hover!.temperature - params.setup.conditions.indoorTemp)).toBeLessThan(0.5);

		expect(readout.probes).toHaveLength(1);
		expect(readout.probes[0].label).toBe('Probe 1');
		expect(readout.probes[0].inAir).toBe(true);
		expect(Number.isFinite(readout.probes[0].speed)).toBe(true);

		expect(readout.rooms).toHaveLength(studio.rooms.length);
		for (const room of readout.rooms) {
			expect(room.volume).toBeGreaterThan(0);
			expect(Number.isFinite(room.changesPerHour)).toBe(true);
		}
		expect(readout.physics.time).toBeGreaterThan(0);
		expect(readout.physics.divergence).toBeLessThan(0.05);
		session.dispose();
	});

	test('opening something is applied in place, while changing the furniture builds a new world', async () => {
		const { session, params } = makeSession();
		await start(session);
		await draw(session, 5);
		const world = session.world!;
		const windowId = studio.openings.find((o) => o.kind !== 'door')!.id;
		params.setup = { ...params.setup, openings: { [windowId]: 1 } };
		session.update(FRAME);
		expect(session.world).toBe(world);
		expect(world.current.openings[windowId]).toBe(1);

		const version = session.latest.version;
		params.setup = { ...params.setup, furniture: false };
		const deadline = Date.now() + 30000;
		while (session.world === world && Date.now() < deadline) {
			session.update(FRAME);
			await pause(5);
		}
		expect(session.world).not.toBe(world);
		expect(session.world!.current.furniture).toBe(false);
		expect(session.simTime).toBeLessThan(1);
		expect(session.latest.version).toBeGreaterThan(version);
		session.dispose();
	});

	test('while paused, a probe pinned or a slice height changed is read at once, not at the next tick of a clock that has stopped', async () => {
		const { session, params, readout, invalidated } = makeSession((p) => (p.clock.paused = true));
		/** Draws frames the way the Stage does: one more only while the session asks for it. Returns how many it took. */
		const untilIdle = async () => {
			for (let n = 1; n <= 60; n++) {
				const more = session.update(FRAME);
				await settle();
				if (!more) return n;
			}
			throw new Error('the session never stopped asking for frames');
		};
		await start(session);
		await untilIdle();
		expect(session.latest.slice, 'the first picture arrives while paused').not.toBeNull();
		const asked = invalidated.count;
		params.probes = [{ id: 'p1', x: 2, y: 1.1, z: 2 }];
		await untilIdle();
		expect(readout.probes.map((r) => r.id), 'the pinned probe has a reading').toEqual(['p1']);
		expect(invalidated.count, 'and the Stage was told there is something new to draw').toBeGreaterThan(asked);
		expect(Number.isFinite(readout.probes[0].speed)).toBe(true);
		const before = session.latest.slice!.y;
		params.view.sliceHeight = 2.0;
		await untilIdle();
		expect(Math.abs(session.latest.slice!.y - 2.0), 'cut at the new height').toBeLessThan(0.11);
		expect(session.latest.slice!.y).not.toBe(before);
		session.dispose();
	});

	test('while paused, a restart still ends with a picture of the new world', async () => {
		const { session, params } = makeSession((p) => (p.clock.paused = true));
		await start(session);
		await draw(session, 8);
		const first = session.world;
		const version = session.latest.version;
		params.restarts++;
		// Frames so short that the read throttle (which counts frame time) cannot be what asks for the first picture.
		const deadline = Date.now() + 30000;
		while (session.world === first && Date.now() < deadline) {
			session.update(0.0001);
			await pause(5);
		}
		expect(session.world, 'a new world was built').not.toBe(first);
		for (let n = 0; n < 4; n++) {
			session.update(0.0001);
			await settle();
		}
		expect(session.latest.slice, 'and it has been drawn').not.toBeNull();
		expect(session.latest.version).toBeGreaterThan(version);
		session.dispose();
	});

	test('a read or a start that fails after the session was disposed says nothing: the page is already leaving', async () => {
		const logged: unknown[][] = [];
		const quiet = console.error;
		console.error = (...args: unknown[]) => logged.push(args);
		try {
			// A backend whose reads fail late, as a buffer that is unmapped when the page leaves does.
			let leaving = false;
			class Late extends CpuBackend {
				override async snapshot(request: Parameters<CpuBackend['snapshot']>[0]) {
					if (!leaving) return super.snapshot(request);
					await pause(25);
					throw new Error('Buffer was unmapped');
				}
			}
			const first = makeSession(undefined, (config, initial) => new Late({ ...config, scalarSubsteps: undefined }, initial));
			await start(first.session);
			await settle();
			leaving = true;
			first.session.update(0.1);
			first.session.dispose();
			await pause(80);
			expect(logged, 'a read that fails after dispose').toEqual([]);

			// And a build that rejects after it.
			const slow: BackendFactory = async () => {
				await pause(25);
				throw new GpuSolverError('lost', 'The graphics device was lost while the solver started.');
			};
			const second = makeSession(undefined, slow);
			second.session.update(FRAME);
			second.session.dispose();
			await pause(80);
			expect(logged, 'a build that fails after dispose').toEqual([]);
			expect(second.readout.status, 'a disposed session leaves its readout alone').toBe('loading');
		} finally {
			console.error = quiet;
		}
	});

	test.describe('when no backend can start', () => {
		/** A factory that always fails, and how often it was asked. */
		const failing = (error: Error) => {
			const calls = { count: 0 };
			const factory: BackendFactory = async () => {
				calls.count++;
				throw error;
			};
			return { calls, factory };
		};

		test('it tries once, says so, and stops asking for frames instead of retrying every frame', async () => {
			const { calls, factory } = failing(new Error('the device would not open'));
			const { session, readout } = makeSession(undefined, factory);
			const quiet = console.error;
			console.error = () => {};
			try {
				for (let n = 0; n < 30; n++) {
					session.update(FRAME);
					await pause(5);
				}
				expect(calls.count, 'one attempt, not one per frame').toBe(1);
				expect(readout.status).toBe('error');
				expect(readout.note).toContain('could not start');
				expect(session.world).toBeNull();
				expect(session.update(FRAME), 'nothing more will happen until the setup changes').toBe(false);
			} finally {
				console.error = quiet;
				session.dispose();
			}
		});

		test('a restart, or another home, is a new reason to try again', async () => {
			const { calls, factory } = failing(new Error('no'));
			const { session, params } = makeSession(undefined, factory);
			const quiet = console.error;
			console.error = () => {};
			try {
				for (let n = 0; n < 10; n++) {
					session.update(FRAME);
					await pause(5);
				}
				expect(calls.count).toBe(1);
				params.restarts++;
				for (let n = 0; n < 10; n++) {
					session.update(FRAME);
					await pause(5);
				}
				expect(calls.count).toBe(2);
				params.setup = blankSetup('one-bedroom');
				for (let n = 0; n < 10; n++) {
					session.update(FRAME);
					await pause(5);
				}
				expect(calls.count).toBe(3);
			} finally {
				console.error = quiet;
				session.dispose();
			}
		});

		test('a browser that can run no solver at all (no WebGPU and no Web Worker) reads as unsupported rather than as a fault', async () => {
			const { factory } = failing(new BackendUnavailable('This browser cannot start a Web Worker.'));
			const { session, readout } = makeSession(undefined, factory);
			const quiet = console.error;
			const quietWarn = console.warn;
			console.error = () => {};
			console.warn = () => {};
			try {
				for (let n = 0; n < 6; n++) {
					session.update(FRAME);
					await pause(5);
				}
				expect(readout.status).toBe('unsupported');
				expect(readout.note).toContain('WebGPU');
				expect(readout.note).toContain('Web Worker');
			} finally {
				console.error = quiet;
				console.warn = quietWarn;
				session.dispose();
			}
		});

		test('a browser that can run no solver is tried once for the page: another home or a restart does not try again, and it is a warning, not an error', async () => {
			const { calls, factory } = failing(new BackendUnavailable('This browser cannot start a Web Worker.'));
			const { session, params, readout } = makeSession(undefined, factory);
			const errors: unknown[][] = [];
			const warnings: unknown[][] = [];
			const [quietError, quietWarn] = [console.error, console.warn];
			console.error = (...args: unknown[]) => errors.push(args);
			console.warn = (...args: unknown[]) => warnings.push(args);
			try {
				for (let n = 0; n < 6; n++) {
					session.update(FRAME);
					await pause(5);
				}
				params.restarts++;
				params.setup = blankSetup('one-bedroom');
				for (let n = 0; n < 6; n++) {
					session.update(FRAME);
					await pause(5);
				}
				expect(calls.count).toBe(1);
				expect(readout.status).toBe('unsupported');
				expect(errors, 'not a fault').toEqual([]);
				expect(warnings).toHaveLength(1);
			} finally {
				console.error = quietError;
				console.warn = quietWarn;
				session.dispose();
			}
		});

		test('a device that fails some other way is still an error', async () => {
			const { factory } = failing(new GpuSolverError('shader', 'a kernel did not compile'));
			const { session, readout } = makeSession(undefined, factory);
			const quiet = console.error;
			console.error = () => {};
			try {
				for (let n = 0; n < 6; n++) {
					session.update(FRAME);
					await pause(5);
				}
				expect(readout.status).toBe('error');
			} finally {
				console.error = quiet;
				session.dispose();
			}
		});
	});

	test('the cell size may arrive after a moment, while the choice of backend is made: the world is built once it has', async () => {
		const asked: string[] = [];
		const { session, readout } = makeSession(undefined, make, async (plan) => {
			asked.push(plan.id);
			await pause(20);
			return 0.3;
		});
		await start(session);
		expect(asked).toEqual(['studio']);
		expect(readout.physics.cellSize).toBe(0.3);
		session.dispose();
	});

	/** Stands in for the worker: its steps do no work and finish only when the test says so, and it keeps what it was given. */
	class Background extends CpuBackend {
		inFlight = 0;
		steps: number[] = [];
		get stepsInFlight() {
			return this.inFlight;
		}
		override step(dt: number) {
			this.steps.push(dt);
			this.inFlight++;
		}
		finish(count = 1) {
			this.inFlight = Math.max(0, this.inFlight - count);
		}
	}
	const background = () => {
		const made: Background[] = [];
		const factory: BackendFactory = (config, initial) => {
			const backend = new Background(config, initial);
			made.push(backend);
			return backend;
		};
		return { made, factory };
	};
	const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

	test('a world on a real worker that is replaced while a read of it is waiting says nothing: the read is rejected as the old worker stops', async () => {
		const workers: ReturnType<typeof inMemoryWorker>[] = [];
		const factory: BackendFactory = (config, initial) => {
			const worker = inMemoryWorker();
			workers.push(worker);
			return WorkerBackend.create(worker.port, config, initial);
		};
		const { session, params, readout } = makeSession(undefined, factory);
		const errors: string[] = [];
		const quiet = console.error;
		console.error = (...args: unknown[]) => errors.push(args.join(' '));
		try {
			await start(session);
			await draw(session, 4);
			// The worker is slow: its replies are held, so a read is waiting when the visitor restarts.
			workers[0].hold(true);
			session.update(0.1);
			params.restarts++;
			const deadline = Date.now() + 30000;
			const first = session.world;
			while (session.world === first && Date.now() < deadline) {
				session.update(FRAME);
				await pause(5);
			}
			expect(workers, 'a second worker was started').toHaveLength(2);
			expect(workers[0].terminated, 'and the first was stopped').toBe(true);
			await draw(session, 3);
			expect(readout.status).toBe('running');
			expect(errors, 'nothing is reported for the replaced world').toEqual([]);
		} finally {
			console.error = quiet;
			session.dispose();
		}
	});

	test('after a pause, or a new speed, the rate starts from what the clock asks, so a backend that keeps up is not shown as slow', async () => {
		const { session, params, readout } = makeSession();
		await start(session);
		await draw(session, 12);
		params.clock.paused = true;
		await draw(session, 6);
		expect(readout.physics.rate, 'a paused clock goes at 0').toBe(0);
		params.clock.paused = false;
		session.update(FRAME);
		expect(readout.physics.rate, 'and starts again from its speed').toBe(1);
		params.clock.speed = 5;
		session.update(FRAME);
		expect(readout.physics.rate, 'a new speed likewise').toBe(5);
		session.dispose();
	});

	test.describe('a backend that works in the background, as the worker does', () => {
		test('no step is sent while two are unfinished, and what the clock asked for in the meantime is sent as one longer step, never longer than a stable one', async () => {
			const { made, factory } = background();
			const { session } = makeSession(undefined, factory);
			await start(session);
			const worker = made[0];
			for (let n = 0; n < 40; n++) session.update(FRAME);
			expect(worker.steps, 'two steps and then it waits').toHaveLength(2);
			expect(worker.steps[0]).toBeCloseTo(FRAME, 9);
			expect(worker.stepsInFlight).toBe(2);

			worker.finish(1);
			session.update(FRAME);
			expect(worker.steps).toHaveLength(3);
			expect(worker.stepsInFlight).toBe(2);
			expect(worker.steps[2], 'the time that went unsent while it was stalled is in the next step').toBeGreaterThan(2 * FRAME);
			expect(worker.steps[2], 'but not more than a stable step').toBeLessThanOrEqual(0.05 + 1e-9);

			worker.finish(2);
			session.update(FRAME);
			expect(worker.steps.length, 'it is sent as much as there is room for').toBe(4);
			expect(session.simTime).toBeCloseTo(sum(worker.steps), 9);
			session.dispose();
		});

		test('a worker that cannot keep up runs the simulation slower than real time and shows the rate, instead of falling further behind', async () => {
			const { made, factory } = background();
			const { session, readout } = makeSession(undefined, factory);
			await start(session);
			const worker = made[0];
			const frames = 300;
			// It finishes a step every five frames, 83 ms: at most 0.05 s of simulated time each, so about 0.6 of real time.
			for (let frame = 0; frame < frames; frame++) {
				if (frame % 5 === 0) worker.finish(1);
				session.update(FRAME);
				expect(worker.stepsInFlight, 'never more than two unfinished').toBeLessThanOrEqual(2);
			}
			const speed = sum(worker.steps) / (frames * FRAME);
			expect(speed).toBeGreaterThan(0.5);
			expect(speed).toBeLessThan(0.7);
			expect(Math.max(...worker.steps)).toBeLessThanOrEqual(0.05 + 1e-9);
			expect(session.simTime).toBeCloseTo(sum(worker.steps), 9);
			for (let frame = 0; frame < 12; frame++) {
				if (frame % 5 === 0) worker.finish(1);
				session.update(FRAME);
				await settle();
			}
			expect(readout.physics.rate, 'the Physics panel and the clock show the rate').toBeGreaterThan(0.45);
			expect(readout.physics.rate).toBeLessThan(0.75);
			session.dispose();
		});

		test('a worker that keeps up with longer steps runs at real time, and is not held to one step a frame', async () => {
			const { made, factory } = background();
			const { session, readout } = makeSession(undefined, factory);
			await start(session);
			const worker = made[0];
			const frames = 300;
			// A step every two frames, 33 ms: more than a frame, less than the stable 50 ms, so the steps grow to cover it.
			for (let frame = 0; frame < frames; frame++) {
				if (frame % 2 === 0) worker.finish(1);
				session.update(FRAME);
			}
			const speed = sum(worker.steps) / (frames * FRAME);
			expect(speed).toBeGreaterThan(0.93);
			expect(speed).toBeLessThanOrEqual(1 + 1e-9);
			expect(sum(worker.steps) / worker.steps.length, 'on average steps are longer than a frame').toBeGreaterThan(1.6 * FRAME);
			for (let frame = 0; frame < 12; frame++) {
				if (frame % 2 === 0) worker.finish(1);
				session.update(FRAME);
				await settle();
			}
			expect(readout.physics.rate).toBeGreaterThan(0.9);
			session.dispose();
		});
	});

	/** A backend that can fail, the way the GPU's and the worker's can. */
	class Fragile extends CpuBackend {
		listeners = new Set<(failure: BackendFailure) => void>();
		steps = 0;
		snapshots = 0;
		override step(dt: number) {
			this.steps++;
			super.step(dt);
		}
		override snapshot(request: Parameters<CpuBackend['snapshot']>[0]) {
			this.snapshots++;
			return super.snapshot(request);
		}
		onFailure(listener: (failure: BackendFailure) => void) {
			this.listeners.add(listener);
			return () => {
				this.listeners.delete(listener);
			};
		}
		fail(failure: BackendFailure) {
			for (const listener of [...this.listeners]) listener(failure);
		}
	}
	const fragileThen = (rest: 'fragile' | 'plain') => {
		const made: CpuBackend[] = [];
		const factory: BackendFactory = (config, initial) => {
			const backend = made.length === 0 || rest === 'fragile' ? new Fragile(config, initial) : new CpuBackend(config, initial);
			made.push(backend);
			return backend;
		};
		return { made, factory };
	};
	/** Silences what the session says about a failure, and returns what it said. */
	const listen = () => {
		const said = { warnings: [] as string[], errors: [] as string[] };
		const [warn, error] = [console.warn, console.error];
		console.warn = (...args: unknown[]) => said.warnings.push(args.join(' '));
		console.error = (...args: unknown[]) => said.errors.push(args.join(' '));
		return { said, restore: () => ((console.warn = warn), (console.error = error)) };
	};

	test.describe('when the backend of a running world fails', () => {
		test('a lost device: the dead backend is neither stepped nor read again, and the world is built again on what the factory gives next, with a word to the visitor', async () => {
			const { made, factory } = fragileThen('plain');
			const { session, readout, announced } = makeSession(undefined, factory);
			const log = listen();
			try {
				await start(session);
				const dead = made[0] as Fragile;
				await draw(session, 10);
				expect(dead.steps).toBeGreaterThan(0);
				const [steps, reads] = [dead.steps, dead.snapshots];
				const before = session.simTime;

				dead.fail({ reason: 'lost', message: 'The graphics device was lost.' });
				expect(session.world, 'the dead world is dropped at once').toBeNull();
				expect(readout.status).toBe('loading');
				expect(announced).toHaveLength(1);
				expect(announced[0]).toContain('graphics device was lost');

				await start(session);
				expect(made, 'built again').toHaveLength(2);
				expect(session.world!.backend).toBe(made[1]);
				await draw(session, 4);
				expect(dead.steps, 'nothing stepped the dead backend').toBe(steps);
				expect(dead.snapshots, 'nothing read it').toBe(reads);
				expect(readout.status).toBe('running');
				expect(readout.physics.backend).toBe('cpu');
				expect(session.simTime, 'the air starts from rest').toBeLessThan(before);
				expect(session.latest.slice, 'and has its own picture').not.toBeNull();
				expect(log.said.errors, 'a lost device is not a fault of the page').toEqual([]);
				expect(log.said.warnings).toHaveLength(1);
			} finally {
				log.restore();
				session.dispose();
			}
		});

		test('a worker that crashed is not started again until the visitor restarts, or it would crash again every time', async () => {
			const { made, factory } = fragileThen('plain');
			const { session, params, readout } = makeSession(undefined, factory);
			const log = listen();
			try {
				await start(session);
				(made[0] as Fragile).fail({ reason: 'crashed', message: 'the solver blew up' });
				expect(session.world).toBeNull();
				expect(readout.status).toBe('error');
				expect(readout.note).toContain('worker');
				for (let n = 0; n < 30; n++) {
					session.update(FRAME);
					await pause(5);
				}
				expect(made, 'not built again').toHaveLength(1);
				expect(session.update(FRAME), 'and the Stage is not asked for more frames').toBe(false);
				expect(log.said.errors).toHaveLength(1);

				params.restarts++;
				await start(session);
				expect(made).toHaveLength(2);
				await draw(session, 2);
				expect(readout.status).toBe('running');
			} finally {
				log.restore();
				session.dispose();
			}
		});

		test('a world that was being built when the running one failed is let go, and its own failure is not the page\'s: the next frame builds again', async () => {
			const made: CpuBackend[] = [];
			let calls = 0;
			const factory: BackendFactory = async (config, initial) => {
				calls++;
				if (calls === 2) {
					// The build that is under way when the device is lost: it fails because the device went.
					await pause(40);
					throw new Error('the device was lost while the solver was being built');
				}
				const backend = calls === 1 ? new Fragile(config, initial) : new CpuBackend(config, initial);
				made.push(backend);
				return backend;
			};
			const { session, params, readout } = makeSession(undefined, factory);
			const log = listen();
			try {
				await start(session);
				params.restarts++;
				session.update(FRAME);
				await pause(5);
				(made[0] as Fragile).fail({ reason: 'lost', message: 'The graphics device was lost.' });
				expect(session.world).toBeNull();
				// The overtaken build fails now. Frames go on, and it is not what the page reports.
				const deadline = Date.now() + 30000;
				while (!session.world && Date.now() < deadline) {
					session.update(FRAME);
					await pause(5);
				}
				expect(calls, 'built again once the failed build was out of the way').toBe(3);
				await draw(session, 3);
				expect(readout.status).toBe('running');
				expect(log.said.errors, 'the overtaken build said nothing').toEqual([]);
			} finally {
				log.restore();
				session.dispose();
			}
		});

		test('a world that has been replaced, or a session that has been disposed, is not listened to any more', async () => {
			const { made, factory } = fragileThen('fragile');
			const { session, params, announced } = makeSession(undefined, factory);
			const log = listen();
			try {
				await start(session);
				const first = made[0] as Fragile;
				const firstWorld = session.world;
				expect(first.listeners.size).toBe(1);
				params.restarts++;
				const deadline = Date.now() + 30000;
				while (session.world === firstWorld) {
					session.update(FRAME);
					await pause(5);
					if (Date.now() > deadline) throw new Error('the restart never built a world');
				}
				const second = made[1] as Fragile;
				expect(first.listeners.size, 'the old backend is let go').toBe(0);
				first.fail({ reason: 'lost', message: 'too late to matter' });
				expect(session.world!.backend).toBe(second);
				expect(announced).toEqual([]);
				session.dispose();
				expect(second.listeners.size, 'and so is the last one when the page leaves').toBe(0);
			} finally {
				log.restore();
				session.dispose();
			}
		});
	});

	/** A backend whose steps queue and are finished by the test, as the GPU's are: it says how many are unfinished and how many it may be given. */
	class Queued extends CpuBackend {
		inFlight = 0;
		maxInFlight = 8;
		steps: number[] = [];
		get stepsInFlight() {
			return this.inFlight;
		}
		override step(dt: number) {
			this.steps.push(dt);
			this.inFlight++;
		}
		finish(count = Infinity) {
			this.inFlight = Math.max(0, this.inFlight - count);
		}
	}
	/** The same device before it reported anything, as the GPU's backend was: its steps queue and nothing says how deep the queue is. */
	class Unreported extends Queued {
		override get stepsInFlight(): number {
			return undefined as unknown as number;
		}
	}
	const queued = <T extends Queued>(Kind: new (config: ConstructorParameters<typeof CpuBackend>[0], initial?: ConstructorParameters<typeof CpuBackend>[1]) => T) => {
		const made: T[] = [];
		const factory: BackendFactory = (config, initial) => {
			const backend = new Kind(config, initial);
			made.push(backend);
			return backend;
		};
		return { made, factory };
	};

	test.describe('a backend that queues its steps and reports how many are unfinished, as the GPU does', () => {
		/** Draws `frames` frames at 60 fps of a clock at `speed`, the device finishing `finishes` steps (all of them when it is Infinity) before each. Returns the simulated seconds sent per real second, and the deepest queue seen. */
		const run = async (backend: Queued, session: SimulationSession, frames: number, finishes: number) => {
			const from = backend.steps.length;
			let deepest = 0;
			for (let frame = 0; frame < frames; frame++) {
				backend.finish(finishes);
				session.update(FRAME);
				deepest = Math.max(deepest, backend.inFlight);
			}
			return { speed: sum(backend.steps.slice(from)) / (frames * FRAME), deepest };
		};

		test('it is given no more than its own limit, which is deeper than the worker’s: eight at once, and then it waits', async () => {
			const { made, factory } = queued(Queued);
			const { session } = makeSession((p) => (p.clock.speed = 20), factory);
			await start(session);
			const device = made[0];
			for (let n = 0; n < 40; n++) session.update(FRAME);
			expect(device.steps, 'seven stable steps cover the first frame at 20 times real time, and one more fills the queue').toHaveLength(8);
			expect(device.stepsInFlight).toBe(8);
			device.finish(3);
			session.update(FRAME);
			expect(device.steps, 'a finished step makes room for exactly one').toHaveLength(11);
			expect(device.stepsInFlight).toBe(8);
			session.dispose();
		});

		test('one that keeps up reaches the fastest clock, 20 times real time at 60 frames a second, and the readout says so', async () => {
			const { made, factory } = queued(Queued);
			const { session, readout } = makeSession((p) => (p.clock.speed = 20), factory);
			await start(session);
			const device = made[0];
			const { speed, deepest } = await run(device, session, 120, Infinity);
			expect(speed, 'sent as much as the clock asked').toBeGreaterThan(19);
			expect(speed).toBeLessThanOrEqual(20 + 1e-6);
			expect(deepest, 'in seven steps a frame, inside its limit').toBeLessThanOrEqual(8);
			for (let n = 0; n < 12; n++) {
				device.finish();
				session.update(FRAME);
				await settle();
			}
			expect(readout.physics.rate).toBeGreaterThan(18);
			session.dispose();
		});

		test('one that cannot keep up runs the simulation slower than the clock and says by how much, and its queue stays inside its limit', async () => {
			const { made, factory } = queued(Queued);
			const { session, readout } = makeSession((p) => (p.clock.speed = 20), factory);
			await start(session);
			const device = made[0];
			// It finishes three steps a frame, 0.05 s each: 9 seconds of the air's time for every second that goes by, not 20.
			const { speed, deepest } = await run(device, session, 300, 3);
			expect(speed).toBeGreaterThan(8);
			expect(speed).toBeLessThan(10.5);
			expect(deepest, 'the queue is bounded').toBeLessThanOrEqual(8);
			for (let n = 0; n < 12; n++) {
				device.finish(3);
				session.update(FRAME);
				await settle();
			}
			expect(readout.physics.rate, 'the Physics panel and the tuner see what the device really did').toBeGreaterThan(7.5);
			expect(readout.physics.rate).toBeLessThan(11);
			session.dispose();
		});

		test('the same device with no count of what is unfinished is sent everything the clock asks, however far behind it falls: the rate then says nothing', async () => {
			const { made, factory } = queued(Unreported);
			const { session, readout } = makeSession((p) => (p.clock.speed = 20), factory);
			await start(session);
			const device = made[0];
			const { speed, deepest } = await run(device, session, 300, 3);
			expect(speed, 'as much as the clock asks').toBeGreaterThan(19);
			expect(deepest, 'while its queue grows without bound').toBeGreaterThan(1000);
			for (let n = 0; n < 12; n++) {
				device.finish(3);
				session.update(FRAME);
				await settle();
			}
			expect(readout.physics.rate, 'and the page calls that real time').toBeGreaterThan(18);
			session.dispose();
		});

		test('at real time, one step a frame, a device that finishes each one in time is never held back, and one that takes two frames for a step runs at half speed with longer steps', async () => {
			const keeping = queued(Queued);
			const first = makeSession(undefined, keeping.factory);
			await start(first.session);
			const fast = await run(keeping.made[0], first.session, 120, Infinity);
			expect(fast.speed).toBeGreaterThan(0.99);
			expect(fast.speed).toBeLessThanOrEqual(1 + 1e-9);
			first.session.dispose();

			const slow = queued(Queued);
			const second = makeSession(undefined, slow.factory);
			await start(second.session);
			// A step takes 33 ms of the device's time, so it can finish one every other frame: the steps grow to the 50 ms stable one only if asked to, so it keeps up at real time here.
			let sent = 0;
			for (let frame = 0; frame < 300; frame++) {
				if (frame % 2 === 0) slow.made[0].finish(1);
				second.session.update(FRAME);
			}
			sent = sum(slow.made[0].steps) / (300 * FRAME);
			expect(sent).toBeGreaterThan(0.93);
			second.session.dispose();
		});
	});

	/** Stands in for the auto-tuner: it is told every frame, says nothing until the test gives it a retune to say, and has the note it was made with. */
	const scripted = (note = '') => {
		const told: { kind: BackendKind; sample: FrameSample }[] = [];
		let ready: Retune | null = null;
		const tuning: Tuning = {
			observe: (kind, sample) => {
				told.push({ kind, sample });
				const retune = ready;
				ready = null;
				return retune;
			},
			note: () => note
		};
		return { tuning, told, ask: (retune: Retune) => (ready = retune) };
	};
	const retune = (size: number): Retune => ({ size, direction: 'finer', message: 'Restarted on a finer grid: the device has room to spare.' });
	/** Draws frames the way the Stage does until `done`, letting the build and the reads proceed. */
	const until = async (session: SimulationSession, done: () => boolean, what: string) => {
		const deadline = Date.now() + 30000;
		while (!done()) {
			if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
			session.update(FRAME);
			await pause(5);
		}
	};
	const fan = (): Setup['devices'][number] => ({ id: 'f1', model: DEVICE_MODELS[0].id, x: 2.4, z: 2.4, y: 0, yaw: 90, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 } }) as unknown as Setup['devices'][number];

	test.describe('the auto-tuner', () => {
		test('is told how every frame went while the clock runs: the real time it took, the rate the solver achieved, and which kind of backend it is on', async () => {
			const tuner = scripted();
			const { session, readout } = makeSession(undefined, make, () => 0.3, { tuning: tuner.tuning });
			await start(session);
			await draw(session, 12);
			expect(tuner.told.length, 'a frame is one call').toBeGreaterThanOrEqual(10);
			expect(tuner.told.every((frame) => frame.kind === 'cpu' && !frame.sample.paused)).toBe(true);
			expect(tuner.told.every((frame) => Math.abs(frame.sample.dt - FRAME) < 1e-12)).toBe(true);
			expect(tuner.told.at(-1)!.sample.rate, 'the achieved rate, the one the Physics panel shows').toBeCloseTo(readout.physics.rate!, 1);
			session.dispose();
		});

		test('a new size restarts the world there, with the Probes and Devices kept, and the screen reader and the status line are told once', async () => {
			const tuner = scripted();
			let size = 0.3;
			const { session, params, readout, announced } = makeSession(
				(p) => {
					p.probes = [{ id: 'p1', x: 5.1, y: 1.1, z: 2.7 }];
					p.setup = { ...p.setup, devices: [fan()] };
				},
				make,
				() => size,
				{ models: DEVICE_MODELS, tuning: tuner.tuning }
			);
			await start(session);
			await draw(session, 10);
			const first = session.world!;
			expect(first.raster.spec.h).toBe(0.3);
			expect(readout.tuning, 'nothing to say yet').toBe('');
			expect(announced).toEqual([]);

			const message = retune(0.2).message;
			size = 0.2;
			tuner.ask({ ...retune(0.2) });
			await until(session, () => session.world !== first, 'the world at the new size');
			expect(session.world!.raster.spec.h).toBe(0.2);
			expect(readout.physics.cellSize, 'the Physics panel and the status line show the new size').toBe(0.2);
			expect(readout.tuning, 'and why').toBe(message);
			expect(announced, 'said once, politely').toEqual([message]);
			expect(session.simTime, 'the air starts again from rest').toBeLessThan(1);
			expect(first.backend === session.world!.backend, 'the old world is let go, and the new one has a solver of its own').toBe(false);

			// What the visitor set up is in the params, so the new world has it: the Probe reads the new air, and the fan is in the new solver.
			expect(params.probes).toEqual([{ id: 'p1', x: 5.1, y: 1.1, z: 2.7 }]);
			expect(params.setup.devices.map((d) => d.id)).toEqual(['f1']);
			expect(session.world!.current.devices.map((d) => d.id)).toEqual(['f1']);
			expect(session.world!.fanIndexOf('f1'), 'the fan is part of the new solver').toBeDefined();
			await draw(session, 12, 0.3);
			expect(readout.probes.map((p) => p.id)).toEqual(['p1']);
			expect(Number.isFinite(readout.probes[0].speed)).toBe(true);
			expect(Object.keys(readout.deviceFlow)).toEqual(['f1']);
			expect(announced, 'and no second time').toEqual([message]);
			expect(readout.tuning, 'it stays while the world runs').toBe(message);
			session.dispose();
		});

		test('a restart by the visitor is on the size the tuner has settled on, and says nothing of the retune that came before', async () => {
			const tuner = scripted();
			let size = 0.3;
			const { session, params, readout, announced } = makeSession(undefined, make, () => size, { tuning: tuner.tuning });
			await start(session);
			await draw(session, 4);
			const first = session.world!;
			size = 0.2;
			tuner.ask(retune(0.2));
			await until(session, () => session.world !== first, 'the retune');
			expect(readout.tuning).not.toBe('');
			const second = session.world!;
			params.restarts++;
			await until(session, () => session.world !== second, 'the restart');
			expect(session.world!.raster.spec.h).toBe(0.2);
			expect(readout.tuning, 'a restart is not a retune').toBe('');
			expect(announced, 'only the retune was announced').toHaveLength(1);
			session.dispose();
		});

		test('while the new world is being built the old one runs on, and its frames are not told to the tuner, which has already begun counting the new one', async () => {
			const tuner = scripted();
			let size = 0.3;
			// Choosing the backend takes a moment (the tuner's `pick` is called at its start, so it has started counting the new world by then): here it takes as long as the test likes.
			let release: () => void = () => {};
			let gate: Promise<void> | null = null;
			const { session, readout } = makeSession(
				undefined,
				make,
				async () => {
					if (gate) await gate;
					return size;
				},
				{ tuning: tuner.tuning }
			);
			await start(session);
			await draw(session, 6);
			const first = session.world!;
			const before = tuner.told.length;
			expect(before).toBeGreaterThan(0);
			size = 0.2;
			gate = new Promise<void>((resolve) => (release = resolve));
			tuner.ask(retune(0.2));
			// The frame that was told it returned the retune; from then on the old world is not observed until the new one is on show.
			session.update(FRAME);
			expect(tuner.told).toHaveLength(before + 1);
			const time = session.simTime;
			for (let n = 0; n < 12; n++) {
				session.update(FRAME);
				await pause(5);
			}
			expect(session.world === first, 'the new world is not ready yet').toBe(true);
			expect(session.simTime, 'the old one is still running').toBeGreaterThan(time);
			expect(tuner.told, 'but it is not being counted').toHaveLength(before + 1);
			expect(readout.tuning, 'and the status line does not say it restarted before it has').toBe('');

			release();
			await until(session, () => session.world !== first, 'the world at the new size');
			const counted = tuner.told.length;
			await draw(session, 6);
			expect(tuner.told.length, 'the new world is told its own frames').toBeGreaterThan(counted);
			session.dispose();
		});

		test('nothing is told to it, and nothing can be asked of it, while the clock is paused', async () => {
			const tuner = scripted();
			let size = 0.3;
			const { session, params, announced } = makeSession((p) => (p.clock.paused = true), make, () => size, { tuning: tuner.tuning });
			await start(session);
			await draw(session, 30);
			expect(tuner.told, 'a paused clock measures nothing').toHaveLength(0);
			// A retune that is already waiting is not made while paused either.
			tuner.ask(retune(0.2));
			size = 0.2;
			const first = session.world!;
			await draw(session, 30);
			expect(session.world === first, 'no new world while paused').toBe(true);
			expect(announced).toEqual([]);

			params.clock.paused = false;
			await until(session, () => session.world !== first, 'the retune, once the clock runs');
			expect(session.world!.raster.spec.h).toBe(0.2);
			expect(tuner.told.length).toBeGreaterThan(0);
			expect(tuner.told.every((frame) => !frame.sample.paused)).toBe(true);
			session.dispose();
		});

		test('a world that cannot be built at the new size says nothing, is not tried again every frame, and leaves the old one running', async () => {
			const tuner = scripted();
			let size = 0.3;
			let builds = 0;
			const factory: BackendFactory = async (config, initial) => {
				builds++;
				if (builds === 2) throw new Error('out of memory');
				return make(config, initial);
			};
			const { session, readout, announced } = makeSession(undefined, factory, () => size, { tuning: tuner.tuning });
			const log = listen();
			try {
				await start(session);
				await draw(session, 4);
				const first = session.world!;
				size = 0.2;
				tuner.ask(retune(0.2));
				for (let n = 0; n < 40; n++) {
					session.update(FRAME);
					await pause(5);
				}
				expect(builds, 'tried once').toBe(2);
				expect(session.world === first, 'the old world is still the one running').toBe(true);
				expect(readout.tuning).toBe('');
				expect(announced).toEqual([]);
				expect(log.said.errors).toHaveLength(1);
			} finally {
				log.restore();
				session.dispose();
			}
		});

		test('a phone or a small tablet: the coarsest grid from the first world, the note in the readout and said once, and nothing measured however long it runs or often it restarts', async () => {
			const log = listen();
			// The real choice, with no graphics card (Node has none) and a device that is small: the grid and the note are its.
			const choice = chooseBackend({ small: true, openGpu: () => Promise.reject(new GpuSolverError('no-webgpu', 'no')) });
			try {
				const { session, params, readout, announced } = makeSession(undefined, make, (plan) => choice.cellSize(plan), { tuning: choice });
				await start(session);
				expect(readout.physics.cellSize).toBe(0.3);
				expect(readout.tuning).toBe('Coarsest grid here: best on a laptop.');
				expect(announced).toEqual([readout.tuning]);
				const first = session.world!;
				await draw(session, 20, 0.5);
				expect(session.world === first, 'it is never measured, so it never changes').toBe(true);
				params.restarts++;
				await until(session, () => session.world !== first, 'the restart');
				expect(readout.physics.cellSize).toBe(0.3);
				expect(readout.tuning, 'the note is permanent').toBe('Coarsest grid here: best on a laptop.');
				expect(announced, 'but it is announced once').toHaveLength(1);
				params.setup = blankSetup('house');
				await until(session, () => session.world!.raster.plan.id === 'house', 'another Home');
				expect(readout.physics.cellSize, 'on every Home').toBe(0.3);
				session.dispose();
			} finally {
				choice.dispose();
				log.restore();
			}
		});

		test('a cell size the address asks for pins the grid: the tuner is not asked, so no retune and no note, whatever the frames say', async () => {
			const log = listen();
			const choice = chooseBackend({ fixedCell: 0.2, openGpu: () => Promise.reject(new GpuSolverError('no-webgpu', 'no')) });
			try {
				const { session, readout, announced } = makeSession(undefined, make, (plan) => choice.cellSize(plan), { tuning: choice });
				await start(session);
				expect(readout.physics.cellSize, 'not the 0.15 m the worker’s tuner would start the studio on').toBe(0.2);
				const first = session.world!;
				await draw(session, 20, 0.5);
				expect(session.world === first, 'the grid never changes').toBe(true);
				expect(readout.tuning).toBe('');
				expect(announced).toEqual([]);
				session.dispose();
			} finally {
				choice.dispose();
				log.restore();
			}
		});

		test('the real tuner: a world with room to spare is judged on its own five seconds, a finer one is built and said, and the old world’s frames while it is built are not counted toward it', async () => {
			// A small budget, so the studio starts on coarse cells and the climb is quick.
			const tuner = new Tuner({ kind: 'cpu', budget: 5000 });
			let observed = 0;
			let atVerdict = -1;
			const tuning: Tuning = {
				observe: (_kind, sample) => {
					observed++;
					const retune = tuner.observe(sample);
					if (retune) atVerdict = observed;
					return retune;
				},
				note: () => tuner.note ?? ''
			};
			// The choice sizes the world when the build starts (that is when the tuner starts counting it), and the world takes a moment to build.
			// A backend that finishes each step as it is given it, so how fast the test machine is changes nothing the tuner is told.
			const { made, factory } = queued(Queued);
			const { session, readout, announced } = makeSession(
				undefined,
				factory,
				(plan) => {
					const h = tuner.pick(plan);
					return pause(60).then(() => h);
				},
				{ tuning }
			);
			await start(session);
			expect(readout.physics.cellSize).toBe(0.3);
			const first = session.world!;
			// Frames of a tenth of a second: two seconds of warm-up and three of a window are about fifty of them.
			const deadline = Date.now() + 30000;
			while (session.world === first) {
				made.at(-1)!.finish();
				session.update(0.1);
				await pause(3);
				if (Date.now() > deadline) throw new Error('Timed out waiting for the finer world.');
			}
			expect(atVerdict, 'the verdict came after the warm-up and a window of this world, not sooner').toBeGreaterThanOrEqual(48);
			expect(atVerdict).toBeLessThanOrEqual(52);
			expect(observed, 'and none of the old world’s frames while the new one was being built (a dozen of them) were told').toBe(atVerdict);
			expect(readout.physics.cellSize).toBe(0.2);
			expect(readout.tuning).toBe('Restarted on a finer grid: the device has room to spare.');
			expect(announced).toHaveLength(1);
			const second = session.world!;
			// Another verdict takes another five seconds of the new world's own frames, and they are counted from its first.
			for (let n = 0; n < 40; n++) {
				made.at(-1)!.finish();
				session.update(0.1);
				await pause(3);
			}
			expect(observed, 'the new world is told its frames').toBeGreaterThan(atVerdict + 30);
			expect(session.world === second, 'no second change before its own warm-up and window are over').toBe(true);
			session.dispose();
		});
	});
});
