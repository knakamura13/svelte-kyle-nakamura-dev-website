import type { Grid } from '../grid';
import { ADVECTION_LIMIT, type Geometry } from '../types';

export interface Velocity {
	u: Float32Array;
	v: Float32Array;
	w: Float32Array;
}

/** Smallest and largest of the eight values the last `sampleLimited` call interpolated between. */
let lowest = 0;
let highest = 0;

/** Trilinear interpolation on one face lattice. (x, y, z) are lattice coordinates; they are clamped to the lattice, which holds a wall's value at the wall. */
export function sample(a: Float32Array, sx: number, sxy: number, mx: number, my: number, mz: number, x: number, y: number, z: number) {
	x = x < 0 ? 0 : x > mx ? mx : x;
	y = y < 0 ? 0 : y > my ? my : y;
	z = z < 0 ? 0 : z > mz ? mz : z;
	const i = x | 0;
	const j = y | 0;
	const k = z | 0;
	const fx = x - i;
	const fy = y - j;
	const fz = z - k;
	const dx = i < mx ? 1 : 0;
	const dy = j < my ? sx : 0;
	const dz = k < mz ? sxy : 0;
	const b = i + sx * j + sxy * k;
	const c00 = a[b] * (1 - fx) + a[b + dx] * fx;
	const c10 = a[b + dy] * (1 - fx) + a[b + dx + dy] * fx;
	const c01 = a[b + dz] * (1 - fx) + a[b + dx + dz] * fx;
	const c11 = a[b + dy + dz] * (1 - fx) + a[b + dx + dy + dz] * fx;
	return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
}

/** Same, and records the range of the stencil in `lowest` / `highest`. */
function sampleLimited(a: Float32Array, sx: number, sxy: number, mx: number, my: number, mz: number, x: number, y: number, z: number) {
	x = x < 0 ? 0 : x > mx ? mx : x;
	y = y < 0 ? 0 : y > my ? my : y;
	z = z < 0 ? 0 : z > mz ? mz : z;
	const i = x | 0;
	const j = y | 0;
	const k = z | 0;
	const dx = i < mx ? 1 : 0;
	const dy = j < my ? sx : 0;
	const dz = k < mz ? sxy : 0;
	const b = i + sx * j + sxy * k;
	const v000 = a[b];
	const v100 = a[b + dx];
	const v010 = a[b + dy];
	const v110 = a[b + dx + dy];
	const v001 = a[b + dz];
	const v101 = a[b + dx + dz];
	const v011 = a[b + dy + dz];
	const v111 = a[b + dx + dy + dz];
	lowest = Math.min(v000, v100, v010, v110, v001, v101, v011, v111);
	highest = Math.max(v000, v100, v010, v110, v001, v101, v011, v111);
	const fx = x - i;
	const fy = y - j;
	const fz = z - k;
	const c00 = v000 * (1 - fx) + v100 * fx;
	const c10 = v010 * (1 - fx) + v110 * fx;
	const c01 = v001 * (1 - fx) + v101 * fx;
	const c11 = v011 * (1 - fx) + v111 * fx;
	return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
}

/**
 * Moves velocity along the flow for `dt` seconds: for every face, find where the air now at that face
 * came from (a midpoint backtrace through the current, divergence-free field) and take the velocity there.
 * Plain semi-Lagrangian advection is stable at any time step but smears the flow, which would flatten a fan's
 * jet, so this adds the MacCormack correction (Selle et al. 2008): advect forward again, halve the error the
 * round trip reveals, and bound the result to a share `ADVECTION_LIMIT` of the way from the semi-Lagrangian value to
 * the extremes of the values it was interpolated from, so it never overshoots and cannot feed noise at the grid scale.
 * Faces that are walls stay zero.
 *
 * `carrier` is the flow that does the carrying (divergence-free, from the last step); `quantity` is what is carried,
 * which is the same velocity plus half a step of the forces on it. `pred` is scratch space the size of `quantity`;
 * the result is written to `out`.
 */
export function advectVelocity(grid: Grid, dt: number, carrier: Velocity, quantity: Velocity, pred: Velocity, out: Velocity, geometry: Geometry, correct = true) {
	const { nx, ny, nz, sx, sxy } = grid;
	const dtg = dt / grid.h;
	const { u, v, w } = carrier;
	const mux = nx;
	const muy = ny - 1;
	const muz = nz - 1;
	const mvx = nx - 1;
	const mvy = ny;
	const mvz = nz - 1;
	const mwx = nx - 1;
	const mwy = ny - 1;
	const mwz = nz;

	const faces = [
		{ phi: quantity.u, p1: pred.u, out: out.u, open: geometry.au, ni: nx + 1, nj: ny, nk: nz, ox: 0, oy: 0.5, oz: 0.5, mx: mux, my: muy, mz: muz },
		{ phi: quantity.v, p1: pred.v, out: out.v, open: geometry.av, ni: nx, nj: ny + 1, nk: nz, ox: 0.5, oy: 0, oz: 0.5, mx: mvx, my: mvy, mz: mvz },
		{ phi: quantity.w, p1: pred.w, out: out.w, open: geometry.aw, ni: nx, nj: ny, nk: nz + 1, ox: 0.5, oy: 0.5, oz: 0, mx: mwx, my: mwy, mz: mwz }
	];

	for (const pass of correct ? [1, 2] : [1]) {
		for (const f of faces) {
			const { phi, p1, open, ox, oy, oz } = f;
			for (let k = 0; k < f.nk; k++)
				for (let j = 0; j < f.nj; j++) {
					const row = sx * j + sxy * k;
					for (let i = 0; i < f.ni; i++) {
						const at = i + row;
						if (open[at] <= 0) {
							(pass === 1 ? p1 : f.out)[at] = 0;
							continue;
						}
						const wx = i + ox;
						const wy = j + oy;
						const wz = k + oz;
						// Velocity here, then at the midpoint of the way back.
						const cu = sample(u, sx, sxy, mux, muy, muz, wx, wy - 0.5, wz - 0.5);
						const cv = sample(v, sx, sxy, mvx, mvy, mvz, wx - 0.5, wy, wz - 0.5);
						const cw = sample(w, sx, sxy, mwx, mwy, mwz, wx - 0.5, wy - 0.5, wz);
						const hx = wx - 0.5 * dtg * cu;
						const hy = wy - 0.5 * dtg * cv;
						const hz = wz - 0.5 * dtg * cw;
						const mu = sample(u, sx, sxy, mux, muy, muz, hx, hy - 0.5, hz - 0.5);
						const mv = sample(v, sx, sxy, mvx, mvy, mvz, hx - 0.5, hy, hz - 0.5);
						const mw = sample(w, sx, sxy, mwx, mwy, mwz, hx - 0.5, hy - 0.5, hz);
						const bx = wx - dtg * mu - ox;
						const by = wy - dtg * mv - oy;
						const bz = wz - dtg * mw - oz;
						if (pass === 1) {
							p1[at] = sample(phi, sx, sxy, f.mx, f.my, f.mz, bx, by, bz);
							continue;
						}
						const stepBack = sampleLimited(phi, sx, sxy, f.mx, f.my, f.mz, bx, by, bz);
						const forward = sample(p1, sx, sxy, f.mx, f.my, f.mz, wx + dtg * mu - ox, wy + dtg * mv - oy, wz + dtg * mw - oz);
						// `stepBack` equals p1[at]; the stored copy and the limited one are the same interpolation.
						const corrected = stepBack + 0.5 * (phi[at] - forward);
						const floor = stepBack - ADVECTION_LIMIT * (stepBack - lowest);
						const ceiling = stepBack + ADVECTION_LIMIT * (highest - stepBack);
						f.out[at] = corrected < floor ? floor : corrected > ceiling ? ceiling : corrected;
					}
				}
		}
	}
	if (!correct) {
		out.u.set(pred.u);
		out.v.set(pred.v);
		out.w.set(pred.w);
	}
}
