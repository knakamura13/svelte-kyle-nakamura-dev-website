import { expect, test } from '@playwright/test';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import { emptyReadout } from '../../src/lib/experiments/airflow/readouts';
import { SimulationSession, type SessionParams } from '../../src/lib/experiments/airflow/sim/session';
import type { BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { GpuSolverError } from '../../src/lib/experiments/airflow/solver/gpu/errors';
import { blankSetup, DEFAULT_CLOCK, DEFAULT_VIEW } from '../../src/lib/experiments/airflow/state';

/** The page's runtime driver, run with a fake clock: each `update(dt)` is one drawn frame of `dt` real seconds. */

const make: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const studio = planById('studio')!;
const FRAME = 1 / 60;

const makeSession = (tweak?: (params: SessionParams) => void, factory: BackendFactory = make) => {
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
	const session = new SimulationSession({ params, plans, models: [], make: factory, cellSize: () => 0.2, readout, invalidate: () => invalidated.count++, reducedMotion: () => false });
	return { session, params, readout, invalidated };
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

		test('a browser with no WebGPU, or no adapter, reads as unsupported rather than as a fault', async () => {
			for (const reason of ['no-webgpu', 'no-adapter'] as const) {
				const { factory } = failing(new GpuSolverError(reason, 'nothing to run on'));
				const { session, readout } = makeSession(undefined, factory);
				const quiet = console.error;
				console.error = () => {};
				try {
					for (let n = 0; n < 6; n++) {
						session.update(FRAME);
						await pause(5);
					}
					expect(readout.status, reason).toBe('unsupported');
					expect(readout.note).toContain('WebGPU');
				} finally {
					console.error = quiet;
					session.dispose();
				}
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
});
