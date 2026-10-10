import { Grid, SIDE, type SideIndex } from '../grid';
import {
	DEFAULT_PRESSURE,
	sideConditions,
	type Advection,
	type Emitter,
	type Exterior,
	type FanDisk,
	type FluidProperties,
	type Geometry,
	type PressureSettings,
	type SideConditions,
	type Sink,
	type SolverConfig,
	type Turbulence
} from '../types';
import type { FaceUpdate } from '../backend';
import type { GpuContext } from './context';
import { GpuSolverError } from './errors';
import { CONSTS, COUNTS, LEVEL, PARTICLES, SIDE as SIDE_LAYOUT, STEP, type UniformLayout } from './layout';
import { WG } from './shaders/common';
import { ROOMS_PER_PASS, ROOM_CELLS_PER_THREAD } from './shaders/readouts';
import { BufferUsage, type GpuBindGroup, type GpuBuffer, type GpuCommandEncoder, type GpuComputePassEncoder, type GpuQuerySet } from './webgpu';

/** cpu/solver.ts SCALAR_CFL and DIFFUSION_LIMIT. */
export const SCALAR_CFL = 0.45;
export const DIFFUSION_LIMIT = 0.9;
/** Steps of tally the log holds before it wraps. The backend reads it back long before that (see backend.ts). */
export const LOG_CAPACITY = 8192;
/** The kernel groups a profiled step times, in step order. */
export const PROFILE_GROUPS = ['turbulence', 'forces', 'advection', 'diffusion', 'assembly', 'multigrid', 'projection', 'scalars'] as const;
export type ProfileGroup = (typeof PROFILE_GROUPS)[number];
/** Profiled steps kept for averaging. */
export const PROFILE_STEPS = 32;
/** Bytes of the profile buffer per profiled step: its timestamps, padded because resolveQuerySet's destination offset must be a multiple of 256. */
export const PROFILE_SLOT_BYTES = Math.ceil((16 * PROFILE_GROUPS.length) / 256) * 256;

export interface Level {
	nx: number;
	ny: number;
	nz: number;
	sx: number;
	sxy: number;
	/** Padded size and cell count. */
	size: number;
	cells: number;
	/** Coarsening factor per axis to the next level (1 on the last). */
	fx: number;
	fy: number;
	fz: number;
	coef: GpuBuffer;
	p: GpuBuffer;
	/** Level uniforms with colour 0 and 1. */
	uniforms: [GpuBuffer, GpuBuffer];
}

/** The multigrid levels of cpu/pressure.ts: every axis with two or more cells halves, rounding up, until 256 cells or fewer remain. */
export function multigridLevels(nx: number, ny: number, nz: number) {
	const levels = [{ nx, ny, nz, fx: 1, fy: 1, fz: 1 }];
	let level = levels[0];
	while (level.nx * level.ny * level.nz > 256) {
		const fx = level.nx >= 2 ? 2 : 1;
		const fy = level.ny >= 2 ? 2 : 1;
		const fz = level.nz >= 2 ? 2 : 1;
		if (fx * fy * fz === 1) break;
		level.fx = fx;
		level.fy = fy;
		level.fz = fz;
		level = { nx: Math.ceil(level.nx / fx), ny: Math.ceil(level.ny / fy), nz: Math.ceil(level.nz / fz), fx: 1, fy: 1, fz: 1 };
		levels.push(level);
	}
	return levels;
}

/** Bytes of device memory a grid needs, for the auto-tuner's memory cap and the Physics panel. */
export function gpuMemoryEstimate(spec: { nx: number; ny: number; nz: number }) {
	const size = (spec.nx + 1) * (spec.ny + 1) * (spec.nz + 1);
	// Four velocity sets (vec4), geometry (vec4), two scalar sets and the source/sink rates (vec2), eddy viscosity.
	let bytes = size * (4 * 16 + 16 + 3 * 8 + 4);
	for (const level of multigridLevels(spec.nx, spec.ny, spec.nz)) bytes += (level.nx + 1) * (level.ny + 1) * (level.nz + 1) * 20;
	// Reduction partials, places, slice output: small next to the fields.
	bytes += Math.ceil(size / WG) * 64 + spec.nx * spec.ny * spec.nz * 4 + spec.nx * spec.nz * 32;
	return bytes;
}

const STORAGE = BufferUsage.STORAGE | BufferUsage.COPY_SRC | BufferUsage.COPY_DST;
const UNIFORM = BufferUsage.UNIFORM | BufferUsage.COPY_DST;

/** Interleaves a velocity into the packed (u, v, w, 0) layout. */
export function packVelocity(u: Float32Array, v: Float32Array, w: Float32Array) {
	const out = new Float32Array(4 * u.length);
	for (let n = 0; n < u.length; n++) {
		out[4 * n] = u[n];
		out[4 * n + 1] = v[n];
		out[4 * n + 2] = w[n];
	}
	return out;
}

export function unpackVelocity(packed: Float32Array) {
	const size = packed.length / 4;
	const u = new Float32Array(size);
	const v = new Float32Array(size);
	const w = new Float32Array(size);
	for (let n = 0; n < size; n++) {
		u[n] = packed[4 * n];
		v[n] = packed[4 * n + 1];
		w[n] = packed[4 * n + 2];
	}
	return { u, v, w };
}

export function packPair(a: Float32Array, b: Float32Array) {
	const out = new Float32Array(2 * a.length);
	for (let n = 0; n < a.length; n++) {
		out[2 * n] = a[n];
		out[2 * n + 1] = b[n];
	}
	return out;
}

export function unpackPair(packed: Float32Array) {
	const size = packed.length / 2;
	const a = new Float32Array(size);
	const b = new Float32Array(size);
	for (let n = 0; n < size; n++) {
		a[n] = packed[2 * n];
		b[n] = packed[2 * n + 1];
	}
	return [a, b] as const;
}

/** The packed geometry: (au, av, aw, room + 1 for air or −(room + 1) for solid), −1 in the padding layer. */
export function packGeometry(grid: Grid, geometry: Geometry) {
	const { nx, ny, nz, sx, sxy, size } = grid;
	const out = new Float32Array(4 * size);
	for (let c = 0; c < size; c++) {
		out[4 * c] = geometry.au[c];
		out[4 * c + 1] = geometry.av[c];
		out[4 * c + 2] = geometry.aw[c];
		out[4 * c + 3] = -1;
	}
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++)
			for (let i = 0; i < nx; i++) {
				const c = i + sx * j + sxy * k;
				const tag = geometry.room[c] + 1;
				out[4 * c + 3] = geometry.fluid[c] ? tag : -tag;
			}
	return out;
}

/** One box side as the exterior kernel walks it: faces base + strideA·a + strideB·b, the cell `shift` before each. */
function sideWalk(grid: Grid, side: SideIndex) {
	const { nx, ny, nz, sx, sxy } = grid;
	switch (side) {
		case SIDE.X0:
			return { axis: 0, na: ny, nb: nz, base: 0, strideA: sx, strideB: sxy, shift: 0 };
		case SIDE.X1:
			return { axis: 0, na: ny, nb: nz, base: nx, strideA: sx, strideB: sxy, shift: 1 };
		case SIDE.Y0:
			return { axis: 1, na: nx, nb: nz, base: 0, strideA: 1, strideB: sxy, shift: 0 };
		case SIDE.Y1:
			return { axis: 1, na: nx, nb: nz, base: sx * ny, strideA: 1, strideB: sxy, shift: sx };
		case SIDE.Z0:
			return { axis: 2, na: nx, nb: ny, base: 0, strideA: 1, strideB: sx, shift: 0 };
		default:
			return { axis: 2, na: nx, nb: ny, base: sxy * nz, strideA: 1, strideB: sx, shift: sxy };
	}
}

/**
 * Whether any exterior opening connects the air to the outside (cpu/pressure.ts `outlet`): an open face on the box
 * beside a cell of air whose law has a slope, which is every one but a plain opening with Cd = 0.
 */
export function hasOutlet(grid: Grid, geometry: Geometry, exterior: Exterior, cd: number) {
	const open = [geometry.au, geometry.av, geometry.aw];
	for (let side = 0; side < 6; side++) {
		const walk = sideWalk(grid, side as SideIndex);
		const data = exterior.sides[side];
		for (let b = 0; b < walk.nb; b++)
			for (let a = 0; a < walk.na; a++) {
				const face = walk.base + walk.strideA * a + walk.strideB * b;
				if (open[walk.axis][face] <= 0 || !geometry.fluid[face - walk.shift]) continue;
				const slot = a + walk.na * b;
				const fanSpeed = data[3 * slot + 1];
				const fanRise = data[3 * slot + 2];
				if (fanSpeed === 0 || fanRise <= 0 ? cd !== 0 : true) return true;
			}
	}
	return false;
}

/** A growable storage buffer for data whose size changes with the setup (fans, scatter lists, sample points). */
class Growable {
	buffer: GpuBuffer;
	constructor(
		private readonly solver: GpuSolver,
		private readonly label: string,
		bytes: number
	) {
		this.buffer = solver.storage(label, bytes);
	}
	/** Makes room for `bytes`, replacing the buffer (and so its bind groups) if it must grow. */
	fit(bytes: number) {
		if (bytes <= this.buffer.size) return this.buffer;
		this.buffer.destroy();
		this.buffer = this.solver.storage(this.label, Math.max(bytes, 2 * this.buffer.size));
		return this.buffer;
	}
}

export interface ParticleBuffers {
	count: number;
	parts: GpuBuffer;
	state: GpuBuffer;
	uniform: GpuBuffer;
	mode: number;
	seed: number;
}

/**
 * The WebGPU solver's state and kernels for one grid: the same algorithm as cpu/solver.ts, kernel for kernel, in f32.
 * It encodes work and never waits for it; reading results back is the backend's job (backend.ts). The phase methods
 * (`turbulence`, `forcesBefore`, ...) are the CPU step's stages, public so the parity tests can run them one at a time.
 */
export class GpuSolver {
	readonly grid: Grid;
	readonly fluid: FluidProperties;
	readonly geometry: Geometry;
	readonly sides: SideConditions;
	readonly turbulenceModel: Turbulence;
	readonly advection: Advection;
	readonly pressureSettings: PressureSettings;
	readonly scalarSubstepsOverride?: number;
	readonly maxEddyViscosity: number;
	readonly levels: Level[];
	/** Workgroups of the kernels that walk every index of the fine grid, and so how many partials they write. */
	readonly cellGroups: [number, number];
	readonly fluidCells: number;
	exterior: Exterior;
	fanCount = 0;
	outlet = false;

	// Fields.
	vel: GpuBuffer;
	next: GpuBuffer;
	readonly quantity: GpuBuffer;
	readonly pred: GpuBuffer;
	readonly geo: GpuBuffer;
	scal: GpuBuffer;
	scalNext: GpuBuffer;
	readonly srcsink: GpuBuffer;
	readonly nut: GpuBuffer;
	readonly ext: GpuBuffer;
	readonly qg: GpuBuffer;
	readonly slotBase: number[];

	// Reductions and logs.
	readonly scalarPartials: GpuBuffer;
	readonly measurePartials: GpuBuffer;
	readonly measureResult: GpuBuffer;
	readonly meanPartials: GpuBuffer;
	readonly mean: GpuBuffer;
	readonly log: GpuBuffer;
	readonly sliceOut: GpuBuffer;
	readonly roomPartials: GpuBuffer;
	readonly roomGroups: number;
	places: GpuBuffer | null = null;
	tracers: ParticleBuffers | null = null;
	smoke: ParticleBuffers | null = null;

	// Uniforms.
	readonly consts: GpuBuffer;
	readonly step: GpuBuffer;
	readonly sideUniforms: GpuBuffer[];
	readonly counts = new Map<string, GpuBuffer>();

	// Fans.
	private readonly fanCells: Growable;
	private readonly fanInfo: Growable;
	private readonly fanState: Growable;
	private readonly fanIndex: Growable;
	private readonly fanStart: Growable;
	private readonly fanEntries: Growable;
	private fanUnique = 0;
	// Sparse updates.
	private readonly scatterIdx: Growable;
	private readonly scatterVals: Growable;
	private readonly samplePoints: Growable;
	private readonly sampleOut: Growable;
	private sources = new Map<number, number>();
	private sinks = new Map<number, number>();

	// Profiling.
	readonly querySet: GpuQuerySet | null = null;
	readonly profileBuffer: GpuBuffer | null = null;

	private readonly ids = new WeakMap<GpuBuffer, number>();
	private nextId = 1;
	private readonly bindGroups = new Map<string, GpuBindGroup>();
	private readonly owned: GpuBuffer[] = [];
	private disposed = false;

	constructor(
		readonly context: GpuContext,
		config: SolverConfig,
		options: { profile?: boolean } = {}
	) {
		const device = context.device;
		this.grid = new Grid(config.grid);
		this.fluid = config.fluid;
		// The solver keeps its own copy of the open fractions, since face updates change them.
		this.geometry = { ...config.geometry, au: config.geometry.au.slice(), av: config.geometry.av.slice(), aw: config.geometry.aw.slice() };
		this.sides = sideConditions(config.sides);
		this.turbulenceModel = config.turbulence ?? 'shear-length';
		this.advection = config.advection ?? 'maccormack';
		this.pressureSettings = { ...DEFAULT_PRESSURE, ...config.pressure };
		this.scalarSubstepsOverride = config.scalarSubsteps;
		this.maxEddyViscosity = config.maxEddyViscosity ?? 0.05;
		const { size, nx, ny, nz } = this.grid;

		const vecBytes = 16 * size;
		const limit = Math.min(device.limits.maxStorageBufferBindingSize ?? 134217728, device.limits.maxBufferSize ?? 268435456);
		if (vecBytes > limit) throw new GpuSolverError('memory', `A ${nx} × ${ny} × ${nz} grid needs ${Math.round(vecBytes / 2 ** 20)} MiB per field, more than this device binds (${Math.round(limit / 2 ** 20)} MiB).`);

		let fluidCells = 0;
		for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) fluidCells += this.geometry.fluid[this.grid.index(i, j, k)];
		this.fluidCells = fluidCells;

		this.consts = this.uniform('consts', CONSTS);
		this.step = this.uniform('step', STEP);
		this.vel = this.storage('vel', vecBytes);
		this.next = this.storage('next', vecBytes);
		this.quantity = this.storage('quantity', vecBytes);
		this.pred = this.storage('pred', vecBytes);
		this.geo = this.storage('geo', vecBytes);
		this.scal = this.storage('scal', 8 * size);
		this.scalNext = this.storage('scalNext', 8 * size);
		this.srcsink = this.storage('srcsink', 8 * size);
		this.nut = this.storage('nut', 4 * size);

		this.levels = multigridLevels(nx, ny, nz).map((dims) => {
			const sx = dims.nx + 1;
			const sxy = (dims.nx + 1) * (dims.ny + 1);
			const levelSize = sxy * (dims.nz + 1);
			return {
				...dims,
				sx,
				sxy,
				size: levelSize,
				cells: dims.nx * dims.ny * dims.nz,
				coef: this.storage('coef', 16 * levelSize),
				p: this.storage('p', 4 * levelSize),
				uniforms: [this.uniform('level', LEVEL), this.uniform('level', LEVEL)] as [GpuBuffer, GpuBuffer]
			};
		});
		this.levels.forEach((level, l) => {
			const coarse = this.levels[l + 1] ?? level;
			for (const colour of [0, 1]) {
				const w = LEVEL.writer()
					.set('nx', level.nx)
					.set('ny', level.ny)
					.set('nz', level.nz)
					.set('sx', level.sx)
					.set('sxy', level.sxy)
					.set('colour', colour)
					.set('fx', level.fx)
					.set('fy', level.fy)
					.set('fz', level.fz)
					.set('cnx', coarse.nx)
					.set('cny', coarse.ny)
					.set('cnz', coarse.nz)
					.set('csx', coarse.sx)
					.set('csxy', coarse.sxy)
					.set('sweeps', this.pressureSettings.coarse);
				device.queue.writeBuffer(level.uniforms[colour], 0, w.data);
			}
		});
		const coarsest = this.levels[this.levels.length - 1];
		if (coarsest.cells > WG) throw new Error(`The coarsest multigrid level has ${coarsest.cells} cells; the coarse solve handles ${WG}.`);

		this.slotBase = [];
		let slots = 0;
		for (let s = 0; s < 6; s++) {
			this.slotBase.push(slots);
			slots += this.grid.sideSize(s as SideIndex);
		}
		this.ext = this.storage('ext', 12 * Math.max(slots, 1));
		this.qg = this.storage('qg', 8 * Math.max(slots, 1));
		this.sideUniforms = [0, 1, 2, 3, 4, 5].map((s) => {
			const walk = sideWalk(this.grid, s as SideIndex);
			const buffer = this.uniform('side', SIDE_LAYOUT);
			const w = SIDE_LAYOUT.writer()
				.set('side', s)
				.set('axis', walk.axis)
				.set('na', walk.na)
				.set('nb', walk.nb)
				.set('base', walk.base)
				.set('strideA', walk.strideA)
				.set('strideB', walk.strideB)
				.set('shift', walk.shift)
				.set('slotBase', this.slotBase[s]);
			device.queue.writeBuffer(buffer, 0, w.data);
			return buffer;
		});

		this.cellGroups = this.groups(size);
		const partialCount = this.cellGroups[0] * this.cellGroups[1];
		this.scalarPartials = this.storage('scalarPartials', 32 * partialCount);
		this.measurePartials = this.storage('measurePartials', 32 * partialCount);
		this.measureResult = this.storage('measureResult', 16);
		const meanGroups = this.groups(this.grid.cells);
		this.meanPartials = this.storage('meanPartials', 8 * meanGroups[0] * meanGroups[1]);
		this.mean = this.storage('mean', 16);
		this.log = this.storage('log', 32 * LOG_CAPACITY);
		this.sliceOut = this.storage('sliceOut', 32 * nx * nz);
		this.roomGroups = Math.ceil(size / (64 * ROOM_CELLS_PER_THREAD));
		this.roomPartials = this.storage('roomPartials', 4 * this.roomGroups * ROOMS_PER_PASS * 5);
		this.setCount('cellPartials', partialCount);
		this.setCount('meanPartials', meanGroups[0] * meanGroups[1]);

		this.fanCells = new Growable(this, 'fanCells', 256);
		this.fanInfo = new Growable(this, 'fanInfo', 256);
		this.fanState = new Growable(this, 'fanState', 256);
		this.fanIndex = new Growable(this, 'fanIndex', 256);
		this.fanStart = new Growable(this, 'fanStart', 256);
		this.fanEntries = new Growable(this, 'fanEntries', 256);
		this.scatterIdx = new Growable(this, 'scatterIdx', 256);
		this.scatterVals = new Growable(this, 'scatterVals', 256);
		this.samplePoints = new Growable(this, 'samplePoints', 256);
		this.sampleOut = new Growable(this, 'sampleOut', 256);

		if (options.profile && context.timestamps) {
			this.querySet = device.createQuerySet({ type: 'timestamp', count: 2 * PROFILE_GROUPS.length * PROFILE_STEPS });
			this.profileBuffer = device.createBuffer({ label: 'profile', size: PROFILE_SLOT_BYTES * PROFILE_STEPS, usage: BufferUsage.QUERY_RESOLVE | BufferUsage.COPY_SRC });
			this.owned.push(this.profileBuffer);
		}

		// Initial state: the geometry, still air, and an empty outdoors.
		device.queue.writeBuffer(this.geo, 0, packGeometry(this.grid, this.geometry));
		this.exterior = {
			sides: [0, 1, 2, 3, 4, 5].map((s) => new Float32Array(3 * this.grid.sideSize(s as SideIndex))) as Exterior['sides'],
			theta: 0,
			particulates: 0
		};
		this.writeConsts();
	}

	/** Allocates the buffers inside an out-of-memory scope, so a device that cannot hold the grid says so. */
	static async create(context: GpuContext, config: SolverConfig, options: { profile?: boolean } = {}) {
		const device = context.device;
		device.pushErrorScope('out-of-memory');
		device.pushErrorScope('validation');
		let solver: GpuSolver | null = null;
		let failure: unknown = null;
		try {
			solver = new GpuSolver(context, config, options);
		} catch (error) {
			failure = error;
		}
		const validation = await device.popErrorScope();
		const memory = await device.popErrorScope();
		if (failure || memory || validation) {
			solver?.dispose();
			if (failure instanceof GpuSolverError) throw failure;
			if (memory) throw new GpuSolverError('memory', `The graphics device could not hold a ${config.grid.nx} × ${config.grid.ny} × ${config.grid.nz} grid.`, memory.message);
			if (validation) throw new GpuSolverError('memory', 'The graphics device refused the solver buffers.', validation.message);
			throw failure;
		}
		if (context.lost) throw new GpuSolverError('lost', 'The graphics device was lost.', context.lostReason);
		return solver as GpuSolver;
	}

	get device() {
		return this.context.device;
	}

	/** Per fan (flow, acceleration, Σweight, Σweight·axial), as the fan kernel last wrote it; the backend reads `flow`. */
	get fanStateBuffer() {
		return this.fanState.buffer;
	}

	storage(label: string, bytes: number) {
		const buffer = this.device.createBuffer({ label, size: Math.max(16, Math.ceil(bytes / 16) * 16), usage: STORAGE });
		this.owned.push(buffer);
		return buffer;
	}

	private uniform(label: string, layout: UniformLayout) {
		const buffer = this.device.createBuffer({ label, size: layout.size, usage: UNIFORM });
		this.owned.push(buffer);
		return buffer;
	}

	/** A small uniform of counts, by name, created on first use. */
	setCount(name: string, a: number, b = 0, c = 0, d = 0) {
		let buffer = this.counts.get(name);
		if (!buffer) {
			buffer = this.uniform(name, COUNTS);
			this.counts.set(name, buffer);
		}
		this.device.queue.writeBuffer(buffer, 0, COUNTS.writer().set('a', a).set('b', b).set('c', c).set('d', d).data);
		return buffer;
	}

	private count(name: string) {
		const buffer = this.counts.get(name);
		if (!buffer) throw new Error(`No count uniform ${name}.`);
		return buffer;
	}

	/** Workgroups to cover `count` threads, as a 2D grid when one dimension is not enough. */
	groups(count: number, size = WG): [number, number] {
		const total = Math.max(1, Math.ceil(count / size));
		const max = this.device.limits.maxComputeWorkgroupsPerDimension ?? 65535;
		if (total <= max) return [total, 1];
		const y = Math.ceil(total / max);
		return [Math.ceil(total / y), y];
	}

	private id(buffer: GpuBuffer) {
		let id = this.ids.get(buffer);
		if (id === undefined) {
			id = this.nextId++;
			this.ids.set(buffer, id);
		}
		return id;
	}

	/** Records one dispatch of `kernel` with the named buffers bound in its declared order. */
	run(pass: GpuComputePassEncoder, kernel: string, buffers: Record<string, GpuBuffer>, groups: [number, number]) {
		const compiled = this.context.kernel(kernel);
		const key = `${kernel}:${compiled.bindings.map((b) => {
			const buffer = buffers[b.name];
			if (!buffer) throw new Error(`Kernel ${kernel} needs buffer ${b.name}.`);
			return this.id(buffer);
		})}`;
		let group = this.bindGroups.get(key);
		if (!group) {
			group = this.device.createBindGroup({ label: kernel, layout: compiled.layout, entries: compiled.bindings.map((b, n) => ({ binding: n, resource: { buffer: buffers[b.name] } })) });
			this.bindGroups.set(key, group);
		}
		pass.setPipeline(compiled.pipeline);
		pass.setBindGroup(0, group);
		pass.dispatchWorkgroups(groups[0], groups[1]);
	}

	/** Rewrites the constant uniform: the grid, the fluid, the box sides, the outdoors. */
	writeConsts() {
		const { grid, fluid } = this;
		const turbulence = this.turbulenceModel !== 'none' && fluid.shearCoefficient > 0;
		const flags = (this.advection === 'maccormack' ? 1 : 0) | (fluid.beta !== 0 && fluid.g !== 0 ? 2 : 0) | (turbulence ? 4 : 0);
		const w = CONSTS.writer()
			.set('nx', grid.nx)
			.set('ny', grid.ny)
			.set('nz', grid.nz)
			.set('sx', grid.sx)
			.set('sxy', grid.sxy)
			.set('size', grid.size)
			.set('flags', flags)
			.set('h', grid.h)
			.set('rho', fluid.rho)
			.set('nu', fluid.nu)
			.set('cd', fluid.cd)
			.set('shear', fluid.shearCoefficient)
			.set('maxLength', fluid.maxLength)
			.set('nutMax', this.maxEddyViscosity)
			.set('alpha', fluid.alpha)
			.set('prT', fluid.prT)
			.set('scT', fluid.scT)
			.set('particleD', fluid.particleDiffusivity)
			.set('settling', fluid.settling)
			.set('deposition', fluid.deposition)
			.set('extTheta', this.exterior.theta)
			.set('extC', this.exterior.particulates)
			.set('mixing', fluid.mixing);
		this.sides.forEach((side, s) => {
			const velocity = side.velocity ?? [0, 0, 0];
			w.vec('side', s, [side.slip === 'free-slip' ? 1 : 0, velocity[0], velocity[1], velocity[2]]);
			w.vec('wall', s, [side.theta === undefined ? 0 : 1, side.theta ?? 0, 0, 0]);
		});
		w.vec('sideBase', 0, [this.slotBase[0], this.slotBase[1], this.slotBase[2], this.slotBase[3]]);
		w.vec('sideBase', 1, [this.slotBase[4], this.slotBase[5], 0, 0]);
		this.device.queue.writeBuffer(this.consts, 0, w.data);
	}

	/** True when the closure is on: otherwise the eddy viscosity stays zero and its kernel never runs. */
	get turbulent() {
		return this.turbulenceModel !== 'none' && this.fluid.shearCoefficient > 0;
	}

	private get nuMax() {
		return this.fluid.nu + (this.turbulenceModel === 'none' ? 0 : this.maxEddyViscosity);
	}

	/** cpu/solver.ts: the explicit diffusion's substeps, a function of the step and constants only. */
	diffusionSubsteps(dt: number) {
		return Math.max(1, Math.ceil((6 * this.nuMax * dt) / (this.grid.h * this.grid.h * DIFFUSION_LIMIT)));
	}

	/**
	 * Scalar substeps. The CPU counts them from this step's largest cell CFL, which on the GPU would mean waiting for
	 * a read-back; instead the estimate `cflSpeed` (the largest per-cell CFL speed sum read back lately, m/s) is
	 * enlarged by `safety` and the count clamped to [1, 16]. `scalarSubsteps` in the config overrides both.
	 */
	scalarSubsteps(dt: number, cflSpeed: number, safety = 1.5) {
		if (this.scalarSubstepsOverride !== undefined) return this.scalarSubstepsOverride;
		const { fluid, grid } = this;
		const cfl = (safety * cflSpeed * dt) / grid.h;
		const diffusive = (6 * (Math.max(fluid.alpha, fluid.particleDiffusivity, this.nuMax / Math.min(fluid.prT, fluid.scT)) + fluid.mixing) * dt) / (grid.h * grid.h);
		return Math.min(16, Math.max(1, Math.ceil(Math.max(cfl / SCALAR_CFL, diffusive / DIFFUSION_LIMIT))));
	}

	/** Writes the step uniform: the coefficients every kernel of a step of `dt` uses, and the tally slot. */
	writeStep(dt: number, scalarSubsteps: number, diffusionSubsteps = this.diffusionSubsteps(dt), slot = 0) {
		const { grid, fluid } = this;
		const half = dt / 2;
		const w = STEP.writer()
			.set('dt', dt)
			.set('dtg', dt / grid.h)
			.set('kgrad', half / (fluid.rho * grid.h))
			.set('kbuoy', half * fluid.g * fluid.beta * 0.5)
			.set('kdiff', dt / diffusionSubsteps / (grid.h * grid.h))
			.set('kcond', (grid.h * half) / fluid.rho)
			.set('dtau', dt / scalarSubsteps)
			.set('half', half)
			.set('slot', slot);
		this.device.queue.writeBuffer(this.step, 0, w.data);
	}

	private swapVelocity() {
		[this.vel, this.next] = [this.next, this.vel];
	}

	private swapScalars() {
		[this.scal, this.scalNext] = [this.scalNext, this.scal];
	}

	// ---- The step's stages, in cpu/solver.ts order. ----

	/** 1. Eddy viscosity from the flow as it stands. */
	turbulence(pass: GpuComputePassEncoder) {
		if (!this.turbulent) return;
		this.run(pass, 'turbulence', { C: this.consts, vel: this.vel, geo: this.geo, nut: this.nut }, this.cellGroups);
	}

	/** 2a. The carried quantity: velocity plus half a step of the pressure gradient, buoyancy and fans. */
	forcesBefore(pass: GpuComputePassEncoder) {
		if (this.fanCount) this.run(pass, 'fanFlow', { C: this.consts, vel: this.vel, fanCells: this.fanCells.buffer, fanInfo: this.fanInfo.buffer, fanState: this.fanState.buffer }, [this.fanCount, 1]);
		this.run(pass, 'quantity', { C: this.consts, S: this.step, vel: this.vel, geo: this.geo, p: this.levels[0].p, scal: this.scal, out: this.quantity }, this.cellGroups);
		this.applyFans(pass, this.quantity);
	}

	applyFans(pass: GpuComputePassEncoder, target: GpuBuffer) {
		if (!this.fanCount || !this.fanUnique) return;
		this.run(
			pass,
			'applyFans',
			{ S: this.step, N: this.count('fans'), fanIndex: this.fanIndex.buffer, fanStart: this.fanStart.buffer, fanEntries: this.fanEntries.buffer, fanState: this.fanState.buffer, vel: target },
			this.groups(this.fanUnique)
		);
	}

	/** 2b. Semi-Lagrangian advection with the clamped MacCormack correction. The result becomes the velocity. */
	advect(pass: GpuComputePassEncoder) {
		const correct = this.advection === 'maccormack';
		this.run(pass, 'advectBack', { C: this.consts, S: this.step, vel: this.vel, phi: this.quantity, geo: this.geo, out: correct ? this.pred : this.next }, this.cellGroups);
		if (correct) this.run(pass, 'advectCorrect', { C: this.consts, S: this.step, vel: this.vel, phi: this.quantity, pred: this.pred, geo: this.geo, out: this.next }, this.cellGroups);
		this.swapVelocity();
	}

	/** 3. The other half of buoyancy and fans. */
	forcesAfter(pass: GpuComputePassEncoder) {
		if (this.fluid.beta !== 0 && this.fluid.g !== 0) this.run(pass, 'buoyancy', { C: this.consts, S: this.step, vel: this.vel, geo: this.geo, scal: this.scal }, this.cellGroups);
		this.applyFans(pass, this.vel);
	}

	/** 4. Explicit diffusion, `substeps` times (the step uniform's kdiff is per substep). */
	diffuse(pass: GpuComputePassEncoder, substeps: number) {
		for (let s = 0; s < substeps; s++) {
			this.run(pass, 'diffuse', { C: this.consts, S: this.step, vel: this.vel, geo: this.geo, nut: this.nut, out: this.next }, this.cellGroups);
			this.swapVelocity();
		}
	}

	/** 5a. The pressure system: conductances and right-hand side, exterior openings side by side, coarse operators. */
	assemble(pass: GpuComputePassEncoder) {
		const fine = this.levels[0];
		this.run(pass, 'assemble', { C: this.consts, S: this.step, geo: this.geo, vel: this.vel, coef: fine.coef }, this.cellGroups);
		for (let s = 0; s < 6; s++) {
			const slots = this.grid.sideSize(s as SideIndex);
			if (!slots) continue;
			this.run(pass, 'exterior', { C: this.consts, B: this.sideUniforms[s], ext: this.ext, p: fine.p, geo: this.geo, coef: fine.coef, qg: this.qg }, this.groups(slots));
		}
		for (let l = 0; l + 1 < this.levels.length; l++) {
			const level = this.levels[l];
			const coarse = this.levels[l + 1];
			this.run(pass, 'coarsen', { L: level.uniforms[0], fine: level.coef, coarse: coarse.coef }, this.groups(coarse.size));
		}
	}

	/** 5b. The fixed V-cycles, and the mean taken out when nothing connects the box to outdoors. */
	solve(pass: GpuComputePassEncoder) {
		for (let n = 0; n < this.pressureSettings.cycles; n++) this.vcycle(pass, 0);
		if (!this.outlet) this.removeMean(pass);
	}

	/** Red-black sweeps on one level. */
	smooth(pass: GpuComputePassEncoder, l: number, sweeps: number) {
		const level = this.levels[l];
		const groups = this.groups(Math.ceil(level.nx / 2) * level.ny * level.nz);
		for (let s = 0; s < sweeps; s++) for (const colour of [0, 1]) this.run(pass, 'smooth', { L: level.uniforms[colour], coef: level.coef, p: level.p }, groups);
	}

	vcycle(pass: GpuComputePassEncoder, l: number) {
		const level = this.levels[l];
		if (l === this.levels.length - 1) {
			this.run(pass, 'coarsest', { L: level.uniforms[0], coef: level.coef, p: level.p }, [1, 1]);
			return;
		}
		const coarse = this.levels[l + 1];
		this.smooth(pass, l, this.pressureSettings.pre);
		this.run(pass, 'restrict', { L: level.uniforms[0], coef: level.coef, p: level.p, coarse: coarse.coef, coarseP: coarse.p }, this.groups(coarse.cells));
		this.vcycle(pass, l + 1);
		this.run(pass, 'prolong', { L: level.uniforms[0], coef: level.coef, p: level.p, coarseP: coarse.p }, this.groups(level.cells));
		this.smooth(pass, l, this.pressureSettings.post);
	}

	removeMean(pass: GpuComputePassEncoder) {
		const fine = this.levels[0];
		this.run(pass, 'meanPartials', { L: fine.uniforms[0], coef: fine.coef, p: fine.p, partials: this.meanPartials }, this.groups(fine.cells));
		this.run(pass, 'meanFinish', { N: this.count('meanPartials'), partials: this.meanPartials, mean: this.mean }, [1, 1]);
		this.run(pass, 'meanSubtract', { L: fine.uniforms[0], coef: fine.coef, p: fine.p, mean: this.mean }, this.groups(fine.cells));
	}

	/** 5c. Applies the pressure. */
	project(pass: GpuComputePassEncoder) {
		this.run(pass, 'project', { C: this.consts, S: this.step, vel: this.vel, geo: this.geo, p: this.levels[0].p, qg: this.qg }, this.cellGroups);
	}

	/**
	 * 6. Temperature and particulates, `substeps` explicit substeps, each adding its tally to the log slot of the step
	 * uniform. The caller clears that slot first (`clearLogSlot`, outside any pass).
	 */
	transport(pass: GpuComputePassEncoder, substeps: number) {
		for (let s = 0; s < substeps; s++) {
			this.run(
				pass,
				'scalars',
				{ C: this.consts, S: this.step, scal: this.scal, vel: this.vel, geo: this.geo, nut: this.nut, srcsink: this.srcsink, next: this.scalNext, partials: this.scalarPartials },
				this.cellGroups
			);
			this.run(pass, 'tally', { S: this.step, N: this.count('cellPartials'), partials: this.scalarPartials, log: this.log }, [1, 1]);
			this.swapScalars();
		}
	}

	clearLogSlot(encoder: GpuCommandEncoder, slot: number) {
		encoder.clearBuffer(this.log, 32 * slot, 32);
	}

	/** Diagnostics partials per workgroup, and the small on-device finish of the CFL speed for the substep estimate. */
	measure(pass: GpuComputePassEncoder) {
		this.run(pass, 'measure', { C: this.consts, vel: this.vel, geo: this.geo, scal: this.scal, partials: this.measurePartials }, this.cellGroups);
		this.run(pass, 'measureFinish', { N: this.count('cellPartials'), partials: this.measurePartials, result: this.measureResult }, [1, 1]);
	}

	/**
	 * One whole step, in one compute pass (or, profiling, one pass per kernel group with timestamps). Returns nothing:
	 * the work is encoded, not done.
	 */
	encodeStep(encoder: GpuCommandEncoder, dt: number, scalarSubsteps: number, slot: number, profileSlot = -1) {
		this.clearLogSlot(encoder, slot);
		const diffusion = this.diffusionSubsteps(dt);
		const stages: [ProfileGroup, (pass: GpuComputePassEncoder) => void][] = [
			['turbulence', (pass) => this.turbulence(pass)],
			['forces', (pass) => this.forcesBefore(pass)],
			['advection', (pass) => (this.advect(pass), this.forcesAfter(pass))],
			['diffusion', (pass) => this.diffuse(pass, diffusion)],
			['assembly', (pass) => this.assemble(pass)],
			['multigrid', (pass) => this.solve(pass)],
			['projection', (pass) => this.project(pass)],
			['scalars', (pass) => this.transport(pass, scalarSubsteps)]
		];
		if (profileSlot < 0 || !this.querySet) {
			const pass = encoder.beginComputePass({ label: 'step' });
			for (const [, stage] of stages) stage(pass);
			pass.end();
			return;
		}
		stages.forEach(([name, stage], g) => {
			const base = 2 * (profileSlot * PROFILE_GROUPS.length + g);
			const pass = encoder.beginComputePass({ label: name, timestampWrites: { querySet: this.querySet!, beginningOfPassWriteIndex: base, endOfPassWriteIndex: base + 1 } });
			stage(pass);
			pass.end();
		});
		const first = 2 * profileSlot * PROFILE_GROUPS.length;
		encoder.resolveQuerySet(this.querySet, first, 2 * PROFILE_GROUPS.length, this.profileBuffer!, PROFILE_SLOT_BYTES * profileSlot);
	}

	// ---- What changes while the solver runs. ----

	/** Open fractions of faces (a door swings, a window slides). */
	updateFaces(updates: FaceUpdate[]) {
		const arrays = [this.geometry.au, this.geometry.av, this.geometry.aw];
		const merged = new Map<number, { mask: number; values: [number, number, number] }>();
		for (const update of updates)
			for (let n = 0; n < update.indices.length; n++) {
				const index = update.indices[n];
				arrays[update.axis][index] = update.values[n];
				const entry = merged.get(index) ?? { mask: 0, values: [0, 0, 0] as [number, number, number] };
				entry.mask |= 1 << update.axis;
				entry.values[update.axis] = update.values[n];
				merged.set(index, entry);
			}
		if (!merged.size) return;
		const idx = new Uint32Array(merged.size);
		const vals = new Float32Array(4 * merged.size);
		let n = 0;
		for (const [index, entry] of merged) {
			idx[n] = index;
			vals.set([entry.values[0], entry.values[1], entry.values[2], entry.mask], 4 * n);
			n++;
		}
		this.scatter('geometryScatter', idx, vals, { geo: this.geo }, 'geometryScatter');
		this.outlet = hasOutlet(this.grid, this.geometry, this.exterior, this.fluid.cd);
	}

	setExterior(exterior: Exterior) {
		this.exterior = exterior;
		const packed = new Float32Array(this.ext.size / 4);
		exterior.sides.forEach((side, s) => packed.set(side.subarray(0, 3 * this.grid.sideSize(s as SideIndex)), 3 * this.slotBase[s]));
		this.device.queue.writeBuffer(this.ext, 0, packed);
		this.outlet = hasOutlet(this.grid, this.geometry, exterior, this.fluid.cd);
		this.writeConsts();
	}

	/** The fans' disks: cells to measure each fan's flow, and the faces it pushes, merged per index so no two threads push one face. */
	setFans(fans: FanDisk[]) {
		this.fanCount = fans.length;
		if (!fans.length) {
			this.fanUnique = 0;
			return;
		}
		const totalCells = fans.reduce((sum, fan) => sum + fan.cells.length, 0);
		const cells = new Uint32Array(2 * Math.max(totalCells, 1));
		const cellWeights = new Float32Array(cells.buffer);
		const info = new Float32Array(8 * fans.length);
		const infoBits = new Uint32Array(info.buffer);
		const byIndex = new Map<number, number[]>();
		let first = 0;
		fans.forEach((fan, n) => {
			for (let c = 0; c < fan.cells.length; c++) {
				cells[2 * (first + c)] = fan.cells[c];
				cellWeights[2 * (first + c) + 1] = fan.cellWeight[c];
			}
			info.set([fan.normal[0], fan.normal[1], fan.normal[2], fan.area, fan.qMax, fan.dpMax], 8 * n);
			infoBits[8 * n + 6] = first;
			infoBits[8 * n + 7] = fan.cells.length;
			first += fan.cells.length;
			for (let e = 0; e < fan.faceIndex.length; e++) {
				const list = byIndex.get(fan.faceIndex[e]) ?? [];
				list.push(n | (fan.faceAxis[e] << 16), e, n);
				byIndex.set(fan.faceIndex[e], list);
			}
		});
		const unique = byIndex.size;
		const index = new Uint32Array(Math.max(unique, 1));
		const start = new Uint32Array(unique + 1);
		const entries = new Uint32Array(2 * Math.max(fans.reduce((sum, fan) => sum + fan.faceIndex.length, 0), 1));
		const entryWeights = new Float32Array(entries.buffer);
		let u = 0;
		let e = 0;
		for (const [face, list] of byIndex) {
			index[u] = face;
			start[u] = e;
			for (let m = 0; m < list.length; m += 3) {
				entries[2 * e] = list[m];
				entryWeights[2 * e + 1] = fans[list[m + 2]].faceWeight[list[m + 1]];
				e++;
			}
			u++;
		}
		start[unique] = e;
		this.fanUnique = unique;
		const queue = this.device.queue;
		queue.writeBuffer(this.fanCells.fit(cells.byteLength), 0, cells);
		queue.writeBuffer(this.fanInfo.fit(info.byteLength), 0, info);
		this.fanState.fit(16 * fans.length);
		queue.writeBuffer(this.fanIndex.fit(index.byteLength), 0, index);
		queue.writeBuffer(this.fanStart.fit(start.byteLength), 0, start);
		queue.writeBuffer(this.fanEntries.fit(entries.byteLength), 0, entries);
		this.setCount('fans', unique);
	}

	get fanStateBuffer() {
		return this.fanState.buffer;
	}

	/** Replaces every emitter, as cpu/solver.ts `setEmitters` does: a per-cell rate in ppm per second, accumulated in f32. */
	setEmitters(emitters: Emitter[]) {
		const air = this.grid.cellVolume * this.fluid.rho;
		const next = new Map<number, number>();
		for (const emitter of emitters) for (let n = 0; n < emitter.cells.length; n++) next.set(emitter.cells[n], Math.fround((next.get(emitter.cells[n]) ?? 0) + (emitter.rate * emitter.share[n]) / air));
		this.writeSources(next, this.sinks, [...this.sources.keys()]);
		this.sources = next;
	}

	/** Replaces every sink (cpu/solver.ts `setSinks`). */
	setSinks(sinks: Sink[]) {
		const volume = this.grid.cellVolume;
		const next = new Map<number, number>();
		for (const sink of sinks) for (let n = 0; n < sink.cells.length; n++) next.set(sink.cells[n], Math.fround((next.get(sink.cells[n]) ?? 0) + (sink.cadr * sink.share[n]) / volume));
		this.writeSources(this.sources, next, [...this.sinks.keys()]);
		this.sinks = next;
	}

	private writeSources(sources: Map<number, number>, sinks: Map<number, number>, previous: number[]) {
		const cells = new Set<number>([...previous, ...sources.keys(), ...sinks.keys(), ...this.sources.keys(), ...this.sinks.keys()]);
		if (!cells.size) return;
		const idx = new Uint32Array(cells.size);
		const vals = new Float32Array(2 * cells.size);
		let n = 0;
		for (const cell of cells) {
			idx[n] = cell;
			vals[2 * n] = sources.get(cell) ?? 0;
			vals[2 * n + 1] = sinks.get(cell) ?? 0;
			n++;
		}
		this.scatter('sourceScatter', idx, vals, { srcsink: this.srcsink }, 'sourceScatter');
	}

	private scatter(kernel: string, idx: Uint32Array, vals: Float32Array, target: Record<string, GpuBuffer>, count: string) {
		const queue = this.device.queue;
		queue.writeBuffer(this.scatterIdx.fit(idx.byteLength), 0, idx);
		queue.writeBuffer(this.scatterVals.fit(vals.byteLength), 0, vals);
		const N = this.setCount(count, idx.length);
		const encoder = this.device.createCommandEncoder({ label: kernel });
		const pass = encoder.beginComputePass();
		this.run(pass, kernel, { N, idx: this.scatterIdx.buffer, vals: this.scatterVals.buffer, ...target }, this.groups(idx.length));
		pass.end();
		queue.submit([encoder.finish()]);
	}

	/** Sets every fluid cell's temperature and particulates (cpu/solver.ts `fill`); returns the host copy of the scalars. */
	fill(theta: number, particulates: number) {
		const { nx, ny, nz, sx, sxy, size } = this.grid;
		const pair = new Float32Array(2 * size);
		for (let k = 0; k < nz; k++)
			for (let j = 0; j < ny; j++)
				for (let i = 0; i < nx; i++) {
					const c = i + sx * j + sxy * k;
					if (!this.geometry.fluid[c]) continue;
					pair[2 * c] = theta;
					pair[2 * c + 1] = particulates;
				}
		this.device.queue.writeBuffer(this.scal, 0, pair);
		return pair;
	}

	// ---- Readouts: encoded here, read back by the backend. ----

	slice(pass: GpuComputePassEncoder, layer: number) {
		const N = this.setCount('slice', layer);
		this.run(pass, 'slice', { C: this.consts, N, vel: this.vel, geo: this.geo, scal: this.scal, out: this.sliceOut }, this.groups(this.grid.nx * this.grid.nz));
	}

	/** Uploads points and encodes the sampler; returns the output buffer to copy from. */
	sample(pass: GpuComputePassEncoder, points: Float32Array) {
		const count = points.length / 3;
		this.device.queue.writeBuffer(this.samplePoints.fit(points.byteLength), 0, points);
		const out = this.sampleOut.fit(20 * Math.max(count, 1));
		const N = this.setCount('sample', count);
		this.run(pass, 'sample', { C: this.consts, N, points: this.samplePoints.buffer, vel: this.vel, scal: this.scal, out }, this.groups(count));
		return out;
	}

	/** Encodes the room kernel for rooms first + 1 to first + count (at most ROOMS_PER_PASS). */
	rooms(pass: GpuComputePassEncoder, first: number, count: number, uniform: GpuBuffer, partials: GpuBuffer) {
		this.device.queue.writeBuffer(uniform, 0, COUNTS.writer().set('a', first).set('b', count).data);
		this.run(pass, 'rooms', { C: this.consts, N: uniform, vel: this.vel, geo: this.geo, scal: this.scal, partials }, this.groups(this.roomGroups, 1));
	}

	roomUniform() {
		const buffer = this.device.createBuffer({ label: 'rooms', size: COUNTS.size, usage: UNIFORM });
		this.owned.push(buffer);
		return buffer;
	}

	// ---- Particles. ----

	/** Allocates and places the particles; the places list (every cell of air) is built once. */
	configureParticles(tracers: number, smoke: number, scale: number, seed: number) {
		for (const set of [this.tracers, this.smoke]) {
			set?.parts.destroy();
			set?.state.destroy();
		}
		this.tracers = null;
		this.smoke = null;
		if (tracers + smoke <= 0) return;
		if (!this.places) {
			const { nx, ny, nz, sx, sxy } = this.grid;
			const list: number[] = [];
			for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (this.geometry.fluid[i + sx * j + sxy * k]) list.push(i + sx * j + sxy * k);
			this.places = this.storage('places', 4 * Math.max(list.length, 1));
			this.device.queue.writeBuffer(this.places, 0, Uint32Array.from(list.length ? list : [0]));
		}
		const make = (count: number, mode: number, streamSeed: number): ParticleBuffers | null =>
			count > 0 ? { count, parts: this.storage('parts', 16 * count), state: this.storage('state', 8 * count), uniform: this.uniform('particles', PARTICLES), mode, seed: streamSeed } : null;
		this.tracers = make(tracers, 1, seed >>> 0);
		this.smoke = make(smoke, 2, (seed ^ 0x9e3779b9) >>> 0);
		const encoder = this.device.createCommandEncoder({ label: 'place particles' });
		for (const set of [this.tracers, this.smoke]) {
			if (!set) continue;
			this.writeParticles(set, 0, 0, scale);
			const pass = encoder.beginComputePass();
			this.particlePass(pass, set);
			pass.end();
		}
		this.device.queue.submit([encoder.finish()]);
		for (const set of [this.tracers, this.smoke]) if (set) this.writeParticles(set, set.mode, 0, scale);
	}

	writeParticles(set: ParticleBuffers, mode: number, dt: number, scale: number, frame = 0) {
		const w = PARTICLES.writer().set('count', set.count).set('places', this.fluidCells).set('seed', set.seed).set('mode', mode).set('dt', dt).set('scale', scale).set('frame', frame);
		this.device.queue.writeBuffer(set.uniform, 0, w.data);
	}

	particlePass(pass: GpuComputePassEncoder, set: ParticleBuffers) {
		this.run(pass, 'particles', { C: this.consts, P: set.uniform, vel: this.vel, geo: this.geo, scal: this.scal, places: this.places!, parts: set.parts, state: set.state }, this.groups(set.count));
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		for (const buffer of this.owned) buffer.destroy();
		for (const set of [this.tracers, this.smoke]) {
			set?.parts.destroy();
			set?.state.destroy();
		}
		this.querySet?.destroy();
		this.bindGroups.clear();
	}
}
