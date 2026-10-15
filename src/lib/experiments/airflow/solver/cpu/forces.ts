import type { Grid } from '../grid';
import type { FanDisk, Geometry } from '../types';
import type { Velocity } from './advect';

/**
 * Boussinesq buoyancy: warm air (theta > 0) is pushed up and cold air down, by g·β·θ, where θ is the
 * temperature above the reference. Applied to every y-face from the mean of the two cells it sits between.
 */
export function applyBuoyancy(grid: Grid, geometry: Geometry, theta: Float32Array, v: Float32Array, dt: number, g: number, beta: number) {
	if (beta === 0 || g === 0) return;
	const { nx, ny, nz, sx, sxy } = grid;
	const { av } = geometry;
	const k = dt * g * beta * 0.5;
	for (let kk = 0; kk < nz; kk++)
		for (let j = 1; j < ny; j++) {
			const row = sx * j + sxy * kk;
			for (let i = 0; i < nx; i++) {
				const f = i + row;
				if (av[f] > 0) v[f] += k * (theta[f - sx] + theta[f]);
			}
		}
}

/** Accelerates every interior face by minus the pressure gradient times `k` (= dt/(ρ·h) or half of it). */
export function applyPressureGradient(grid: Grid, geometry: Geometry, p: Float32Array, vel: Velocity, k: number) {
	const { nx, ny, nz, sx, sxy } = grid;
	const { au, av, aw } = geometry;
	const { u, v, w } = vel;
	for (let kk = 0; kk < nz; kk++)
		for (let j = 0; j < ny; j++) {
			const row = sx * j + sxy * kk;
			for (let i = 0; i < nx; i++) {
				const f = i + row;
				if (i > 0 && au[f] > 0) u[f] -= k * (p[f] - p[f - 1]);
				if (j > 0 && av[f] > 0) v[f] -= k * (p[f] - p[f - sx]);
				if (kk > 0 && aw[f] > 0) w[f] -= k * (p[f] - p[f - sxy]);
			}
		}
}

/**
 * How hard each fan pushes right now, as an acceleration in m/s² (times the faces' own weights, which are
 * applied by `applyFans`). The push follows the fan curve for the flow the fan is delivering: Δp = Δp_max·(1 − (Q/Q_max)²),
 * so it shrinks as the room pushes back and the fan delivers its rated flow in open air. The push is the pressure
 * rise times the swept area, spread over the disk's cells by their weights, which works the same whether the disk
 * spans many cells or is smaller than one.
 *
 * Records each fan's flow in `flows`, m³/s.
 */
export function fanAcceleration(grid: Grid, fans: FanDisk[], vel: Velocity, rho: number, flows: Float64Array, accelerations: Float64Array) {
	const { sx, sxy } = grid;
	const volume = grid.cellVolume;
	for (let n = 0; n < fans.length; n++) {
		const fan = fans[n];
		const [nx, ny, nz] = fan.normal;
		let weights = 0;
		let axial = 0;
		for (let c = 0; c < fan.cells.length; c++) {
			const cell = fan.cells[c];
			const weight = fan.cellWeight[c];
			const u = 0.5 * (vel.u[cell] + vel.u[cell + 1]);
			const v = 0.5 * (vel.v[cell] + vel.v[cell + sx]);
			const w = 0.5 * (vel.w[cell] + vel.w[cell + sxy]);
			axial += weight * (u * nx + v * ny + w * nz);
			weights += weight;
		}
		const flow = weights > 0 ? (fan.area * axial) / weights : 0;
		flows[n] = flow;
		if (fan.qMax <= 0 || fan.dpMax <= 0 || weights <= 0) {
			accelerations[n] = 0;
			continue;
		}
		const ratio = flow / fan.qMax;
		accelerations[n] = (fan.dpMax * (1 - ratio * ratio) * fan.area) / (weights * volume * rho);
	}
}

/** Adds `dt` of every fan's push to `vel`. */
export function applyFans(fans: FanDisk[], accelerations: Float64Array, vel: Velocity, dt: number) {
	const faces = [vel.u, vel.v, vel.w];
	for (let n = 0; n < fans.length; n++) {
		const fan = fans[n];
		const k = dt * accelerations[n];
		if (k === 0) continue;
		for (let e = 0; e < fan.faceIndex.length; e++) faces[fan.faceAxis[e]][fan.faceIndex[e]] += k * fan.faceWeight[e];
	}
}
