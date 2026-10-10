import type { BackendUpdate, FieldState, FlowBackend, Snapshot, SnapshotRequest } from '../backend';
import { POINT_FIELDS, type Diagnostics, type RoomStats, type Slice, type SolverConfig } from '../types';
import { GpuContext } from './context';
import { GpuSolver, LOG_CAPACITY, packPair, packVelocity, unpackPair, unpackVelocity } from './solver';
import { ROOMS_PER_PASS } from './shaders/readouts';
import { BufferUsage, MapMode, type GpuBuffer, type GpuCommandEncoder } from './webgpu';

const READBACK = BufferUsage.MAP_READ | BufferUsage.COPY_DST;
const UNIFORM = BufferUsage.UNIFORM | BufferUsage.COPY_DST;

/** A copy from a device buffer into a fresh mappable buffer, read once the queue has caught up. */
interface Pending {
	staging: GpuBuffer;
	bytes: number;
}

/**
 * The WebGPU solver behind the backend interface (cpu/backend.ts is the reference). Steps are encoded and submitted
 * without waiting; snapshots, samples and field reads copy what they need into mappable buffers and resolve when the
 * GPU has caught up. Sums the kernels leave per workgroup (diagnostics, room statistics, the particulate tally) are
 * finished here in double.
 *
 * The scalar substep count comes from the largest CFL speed read back lately (`GpuSolver.scalarSubsteps`), refreshed
 * by a small read after a step whenever none is in flight, and by every snapshot.
 */
export class GpuBackend implements FlowBackend {
	readonly kind = 'webgpu';
	time = 0;
	steps = 0;
	private lastDt = 0;
	private cflSpeed = 0;
	private cflPending = false;
	private readonly cflStaging: GpuBuffer;
	/** Steps whose tally slots have been read back and added to `tally`. */
	private logged = 0;
	private readonly tally = { inflow: 0, outflow: 0, emitted: 0, removed: 0, deposited: 0 };
	private initialMass = 0;
	private particleScale = 1;
	private frame = 0;
	private readonly roomBuffers: { uniform: GpuBuffer; partials: GpuBuffer }[] = [];
	private disposed = false;

	private constructor(
		readonly solver: GpuSolver,
		private readonly ownedContext: GpuContext | null
	) {
		this.cflStaging = solver.device.createBuffer({ label: 'cfl readback', size: 16, usage: READBACK });
	}

	/**
	 * Builds the solver for `config` with the air at `initial` (as `CpuBackend`). Pass a `context` to share one device
	 * between grids (the auto-tuner does); otherwise the backend makes and owns its own.
	 */
	static async create(config: SolverConfig, initial?: { theta?: number; particulates?: number }, context?: GpuContext) {
		const owned = context ? null : await GpuContext.create();
		const solver = await GpuSolver.create((context ?? owned)!, config);
		const backend = new GpuBackend(solver, owned);
		const pair = solver.fill(initial?.theta ?? 0, initial?.particulates ?? 0);
		let sum = 0;
		for (let n = 1; n < pair.length; n += 2) sum += pair[n];
		backend.initialMass = sum * solver.grid.cellVolume * solver.fluid.rho;
		return backend;
	}

	get grid() {
		return this.solver.grid;
	}

	get fluidCells() {
		return this.solver.fluidCells;
	}

	step(dt: number) {
		const s = this.solver;
		const device = s.device;
		const substeps = s.scalarSubsteps(dt, this.cflSpeed);
		const slot = this.steps % LOG_CAPACITY;
		s.writeStep(dt, substeps, s.diffusionSubsteps(dt), slot);
		const encoder = device.createCommandEncoder({ label: 'step' });
		s.encodeStep(encoder, dt, substeps, slot);
		const readCfl = !this.cflPending;
		if (readCfl) {
			const pass = encoder.beginComputePass({ label: 'cfl' });
			s.measure(pass);
			pass.end();
			encoder.copyBufferToBuffer(s.measureResult, 0, this.cflStaging, 0, 16);
			this.cflPending = true;
		}
		device.queue.submit([encoder.finish()]);
		if (readCfl)
			this.cflStaging.mapAsync(MapMode.READ).then(
				() => {
					this.cflSpeed = new Float32Array(this.cflStaging.getMappedRange())[0];
					this.cflStaging.unmap();
					this.cflPending = false;
				},
				() => (this.cflPending = false)
			);
		this.time += dt;
		this.steps++;
		this.lastDt = dt;
	}

	update(change: BackendUpdate) {
		const s = this.solver;
		if (change.faces?.length) s.updateFaces(change.faces);
		// After the faces, so whether the box has an outlet is worked out on the new openings.
		if (change.exterior) s.setExterior(change.exterior);
		if (change.fans) s.setFans(change.fans);
		if (change.emitters) s.setEmitters(change.emitters);
		if (change.sinks) s.setSinks(change.sinks);
	}

	configureParticles({ tracers, smoke, scale, seed }: { tracers: number; smoke: number; scale: number; seed?: number }) {
		this.particleScale = scale;
		this.frame = 0;
		this.solver.configureParticles(tracers, smoke, scale, seed ?? 1);
	}

	stepParticles(dt: number) {
		const s = this.solver;
		this.frame++;
		for (const set of [s.tracers, s.smoke]) {
			if (!set) continue;
			// One submit per set: its uniform write must land before its dispatch.
			s.writeParticles(set, set.mode, dt, this.particleScale, this.frame);
			const encoder = s.device.createCommandEncoder({ label: 'particles' });
			const pass = encoder.beginComputePass();
			s.particlePass(pass, set);
			pass.end();
			s.device.queue.submit([encoder.finish()]);
		}
	}

	async snapshot(request: SnapshotRequest): Promise<Snapshot> {
		const s = this.solver;
		const { grid } = s;
		const encoder = s.device.createCommandEncoder({ label: 'snapshot' });
		const pass = encoder.beginComputePass({ label: 'snapshot' });
		s.measure(pass);
		const layer = request.sliceY === undefined ? -1 : Math.min(grid.ny - 1, Math.max(0, Math.floor(request.sliceY / grid.h)));
		if (layer >= 0) s.slice(pass, layer);
		const rooms = request.rooms ? s.geometry.rooms : 0;
		const chunks: { first: number; count: number; partials: GpuBuffer }[] = [];
		for (let first = 0; first < rooms; first += ROOMS_PER_PASS) {
			// Each chunk has its own uniform: queued uniform writes all land before the submit.
			const n = chunks.length;
			this.roomBuffers[n] ??= { uniform: s.device.createBuffer({ label: 'rooms', size: 16, usage: UNIFORM }), partials: s.storage('roomPartials', 4 * s.roomGroups * ROOMS_PER_PASS * 5) };
			const count = Math.min(ROOMS_PER_PASS, rooms - first);
			s.rooms(pass, first, count, this.roomBuffers[n].uniform, this.roomBuffers[n].partials);
			chunks.push({ first, count, partials: this.roomBuffers[n].partials });
		}
		pass.end();

		const groups = s.cellGroups[0] * s.cellGroups[1];
		const measure = this.copy(encoder, s.measurePartials, 32 * groups);
		const unread = Math.min(this.steps - this.logged, LOG_CAPACITY);
		const logStart = (this.steps - unread) % LOG_CAPACITY;
		const firstRun = Math.min(unread, LOG_CAPACITY - logStart);
		const logs = [firstRun > 0 ? this.copy(encoder, s.log, 32 * firstRun, 32 * logStart) : null, unread > firstRun ? this.copy(encoder, s.log, 32 * (unread - firstRun), 0) : null];
		const slice = layer >= 0 ? this.copy(encoder, s.sliceOut, 32 * grid.nx * grid.nz) : null;
		const roomReads = chunks.map((chunk) => this.copy(encoder, chunk.partials, 4 * s.roomGroups * ROOMS_PER_PASS * 5));
		const fans = s.fanCount ? this.copy(encoder, s.fanStateBuffer, 16 * s.fanCount) : null;
		const tracers = request.particles && s.tracers ? this.copy(encoder, s.tracers.parts, 16 * s.tracers.count) : null;
		const smoke = request.particles && s.smoke ? this.copy(encoder, s.smoke.parts, 16 * s.smoke.count) : null;
		s.device.queue.submit([encoder.finish()]);
		this.logged = this.steps;

		const [measured, logA, logB, sliced, fanState, tracerData, smokeData, ...roomData] = await Promise.all([
			this.read(measure),
			this.read(logs[0]),
			this.read(logs[1]),
			this.read(slice),
			this.read(fans),
			this.read(tracers),
			this.read(smoke),
			...roomReads.map((r) => this.read(r))
		]);
		for (const log of [logA, logB]) {
			if (!log) continue;
			for (let n = 0; n < log.length; n += 8) {
				this.tally.inflow += log[n];
				this.tally.outflow += log[n + 1];
				this.tally.emitted += log[n + 2];
				this.tally.removed += log[n + 3];
				this.tally.deposited += log[n + 4];
			}
		}
		return {
			diagnostics: this.diagnostics(measured!, groups),
			slice: sliced ? this.toSlice(sliced, layer) : undefined,
			tracers: tracerData ?? undefined,
			smoke: smokeData ?? undefined,
			rooms: request.rooms ? this.toRooms(chunks, roomData as Float32Array[]) : undefined,
			fanFlow: Float64Array.from({ length: s.fanCount }, (_, n) => fanState![4 * n])
		};
	}

	async samplePoints(points: Float32Array) {
		const s = this.solver;
		const count = points.length / 3;
		if (!count) return new Float32Array(0);
		const encoder = s.device.createCommandEncoder({ label: 'sample' });
		const pass = encoder.beginComputePass();
		const out = s.sample(pass, points);
		pass.end();
		const pending = this.copy(encoder, out, 4 * POINT_FIELDS.length * count);
		s.device.queue.submit([encoder.finish()]);
		return (await this.read(pending))!;
	}

	async readFields(): Promise<FieldState> {
		const s = this.solver;
		const size = s.grid.size;
		const encoder = s.device.createCommandEncoder({ label: 'read fields' });
		const vel = this.copy(encoder, s.vel, 16 * size);
		const p = this.copy(encoder, s.levels[0].p, 4 * size);
		const scal = this.copy(encoder, s.scal, 8 * size);
		s.device.queue.submit([encoder.finish()]);
		const [velData, pData, scalData] = await Promise.all([this.read(vel), this.read(p), this.read(scal)]);
		const { u, v, w } = unpackVelocity(velData!);
		const [theta, particulates] = unpackPair(scalData!);
		return { u, v, w, p: pData!, theta, particulates };
	}

	writeFields(fields: FieldState) {
		const s = this.solver;
		const queue = s.device.queue;
		const packed = packVelocity(fields.u, fields.v, fields.w);
		queue.writeBuffer(s.vel, 0, packed);
		queue.writeBuffer(s.next, 0, packed);
		queue.writeBuffer(s.levels[0].p, 0, fields.p);
		queue.writeBuffer(s.scal, 0, packPair(fields.theta, fields.particulates));
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		for (const buffers of this.roomBuffers) buffers.uniform.destroy();
		this.cflStaging.destroy();
		this.solver.dispose();
		this.ownedContext?.dispose();
	}

	private copy(encoder: GpuCommandEncoder, source: GpuBuffer, bytes: number, offset = 0): Pending {
		const staging = this.solver.device.createBuffer({ label: 'readback', size: Math.max(16, Math.ceil(bytes / 4) * 4), usage: READBACK });
		encoder.copyBufferToBuffer(source, offset, staging, 0, bytes);
		return { staging, bytes };
	}

	private async read(pending: Pending | null) {
		if (!pending) return null;
		await pending.staging.mapAsync(MapMode.READ);
		const data = new Float32Array(pending.staging.getMappedRange(0, pending.bytes).slice(0));
		pending.staging.unmap();
		pending.staging.destroy();
		return data;
	}

	/** cpu/solver.ts `measure` and `diagnostics`, from the per-workgroup partials. */
	private diagnostics(partials: Float32Array, groups: number): Diagnostics {
		const { grid, fluid } = this.solver;
		let sumSquares = 0;
		let cells = 0;
		let fastest = 0;
		let squares = 0;
		let cflSpeed = 0;
		let particulates = 0;
		for (let g = 0; g < groups; g++) {
			sumSquares += partials[8 * g];
			cells += partials[8 * g + 1];
			fastest = Math.max(fastest, partials[8 * g + 2]);
			squares += partials[8 * g + 3];
			cflSpeed = Math.max(cflSpeed, partials[8 * g + 4]);
			particulates += partials[8 * g + 5];
		}
		this.cflSpeed = cflSpeed;
		const reference = Math.max(Math.sqrt(squares / Math.max(cells, 1)), 0.01);
		const rho = fluid.rho;
		return {
			time: this.time,
			steps: this.steps,
			maxSpeed: fastest,
			divergence: cells ? Math.sqrt(sumSquares / cells) / reference : 0,
			cfl: (fastest * this.lastDt) / grid.h,
			mass: {
				initial: this.initialMass,
				emitted: this.tally.emitted * rho,
				inflow: this.tally.inflow * rho,
				outflow: this.tally.outflow * rho,
				removed: this.tally.removed * rho,
				deposited: this.tally.deposited * rho,
				inAir: particulates * grid.cellVolume * rho
			}
		};
	}

	private toSlice(data: Float32Array, layer: number): Slice {
		const { nx, nz, h } = this.solver.grid;
		const size = nx * nz;
		const lane = (n: number) => Float32Array.from({ length: size }, (_, id) => data[8 * id + n]);
		return {
			nx,
			nz,
			h,
			y: (layer + 0.5) * h,
			u: lane(0),
			v: lane(1),
			w: lane(2),
			speed: lane(3),
			theta: lane(4),
			particulates: lane(5),
			fluid: Uint8Array.from({ length: size }, (_, id) => (data[8 * id + 6] > 0 ? 1 : 0))
		};
	}

	/** cpu/readouts.ts `roomStats`, from the room kernel's per-workgroup sums. */
	private toRooms(chunks: { first: number; count: number }[], data: Float32Array[]): RoomStats[] {
		const { grid, roomGroups } = this.solver;
		const cell = grid.cellVolume;
		const stride = ROOMS_PER_PASS * 5;
		const stats: RoomStats[] = [];
		chunks.forEach((chunk, c) => {
			for (let slot = 0; slot < chunk.count; slot++) {
				const sums = [0, 0, 0, 0, 0];
				for (let g = 0; g < roomGroups; g++) for (let f = 0; f < 5; f++) sums[f] += data[c][stride * g + 5 * slot + f];
				const [cells, speed, theta, particulates, inflow] = sums;
				const volume = cells * cell;
				const flow = inflow * grid.h * grid.h;
				stats.push({
					volume,
					speed: cells ? speed / cells : 0,
					theta: cells ? theta / cells : 0,
					particulates: cells ? particulates / cells : 0,
					inflow: flow,
					changesPerHour: volume > 0 ? (flow * 3600) / volume : 0
				});
			}
		});
		return stats;
	}
}
