import { SIDE, type Grid, type SideIndex } from '../grid';
import type { Exterior, Geometry, PressureSettings } from '../types';
import type { Velocity } from './advect';

/**
 * Speed below which an opening's conductance stops growing. The orifice law Q ∝ √Δp has an infinite slope at
 * zero flow; linearising it there would make the pressure solve ill-conditioned for no visible gain.
 */
const U_REGULAR = 0.05;
/**
 * Relative enlargement of the diagonal, at rounding level. It must stay that small: it acts as a leak that
 * grows with the room's pressure and with the number of cells, and a larger one swallows the flow through a
 * small opening. A room with no opening at all is singular (pressure is only defined up to a constant); that
 * constant is removed explicitly instead (see `solve`).
 */
const SHIFT = 1e-7;
/** Floor of the fan-curve square root, so a stalled window fan stays bounded. */
const STALL = 0.01;

interface Level {
	nx: number;
	ny: number;
	nz: number;
	sx: number;
	sxy: number;
	/** How much this level is coarsened per axis to make the next one: 1 or 2. */
	fx: number;
	fy: number;
	fz: number;
	/**
	 * Conductance of every face, m³/s per Pa: the flow a pressure difference between the two cells pushes
	 * through the face. On a face of the box itself it is the opening's conductance to the outside instead.
	 */
	cx: Float32Array;
	cy: Float32Array;
	cz: Float32Array;
	/** Sum of the six conductances, slightly enlarged: the diagonal of the system. 0 for a cell with no air connection. */
	dg: Float32Array;
	p: Float32Array;
	rhs: Float32Array;
	res: Float32Array;
}

function makeLevel(nx: number, ny: number, nz: number, fx = 1, fy = 1, fz = 1): Level {
	const sx = nx + 1;
	const sxy = (nx + 1) * (ny + 1);
	const size = sxy * (nz + 1);
	const array = () => new Float32Array(size);
	return { nx, ny, nz, sx, sxy, fx, fy, fz, cx: array(), cy: array(), cz: array(), dg: array(), p: array(), rhs: array(), res: array() };
}

/**
 * The pressure projection: finds the pressure whose gradient removes the divergence from the velocity, solves
 * it with a geometric multigrid, and applies it.
 *
 * Everything is flux balance per cell. A face between two cells passes flow in proportion to the pressure
 * difference, with conductance a·h·dt/ρ (a is the face's open fraction). A face on the box that is an exterior
 * opening passes flow by the orifice law (or a window fan's curve), which depends on the room's own pressure; it
 * is linearised about the pressure of the last step, which makes it one more conductance and one more source
 * term in the cell next to it. The resulting system is symmetric and, with any opening in the box, positive
 * definite; with none it is singular, and the small shift in the diagonal fixes the constant.
 *
 * The multigrid coarsens by aggregating 2×2×2 cells with piecewise-constant transfer. The coarse operator is
 * rebuilt from the fine conductances: faces across a coarse interface are summed, and an interior face is
 * halved because the coarse cells are twice as far apart.
 */
export class PressureSolver {
	readonly levels: Level[] = [];
	/** Per box side: the flow speed into the room an opening settled on last (the linearisation point), and its slope, both per face of that side. */
	private readonly boundaryQ: Float32Array[];
	private readonly boundaryG: Float32Array[];
	/** Relative residual of the last solve. */
	residual = 0;
	/** Whether any exterior opening connects the air to the outside; without one the pressure level is arbitrary. */
	private outlet = false;

	constructor(
		private readonly grid: Grid,
		private readonly settings: PressureSettings
	) {
		let level = makeLevel(grid.nx, grid.ny, grid.nz);
		this.levels.push(level);
		while (level.nx * level.ny * level.nz > 256) {
			const fx = level.nx % 2 === 0 && level.nx >= 2 ? 2 : 1;
			const fy = level.ny % 2 === 0 && level.ny >= 2 ? 2 : 1;
			const fz = level.nz % 2 === 0 && level.nz >= 2 ? 2 : 1;
			if (fx * fy * fz === 1) break;
			level.fx = fx;
			level.fy = fy;
			level.fz = fz;
			level = makeLevel(level.nx / fx, level.ny / fy, level.nz / fz);
			this.levels.push(level);
		}
		this.boundaryQ = [0, 1, 2, 3, 4, 5].map((s) => new Float32Array(grid.sideSize(s as SideIndex)));
		this.boundaryG = [0, 1, 2, 3, 4, 5].map((s) => new Float32Array(grid.sideSize(s as SideIndex)));
	}

	get fine() {
		return this.levels[0];
	}

	/** Pressure, Pa, in the grid's layout. Kept between steps as the next solve's starting guess. */
	get pressure() {
		return this.levels[0].p;
	}

	/** What an opening passes: speed into the room (m/s) and its slope with respect to outside-minus-inside pressure, for outside-minus-inside pressure `delta`. */
	private static opening(delta: number, rho: number, cd: number, fanSpeed: number, fanRise: number): [number, number] {
		if (fanSpeed === 0 || fanRise <= 0) {
			const speed = cd * Math.sqrt((2 * Math.abs(delta)) / rho) * Math.sign(delta);
			return [speed, (cd * cd) / (rho * Math.max(Math.abs(speed), U_REGULAR))];
		}
		// A window fan: speed follows its curve. An intake fan (positive speed) is helped by a higher outside pressure, an exhaust fan hindered.
		const s = Math.sign(fanSpeed);
		const root = Math.sqrt(Math.max(1 + (s * delta) / fanRise, 0));
		return [fanSpeed * root, Math.abs(fanSpeed) / (2 * fanRise * Math.max(root, STALL))];
	}

	/**
	 * Builds the system for this step: conductances, diagonal and right-hand side on the fine level, and the
	 * coarse operators. `vel` holds the velocity after advection, diffusion and forces, which the projection
	 * makes divergence-free.
	 */
	assemble(dt: number, rho: number, cd: number, geometry: Geometry, exterior: Exterior, vel: Velocity) {
		const { nx, ny, nz, sx, sxy, h } = this.grid;
		const fine = this.levels[0];
		const { au, av, aw, fluid } = geometry;
		const { u, v, w } = vel;
		const { cx, cy, cz, dg, rhs, p } = fine;
		const k = (h * dt) / rho;
		const area = h * h;

		cx.fill(0);
		cy.fill(0);
		cz.fill(0);
		rhs.fill(0);
		for (let kk = 0; kk < nz; kk++)
			for (let j = 0; j < ny; j++) {
				const row = sx * j + sxy * kk;
				for (let i = 0; i < nx; i++) {
					const c = i + row;
					if (!fluid[c]) continue;
					// Faces between two cells.
					if (i > 0) cx[c] = au[c] * k;
					if (j > 0) cy[c] = av[c] * k;
					if (kk > 0) cz[c] = aw[c] * k;
					if (i === nx - 1) cx[c + 1] = 0;
					else cx[c + 1] = au[c + 1] * k;
					if (j === ny - 1) cy[c + sx] = 0;
					else cy[c + sx] = av[c + sx] * k;
					if (kk === nz - 1) cz[c + sxy] = 0;
					else cz[c + sxy] = aw[c + sxy] * k;
					let divergence = 0;
					if (i > 0) divergence -= au[c] * u[c];
					if (i < nx - 1) divergence += au[c + 1] * u[c + 1];
					if (j > 0) divergence -= av[c] * v[c];
					if (j < ny - 1) divergence += av[c + sx] * v[c + sx];
					if (kk > 0) divergence -= aw[c] * w[c];
					if (kk < nz - 1) divergence += aw[c + sxy] * w[c + sxy];
					rhs[c] = -area * divergence;
				}
			}

		// Faces on the box: exterior openings. Linearise the orifice law about the room's pressure now.
		const sides = exterior.sides;
		const openings = (side: SideIndex, open: Float32Array, conductance: Float32Array, faceOf: (a: number, b: number) => number, cellOf: (a: number, b: number) => number, na: number, nb: number) => {
			const data = sides[side];
			const q = this.boundaryQ[side];
			const g = this.boundaryG[side];
			for (let b = 0; b < nb; b++)
				for (let a = 0; a < na; a++) {
					const slot = a + na * b;
					const face = faceOf(a, b);
					const cell = cellOf(a, b);
					q[slot] = 0;
					g[slot] = 0;
					if (open[face] <= 0 || !fluid[cell]) continue;
					const base = 3 * slot;
					const [speed, slope] = PressureSolver.opening(data[base] - p[cell], rho, cd, data[base + 1], data[base + 2]);
					const flowArea = open[face] * area;
					conductance[face] = flowArea * slope;
					q[slot] = speed + slope * p[cell];
					g[slot] = slope;
					rhs[cell] += flowArea * q[slot];
				}
		};
		openings(SIDE.X0, au, cx, (j, kk) => sx * j + sxy * kk, (j, kk) => sx * j + sxy * kk, ny, nz);
		openings(SIDE.X1, au, cx, (j, kk) => nx + sx * j + sxy * kk, (j, kk) => nx - 1 + sx * j + sxy * kk, ny, nz);
		openings(SIDE.Y0, av, cy, (i, kk) => i + sxy * kk, (i, kk) => i + sxy * kk, nx, nz);
		openings(SIDE.Y1, av, cy, (i, kk) => i + sx * ny + sxy * kk, (i, kk) => i + sx * (ny - 1) + sxy * kk, nx, nz);
		openings(SIDE.Z0, aw, cz, (i, j) => i + sx * j, (i, j) => i + sx * j, nx, ny);
		openings(SIDE.Z1, aw, cz, (i, j) => i + sx * j + sxy * nz, (i, j) => i + sx * j + sxy * (nz - 1), nx, ny);

		this.outlet = this.boundaryG.some((side) => side.some((slope) => slope > 0));
		for (let c = 0; c < dg.length; c++) dg[c] = 0;
		this.diagonal(fine);
		for (let l = 0; l + 1 < this.levels.length; l++) this.coarsen(this.levels[l], this.levels[l + 1]);
	}

	/** Diagonal of a level from its conductances. */
	private diagonal(level: Level) {
		const { nx, ny, nz, sx, sxy, cx, cy, cz, dg } = level;
		for (let k = 0; k < nz; k++)
			for (let j = 0; j < ny; j++) {
				const row = sx * j + sxy * k;
				for (let i = 0; i < nx; i++) {
					const c = i + row;
					const sum = cx[c] + cx[c + 1] + cy[c] + cy[c + sx] + cz[c] + cz[c + sxy];
					dg[c] = sum > 0 ? sum * (1 + SHIFT) : 0;
				}
			}
	}

	/** The operator one level up: faces across a coarse interface are summed, interior ones halved for the doubled distance, and opening conductances (which do not depend on distance) are not. */
	private coarsen(fine: Level, coarse: Level) {
		const { fx, fy, fz } = fine;
		const sum = (src: Float32Array, i: number, j: number, k: number, ni: number, nj: number, nk: number) => {
			let total = 0;
			for (let c = 0; c < nk; c++) for (let b = 0; b < nj; b++) for (let a = 0; a < ni; a++) total += src[i + a + fine.sx * (j + b) + fine.sxy * (k + c)];
			return total;
		};
		const { sx, sxy } = coarse;
		for (let k = 0; k < coarse.nz; k++)
			for (let j = 0; j < coarse.ny; j++)
				for (let i = 0; i <= coarse.nx; i++) {
					const interior = i > 0 && i < coarse.nx;
					coarse.cx[i + sx * j + sxy * k] = sum(fine.cx, i * fx, j * fy, k * fz, 1, fy, fz) / (interior ? fx : 1);
				}
		for (let k = 0; k < coarse.nz; k++)
			for (let j = 0; j <= coarse.ny; j++)
				for (let i = 0; i < coarse.nx; i++) {
					const interior = j > 0 && j < coarse.ny;
					coarse.cy[i + sx * j + sxy * k] = sum(fine.cy, i * fx, j * fy, k * fz, fx, 1, fz) / (interior ? fy : 1);
				}
		for (let k = 0; k <= coarse.nz; k++)
			for (let j = 0; j < coarse.ny; j++)
				for (let i = 0; i < coarse.nx; i++) {
					const interior = k > 0 && k < coarse.nz;
					coarse.cz[i + sx * j + sxy * k] = sum(fine.cz, i * fx, j * fy, k * fz, fx, fy, 1) / (interior ? fz : 1);
				}
		coarse.dg.fill(0);
		this.diagonal(coarse);
	}

	/** Red-black Gauss-Seidel: every cell of one colour is updated from the other colour's latest values. */
	private smooth(level: Level, sweeps: number) {
		const { nx, ny, nz, sx, sxy, cx, cy, cz, dg, p, rhs } = level;
		for (let s = 0; s < sweeps; s++)
			for (let colour = 0; colour < 2; colour++)
				for (let k = 0; k < nz; k++) {
					const zm = k > 0;
					const zp = k < nz - 1;
					for (let j = 0; j < ny; j++) {
						const ym = j > 0;
						const yp = j < ny - 1;
						const row = sx * j + sxy * k;
						for (let i = (colour + j + k) & 1; i < nx; i += 2) {
							const c = i + row;
							const d = dg[c];
							if (d <= 0) continue;
							let sum = rhs[c];
							if (i > 0) sum += cx[c] * p[c - 1];
							if (i < nx - 1) sum += cx[c + 1] * p[c + 1];
							if (ym) sum += cy[c] * p[c - sx];
							if (yp) sum += cy[c + sx] * p[c + sx];
							if (zm) sum += cz[c] * p[c - sxy];
							if (zp) sum += cz[c + sxy] * p[c + sxy];
							p[c] = sum / d;
						}
					}
				}
	}

	/** res = rhs − A·p on a level. */
	private residualOf(level: Level) {
		const { nx, ny, nz, sx, sxy, cx, cy, cz, dg, p, rhs, res } = level;
		for (let k = 0; k < nz; k++)
			for (let j = 0; j < ny; j++) {
				const row = sx * j + sxy * k;
				for (let i = 0; i < nx; i++) {
					const c = i + row;
					const d = dg[c];
					if (d <= 0) {
						res[c] = 0;
						continue;
					}
					let sum = d * p[c];
					if (i > 0) sum -= cx[c] * p[c - 1];
					if (i < nx - 1) sum -= cx[c + 1] * p[c + 1];
					if (j > 0) sum -= cy[c] * p[c - sx];
					if (j < ny - 1) sum -= cy[c + sx] * p[c + sx];
					if (k > 0) sum -= cz[c] * p[c - sxy];
					if (k < nz - 1) sum -= cz[c + sxy] * p[c + sxy];
					res[c] = rhs[c] - sum;
				}
			}
	}

	private vcycle(l: number) {
		const level = this.levels[l];
		if (l === this.levels.length - 1) {
			this.smooth(level, this.settings.coarse);
			return;
		}
		const next = this.levels[l + 1];
		this.smooth(level, this.settings.pre);
		this.residualOf(level);
		// Restrict: a coarse cell's residual is the sum over the cells it aggregates.
		next.rhs.fill(0);
		next.p.fill(0);
		const { fx, fy, fz } = level;
		for (let k = 0; k < level.nz; k++)
			for (let j = 0; j < level.ny; j++) {
				const row = level.sx * j + level.sxy * k;
				const coarseRow = next.sx * ((j / fy) | 0) + next.sxy * ((k / fz) | 0);
				for (let i = 0; i < level.nx; i++) next.rhs[((i / fx) | 0) + coarseRow] += level.res[i + row];
			}
		this.vcycle(l + 1);
		// Prolong the correction, the same on every cell of an aggregate.
		for (let k = 0; k < level.nz; k++)
			for (let j = 0; j < level.ny; j++) {
				const row = level.sx * j + level.sxy * k;
				const coarseRow = next.sx * ((j / fy) | 0) + next.sxy * ((k / fz) | 0);
				for (let i = 0; i < level.nx; i++) if (level.dg[i + row] > 0) level.p[i + row] += next.p[((i / fx) | 0) + coarseRow];
			}
		this.smooth(level, this.settings.post);
	}

	/** Runs the V-cycles (or, with `tolerance`, as many as it takes up to `maxCycles`). Returns the relative residual. */
	solve(cycles = this.settings.cycles, tolerance = 0) {
		const fine = this.levels[0];
		const norm = (a: Float32Array) => {
			let s = 0;
			for (let i = 0; i < a.length; i++) s += a[i] * a[i];
			return Math.sqrt(s);
		};
		const reference = norm(fine.rhs);
		for (let n = 0; n < cycles; n++) {
			this.vcycle(0);
			if (tolerance > 0) {
				this.residualOf(fine);
				if (norm(fine.res) <= tolerance * reference) break;
			}
		}
		if (!this.outlet) this.removeMean(fine);
		this.residualOf(fine);
		this.residual = reference > 0 ? norm(fine.res) / reference : 0;
		return this.residual;
	}

	/** Shifts the pressure so its mean over the air is zero. Gradients, and so the flow, do not change. */
	private removeMean(level: Level) {
		const { nx, ny, nz, sx, sxy, dg, p } = level;
		let sum = 0;
		let count = 0;
		for (let k = 0; k < nz; k++)
			for (let j = 0; j < ny; j++)
				for (let i = 0; i < nx; i++) {
					const c = i + sx * j + sxy * k;
					if (dg[c] > 0) {
						sum += p[c];
						count++;
					}
				}
		if (!count) return;
		const mean = sum / count;
		for (let k = 0; k < nz; k++)
			for (let j = 0; j < ny; j++)
				for (let i = 0; i < nx; i++) {
					const c = i + sx * j + sxy * k;
					if (dg[c] > 0) p[c] -= mean;
				}
	}

	/**
	 * Applies the solved pressure: every face between two cells loses the pressure gradient; every exterior
	 * opening takes the speed the linearised law gives for the new pressure; walls stay at zero.
	 */
	project(dt: number, rho: number, geometry: Geometry, vel: Velocity) {
		const { nx, ny, nz, sx, sxy, h } = this.grid;
		const { au, av, aw } = geometry;
		const { u, v, w } = vel;
		const p = this.levels[0].p;
		const k = dt / (rho * h);
		for (let kk = 0; kk < nz; kk++)
			for (let j = 0; j < ny; j++) {
				const row = sx * j + sxy * kk;
				for (let i = 0; i <= nx; i++) {
					const f = i + row;
					if (au[f] <= 0) u[f] = 0;
					else if (i > 0 && i < nx) u[f] -= k * (p[f] - p[f - 1]);
				}
			}
		for (let kk = 0; kk < nz; kk++)
			for (let j = 0; j <= ny; j++) {
				const row = sx * j + sxy * kk;
				for (let i = 0; i < nx; i++) {
					const f = i + row;
					if (av[f] <= 0) v[f] = 0;
					else if (j > 0 && j < ny) v[f] -= k * (p[f] - p[f - sx]);
				}
			}
		for (let kk = 0; kk <= nz; kk++)
			for (let j = 0; j < ny; j++) {
				const row = sx * j + sxy * kk;
				for (let i = 0; i < nx; i++) {
					const f = i + row;
					if (aw[f] <= 0) w[f] = 0;
					else if (kk > 0 && kk < nz) w[f] -= k * (p[f] - p[f - sxy]);
				}
			}
		const settle = (side: SideIndex, open: Float32Array, field: Float32Array, sign: number, faceOf: (a: number, b: number) => number, cellOf: (a: number, b: number) => number, na: number, nb: number) => {
			const q = this.boundaryQ[side];
			const g = this.boundaryG[side];
			for (let b = 0; b < nb; b++)
				for (let a = 0; a < na; a++) {
					const face = faceOf(a, b);
					if (open[face] > 0) field[face] = sign * (q[a + na * b] - g[a + na * b] * p[cellOf(a, b)]);
				}
		};
		settle(SIDE.X0, au, u, 1, (j, kk) => sx * j + sxy * kk, (j, kk) => sx * j + sxy * kk, ny, nz);
		settle(SIDE.X1, au, u, -1, (j, kk) => nx + sx * j + sxy * kk, (j, kk) => nx - 1 + sx * j + sxy * kk, ny, nz);
		settle(SIDE.Y0, av, v, 1, (i, kk) => i + sxy * kk, (i, kk) => i + sxy * kk, nx, nz);
		settle(SIDE.Y1, av, v, -1, (i, kk) => i + sx * ny + sxy * kk, (i, kk) => i + sx * (ny - 1) + sxy * kk, nx, nz);
		settle(SIDE.Z0, aw, w, 1, (i, j) => i + sx * j, (i, j) => i + sx * j, nx, ny);
		settle(SIDE.Z1, aw, w, -1, (i, j) => i + sx * j + sxy * nz, (i, j) => i + sx * j + sxy * (nz - 1), nx, ny);
	}
}
