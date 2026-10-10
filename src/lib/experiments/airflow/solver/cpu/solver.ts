import { Grid } from '../grid';
import {
	DEFAULT_PRESSURE,
	sideConditions,
	type Diagnostics,
	type RoomStats,
	type Slice,
	type Emitter,
	type Exterior,
	type FanDisk,
	type FluidProperties,
	type Geometry,
	type PressureSettings,
	type SideConditions,
	type Sink,
	type SolverConfig,
	type Advection,
	type Turbulence
} from '../types';
import { advectVelocity, type Velocity } from './advect';
import { diffuseVelocity } from './diffuse';
import { applyBuoyancy, applyFans, applyPressureGradient, fanAcceleration } from './forces';
import { PressureSolver } from './pressure';
import { diffusivities, emptyTally, maxCfl, stepScalar, type ScalarSpec } from './scalars';
import { Particles } from './particles';
import { extractSlice, roomStats, samplePoints } from './readouts';
import { eddyViscosity } from './turbulence';

/** Largest cell-crossing count one explicit scalar substep may have. */
const SCALAR_CFL = 0.45;
/** Fraction of the explicit diffusion stability limit a substep may use. */
const DIFFUSION_LIMIT = 0.9;
/**
 * Most scalar substeps one step may take. A real room needs a handful. Past this the flow has run away, and more
 * substeps would only make each step take minutes and freeze the page. The GPU solver has the same cap.
 */
const MAX_SCALAR_SUBSTEPS = 64;

const velocity = (size: number): Velocity => ({ u: new Float32Array(size), v: new Float32Array(size), w: new Float32Array(size) });

export function emptyExterior(grid: Grid): Exterior {
	return {
		sides: [0, 1, 2, 3, 4, 5].map((s) => new Float32Array(3 * grid.sideSize(s as 0))) as Exterior['sides'],
		theta: 0,
		particulates: 0
	};
}

/**
 * The reference implementation of the airflow solver: Fast Fluid Dynamics on a staggered grid. Each step
 *
 *   1. measures the eddy viscosity (a shear-length closure) from the current flow,
 *   2. advects velocity along the flow (semi-Lagrangian with a limited MacCormack correction),
 *   3. adds buoyancy and fan forces,
 *   4. diffuses it (viscosity plus eddy viscosity),
 *   5. projects it to be divergence-free, solving for pressure with multigrid, with exterior openings as
 *      pressure-driven boundaries,
 *   6. transports temperature and particulates through the new flow in conservative substeps.
 *
 * Every kernel works on typed arrays in one shared layout (see grid.ts), so the WebGPU solver can mirror them.
 */
export class CpuSolver {
	readonly grid: Grid;
	readonly fluid: FluidProperties;
	readonly geometry: Geometry;
	readonly sides: SideConditions;
	readonly turbulence: Turbulence;
	readonly advection: Advection;
	readonly pressureSettings: PressureSettings;
	readonly scalarSubstepsOverride?: number;
	readonly maxEddyViscosity: number;

	vel: Velocity;
	/** Eddy viscosity, m²/s. */
	readonly nut: Float32Array;
	/** Temperature above the reference, K. */
	theta: Float32Array;
	/** Particulates, ppm by mass. */
	c: Float32Array;
	readonly pressure: PressureSolver;
	exterior: Exterior;
	fans: FanDisk[] = [];
	/** Flow through each fan's disk as of the last step, m³/s. */
	fanFlow = new Float64Array(0);

	time = 0;
	steps = 0;

	private pred: Velocity;
	private next: Velocity;
	private quantity: Velocity;
	private fanPush = new Float64Array(0);
	private thetaNext: Float32Array;
	private cNext: Float32Array;
	private readonly cu: Float32Array;
	private readonly cv: Float32Array;
	private readonly cw: Float32Array;
	private readonly diffusivity: Float32Array;
	private readonly heatDiffusivity: Float32Array;
	private readonly source: Float32Array;
	private readonly sink: Float32Array;
	/** The pressure the previous step started from, and the mean of it and this step's, which the first half-step applies (see `step`). */
	private readonly previousPressure: Float32Array;
	private readonly startPressure: Float32Array;
	private readonly tally = emptyTally();
	private initialMass = 0;
	private lastCfl = 0;
	private lastDivergence = 0;
	private lastMaxSpeed = 0;
	private substeps = 1;

	constructor(config: SolverConfig) {
		this.grid = new Grid(config.grid);
		this.fluid = config.fluid;
		this.geometry = config.geometry;
		this.sides = sideConditions(config.sides);
		this.turbulence = config.turbulence ?? 'shear-length';
		this.advection = config.advection ?? 'maccormack';
		this.pressureSettings = { ...DEFAULT_PRESSURE, ...config.pressure };
		this.scalarSubstepsOverride = config.scalarSubsteps;
		this.maxEddyViscosity = config.maxEddyViscosity ?? 0.05;
		const size = this.grid.size;
		this.vel = velocity(size);
		this.pred = velocity(size);
		this.next = velocity(size);
		this.quantity = velocity(size);
		const array = () => new Float32Array(size);
		this.nut = array();
		this.theta = array();
		this.c = array();
		this.thetaNext = array();
		this.cNext = array();
		this.cu = array();
		this.cv = array();
		this.cw = array();
		this.diffusivity = array();
		this.heatDiffusivity = array();
		this.source = array();
		this.sink = array();
		this.previousPressure = array();
		this.startPressure = array();
		this.pressure = new PressureSolver(this.grid, this.pressureSettings);
		this.exterior = emptyExterior(this.grid);
	}

	/** The number of cells the air can occupy. */
	get fluidCells() {
		let n = 0;
		const { nx, ny, nz, sx, sxy } = this.grid;
		for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) n += this.geometry.fluid[i + sx * j + sxy * k];
		return n;
	}

	/** Sets every fluid cell's temperature, K above the reference, and every cell's particulates. */
	fill(theta: number, particulates = 0) {
		const { nx, ny, nz, sx, sxy } = this.grid;
		this.theta.fill(0);
		this.c.fill(0);
		for (let k = 0; k < nz; k++)
			for (let j = 0; j < ny; j++)
				for (let i = 0; i < nx; i++) {
					const cell = i + sx * j + sxy * k;
					if (!this.geometry.fluid[cell]) continue;
					this.theta[cell] = theta;
					this.c[cell] = particulates;
				}
		this.initialMass = this.airborneMass();
	}

	/** Particulate mass in the air, mg. */
	airborneMass() {
		const { nx, ny, nz, sx, sxy } = this.grid;
		let sum = 0;
		for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) sum += this.c[i + sx * j + sxy * k];
		return sum * this.grid.cellVolume * this.fluid.rho;
	}

	setFans(fans: FanDisk[]) {
		this.fans = fans;
		this.fanFlow = new Float64Array(fans.length);
		this.fanPush = new Float64Array(fans.length);
	}

	/** Replaces every emitter. The solver turns each into a per-cell rate in ppm per second. */
	setEmitters(emitters: Emitter[]) {
		this.source.fill(0);
		const air = this.grid.cellVolume * this.fluid.rho;
		for (const emitter of emitters)
			for (let n = 0; n < emitter.cells.length; n++) this.source[emitter.cells[n]] += (emitter.rate * emitter.share[n]) / air;
	}

	/** Replaces every sink. */
	setSinks(sinks: Sink[]) {
		this.sink.fill(0);
		const volume = this.grid.cellVolume;
		for (const sink of sinks) for (let n = 0; n < sink.cells.length; n++) this.sink[sink.cells[n]] += (sink.cadr * sink.share[n]) / volume;
	}

	/** Advances the flow, temperature and particulates by `dt` seconds. */
	step(dt: number) {
		const { grid, fluid, geometry } = this;
		const nuMax = this.nuMax();

		// 1. Eddy viscosity from the flow as it stands.
		eddyViscosity(grid, geometry, this.vel, { coefficient: this.turbulence === 'none' ? 0 : fluid.shearCoefficient, maxLength: fluid.maxLength }, this.maxEddyViscosity, this.nut, this.cu, this.cv, this.cw);

		// 2. Advection, second-order in time: the carried velocity includes half a step of everything that pushes
		// on it (last step's pressure gradient, buoyancy, fans) and the other half is added after. Without this the
		// advect-then-project splitting loses energy in proportion to dt, as if the air were more viscous.
		const half = dt / 2;
		const { quantity } = this;
		quantity.u.set(this.vel.u);
		quantity.v.set(this.vel.v);
		quantity.w.set(this.vel.w);
		// The pressure for this first half is the mean of the last two solves, not the last one alone. Half old,
		// half new pressure has a mode that alternates sign every step and cancels in the velocity, so nothing damps
		// it; with a solve cut off after a few V-cycles it grows (the one-bedroom plan blew up this way). The mean
		// cancels it, and a steady pressure is unchanged.
		const latest = this.pressure.pressure;
		if (this.steps === 0) this.previousPressure.set(latest);
		for (let i = 0; i < latest.length; i++) this.startPressure[i] = 0.5 * (latest[i] + this.previousPressure[i]);
		this.previousPressure.set(latest);
		applyPressureGradient(grid, geometry, this.startPressure, quantity, half / (fluid.rho * grid.h));
		applyBuoyancy(grid, geometry, this.theta, quantity.v, half, fluid.g, fluid.beta);
		if (this.fans.length) {
			fanAcceleration(grid, this.fans, this.vel, fluid.rho, this.fanFlow, this.fanPush);
			applyFans(this.fans, this.fanPush, quantity, half);
		}
		advectVelocity(grid, dt, this.vel, quantity, this.pred, this.next, geometry, this.advection === 'maccormack');
		[this.vel, this.next] = [this.next, this.vel];

		// 3. The other half of the forces.
		applyBuoyancy(grid, geometry, this.theta, this.vel.v, half, fluid.g, fluid.beta);
		if (this.fans.length) applyFans(this.fans, this.fanPush, this.vel, half);

		// 4. Diffusion, in as many substeps as keep the explicit scheme stable.
		const substeps = Math.max(1, Math.ceil((6 * nuMax * dt) / (grid.h * grid.h * DIFFUSION_LIMIT)));
		for (let s = 0; s < substeps; s++) {
			diffuseVelocity(grid, geometry, this.sides, fluid.nu, this.nut, dt / substeps, this.vel, this.next);
			[this.vel, this.next] = [this.next, this.vel];
		}

		// 5. Projection.
		// The pressure takes the second half of the step (the first half was applied before advection).
		this.pressure.assemble(half, fluid.rho, fluid.cd, geometry, this.exterior, this.vel);
		this.pressure.solve();
		this.pressure.project(half, fluid.rho, geometry, this.vel);

		// 6. Scalars.
		this.transport(dt);

		this.time += dt;
		this.steps++;
		this.measure(dt);
	}

	private nuMax() {
		return this.fluid.nu + (this.turbulence === 'none' ? 0 : this.maxEddyViscosity);
	}

	private transport(dt: number) {
		const { grid, fluid, geometry, exterior } = this;
		const heat: ScalarSpec = {
			molecular: fluid.alpha,
			turbulent: fluid.prT,
			mixing: fluid.mixing,
			inflow: exterior.theta,
			settling: 0,
			deposition: 0,
			wall: this.sides.map((side) => side.theta)
		};
		const smoke: ScalarSpec = {
			molecular: fluid.particleDiffusivity,
			turbulent: fluid.scT,
			mixing: fluid.mixing,
			inflow: exterior.particulates,
			settling: fluid.settling,
			deposition: fluid.deposition,
			source: this.source,
			sink: this.sink
		};
		const cfl = maxCfl(grid, geometry, this.vel, dt, fluid.settling);
		const diffusive = (6 * (Math.max(fluid.alpha, fluid.particleDiffusivity, this.nuMax() / Math.min(fluid.prT, fluid.scT)) + fluid.mixing) * dt) / (grid.h * grid.h);
		this.substeps = this.scalarSubstepsOverride ?? Math.min(MAX_SCALAR_SUBSTEPS, Math.max(1, Math.ceil(Math.max(cfl / SCALAR_CFL, diffusive / DIFFUSION_LIMIT))));
		const dtau = dt / this.substeps;
		diffusivities(grid, geometry, this.nut, heat, this.heatDiffusivity);
		diffusivities(grid, geometry, this.nut, smoke, this.diffusivity);
		for (let s = 0; s < this.substeps; s++) {
			stepScalar(grid, geometry, this.vel, this.heatDiffusivity, heat, this.theta, this.thetaNext, dtau);
			[this.theta, this.thetaNext] = [this.thetaNext, this.theta];
			stepScalar(grid, geometry, this.vel, this.diffusivity, smoke, this.c, this.cNext, dtau, this.tally);
			[this.c, this.cNext] = [this.cNext, this.c];
		}
	}

	/** Diagnostics that need a pass over the field: speed, divergence, and the cell-crossing count. */
	private measure(dt: number) {
		const { nx, ny, nz, sx, sxy, h } = this.grid;
		const { u, v, w } = this.vel;
		const { fluid, au, av, aw } = this.geometry;
		let fastest = 0;
		let squares = 0;
		let sumSquares = 0;
		let cells = 0;
		for (let k = 0; k < nz; k++)
			for (let j = 0; j < ny; j++)
				for (let i = 0; i < nx; i++) {
					const c = i + sx * j + sxy * k;
					if (!fluid[c]) continue;
					const net = au[c + 1] * u[c + 1] - au[c] * u[c] + av[c + sx] * v[c + sx] - av[c] * v[c] + aw[c + sxy] * w[c + sxy] - aw[c] * w[c];
					sumSquares += net * net;
					cells++;
					const fast = Math.max(Math.abs(u[c]), Math.abs(u[c + 1]), Math.abs(v[c]), Math.abs(v[c + sx]), Math.abs(w[c]), Math.abs(w[c + sxy]));
					if (fast > fastest) fastest = fast;
					const cu = 0.5 * (u[c] + u[c + 1]);
					const cv = 0.5 * (v[c] + v[c + sx]);
					const cw = 0.5 * (w[c] + w[c + sxy]);
					squares += cu * cu + cv * cv + cw * cw;
				}
		this.lastMaxSpeed = fastest;
		// `net` is a speed (face fraction times face speed, summed over faces): the cell's divergence times h.
		const reference = Math.max(Math.sqrt(squares / Math.max(cells, 1)), 0.01);
		this.lastDivergence = cells ? Math.sqrt(sumSquares / cells) / reference : 0;
		this.lastCfl = (fastest * dt) / h;
	}

	/** The layer of cells at height `y`. */
	slice(y: number): Slice {
		return extractSlice(this.grid, this.geometry, this.vel, this.theta, this.c, y);
	}

	/** Velocity, temperature and particulates at points (x, y, z in metres, three numbers each); see POINT_FIELDS. */
	sample(points: Float32Array) {
		return samplePoints(this.grid, this.vel, this.theta, this.c, points);
	}

	rooms(): RoomStats[] {
		return roomStats(this.grid, this.geometry, this.vel, this.theta, this.c);
	}

	/** The dots that show the flow. Call `particles.step` once per frame with the real elapsed time. */
	makeParticles(tracers: number, smoke: number, seed?: number) {
		return new Particles(this.grid, this.geometry, tracers, smoke, seed);
	}

	/** What the run looks like right now. */
	diagnostics(): Diagnostics {
		const rho = this.fluid.rho;
		const t = this.tally;
		return {
			time: this.time,
			steps: this.steps,
			maxSpeed: this.lastMaxSpeed,
			divergence: this.lastDivergence,
			cfl: this.lastCfl,
			mass: {
				initial: this.initialMass,
				emitted: t.emitted * rho,
				inflow: t.inflow * rho,
				outflow: t.outflow * rho,
				removed: t.removed * rho,
				deposited: t.deposited * rho,
				inAir: this.airborneMass()
			}
		};
	}
}
