import { expect, test } from '@playwright/test';
import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import { fluidFor, World } from '../../src/lib/experiments/airflow/sim/world';
import type { BackendFailure } from '../../src/lib/experiments/airflow/solver/backend';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { transferList } from '../../src/lib/experiments/airflow/solver/cpu/protocol';
import { WorkerBackend } from '../../src/lib/experiments/airflow/solver/cpu/proxy';
import type { SolverConfig } from '../../src/lib/experiments/airflow/solver/types';
import { blankSetup, type Setup } from '../../src/lib/experiments/airflow/state';
import { inMemoryWorker, until } from './channel';

/**
 * The solver's Web Worker, driven in Node through a real message channel (tests/solver/channel.ts): what the page sends it,
 * what it answers, and what the page does when it goes wrong. The one thing a unit test cannot show is the browser's
 * own Worker, which the page's end-to-end test (tests/airflow.spec.ts) and the GPU suite's browser cover.
 */

const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
const H = 0.3;

/** A fresh solver configuration (the CPU solver changes its geometry in place, so no two backends share one). */
function makeConfig(): SolverConfig {
	const setup = blankSetup('studio');
	const raster = rasterizePlan(planById('studio')!, H, { furniture: setup.furniture });
	return { grid: raster.spec, fluid: fluidFor(setup), geometry: raster.geometry };
}

/** The two-bedroom home in a west wind, with two windows and a door open and a fan on: every kind of update the solver takes. */
function windySetup(): Setup {
	const setup = blankSetup('two-bedroom');
	setup.conditions = { ...setup.conditions, windFrom: 270, windSpeed: 4, outdoorTemp: 21, indoorTemp: 21, outdoorPm25: 0 };
	setup.openings = { 'living-window-1': 1, 'bedroom-1-window': 1, 'bedroom-1-door': 1 };
	setup.devices = [
		{ id: 'f1', model: DEVICE_MODELS[0].id, x: 2.4, z: 5.4, y: 0, yaw: 90, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 } } as unknown as Setup['devices'][number]
	];
	return setup;
}

/** The largest gap between two arrays, or Infinity if they are not the same length. */
function gap(a: ArrayLike<number> | undefined, b: ArrayLike<number> | undefined) {
	if (!a || !b || a.length !== b.length) return Infinity;
	let worst = 0;
	for (let n = 0; n < a.length; n++) worst = Math.max(worst, Math.abs(a[n] - b[n]));
	return worst;
}

test.describe('the solver worker', () => {
	test.describe.configure({ timeout: 60_000 });

	test('create gives the grid and the fluid cell count, and a worker that has no steps unfinished', async () => {
		const worker = inMemoryWorker();
		const config = makeConfig();
		const backend = await WorkerBackend.create(worker.port, config);
		const reference = new CpuBackend(makeConfig());
		expect(backend.kind).toBe('cpu');
		expect(backend.grid.nx).toBe(config.grid.nx);
		expect(backend.grid.cells).toBe(reference.grid.cells);
		expect(backend.fluidCells).toBe(reference.fluidCells);
		expect(backend.fluidCells).toBeGreaterThan(500);
		expect(backend.stepsInFlight).toBe(0);
		expect(worker.sent.map((r) => r.type)).toEqual(['create']);
		backend.dispose();
	});

	test('every step is acknowledged when it is done: the unfinished count rises with each call and falls with each reply', async () => {
		const worker = inMemoryWorker();
		const backend = await WorkerBackend.create(worker.port, makeConfig());
		worker.hold(true);
		for (let n = 0; n < 3; n++) backend.step(0.02);
		expect(backend.stepsInFlight, 'counted when it is sent, before the worker has begun').toBe(3);
		await until(() => worker.sent.length === 4, 'the steps to be sent');
		// Held replies are the worker being slow: the steps are done, and the page has not been told.
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(backend.stepsInFlight).toBe(3);
		worker.hold(false);
		await until(() => backend.stepsInFlight === 0, 'the acknowledgements');
		const { diagnostics } = await backend.snapshot({});
		expect(diagnostics.steps, 'the worker did the steps').toBe(3);
		expect(diagnostics.time).toBeCloseTo(0.06, 6);
		backend.dispose();
	});

	test('a world on the worker computes exactly what the same world in this thread does: updates, steps, particles, snapshots, samples and fields', async () => {
		const worker = inMemoryWorker();
		const remote = await World.create(windySetup(), { plans, models, h: H, make: (config, initial) => WorkerBackend.create(worker.port, config, initial) });
		const local = await World.create(windySetup(), { plans, models, h: H, make: (config, initial) => new CpuBackend(config, initial) });
		const both = [remote, local];
		for (const world of both) {
			for (let n = 0; n < 5; n++) world.backend.step(0.02);
			// A change that reaches every part of the update message: a window shut, an emitter, and particles to carry.
			world.apply({ ...windySetup(), openings: { ...windySetup().openings, 'living-window-1': 0.3 } }, 0.1);
			world.emit({ x: 3, y: 1, z: 3 }, 0.08);
			world.backend.configureParticles({ tracers: 200, smoke: 100, scale: 0.3, seed: 7 });
		}
		// The page's particle steps are one in flight at a time, and ones asked for while another is on its way are added together. For the
		// two worlds to move their particles alike here, each step waits for the worker to finish the last: a read is answered after it.
		const barrier = new Float32Array(3);
		for (let n = 0; n < 5; n++) {
			for (const world of both) {
				world.backend.step(0.02);
				world.backend.stepParticles(0.016);
			}
			await remote.backend.samplePoints(barrier);
		}
		const request = { sliceY: 1.1, particles: true, rooms: true };
		const [a, b] = await Promise.all([remote.backend.snapshot(request), local.backend.snapshot(request)]);
		expect(a.diagnostics.steps).toBe(10);
		expect(a.diagnostics, 'diagnostics').toEqual(b.diagnostics);
		expect(a.rooms, 'per-room numbers').toEqual(b.rooms);
		expect(a.fanFlow.length).toBeGreaterThan(0);
		expect(gap(a.fanFlow, b.fanFlow), 'fan flow').toBe(0);
		for (const field of ['u', 'v', 'w', 'speed', 'theta', 'particulates', 'fluid'] as const) expect(gap(a.slice![field], b.slice![field]), `slice ${field}`).toBe(0);
		expect(Math.max(...a.slice!.speed), 'the flow is not still').toBeGreaterThan(0.05);
		expect(gap(a.tracers, b.tracers), 'tracers').toBe(0);
		expect(gap(a.smoke, b.smoke), 'smoke').toBe(0);
		expect(a.tracers!.length).toBe(4 * 200);

		const points = new Float32Array([1.2, 1.1, 4.2, 2.4, 1.5, 5.4, 6.9, 0.9, 6.0]);
		const [sampledRemote, sampledLocal] = await Promise.all([remote.backend.samplePoints(points), local.backend.samplePoints(points)]);
		expect(sampledRemote.length).toBe(15);
		expect(gap(sampledRemote, sampledLocal), 'point samples').toBe(0);

		// Replies move their arrays out of the worker. A second snapshot after more steps still works, and still agrees.
		for (const world of both) for (let n = 0; n < 3; n++) world.backend.step(0.02);
		const [a2, b2] = await Promise.all([remote.backend.snapshot(request), local.backend.snapshot(request)]);
		expect(a2.diagnostics.steps).toBe(13);
		expect(gap(a2.slice!.u, b2.slice!.u), 'the second slice').toBe(0);
		expect(gap(a2.slice!.u, a.slice!.u), 'and it is a different moment').toBeGreaterThan(0);

		const [fieldsRemote, fieldsLocal] = await Promise.all([remote.backend.readFields(), local.backend.readFields()]);
		for (const field of ['u', 'v', 'w', 'p', 'theta', 'particulates'] as const) expect(gap(fieldsRemote[field], fieldsLocal[field]), `field ${field}`).toBe(0);
		expect(remote.backend.stepsInFlight).toBe(0);
		remote.dispose();
		local.dispose();
	});

	test('writeFields overwrites what the worker holds, and readFields reads it back', async () => {
		const worker = inMemoryWorker();
		const backend = await WorkerBackend.create(worker.port, makeConfig(), { theta: 0, particulates: 0 });
		for (let n = 0; n < 4; n++) backend.step(0.02);
		const before = await backend.readFields();
		const doubled = { ...before, u: before.u.map((x) => 2 * x), theta: before.theta.map((x) => x + 1) };
		backend.writeFields(doubled);
		const after = await backend.readFields();
		expect(gap(after.u, doubled.u)).toBe(0);
		expect(gap(after.theta, doubled.theta)).toBe(0);
		expect(gap(after.p, before.p)).toBe(0);
		backend.dispose();
	});

	test('particle steps are one in flight at a time, and those asked for meanwhile are added into a single step', async () => {
		const worker = inMemoryWorker();
		const backend = await WorkerBackend.create(worker.port, makeConfig());
		backend.configureParticles({ tracers: 50, smoke: 50, scale: 0.3, seed: 1 });
		const moves = () => worker.sent.filter((request) => request.type === 'stepParticles') as { type: 'stepParticles'; dt: number }[];
		worker.hold(true);
		for (let n = 0; n < 5; n++) backend.stepParticles(0.016);
		expect(moves().map((m) => m.dt), 'the first goes at once and the rest wait for its reply').toEqual([0.016]);
		worker.hold(false);
		await until(() => moves().length === 2, 'the summed step');
		expect(moves()[1].dt).toBeCloseTo(4 * 0.016, 9);
		// Whatever has piled up while the worker was behind is capped, so one long stall is not one huge move.
		worker.hold(true);
		for (let n = 0; n < 6; n++) backend.stepParticles(0.5);
		worker.hold(false);
		await until(() => moves().length >= 3, 'the capped step');
		for (const move of moves().slice(2)) expect(move.dt).toBeLessThanOrEqual(0.1 + 1e-9);
		const { tracers } = await backend.snapshot({ particles: true });
		expect(Array.from(tracers!).every(Number.isFinite)).toBe(true);
		backend.dispose();
	});

	test('dispose stops the worker: what was asked is rejected, nothing more is sent, and it is not a failure', async () => {
		const worker = inMemoryWorker();
		const backend = await WorkerBackend.create(worker.port, makeConfig());
		const failures: BackendFailure[] = [];
		backend.onFailure((failure) => failures.push(failure));
		worker.hold(true);
		backend.step(0.02);
		const waiting = backend.snapshot({});
		backend.dispose();
		await expect(waiting).rejects.toThrow(/stopped/);
		expect(worker.terminated).toBe(true);
		expect(backend.stepsInFlight).toBe(0);
		const sent = worker.sent.length;
		backend.step(0.02);
		backend.update({ emitters: [] });
		backend.stepParticles(0.016);
		backend.configureParticles({ tracers: 1, smoke: 1, scale: 1 });
		backend.writeFields(await new CpuBackend(makeConfig()).readFields());
		expect(worker.sent.length, 'a disposed backend sends nothing').toBe(sent);
		await expect(backend.readFields()).rejects.toThrow(/stopped/);
		backend.dispose();
		expect(failures).toEqual([]);
	});

	test('a request that fails in the worker rejects that request alone: the backend carries on', async () => {
		class Faulty extends CpuBackend {
			override async samplePoints(): Promise<Float32Array> {
				throw new Error('no samples today');
			}
		}
		const worker = inMemoryWorker((config, initial) => new Faulty(config, initial));
		const backend = await WorkerBackend.create(worker.port, makeConfig());
		const failures: BackendFailure[] = [];
		backend.onFailure((failure) => failures.push(failure));
		await expect(backend.samplePoints(new Float32Array([1, 1, 1]))).rejects.toThrow('no samples today');
		backend.step(0.02);
		const { diagnostics } = await backend.snapshot({});
		expect(diagnostics.steps).toBe(1);
		expect(failures).toEqual([]);
		expect(worker.terminated).toBe(false);
		backend.dispose();
	});

	test('a step that throws in the worker fails the backend: the listener hears it once, reads reject, the worker is stopped and nothing more is sent', async () => {
		class Exploding extends CpuBackend {
			private count = 0;
			override step(dt: number) {
				if (++this.count === 3) throw new Error('the solver blew up');
				super.step(dt);
			}
		}
		const worker = inMemoryWorker((config, initial) => new Exploding(config, initial));
		const backend = await WorkerBackend.create(worker.port, makeConfig());
		const failures: BackendFailure[] = [];
		backend.onFailure((failure) => failures.push(failure));
		for (let n = 0; n < 5; n++) backend.step(0.02);
		await until(() => failures.length > 0, 'the failure report');
		expect(failures).toEqual([{ reason: 'crashed', message: 'the solver blew up' }]);
		expect(backend.stepsInFlight, 'the steps that will never finish are not counted').toBe(0);
		expect(worker.terminated).toBe(true);
		const sent = worker.sent.length;
		backend.step(0.02);
		backend.update({ emitters: [] });
		expect(worker.sent.length).toBe(sent);
		await expect(backend.snapshot({})).rejects.toThrow('the solver blew up');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(failures, 'and it is said once').toHaveLength(1);
	});

	test('an error in the worker outside any request fails it too, and rejects the read that was waiting', async () => {
		const worker = inMemoryWorker();
		const backend = await WorkerBackend.create(worker.port, makeConfig());
		const failures: BackendFailure[] = [];
		backend.onFailure((failure) => failures.push(failure));
		worker.hold(true);
		const waiting = backend.snapshot({});
		worker.crash('Uncaught SyntaxError: nope');
		await expect(waiting).rejects.toThrow('Uncaught SyntaxError: nope');
		expect(failures).toEqual([{ reason: 'crashed', message: 'Uncaught SyntaxError: nope' }]);
		expect(worker.terminated).toBe(true);
	});

	test('a failure can be listened for after it happened, and a listener that has unsubscribed is not called', async () => {
		const worker = inMemoryWorker();
		const backend = await WorkerBackend.create(worker.port, makeConfig());
		const early: BackendFailure[] = [];
		const late: BackendFailure[] = [];
		const stop = backend.onFailure((failure) => early.push(failure));
		stop();
		worker.crash('gone');
		expect(early).toEqual([]);
		backend.onFailure((failure) => late.push(failure));
		await until(() => late.length > 0, 'the late listener');
		expect(late).toEqual([{ reason: 'crashed', message: 'gone' }]);
	});

	test('a worker that cannot build the solver rejects create, and is stopped', async () => {
		const worker = inMemoryWorker(() => {
			throw new Error('the grid does not fit in memory');
		});
		await expect(WorkerBackend.create(worker.port, makeConfig())).rejects.toThrow('the grid does not fit in memory');
		expect(worker.terminated).toBe(true);
	});

	test('transferList moves whole buffers, each once, and copies a view onto part of one', () => {
		const whole = new Float32Array(4);
		const part = whole.subarray(1, 3);
		const other = new Uint8Array(2);
		const list = transferList(whole, part, other, null, undefined);
		expect(list).toHaveLength(2);
		expect(list[0]).toBe(whole.buffer);
		expect(list[1]).toBe(other.buffer);
		expect(transferList(part)).toEqual([]);
	});
});
