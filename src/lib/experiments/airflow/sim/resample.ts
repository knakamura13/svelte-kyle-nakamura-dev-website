import type { FieldState } from '../solver/backend';
import type { GridSpec } from '../solver/grid';

/**
 * Moves the air from one grid onto another of the same Home, so a world rebuilt at another cell size carries on where the old one was
 * rather than starting from rest: what the warm-up stepped, when it picks a coarser grid than it measured, and a device that falls
 * behind later. Every field is read at the new grid's own points (the faces for the velocity, the cell centres for the rest) by
 * trilinear interpolation of the old one, in metres, so the two grids need not line up.
 *
 * Only air is read: a cell value is the average of the old cells around the point that are air, so furniture does not drag the air
 * beside it toward zero, and a point with no air round it (the furniture is drawn a little differently on each grid) takes the nearest
 * air's value, a few cells out at most. Faces the new grid has shut carry no flow. The particulate mass
 * in the air is kept: the new field is scaled so that its total matches the old one's, which the smoke's books need. The velocity is
 * not divergence-free on the new grid; the solver's projection makes it so at its first step.
 */

/** One grid of a Home: its size, which cells are air (1) and how far open each face is (0 to 1), all in the padded layout of grid.ts. */
export interface GridAir {
	spec: GridSpec;
	fluid: Uint8Array | Float32Array;
	au: Float32Array;
	av: Float32Array;
	aw: Float32Array;
}

const clamp = (value: number, lo: number, hi: number) => (value < lo ? lo : value > hi ? hi : value);

/** Reads a field of the padded layout at the continuous index (gi, gj, gk), its valid range [0, ni] by [0, nj] by [0, nk], weighting each corner by `weight` (null: every corner counts). */
function sampler(spec: GridSpec, values: Float32Array, ni: number, nj: number, nk: number, weight: ((index: number) => number) | null) {
	const sx = spec.nx + 1;
	const sxy = (spec.nx + 1) * (spec.ny + 1);
	return (gi: number, gj: number, gk: number) => {
		const i = clamp(gi, 0, ni);
		const j = clamp(gj, 0, nj);
		const k = clamp(gk, 0, nk);
		const i0 = Math.min(Math.floor(i), Math.max(0, ni - 1));
		const j0 = Math.min(Math.floor(j), Math.max(0, nj - 1));
		const k0 = Math.min(Math.floor(k), Math.max(0, nk - 1));
		const i1 = Math.min(i0 + 1, ni);
		const j1 = Math.min(j0 + 1, nj);
		const k1 = Math.min(k0 + 1, nk);
		const fi = i - i0;
		const fj = j - j0;
		const fk = k - k0;
		let sum = 0;
		let total = 0;
		for (let c = 0; c < 8; c++) {
			const ii = c & 1 ? i1 : i0;
			const jj = c & 2 ? j1 : j0;
			const kk = c & 4 ? k1 : k0;
			const w = (c & 1 ? fi : 1 - fi) * (c & 2 ? fj : 1 - fj) * (c & 4 ? fk : 1 - fk);
			if (w <= 0) continue;
			const index = ii + sx * jj + sxy * kk;
			const m = weight ? weight(index) : 1;
			if (m <= 0) continue;
			sum += w * m * values[index];
			total += w * m;
		}
		if (total > 1e-9) return sum / total;
		if (!weight) return null;
		// No air round the point on the old grid (furniture is drawn a little differently on each grid): the nearest air there is, a few
		// cells out at most, stands in for it.
		const ci = Math.round(i);
		const cj = Math.round(j);
		const ck = Math.round(k);
		for (let radius = 1; radius <= NEAREST; radius++) {
			sum = 0;
			total = 0;
			for (let dk = -radius; dk <= radius; dk++)
				for (let dj = -radius; dj <= radius; dj++)
					for (let di = -radius; di <= radius; di++) {
						const ii = ci + di;
						const jj = cj + dj;
						const kk = ck + dk;
						if (ii < 0 || jj < 0 || kk < 0 || ii > ni || jj > nj || kk > nk) continue;
						const index = ii + sx * jj + sxy * kk;
						if (weight(index) <= 0) continue;
						sum += values[index];
						total++;
					}
			if (total) return sum / total;
		}
		return null;
	};
}

/** How many cells out the nearest air is looked for, when a point of the new grid has no air of the old one round it. */
const NEAREST = 3;

/** The particulate mass in a grid's air, in units of concentration times m³ (the density is the same on both grids, so it cancels). */
function massOf(grid: GridAir, particulates: Float32Array) {
	const { nx, ny, nz, h } = grid.spec;
	const sx = nx + 1;
	const sxy = (nx + 1) * (ny + 1);
	let sum = 0;
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++)
			for (let i = 0; i < nx; i++) {
				const c = i + sx * j + sxy * k;
				if (grid.fluid[c]) sum += particulates[c];
			}
	return sum * h * h * h;
}

/** The air of `from` on the grid of `to`: every field of `FieldState`, in the padded layout of `to.spec`. */
export function resampleFields(from: GridAir, fields: FieldState, to: GridAir): FieldState {
	const a = from.spec;
	const b = to.spec;
	const size = (b.nx + 1) * (b.ny + 1) * (b.nz + 1);
	const out: FieldState = {
		u: new Float32Array(size),
		v: new Float32Array(size),
		w: new Float32Array(size),
		p: new Float32Array(size),
		theta: new Float32Array(size),
		particulates: new Float32Array(size)
	};
	const air = (index: number) => from.fluid[index];
	// Cell fields of the old grid, read over its air only; faces read as they are (a shut face holds no flow, which is right beside a wall).
	const cell = (values: Float32Array) => sampler(a, values, a.nx - 1, a.ny - 1, a.nz - 1, air);
	const u = sampler(a, fields.u, a.nx, a.ny - 1, a.nz - 1, null);
	const v = sampler(a, fields.v, a.nx - 1, a.ny, a.nz - 1, null);
	const w = sampler(a, fields.w, a.nx - 1, a.ny - 1, a.nz, null);
	const p = cell(fields.p);
	const theta = cell(fields.theta);
	const particulates = cell(fields.particulates);
	const r = b.h / a.h;
	const sx = b.nx + 1;
	const sxy = (b.nx + 1) * (b.ny + 1);
	for (let k = 0; k <= b.nz; k++)
		for (let j = 0; j <= b.ny; j++)
			for (let i = 0; i <= b.nx; i++) {
				const index = i + sx * j + sxy * k;
				// A point of the new grid, as a continuous index of the old: position / a.h, less the half cell where the old field sits off the corner.
				const ci = (i + 0.5) * r - 0.5;
				const cj = (j + 0.5) * r - 0.5;
				const ck = (k + 0.5) * r - 0.5;
				if (j < b.ny && k < b.nz && to.au[index] > 0) out.u[index] = u(i * r, cj, ck) ?? 0;
				if (i < b.nx && k < b.nz && to.av[index] > 0) out.v[index] = v(ci, j * r, ck) ?? 0;
				if (i < b.nx && j < b.ny && to.aw[index] > 0) out.w[index] = w(ci, cj, k * r) ?? 0;
				if (i < b.nx && j < b.ny && k < b.nz && to.fluid[index]) {
					out.p[index] = p(ci, cj, ck) ?? 0;
					out.theta[index] = theta(ci, cj, ck) ?? 0;
					out.particulates[index] = Math.max(0, particulates(ci, cj, ck) ?? 0);
				}
			}
	const before = massOf(from, fields.particulates);
	const after = massOf(to, out.particulates);
	if (before > 0 && after > 0) {
		const scale = before / after;
		for (let n = 0; n < size; n++) out.particulates[n] *= scale;
	}
	return out;
}
