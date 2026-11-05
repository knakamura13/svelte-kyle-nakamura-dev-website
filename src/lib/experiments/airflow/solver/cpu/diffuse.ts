import type { Grid } from '../grid';
import type { Geometry, SideConditions } from '../types';
import type { Velocity } from './advect';

/** The value a wall's ghost neighbour holds so the wall surface gets the wall's own velocity. */
function ghostAtBox(sides: SideConditions, side: number, component: number, value: number) {
	const condition = sides[side];
	return condition.slip === 'free-slip' ? value : 2 * (condition.velocity?.[component] ?? 0) - value;
}

/**
 * The diffusion across one tangential axis `t` of face `f`: the sum of both neighbours minus twice the
 * centre. A neighbour is real only if air connects the two faces; a wall in the way makes it a ghost that
 * gives the wall its velocity (an interior wall is still, so the ghost is the centre's mirror image), and
 * a part-open door blends the two by its open fraction.
 */
function tangential(
	phi: Float32Array,
	open: Float32Array,
	f: number,
	lo: number,
	hi: number,
	step: number,
	position: number,
	cells: number,
	centre: number,
	sides: SideConditions,
	side: number,
	component: number
) {
	let plus: number;
	let minus: number;
	if (position + 1 < cells) {
		const through = 0.5 * (open[lo + step] + open[hi + step]);
		plus = through * phi[f + step] - (1 - through) * centre;
	} else plus = ghostAtBox(sides, side + 1, component, centre);
	if (position > 0) {
		const through = 0.5 * (open[lo] + open[hi]);
		minus = through * phi[f - step] - (1 - through) * centre;
	} else minus = ghostAtBox(sides, side, component, centre);
	return plus + minus - 2 * centre;
}

/**
 * One explicit step of viscous diffusion, ∂φ/∂t = ∇·(ν_eff ∇φ), for every velocity component, with
 * ν_eff = ν + ν_t from the turbulence closure.
 *
 * Normal to a face the neighbours are the next faces of the same component (a wall holds zero there, which is
 * the right condition for the normal component). Along the other two axes see `tangential`.
 *
 * Stable while 6·ν_eff·dt/h² < 1; the solver substeps to keep it so.
 */
export function diffuseVelocity(grid: Grid, geometry: Geometry, sides: SideConditions, nu: number, nut: Float32Array, dt: number, vel: Velocity, out: Velocity) {
	const { nx, ny, nz, sx, sxy } = grid;
	const dims = [nx, ny, nz];
	const steps = [1, sx, sxy];
	const open = [geometry.au, geometry.av, geometry.aw];
	const fields = [vel.u, vel.v, vel.w];
	const results = [out.u, out.v, out.w];
	const k = dt / (grid.h * grid.h);

	for (let n = 0; n < 3; n++) {
		const phi = fields[n];
		const result = results[n];
		const mine = open[n];
		const sn = steps[n];
		const t1 = (n + 1) % 3;
		const t2 = (n + 2) % 3;
		const s1 = steps[t1];
		const s2 = steps[t2];
		const c1 = dims[t1];
		const c2 = dims[t2];
		const cn = dims[n];
		const open1 = open[t1];
		const open2 = open[t2];
		const ni = nx + (n === 0 ? 1 : 0);
		const nj = ny + (n === 1 ? 1 : 0);
		const nk = nz + (n === 2 ? 1 : 0);
		for (let kk = 0; kk < nk; kk++)
			for (let jj = 0; jj < nj; jj++) {
				const row = sx * jj + sxy * kk;
				for (let ii = 0; ii < ni; ii++) {
					const f = ii + row;
					const pn = n === 0 ? ii : n === 1 ? jj : kk;
					// Faces on the box itself are openings or walls: the pressure step sets them.
					if (mine[f] <= 0) {
						result[f] = 0;
						continue;
					}
					if (pn === 0 || pn === cn) {
						result[f] = phi[f];
						continue;
					}
					const lo = f - sn;
					const hi = f;
					const centre = phi[f];
					const p1 = t1 === 0 ? ii : t1 === 1 ? jj : kk;
					const p2 = t2 === 0 ? ii : t2 === 1 ? jj : kk;
					const faceNu = nu + 0.5 * (nut[lo] + nut[hi]);
					const normal = (nu + nut[hi]) * (phi[f + sn] - centre) - (nu + nut[lo]) * (centre - phi[f - sn]);
					const around =
						tangential(phi, open1, f, lo, hi, s1, p1, c1, centre, sides, 2 * t1, n) +
						tangential(phi, open2, f, lo, hi, s2, p2, c2, centre, sides, 2 * t2, n);
					result[f] = centre + k * (normal + faceNu * around);
				}
			}
	}
}
