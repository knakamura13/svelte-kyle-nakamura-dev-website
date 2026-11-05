import { expect, test } from '@playwright/test';
import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import { emptyReadout } from '../../src/lib/experiments/airflow/readouts';
import { SCENARIOS } from '../../src/lib/experiments/airflow/scenarios';
import { SimulationSession, VOLUME_INTERVAL, type SessionParams } from '../../src/lib/experiments/airflow/sim/session';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import type { SnapshotRequest } from '../../src/lib/experiments/airflow/solver/backend';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { WorkerBackend } from '../../src/lib/experiments/airflow/solver/cpu/proxy';
import { Grid } from '../../src/lib/experiments/airflow/solver/grid';
import { FLOW_STRIDE, SCALAR_STRIDE, VOLUME_BUDGET, extractVolume, volumeCells, volumeSpec, type Volume } from '../../src/lib/experiments/airflow/solver/volume';
import { DEFAULT_CLOCK, DEFAULT_VIEW, type Setup } from '../../src/lib/experiments/airflow/state';
import { inMemoryWorker, until } from './channel';

/**
 * The volume snapshot (solver/volume.ts): how it divides the box, that its averages are the plain averages over the air, that the
 * worker sends it to the page as moved buffers through a real message channel, and how the session asks for it.
 */

const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
const crossVentilation = () => structuredClone(SCENARIOS.find((s) => s.id === 'cross-ventilation')!.setup) as Setup;

/** The largest gap between two arrays, or Infinity if they are not the same length. */
function gap(a: ArrayLike<number> | undefined, b: ArrayLike<number> | undefined) {
	if (!a || !b || a.length !== b.length) return Infinity;
	let worst = 0;
	for (let n = 0; n < a.length; n++) worst = Math.max(worst, Math.abs(a[n] - b[n]));
	return worst;
}

test.describe('the volume grid', () => {
	test('a grid within the budget is its own volume', () => {
		const spec = volumeSpec({ nx: 40, ny: 12, nz: 26, h: 0.2 });
		expect(spec).toEqual({ nx: 40, ny: 12, nz: 26, sx: 1, sy: 1, sz: 1, h: 0.2 });
	});

	test('every Home at every cell size the tuner picks fits the budget, with no volume cell longer than 0.3 m', () => {
		for (const plan of plans)
			for (const h of [0.3, 0.2, 0.15, 0.1, 0.075]) {
				const grid = { nx: Math.round(plan.width / h), ny: Math.round(plan.ceiling / h), nz: Math.round(plan.depth / h), h };
				const spec = volumeSpec(grid);
				expect(volumeCells(spec), `${plan.id} at ${h} m`).toBeLessThanOrEqual(VOLUME_BUDGET);
				expect(spec.nx * spec.sx).toBeGreaterThanOrEqual(grid.nx);
				expect((spec.nx - 1) * spec.sx).toBeLessThan(grid.nx);
				expect(spec.ny * spec.sy).toBeGreaterThanOrEqual(grid.ny);
				expect(spec.nz * spec.sz).toBeGreaterThanOrEqual(grid.nz);
				expect(Math.max(spec.sx, spec.sy, spec.sz) * h, `${plan.id} at ${h} m`).toBeLessThanOrEqual(0.3 + 1e-9);
			}
	});

	test('it coarsens as little as it can, and keeps the vertical finest where it has a choice', () => {
		// The two-bedroom at 0.15 m is 66,560 cells, just over: one axis is halved, not all three, and not the vertical.
		expect(volumeSpec({ nx: 80, ny: 16, nz: 52, h: 0.15 })).toMatchObject({ sx: 2, sy: 1, sz: 1, nx: 40, ny: 16, nz: 52 });
		// The house at 0.075 m (786,432 cells): thirds across, halves up.
		expect(volumeSpec({ nx: 192, ny: 32, nz: 128, h: 0.075 })).toMatchObject({ sx: 3, sy: 2, sz: 3 });
		// The studio at 0.075 m keeps every layer.
		expect(volumeSpec({ nx: 104, ny: 32, nz: 72, h: 0.075 })).toMatchObject({ sx: 2, sy: 1, sz: 2 });
	});
});

test.describe('the volume of a world', () => {
	test('each volume cell is the mean over the air in its block, with the share of air, whatever the block holds', () => {
		// Furniture and walls in a real plan, random fields, and blocks that do not divide the grid evenly (a budget that forces strides of 3).
		const raster = rasterizePlan(planById('one-bedroom')!, 0.15, { furniture: true });
		const grid = new Grid(raster.spec);
		let seed = 12345;
		const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
		const field = () => Float32Array.from({ length: grid.size }, random);
		const vel = { u: field(), v: field(), w: field() };
		const theta = field();
		const particulates = field().map(Math.abs);
		const spec = volumeSpec(grid, 2_500);
		expect(Math.max(spec.sx, spec.sy, spec.sz)).toBeGreaterThan(2);
		expect(grid.nx % spec.sx || grid.ny % spec.sy || grid.nz % spec.sz, 'a partial block on some axis').toBeGreaterThan(0);
		const volume = extractVolume(grid, raster.geometry, vel, theta, particulates, spec);
		const { sx, sxy } = grid;
		let solid = 0;
		let mixed = 0;
		for (let K = 0; K < spec.nz; K++)
			for (let J = 0; J < spec.ny; J++)
				for (let I = 0; I < spec.nx; I++) {
					const sums = [0, 0, 0, 0, 0];
					let air = 0;
					let count = 0;
					for (let k = K * spec.sz; k < Math.min((K + 1) * spec.sz, grid.nz); k++)
						for (let j = J * spec.sy; j < Math.min((J + 1) * spec.sy, grid.ny); j++)
							for (let i = I * spec.sx; i < Math.min((I + 1) * spec.sx, grid.nx); i++) {
								count++;
								const c = i + sx * j + sxy * k;
								if (!raster.geometry.fluid[c]) continue;
								air++;
								sums[0] += (vel.u[c] + vel.u[c + 1]) / 2;
								sums[1] += (vel.v[c] + vel.v[c + sx]) / 2;
								sums[2] += (vel.w[c] + vel.w[c + sxy]) / 2;
								sums[3] += theta[c];
								sums[4] += particulates[c];
							}
					const at = I + spec.nx * (J + spec.ny * K);
					const expected = air ? [...sums.slice(0, 3).map((s) => s / air), air / count, sums[3] / air, sums[4] / air] : [0, 0, 0, 0, 0, 0];
					const got = [...volume.flow.subarray(FLOW_STRIDE * at, FLOW_STRIDE * at + 4), ...volume.scalars.subarray(SCALAR_STRIDE * at, SCALAR_STRIDE * at + 2)];
					got.forEach((value, n) => expect(value, `cell ${I},${J},${K} field ${n}`).toBeCloseTo(expected[n], 5));
					if (!air) solid++;
					else if (air < count) mixed++;
				}
		expect(solid, 'some blocks are all furniture').toBeGreaterThan(0);
		expect(mixed, 'some are part furniture').toBeGreaterThan(0);
	});

	test('a snapshot that asks for the volume carries it, on the grid volumeSpec picks, and one that does not leaves it out', async () => {
		const world = await World.create(crossVentilation(), { plans, models, h: 0.2, make: (config, initial) => new CpuBackend(config, initial) });
		for (let n = 0; n < 20; n++) world.backend.step(0.05);
		const without = await world.backend.snapshot({ sliceY: 1.1 });
		expect(without.volume).toBeUndefined();
		const { volume } = await world.backend.snapshot({ volume: true });
		expect(volume).toBeDefined();
		expect(volume).toMatchObject({ ...volumeSpec(world.backend.grid) });
		expect(volume!.flow.length).toBe(FLOW_STRIDE * volumeCells(volume!));
		expect(volume!.scalars.length).toBe(SCALAR_STRIDE * volumeCells(volume!));
		// The breeze crosses the home from the west: east-going air somewhere, all of it finite.
		let east = 0;
		for (let n = 0; n < volumeCells(volume!); n++) east = Math.max(east, volume!.flow[FLOW_STRIDE * n]);
		expect(east).toBeGreaterThan(0.2);
		expect(Array.from(volume!.flow).every(Number.isFinite)).toBe(true);
		world.dispose();
	});
});

test.describe('the volume on the worker', () => {
	test.describe.configure({ timeout: 60_000 });

	test('comes through the message channel equal to the same world in this thread, as moved buffers', async () => {
		// The worker's solver keeps what each volume snapshot gave it, so the test can see that the buffers left it.
		const made: Volume[] = [];
		class Watched extends CpuBackend {
			override volume() {
				const volume = super.volume();
				made.push(volume);
				return volume;
			}
		}
		const worker = inMemoryWorker((config, initial) => new Watched(config, initial));
		const remote = await World.create(crossVentilation(), { plans, models, h: 0.2, make: (config, initial) => WorkerBackend.create(worker.port, config, initial) });
		const local = await World.create(crossVentilation(), { plans, models, h: 0.2, make: (config, initial) => new CpuBackend(config, initial) });
		for (const world of [remote, local]) {
			for (let n = 0; n < 12; n++) world.backend.step(0.05);
			world.emit({ x: 3, y: 1, z: 3 }, 0.2);
			for (let n = 0; n < 8; n++) world.backend.step(0.05);
		}
		const request: SnapshotRequest = { sliceY: 1.1, volume: true };
		const [a, b] = await Promise.all([remote.backend.snapshot(request), local.backend.snapshot(request)]);
		expect(a.volume, 'the volume crossed').toBeDefined();
		const { flow, scalars, ...spec } = a.volume!;
		const { flow: localFlow, scalars: localScalars, ...localSpec } = b.volume!;
		expect(spec).toEqual(localSpec);
		expect(gap(flow, localFlow), 'velocity and the share of air').toBe(0);
		expect(gap(scalars, localScalars), 'temperature and particulates').toBe(0);
		let smoky = 0;
		for (let n = 1; n < scalars.length; n += SCALAR_STRIDE) if (scalars[n] > 1e-6) smoky++;
		expect(smoky, 'the smoke released shows').toBeGreaterThan(0);
		expect(made).toHaveLength(1);
		expect(made[0].flow.buffer.byteLength, 'the flow was moved, not copied').toBe(0);
		expect(made[0].scalars.buffer.byteLength, 'and so were the scalars').toBe(0);
		// The page can read it again: a second volume after more steps still agrees, and shows a different moment.
		for (const world of [remote, local]) for (let n = 0; n < 4; n++) world.backend.step(0.05);
		const [a2, b2] = await Promise.all([remote.backend.snapshot({ volume: true }), local.backend.snapshot({ volume: true })]);
		expect(gap(a2.volume!.flow, b2.volume!.flow)).toBe(0);
		expect(gap(a2.volume!.flow, flow)).toBeGreaterThan(0);
		remote.dispose();
		local.dispose();
	});
});

test.describe('the session and the volume', () => {
	test.describe.configure({ timeout: 120_000 });

	const FRAME = 1 / 60;
	const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	/** A session on the studio whose backend counts the volume reads it is asked for. */
	function counted(factory: (config: Parameters<BackendFactory>[0], initial: Parameters<BackendFactory>[1]) => ReturnType<BackendFactory>, volume = true) {
		const reads: { volume: boolean }[] = [];
		const make: BackendFactory = async (config, initial) => {
			const backend = await factory(config, initial);
			const snapshot = backend.snapshot.bind(backend);
			backend.snapshot = (request) => {
				reads.push({ volume: !!request.volume });
				return snapshot(request);
			};
			return backend;
		};
		const params: SessionParams = {
			setup: crossVentilation(),
			view: { ...DEFAULT_VIEW, units: 'metric' },
			clock: { ...DEFAULT_CLOCK },
			probes: [],
			emission: { strength: 0.5, active: false },
			restarts: 0,
			startingSmoke: 0
		};
		const session = new SimulationSession({ params, plans, models: DEVICE_MODELS, make, cellSize: () => 0.3, readout: emptyReadout(), invalidate: () => {}, reducedMotion: () => false, volume, particles: false });
		return { session, params, reads, volumes: () => reads.filter((r) => r.volume).length };
	}

	/** Draws frames the way the Stage does: one more only while the session asks for it, letting each frame's read finish. Returns how many it took. */
	async function frames(session: SimulationSession, count: number, dt = FRAME) {
		for (let n = 1; n <= count; n++) {
			const more = session.update(dt);
			await pause(4);
			if (!more) return n;
		}
		return count;
	}

	async function start(session: SimulationSession) {
		const deadline = Date.now() + 30_000;
		while (!session.world && Date.now() < deadline) {
			session.update(FRAME);
			await pause(4);
		}
		expect(session.world).not.toBeNull();
	}

	test('while the clock runs it is read at most ten times a second, and it is of the running world', async () => {
		const { session, volumes, reads } = counted((config, initial) => new CpuBackend(config, initial));
		await start(session);
		await frames(session, 3);
		expect(session.latest.volume, "the new world's first picture has one").not.toBeNull();
		expect(session.latest.volume).toMatchObject({ ...volumeSpec(session.world!.backend.grid) });
		const before = volumes();
		const snapshotsBefore = reads.length;
		// Two simulated seconds of frames at 60 a second.
		await frames(session, 120);
		const read = volumes() - before;
		expect(read, 'about ten a second').toBeGreaterThanOrEqual(10);
		expect(read).toBeLessThanOrEqual(Math.ceil((120 * FRAME) / VOLUME_INTERVAL) + 1);
		expect(reads.length - snapshotsBefore, 'snapshots without one come in between').toBeGreaterThan(read);
		expect(session.latest.volumeAt).toBeGreaterThan(0);
		session.dispose();
	});

	test('when the clock stops it is read once more, at once, for the moment it stopped at, and not again while it stays stopped', async () => {
		const { session, params, volumes } = counted((config, initial) => new CpuBackend(config, initial));
		await start(session);
		await frames(session, 20);
		params.clock.paused = true;
		const before = volumes();
		// Frames so short that the throttle, which counts frame time, cannot be what asks.
		const took = await frames(session, 60, 0.0001);
		expect(took, 'the session stops asking for frames once it has the picture').toBeLessThan(60);
		expect(volumes() - before, 'one more read').toBe(1);
		expect(session.latest.volumeAt, 'of the moment the clock stopped at').toBe(session.simTime);
		await frames(session, 30, FRAME);
		expect(volumes() - before, 'and none while it stays stopped').toBe(1);
		params.clock.paused = false;
		await frames(session, 12);
		expect(volumes() - before, 'running again reads again').toBeGreaterThan(1);
		session.dispose();
	});

	test('a restart while paused clears the old volume and reads the new world once', async () => {
		const { session, params, volumes } = counted((config, initial) => new CpuBackend(config, initial));
		params.clock.paused = true;
		await start(session);
		await frames(session, 30, 0.0001);
		const first = session.latest.volume;
		expect(first).not.toBeNull();
		const world = session.world;
		params.restarts++;
		const deadline = Date.now() + 30_000;
		while (session.world === world && Date.now() < deadline) {
			session.update(0.0001);
			await pause(4);
		}
		const before = volumes();
		await frames(session, 30, 0.0001);
		expect(session.latest.volume, 'the new world has its own').not.toBe(first);
		expect(session.latest.volume).not.toBeNull();
		expect(volumes() - before).toBeLessThanOrEqual(1);
		session.dispose();
	});

	test('through the worker, the session gets the volume as it does in this thread', async () => {
		const worker = inMemoryWorker();
		const { session, volumes } = counted((config, initial) => WorkerBackend.create(worker.port, config, initial));
		await start(session);
		await until(() => (session.update(FRAME), session.latest.volume !== null), 'the first volume');
		await frames(session, 30);
		expect(volumes()).toBeGreaterThan(1);
		const { volume } = session.latest;
		expect(volume!.flow.length).toBe(FLOW_STRIDE * volumeCells(volume!));
		let moving = 0;
		for (let n = 0; n < volumeCells(volume!); n++) moving = Math.max(moving, Math.hypot(volume!.flow[4 * n], volume!.flow[4 * n + 1], volume!.flow[4 * n + 2]));
		expect(moving, 'the breeze is in it').toBeGreaterThan(0.05);
		session.dispose();
		expect(worker.terminated).toBe(true);
	});

	test('a session that is not asked for the volume never reads one, and one that turns its particles off sends no particle work', async () => {
		const { session, volumes } = counted((config, initial) => new CpuBackend(config, initial), false);
		await start(session);
		await frames(session, 30);
		expect(volumes()).toBe(0);
		expect(session.latest.volume).toBeNull();
		expect(session.latest.tracers, 'no particles were configured').toBeNull();
		session.dispose();
	});
});
