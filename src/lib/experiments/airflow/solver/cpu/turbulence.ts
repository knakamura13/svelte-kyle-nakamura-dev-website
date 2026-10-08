import type { Grid } from '../grid';
import type { Geometry } from '../types';
import type { Velocity } from './advect';

/** Cell-centred velocity, reused as scratch by the turbulence closure and the tracers. */
export function cellVelocity(grid: Grid, vel: Velocity, geometry: Geometry, cu: Float32Array, cv: Float32Array, cw: Float32Array) {
	const { nx, ny, nz, sx, sxy } = grid;
	const { u, v, w } = vel;
	const { fluid } = geometry;
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++) {
			const row = sx * j + sxy * k;
			for (let i = 0; i < nx; i++) {
				const c = i + row;
				if (!fluid[c]) {
					cu[c] = cv[c] = cw[c] = 0;
					continue;
				}
				cu[c] = 0.5 * (u[c] + u[c + 1]);
				cv[c] = 0.5 * (v[c] + v[c + sx]);
				cw[c] = 0.5 * (w[c] + w[c + sxy]);
			}
		}
}

/**
 * Eddy viscosity from a shear-length closure: ν_t = c·V·ℓ, with V the local speed and ℓ = V/|S| the shear length
 * (|S| is the strain-rate magnitude), capped at `maxLength`. In a jet or plume V/|S| is its width, so ν_t = c·V·b is
 * constant along a round jet, which is what makes its centreline speed fall as 1/distance; in uniform flow and
 * still air the cap and the speed keep it modest. The diagonal strains come straight from the face velocities and
 * the shear terms from cell-centred velocities, by a central difference where air continues on both sides and a
 * one-sided one at a wall.
 *
 * A Smagorinsky closure (ν_t = (Cs·Δ)²|S|) was tried first and fails this job: |S| falls as 1/distance² along a
 * jet, so the eddy viscosity vanishes and the jet stays laminar (centreline decay exponent −0.1 instead of −1,
 * whatever the filter width), while it leaves laminar benchmarks alone only by being too weak to matter anywhere.
 */
export function eddyViscosity(
	grid: Grid,
	geometry: Geometry,
	vel: Velocity,
	closure: { coefficient: number; maxLength: number },
	limit: number,
	nut: Float32Array,
	cu: Float32Array,
	cv: Float32Array,
	cw: Float32Array
) {
	const { nx, ny, nz, sx, sxy, h } = grid;
	if (closure.coefficient <= 0) {
		nut.fill(0);
		return;
	}
	cellVelocity(grid, vel, geometry, cu, cv, cw);
	const { u, v, w } = vel;
	const { fluid, au, av, aw } = geometry;
	const inv2h = 0.5 / h;
	const invh = 1 / h;

	/** d(q)/d(axis) at cell c: central when both neighbours are connected, one-sided when one is, zero when neither. */
	const gradient = (q: Float32Array, c: number, step: number, minus: boolean, plus: boolean) =>
		minus && plus ? (q[c + step] - q[c - step]) * inv2h : plus ? (q[c + step] - q[c]) * invh : minus ? (q[c] - q[c - step]) * invh : 0;

	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++) {
			const row = sx * j + sxy * k;
			for (let i = 0; i < nx; i++) {
				const c = i + row;
				if (!fluid[c]) {
					nut[c] = 0;
					continue;
				}
				const xm = au[c] > 0;
				const xp = au[c + 1] > 0;
				const ym = av[c] > 0;
				const yp = av[c + sx] > 0;
				const zm = aw[c] > 0;
				const zp = aw[c + sxy] > 0;
				const sxx = (u[c + 1] - u[c]) * invh;
				const syy = (v[c + sx] - v[c]) * invh;
				const szz = (w[c + sxy] - w[c]) * invh;
				const sxy_ = 0.5 * (gradient(cu, c, sx, ym, yp) + gradient(cv, c, 1, xm, xp));
				const sxz = 0.5 * (gradient(cu, c, sxy, zm, zp) + gradient(cw, c, 1, xm, xp));
				const syz = 0.5 * (gradient(cv, c, sxy, zm, zp) + gradient(cw, c, sx, ym, yp));
				const magnitude = Math.sqrt(2 * (sxx * sxx + syy * syy + szz * szz) + 4 * (sxy_ * sxy_ + sxz * sxz + syz * syz));
				const speed = Math.sqrt(cu[c] * cu[c] + cv[c] * cv[c] + cw[c] * cw[c]);
				const shearLength = speed < closure.maxLength * magnitude ? speed / magnitude : closure.maxLength;
				const value = closure.coefficient * speed * shearLength;
				nut[c] = value < limit ? value : limit;
			}
		}
}
