import { CpuSolver } from '../../src/lib/experiments/airflow/solver/cpu/solver';
import { rasterizeFan } from '../../src/lib/experiments/airflow/solver/fan';
import { boxGeometry } from '../../src/lib/experiments/airflow/solver/geometry';
import type { Grid } from '../../src/lib/experiments/airflow/solver/grid';
import { AIR, type FluidProperties, type SideCondition } from '../../src/lib/experiments/airflow/solver/types';

/** The benchmark and invariant scenarios: each builds a solver ready to run, plus what is needed to measure it. */

/** Advances `seconds` of simulated time in steps of at most `dt`, calling `each` after every step. */
export function advance(solver: CpuSolver, seconds: number, dt: number, each?: (time: number) => void) {
	let time = 0;
	while (time < seconds - 1e-9) {
		const step = Math.min(dt, seconds - time);
		solver.step(step);
		time += step;
		each?.(time);
	}
}

/** Opens every face of one side of the box (a window the size of the wall): a boundary at fixed outside pressure. */
export function openSide(solver: CpuSolver, side: 0 | 1 | 2 | 3 | 4 | 5) {
	const { nx, ny, nz, sx, sxy } = solver.grid;
	const { au, av, aw } = solver.geometry;
	if (side < 2) for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) au[(side === 0 ? 0 : nx) + sx * j + sxy * k] = 1;
	else if (side < 4) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) av[i + (side === 2 ? 0 : sx * ny) + sxy * k] = 1;
	else for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) aw[i + sx * j + (side === 4 ? 0 : sxy * nz)] = 1;
}

const WALL: SideCondition = { slip: 'no-slip' };
const SLIP: SideCondition = { slip: 'free-slip' };

/** A unit square cavity, lid sliding at 1, kinematic viscosity 1e-3: Reynolds number 1000. Two cells thick in z is not needed: the z sides are free-slip, so it is two-dimensional. */
export function lidDrivenCavity(n: number) {
	const h = 1 / n;
	const solver = new CpuSolver({
		grid: { nx: n, ny: n, nz: 1, h },
		fluid: { ...AIR, rho: 1, nu: 1e-3, beta: 0 },
		geometry: boxGeometry({ nx: n, ny: n, nz: 1, h }),
		sides: [WALL, WALL, WALL, { slip: 'no-slip', velocity: [1, 0, 0] }, SLIP, SLIP],
		turbulence: 'none',
		pressure: { cycles: 4, pre: 2, post: 2, coarse: 30 }
	});
	solver.fill(0);
	return solver;
}

/**
 * u(y) along x = 0.5 and v(x) along y = 0.5 of a cavity solution, linearly interpolated from the staggered
 * faces at the given coordinates (the line x = 0.5 is exactly a column of u faces).
 */
export function cavityCenterlines(solver: CpuSolver, ys: number[], xs: number[]) {
	const { nx, ny, sx, h } = solver.grid;
	const at = (g: number, count: number, read: (index: number) => number) => {
		const lattice = Math.max(0, Math.min(count - 1, g));
		const i = Math.min(count - 2, Math.floor(lattice));
		const f = lattice - i;
		return read(i) * (1 - f) + read(i + 1) * f;
	};
	return {
		u: ys.map((y) => at(y / h - 0.5, ny, (j) => solver.vel.u[nx / 2 + sx * j])),
		v: xs.map((x) => at(x / h - 0.5, nx, (i) => solver.vel.v[i + sx * (ny / 2)]))
	};
}

/**
 * A unit square cavity heated from the left and cooled from the right, in units where g·β·ΔT·H³ = 1, so
 * Ra = 1/(ν·α) and Pr = ν/α. Velocities come out scaled by α/H when divided by `alpha`.
 */
export function heatedCavity(rayleigh: number, n: number, prandtl = 0.71) {
	const h = 1 / n;
	const alpha = 1 / Math.sqrt(rayleigh * prandtl);
	const nu = prandtl * alpha;
	const solver = new CpuSolver({
		grid: { nx: n, ny: n, nz: 1, h },
		fluid: { ...AIR, rho: 1, nu, alpha, beta: 1, g: 1 },
		geometry: boxGeometry({ nx: n, ny: n, nz: 1, h }),
		sides: [{ slip: 'no-slip', theta: 0.5 }, { slip: 'no-slip', theta: -0.5 }, WALL, WALL, SLIP, SLIP],
		turbulence: 'none',
		pressure: { cycles: 4, pre: 2, post: 2, coarse: 30 }
	});
	solver.fill(0);
	return { solver, alpha };
}

/** Average Nusselt number on the hot wall from the first cell's temperature: heat flux (θ_wall − θ_cell)/(h/2) in units of ΔT/H. */
export function hotWallNusselt(solver: CpuSolver) {
	const { ny, sx, h } = solver.grid;
	let sum = 0;
	for (let j = 0; j < ny; j++) sum += (0.5 - solver.theta[sx * j]) / (h / 2);
	return sum / ny;
}

/** Maximum u along x = 0.5 and v along y = 0.5, with where they are, as the benchmark tables give them. */
export function cavityPeaks(solver: CpuSolver) {
	const { nx, ny, sx, h } = solver.grid;
	let u = { value: -Infinity, at: 0 };
	let v = { value: -Infinity, at: 0 };
	for (let j = 0; j < ny; j++) {
		const value = solver.vel.u[nx / 2 + sx * j];
		if (value > u.value) u = { value, at: (j + 0.5) * h };
	}
	for (let i = 0; i < nx; i++) {
		const value = solver.vel.v[i + sx * (ny / 2)];
		if (value > v.value) v = { value, at: (i + 0.5) * h };
	}
	return { u, v };
}

export interface Opening {
	/** Which wall the opening is in: 0 for the -x wall, 1 for the +x wall. */
	side: 0 | 1;
	/** Its first cell row (height) and first cell column (z), and its size in cells. */
	j: number;
	k: number;
	rows: number;
	columns: number;
}

/** Cuts openings into the ±x walls of a solver's box and returns the faces, so a test can add outside pressure and read the flow. */
export function cutOpenings(solver: CpuSolver, openings: Opening[]) {
	const { nx, sx, sxy } = solver.grid;
	const faces: { side: 0 | 1; slot: number; face: number; y: number }[] = [];
	for (const o of openings)
		for (let dj = 0; dj < o.rows; dj++)
			for (let dk = 0; dk < o.columns; dk++) {
				const j = o.j + dj;
				const k = o.k + dk;
				const face = (o.side === 0 ? 0 : nx) + sx * j + sxy * k;
				solver.geometry.au[face] = 1;
				faces.push({ side: o.side, slot: j + solver.grid.ny * k, face, y: (j + 0.5) * solver.grid.h });
			}
	return faces;
}

/** Flow, m³/s, in through the -x openings and out through the +x ones. */
export function openingFlows(solver: CpuSolver, faces: ReturnType<typeof cutOpenings>) {
	const area = solver.grid.h * solver.grid.h;
	let into = 0;
	let out = 0;
	for (const f of faces) {
		const q = solver.vel.u[f.face] * area * solver.geometry.au[f.face];
		if (f.side === 0) into += q;
		else out += q;
	}
	return { into, out };
}

/**
 * A 3 m cube of warm air with a 0.6 m square opening low in the -x wall and another high in the +x wall,
 * cold outside: the stack effect. The cold outside air is lighter or heavier than the room's, which shows up as
 * a hydrostatic offset of the pressure outside each opening. With `isothermal` the air coming in is the room's own
 * temperature, so only the pressure boundary is under test; without it the cold air pools on the floor.
 */
export function stackRoom(h: number, isothermal: boolean) {
	const n = Math.round(3 / h);
	const room = 293.15;
	const outside = 273.15;
	const fluid: FluidProperties = { ...AIR, beta: 1 / room, cd: 0.62 };
	const geometry = boxGeometry({ nx: n, ny: n, nz: n, h });
	const solver = new CpuSolver({ grid: { nx: n, ny: n, nz: n, h }, fluid, geometry });
	const span = Math.round(0.6 / h);
	const low = Math.round(0.15 / h);
	const high = Math.round(2.25 / h);
	const k = Math.round((n - span) / 2);
	const faces = cutOpenings(solver, [
		{ side: 0, j: low, k, rows: span, columns: span },
		{ side: 1, j: high, k, rows: span, columns: span }
	]);
	solver.exterior.theta = isothermal ? 0 : outside - room;
	for (const f of faces) solver.exterior.sides[f.side][3 * f.slot] = fluid.rho * fluid.g * fluid.beta * (outside - room) * f.y;
	solver.fill(0);
	const area = span * span * h * h;
	const effective = area / Math.SQRT2;
	// Q = Cd·A_eff·√(2·g·H·(Ti − To)/Ti), H the height between the openings' centres.
	const analytic = fluid.cd * effective * Math.sqrt((2 * fluid.g * (2.55 - 0.45) * (room - outside)) / room);
	return { solver, faces, analytic };
}

/**
 * The same cube with openings at the same height on opposite walls and a pressure difference between them:
 * Q = Cd·A_eff·√(2·ΔP/ρ) with the two openings in series.
 */
export function windRoom(h: number, windward: number, leeward: number) {
	const n = Math.round(3 / h);
	const fluid: FluidProperties = { ...AIR, beta: 0, cd: 0.62 };
	const geometry = boxGeometry({ nx: n, ny: n, nz: n, h });
	const solver = new CpuSolver({ grid: { nx: n, ny: n, nz: n, h }, fluid, geometry });
	const span = Math.round(0.6 / h);
	const row = Math.round(0.9 / h);
	const k = Math.round((n - span) / 2);
	const faces = cutOpenings(solver, [
		{ side: 0, j: row, k, rows: span, columns: span },
		{ side: 1, j: row, k, rows: span, columns: span }
	]);
	for (const f of faces) solver.exterior.sides[f.side][3 * f.slot] = f.side === 0 ? windward : leeward;
	solver.fill(0);
	const area = span * span * h * h;
	const analytic = fluid.cd * (area / Math.SQRT2) * Math.sqrt((2 * (windward - leeward)) / fluid.rho);
	return { solver, faces, analytic, area, volume: n * n * n * h * h * h };
}

/**
 * A closed-in 3 × 3 × 2.4 m room (cells 0.15 m: a grid whose dimensions the multigrid can coarsen, as a plan's are padded to) with two openings, a purifier inlet in the middle and particulates on every
 * surface, in which the particulates are held well mixed by a large eddy diffusivity (a room's real mixing is
 * what the other benchmarks test): the box model dC/dt = −(Q/V + CADR/V + v_d·A/V)·C.
 */
export function mixedRoom(options: { h: number; pressure: number; cadr: number; deposition: number; diffusivity: number }) {
	const { h } = options;
	const [length, width, height] = [3, 3, 2.4];
	const [nx, ny, nz] = [Math.round(length / h), Math.round(height / h), Math.round(width / h)];
	const fluid: FluidProperties = { ...AIR, beta: 0, cd: 0.62, deposition: options.deposition, particleDiffusivity: options.diffusivity };
	const geometry = boxGeometry({ nx, ny, nz, h });
	const solver = new CpuSolver({ grid: { nx, ny, nz, h }, fluid, geometry });
	const span = Math.round(0.6 / h);
	const faces = cutOpenings(solver, [
		{ side: 0, j: Math.round(0.9 / h), k: Math.round((nz - span) / 2), rows: span, columns: span },
		{ side: 1, j: Math.round(0.9 / h), k: Math.round((nz - span) / 2), rows: span, columns: span }
	]);
	for (const f of faces) solver.exterior.sides[f.side][3 * f.slot] = f.side === 0 ? options.pressure : -options.pressure;
	solver.fill(0, 100);
	const g = solver.grid;
	const inlet: number[] = [];
	for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) inlet.push(Math.round(nx / 2) + a + g.sx * (3 + b) + g.sxy * (Math.round(nz / 2) + c));
	solver.setSinks([{ cells: Uint32Array.from(inlet), share: new Float32Array(inlet.length).fill(1 / inlet.length), cadr: options.cadr }]);
	const openingArea = span * span * h * h;
	return {
		solver,
		faces,
		volume: length * width * height,
		/** Surface that collects deposition: the walls, floor and ceiling less the two openings. */
		surface: 2 * (length * width + length * height + width * height) - 2 * openingArea,
		openingArea
	};
}

export interface JetSetup {
	solver: CpuSolver;
	/** The fan's disk diameter, m, its rated flow, m³/s, and the mean speed through the disk at that flow, m/s. */
	diameter: number;
	rated: number;
	diskSpeed: number;
	/** Where the fan sits along the box, m. */
	origin: number;
	grid: Grid;
}

/**
 * A fan disk blowing along +x in a large box that is open to still air on all six sides, so the jet and the
 * air it entrains meet no wall. Calibrated the way a fan device is: the free-delivery flow is solved so that the
 * flow through the disk in open air equals the rated flow, given that a disk pushing air from rest loses a
 * fraction of its pressure rise to the wake's kinetic energy.
 */
export function freeJet(options: { h: number; diameter?: number; rated?: number; width?: number }): JetSetup {
	const { h } = options;
	const diameter = options.diameter ?? 0.4;
	const rated = options.rated ?? 0.5;
	const width = options.width ?? 3.2;
	const length = 8;
	const [nx, ny, nz] = [Math.round(length / h), Math.round(width / h), Math.round(width / h)];
	const fluid: FluidProperties = { ...AIR, beta: 0, cd: 0.62 };
	const geometry = boxGeometry({ nx, ny, nz, h });
	const solver = new CpuSolver({ grid: { nx, ny, nz, h }, fluid, geometry, pressure: { cycles: 3, pre: 2, post: 2, coarse: 30 } });
	for (const side of [0, 1, 2, 3, 4, 5] as const) openSide(solver, side);
	solver.fill(0);
	const area = (Math.PI * diameter * diameter) / 4;
	const diskSpeed = rated / area;
	// A disk in open air delivers the flow at which its pressure rise equals KAPPA·ρ·U²: KAPPA is how much of a rise the wake's kinetic energy takes (about 2 for an ideal disk, less for a real, resolved one).
	const KAPPA = 1.6;
	const rise = 2 * KAPPA * fluid.rho * diskSpeed * diskSpeed;
	const qMax = rated / Math.sqrt(1 - (KAPPA * fluid.rho * diskSpeed * diskSpeed) / rise);
	const origin = 0.8;
	solver.setFans([rasterizeFan(solver.grid, geometry, { center: [origin, (ny * h) / 2, (nz * h) / 2], normal: [1, 0, 0], radius: diameter / 2, thickness: 0.1, qMax, dpMax: rise })]);
	return { solver, diameter, rated, diskSpeed, origin, grid: solver.grid };
}

/** Speed along the jet's axis, m/s, at `distance` metres past the fan: the mean of the four faces around the axis. */
export function jetCenterline(jet: JetSetup, distance: number) {
	const { nx, ny, nz, sx, sxy, h } = jet.grid;
	const i = Math.min(nx - 1, Math.round((jet.origin + distance) / h));
	let sum = 0;
	for (const dj of [-1, 0]) for (const dk of [-1, 0]) sum += jet.solver.vel.u[i + sx * (ny / 2 + dj) + sxy * (nz / 2 + dk)];
	return sum / 4;
}
