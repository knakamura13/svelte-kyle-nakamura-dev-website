import type { Grid, GridSpec } from './grid';
import type { Geometry } from './types';

/**
 * The volume snapshot: the whole box of air at a coarser grid, for the renderers that fill the rooms (streaks, smoke and the
 * overlays). Each volume cell is the average of a block of solver cells, over the air in the block only, so furniture never drags
 * a reading toward zero, and it carries the share of the block that is air. Both backends make it the same way: cpu/readouts.ts
 * on the processor and the `volume` kernel on the GPU, whose result is read back like any other part of a snapshot.
 */

/** The most cells a volume may have: 64,000 cells are 1.5 MB of floats, which a page reads back ten times a second without noticing. */
export const VOLUME_BUDGET = 64_000;

/** How the volume divides the solver's box. */
export interface VolumeSpec {
	/** Cells of the volume along x, y and z. */
	nx: number;
	ny: number;
	nz: number;
	/** Solver cells each volume cell averages along x, y and z: a volume cell is sx·h by sy·h by sz·h. The last cell on an axis may hold fewer. */
	sx: number;
	sy: number;
	sz: number;
	/** The solver's cell size, m. */
	h: number;
}

/** Numbers per volume cell in `Volume.flow` and in `Volume.scalars`. */
export const FLOW_STRIDE = 4;
export const SCALAR_STRIDE = 2;

/**
 * The air in the box at one moment, on the grid of `VolumeSpec`. Arrays run x fastest, then y, then z, which is the order a 3D
 * texture is uploaded in.
 */
export interface Volume extends VolumeSpec {
	/** Per volume cell: the air's velocity east, up and south at the cell centres (m/s), averaged over the air in it, and the share of it that is air (0 to 1). */
	flow: Float32Array;
	/** Per volume cell: the temperature, K above the solver's reference, and the particulates, ppm by mass, averaged over the air in it. */
	scalars: Float32Array;
}

const blocks = (cells: number, stride: number) => Math.ceil(cells / stride);

/**
 * The strides for a grid: the volume with the smallest largest cell edge that fits `budget` cells. Among volumes with the same
 * largest edge it takes the one that coarsens least in all (the smallest sum of strides), then the one that keeps the vertical
 * finest (a room is low, and what happens between the floor and the ceiling is most of the picture), then the one with most cells.
 * A grid that fits is its own volume: every stride 1.
 */
export function volumeSpec(grid: GridSpec, budget = VOLUME_BUDGET): VolumeSpec {
	let best: { spec: VolumeSpec; key: number[] } | null = null;
	// A stride past 32 would mean a grid of more than two billion cells at the budget.
	const most = Math.min(32, Math.max(grid.nx, grid.ny, grid.nz));
	for (let sy = 1; sy <= most; sy++)
		for (let sz = 1; sz <= most; sz++)
			for (let sx = 1; sx <= most; sx++) {
				const nx = blocks(grid.nx, sx);
				const ny = blocks(grid.ny, sy);
				const nz = blocks(grid.nz, sz);
				const cells = nx * ny * nz;
				if (cells > budget) continue;
				const key = [Math.max(sx, sy, sz), sx + sy + sz, sy, -cells];
				if (!best || less(key, best.key)) best = { spec: { nx, ny, nz, sx, sy, sz, h: grid.h }, key };
				// Any coarser x only coarsens further.
				break;
			}
	if (!best) throw new Error(`No volume of at most ${budget} cells divides a ${grid.nx} × ${grid.ny} × ${grid.nz} grid.`);
	return best.spec;
}

function less(a: number[], b: number[]) {
	for (let n = 0; n < a.length; n++) if (a[n] !== b[n]) return a[n] < b[n];
	return false;
}

/** Cells of a volume. */
export const volumeCells = (spec: Pick<VolumeSpec, 'nx' | 'ny' | 'nz'>) => spec.nx * spec.ny * spec.nz;

/** The volume's extent, m, along x, y and z: a whole number of volume cells, which can reach past the box by less than one cell. */
export const volumeExtent = (spec: VolumeSpec): [number, number, number] => [spec.nx * spec.sx * spec.h, spec.ny * spec.sy * spec.h, spec.nz * spec.sz * spec.h];

/**
 * Averages the solver's fields into the volume `spec` describes (the CPU's half of the volume snapshot; the GPU's `volume` kernel does
 * the same sums in the same order). A cell's velocity is the mean of its two faces on each axis, as in a slice.
 */
export function extractVolume(grid: Grid, geometry: Geometry, vel: { u: Float32Array; v: Float32Array; w: Float32Array }, theta: Float32Array, particulates: Float32Array, spec: VolumeSpec): Volume {
	const { nx, ny, nz, sx, sxy } = grid;
	const cells = volumeCells(spec);
	const flow = new Float32Array(FLOW_STRIDE * cells);
	const scalars = new Float32Array(SCALAR_STRIDE * cells);
	const { u, v, w } = vel;
	const fluid = geometry.fluid;
	let out = 0;
	for (let K = 0; K < spec.nz; K++)
		for (let J = 0; J < spec.ny; J++)
			for (let I = 0; I < spec.nx; I++, out++) {
				const i0 = I * spec.sx;
				const j0 = J * spec.sy;
				const k0 = K * spec.sz;
				const i1 = Math.min(i0 + spec.sx, nx);
				const j1 = Math.min(j0 + spec.sy, ny);
				const k1 = Math.min(k0 + spec.sz, nz);
				let su = 0;
				let sv = 0;
				let sw = 0;
				let st = 0;
				let sp = 0;
				let air = 0;
				let count = 0;
				for (let k = k0; k < k1; k++)
					for (let j = j0; j < j1; j++)
						for (let i = i0; i < i1; i++) {
							count++;
							const c = i + sx * j + sxy * k;
							if (!fluid[c]) continue;
							su += 0.5 * (u[c] + u[c + 1]);
							sv += 0.5 * (v[c] + v[c + sx]);
							sw += 0.5 * (w[c] + w[c + sxy]);
							st += theta[c];
							sp += particulates[c];
							air++;
						}
				if (!air) continue;
				flow[FLOW_STRIDE * out] = su / air;
				flow[FLOW_STRIDE * out + 1] = sv / air;
				flow[FLOW_STRIDE * out + 2] = sw / air;
				flow[FLOW_STRIDE * out + 3] = air / count;
				scalars[SCALAR_STRIDE * out] = st / air;
				scalars[SCALAR_STRIDE * out + 1] = sp / air;
			}
	return { ...spec, flow, scalars };
}
