import type { Grid } from '../grid';
import type { Geometry } from '../types';
import type { Velocity } from './advect';

/** Cumulative mass moved by one scalar, in the scalar's own units times m³ (multiply by ρ for mg of a ppm-by-mass scalar). */
export interface Tally {
	emitted: number;
	inflow: number;
	outflow: number;
	removed: number;
	deposited: number;
}

export const emptyTally = (): Tally => ({ emitted: 0, inflow: 0, outflow: 0, removed: 0, deposited: 0 });

export interface ScalarSpec {
	/** Diffusivity is `molecular` plus the eddy viscosity divided by `turbulent` (a Prandtl or Schmidt number). */
	molecular: number;
	turbulent: number;
	/** Value air carries in through an exterior opening. */
	inflow: number;
	/** Downward drift speed and surface deposition speed, m/s. Zero for temperature. */
	settling: number;
	deposition: number;
	/** Fixed wall value per box side (-x, +x, -y, +y, -z, +z); undefined for an adiabatic wall. */
	wall?: (number | undefined)[];
	/** Per cell: release rate in scalar units per second, and first-order removal rate per second (a purifier's inlet). */
	source?: Float32Array;
	sink?: Float32Array;
}

/**
 * The largest number of cells any air crosses in `dt`, summed over the three axes, which is what an explicit
 * advection scheme has to keep below about a half.
 */
export function maxCfl(grid: Grid, geometry: Geometry, vel: Velocity, dt: number, settling = 0) {
	const { nx, ny, nz, sx, sxy, h } = grid;
	const { u, v, w } = vel;
	const { fluid } = geometry;
	let worst = 0;
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++) {
			const row = sx * j + sxy * k;
			for (let i = 0; i < nx; i++) {
				const c = i + row;
				if (!fluid[c]) continue;
				const sum =
					Math.max(Math.abs(u[c]), Math.abs(u[c + 1])) + Math.max(Math.abs(v[c]), Math.abs(v[c + sx])) + Math.max(Math.abs(w[c]), Math.abs(w[c + sxy])) + settling;
				if (sum > worst) worst = sum;
			}
		}
	return (worst * dt) / h;
}

/** Cell diffusivities, written into `diffusivity`. */
export function diffusivities(grid: Grid, geometry: Geometry, nut: Float32Array, spec: ScalarSpec, diffusivity: Float32Array) {
	const { nx, ny, nz, sx, sxy } = grid;
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++) {
			const row = sx * j + sxy * k;
			for (let i = 0; i < nx; i++) {
				const c = i + row;
				diffusivity[c] = geometry.fluid[c] ? spec.molecular + nut[c] / spec.turbulent : 0;
			}
		}
}

/**
 * The value of a transported scalar on a face, times the speed through it, with the van Leer limiter: the
 * upwind cell's value plus half a limited slope. `cm` and `cp` are the cells on the minus and plus side (-1 when
 * the face is on the box), and `fm`, `fp` the cells beyond them (-1 when there is none or a wall is between).
 * Returns the advective flux per unit face area along +axis.
 */
function advective(phi: Float32Array, speed: number, cm: number, cp: number, fm: number, fp: number, inflow: number) {
	if (cm < 0) return speed > 0 ? speed * inflow : speed * phi[cp];
	if (cp < 0) return speed >= 0 ? speed * phi[cm] : speed * inflow;
	if (speed >= 0) {
		const up = phi[cm];
		let face = up;
		if (fm >= 0) {
			const ahead = phi[cp] - up;
			const behind = up - phi[fm];
			if (ahead * behind > 0) face += (ahead * behind) / (ahead + behind);
		}
		return speed * face;
	}
	const up = phi[cp];
	let face = up;
	if (fp >= 0) {
		const ahead = phi[cm] - up;
		const behind = up - phi[fp];
		if (ahead * behind > 0) face += (ahead * behind) / (ahead + behind);
	}
	return speed * face;
}

/**
 * One explicit substep of ∂φ/∂t + ∇·(u φ) = ∇·(D ∇φ) + source − sink·φ for a scalar, in conservative form:
 * what leaves one cell through a face enters its neighbour, so the only gains and losses are the box's openings,
 * sources, sinks and surfaces, and the `tally` can account for every bit of it.
 *
 * Removal (purifier inlets, deposition on every wall, settling onto floors) is applied implicitly, so a very
 * strong sink in a few cells cannot go unstable.
 */
export function stepScalar(
	grid: Grid,
	geometry: Geometry,
	vel: Velocity,
	diffusivity: Float32Array,
	spec: ScalarSpec,
	phi: Float32Array,
	next: Float32Array,
	dtau: number,
	tally?: Tally
) {
	const { nx, ny, nz, sx, sxy, h } = grid;
	const { u, v, w } = vel;
	const { fluid, au, av, aw } = geometry;
	const area = h * h;
	const volume = h * h * h;
	const inv = dtau / volume;
	const deposit = spec.deposition / h;
	const settle = spec.settling;
	const wall = spec.wall;
	const source = spec.source;
	const sink = spec.sink;
	const inflow = spec.inflow;
	let inflowMass = 0;
	let outflowMass = 0;
	let emitted = 0;
	let removed = 0;
	let deposited = 0;

	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++) {
			const row = sx * j + sxy * k;
			for (let i = 0; i < nx; i++) {
				const c = i + row;
				if (!fluid[c]) {
					next[c] = phi[c];
					continue;
				}
				const centre = phi[c];
				const dc = diffusivity[c];
				let net = 0;

				// x faces: minus (index c) and plus (index c + 1).
				{
					let a = au[c];
					if (a > 0) {
						const cm = i > 0 ? c - 1 : -1;
						const fm = i > 1 && au[c - 1] > 0 ? c - 2 : -1;
						const fp = i < nx - 1 && au[c + 1] > 0 ? c + 1 : -1;
						let flux = advective(phi, u[c], cm, c, fm, fp, inflow);
						if (cm >= 0) flux -= 0.5 * (diffusivity[cm] + dc) * (centre - phi[cm]) / h;
						flux *= a * area;
						net -= flux;
						if (cm < 0) {
							if (flux > 0) inflowMass += flux;
							else outflowMass -= flux;
						}
					} else if (i === 0 && wall && wall[0] !== undefined) net -= (dc * (wall[0] - centre) * 2 * area) / h;
					a = au[c + 1];
					if (a > 0) {
						const cp = i < nx - 1 ? c + 1 : -1;
						const fm = i > 0 && au[c] > 0 ? c - 1 : -1;
						const fp = i < nx - 2 && au[c + 2] > 0 ? c + 2 : -1;
						let flux = advective(phi, u[c + 1], c, cp, fm, fp, inflow);
						if (cp >= 0) flux -= 0.5 * (dc + diffusivity[cp]) * (phi[cp] - centre) / h;
						flux *= a * area;
						net += flux;
						if (cp < 0) {
							if (flux > 0) outflowMass += flux;
							else inflowMass -= flux;
						}
					} else if (i === nx - 1 && wall && wall[1] !== undefined) net -= (dc * (wall[1] - centre) * 2 * area) / h;
				}

				// y faces: settling carries particulates down through every open one, in addition to the air.
				{
					let a = av[c];
					if (a > 0) {
						const cm = j > 0 ? c - sx : -1;
						const fm = j > 1 && av[c - sx] > 0 ? c - 2 * sx : -1;
						const fp = j < ny - 1 && av[c + sx] > 0 ? c + sx : -1;
						let flux = advective(phi, v[c], cm, c, fm, fp, inflow);
						if (cm >= 0) {
							flux -= 0.5 * (diffusivity[cm] + dc) * (centre - phi[cm]) / h;
							flux -= settle * centre;
						}
						flux *= a * area;
						net -= flux;
						if (cm < 0) {
							if (flux > 0) inflowMass += flux;
							else outflowMass -= flux;
						}
					} else if (j === 0 && wall && wall[2] !== undefined) net -= (dc * (wall[2] - centre) * 2 * area) / h;
					a = av[c + sx];
					if (a > 0) {
						const cp = j < ny - 1 ? c + sx : -1;
						const fm = j > 0 && av[c] > 0 ? c - sx : -1;
						const fp = j < ny - 2 && av[c + 2 * sx] > 0 ? c + 2 * sx : -1;
						let flux = advective(phi, v[c + sx], c, cp, fm, fp, inflow);
						if (cp >= 0) {
							flux -= 0.5 * (dc + diffusivity[cp]) * (phi[cp] - centre) / h;
							flux -= settle * phi[cp];
						}
						flux *= a * area;
						net += flux;
						if (cp < 0) {
							if (flux > 0) outflowMass += flux;
							else inflowMass -= flux;
						}
					} else if (j === ny - 1 && wall && wall[3] !== undefined) net -= (dc * (wall[3] - centre) * 2 * area) / h;
				}

				// z faces.
				{
					let a = aw[c];
					if (a > 0) {
						const cm = k > 0 ? c - sxy : -1;
						const fm = k > 1 && aw[c - sxy] > 0 ? c - 2 * sxy : -1;
						const fp = k < nz - 1 && aw[c + sxy] > 0 ? c + sxy : -1;
						let flux = advective(phi, w[c], cm, c, fm, fp, inflow);
						if (cm >= 0) flux -= 0.5 * (diffusivity[cm] + dc) * (centre - phi[cm]) / h;
						flux *= a * area;
						net -= flux;
						if (cm < 0) {
							if (flux > 0) inflowMass += flux;
							else outflowMass -= flux;
						}
					} else if (k === 0 && wall && wall[4] !== undefined) net -= (dc * (wall[4] - centre) * 2 * area) / h;
					a = aw[c + sxy];
					if (a > 0) {
						const cp = k < nz - 1 ? c + sxy : -1;
						const fm = k > 0 && aw[c] > 0 ? c - sxy : -1;
						const fp = k < nz - 2 && aw[c + 2 * sxy] > 0 ? c + 2 * sxy : -1;
						let flux = advective(phi, w[c + sxy], c, cp, fm, fp, inflow);
						if (cp >= 0) flux -= 0.5 * (dc + diffusivity[cp]) * (phi[cp] - centre) / h;
						flux *= a * area;
						net += flux;
						if (cp < 0) {
							if (flux > 0) outflowMass += flux;
							else inflowMass -= flux;
						}
					} else if (k === nz - 1 && wall && wall[5] !== undefined) net -= (dc * (wall[5] - centre) * 2 * area) / h;
				}

				// `net` is what flows out of the cell minus what flows in, so the cell loses it.
				let value = centre - inv * net;
				const added = source ? source[c] * dtau : 0;
				value += added;
				emitted += added * volume;
				const purifier = sink ? sink[c] : 0;
				let surfaces = 0;
				if (deposit > 0 || settle > 0) {
					surfaces = deposit * (6 - au[c] - au[c + 1] - av[c] - av[c + sx] - aw[c] - aw[c + sxy]);
					surfaces += (settle / h) * (1 - av[c]);
				}
				const rate = purifier + surfaces;
				if (rate > 0) {
					const after = value / (1 + rate * dtau);
					const lost = (value - after) * volume;
					removed += (lost * purifier) / rate;
					deposited += (lost * surfaces) / rate;
					value = after;
				}
				next[c] = value;
			}
		}

	if (tally) {
		tally.inflow += inflowMass * dtau;
		tally.outflow += outflowMass * dtau;
		tally.emitted += emitted;
		tally.removed += removed;
		tally.deposited += deposited;
	}
}
