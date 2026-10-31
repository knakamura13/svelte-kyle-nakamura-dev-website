import type { GridSpec } from './grid';

/**
 * What a solver backend is told and what it reports. The CPU reference (cpu/) defines the behavior;
 * the WebGPU backend (gpu/) implements the same algorithm kernel for kernel and is tested against it.
 * SI units throughout, with two exceptions: particulates are in ppm by mass (mg of particles per kg of
 * air) and temperature is carried as `theta`, kelvin above the reference temperature.
 */

export interface FluidProperties {
	/** Air density, kg/m³. Constant: this is a Boussinesq solver. */
	rho: number;
	/** Laminar kinematic viscosity, m²/s. */
	nu: number;
	/** Laminar thermal diffusivity, m²/s. */
	alpha: number;
	/** Thermal expansion coefficient, 1/K. Zero switches buoyancy off. */
	beta: number;
	/** Gravity, m/s². */
	g: number;
	/**
	 * The turbulence closure: eddy viscosity is `shearCoefficient` times the local speed times the shear length
	 * V/|S|, which is the width of whatever jet or plume the air is in, capped at `maxLength` m (the size of a room).
	 * It depends on neither the grid nor the distance to a wall.
	 */
	shearCoefficient: number;
	maxLength: number;
	/** Turbulent Prandtl and Schmidt numbers: eddy viscosity divided by these gives the eddy diffusivities. */
	prT: number;
	scT: number;
	/**
	 * Background mixing of temperature and particulates, m²/s, added to their diffusivity everywhere. It stands for the
	 * weak room-scale convection real rooms always have (people, appliances, sunlit surfaces, small temperature differences)
	 * and this model has no sources of: without it, smoke released in still air would never spread from its cell. About
	 * 0.005 mixes a closed room of a few metres in tens of minutes, as measured. Laminar benchmarks set it to zero.
	 */
	mixing: number;
	/** Particulate: molecular diffusivity, still-air settling speed and surface deposition speed, all m/s or m²/s. */
	particleDiffusivity: number;
	settling: number;
	deposition: number;
	/** Discharge coefficient of an exterior opening, which turns its open area and pressure difference into flow. */
	cd: number;
}

/** Air at 20 °C and 1 atm, with the closure constants the free-jet benchmark settled on (see docs/plans/2026-10-07-airflow-experiment.md). */
export const AIR: FluidProperties = {
	rho: 1.204,
	nu: 1.516e-5,
	alpha: 2.14e-5,
	beta: 1 / 293.15,
	g: 9.80665,
	shearCoefficient: 0.015,
	maxLength: 0.5,
	prT: 0.85,
	scT: 0.7,
	mixing: 0.005,
	particleDiffusivity: 0,
	settling: 0,
	deposition: 0,
	cd: 0.62
};

export type Slip = 'no-slip' | 'free-slip';

/** How one side of the box treats air at the wall. */
export interface SideCondition {
	slip: Slip;
	/** Tangential velocity of the wall, m/s, for a moving lid. Defaults to a still wall. */
	velocity?: [number, number, number];
	/** Fixed wall temperature, K above the reference. Absent means adiabatic, like every wall of a home. */
	theta?: number;
}

/** -x, +x, -y, +y, -z, +z. */
export type SideConditions = [SideCondition, SideCondition, SideCondition, SideCondition, SideCondition, SideCondition];

/** Where air can go, as the solver sees the home. Every array uses the padded layout of grid.ts. */
export interface Geometry {
	/** 1 for a cell the air can occupy, 0 for solid (furniture, space outside the plan). */
	fluid: Uint8Array;
	/** The fraction of each face air can pass through: 0 for a wall, 1 for open, in between for a part-open door or window. */
	au: Float32Array;
	av: Float32Array;
	aw: Float32Array;
	/** Which room each cell is in, 1-based. 0 for none. */
	room: Uint8Array;
	/** How many rooms there are. */
	rooms: number;
}

/**
 * Outdoors. Nothing outside the box is simulated: an opening in a wall of the box is a face where the
 * outside pressure, and for a window fan the fan's curve, meet the room's own pressure.
 */
export interface Exterior {
	/**
	 * For each side of the box, three values per face on that side (faces numbered as in Grid.sideSize,
	 * first coordinate fastest): the pressure outside the face, Pa; a window fan's free-delivery speed into
	 * the room, m/s (0 for a plain opening, negative for an exhaust fan); and the fan's shut-off pressure
	 * rise, Pa. Faces with no opening are ignored.
	 */
	sides: [Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array];
	/** Outdoor air temperature in K above the reference. Air coming in through an opening carries it. */
	theta: number;
	/** Outdoor particulates, ppm by mass. */
	particulates: number;
}

/**
 * A fan: a disk of body force with a fan curve, so the flow falls as back-pressure rises. The host rasterizes
 * the disk, so the solver knows nothing about how it is shaped or aimed.
 */
export interface FanDisk {
	/** The cells that make up the disk, and each one's weight (its share of the disk): used to measure the flow through it. */
	cells: Uint32Array;
	cellWeight: Float32Array;
	/** The faces that push, as index into that axis's face array, with the weight of the push on each. */
	faceAxis: Uint8Array;
	faceIndex: Uint32Array;
	/** Includes the disk normal's component on the face's axis and half of each of the two neighbouring cells' weights. */
	faceWeight: Float32Array;
	/** Unit vector the fan blows along. */
	normal: [number, number, number];
	/** Swept area, m². */
	area: number;
	/** Flow with no back-pressure, m³/s, and pressure rise with no flow, Pa. Both are zero when the fan is off. */
	qMax: number;
	dpMax: number;
}

/** Releases particulates at a place: mass spread over cells by share (the shares add up to 1). */
export interface Emitter {
	cells: Uint32Array;
	share: Float32Array;
	/** Mass released, mg of particles per second. */
	rate: number;
}

/** Removes particulates at a place, like an air purifier's inlet: `cadr` m³/s of air is cleaned, spread over cells by share. */
export interface Sink {
	cells: Uint32Array;
	share: Float32Array;
	cadr: number;
}

export interface MassBalance {
	/** Particulate mass in mg, cumulative since the run began: released, taken in and carried out through openings, removed by purifiers, deposited on surfaces. */
	emitted: number;
	inflow: number;
	outflow: number;
	removed: number;
	deposited: number;
	/** Particulate mass in the air right now, mg. At every moment: initial + emitted + inflow = inAir + outflow + removed + deposited. */
	inAir: number;
	initial: number;
}

export interface Diagnostics {
	/** Simulated seconds and steps since the run began. */
	time: number;
	steps: number;
	/** Fastest air in the box, m/s. */
	maxSpeed: number;
	/** How far the flow is from incompressible after the last pressure solve: the rms of the net flow out of a cell, as a fraction of the flow the cell's faces carry. */
	divergence: number;
	/** The largest number of cells any air crossed in one step. */
	cfl: number;
	mass: MassBalance;
}

/** The closure is off for laminar benchmarks (a lid-driven cavity at Re 1000 has no turbulence to model) and on for rooms. */
/** One horizontal layer of the box, as the cell-centred values the heatmap and the hover readout read. All arrays are nx × nz, x fastest. */
export interface Slice {
	nx: number;
	nz: number;
	/** Cell size, m. */
	h: number;
	/** Height the slice was cut at, m, snapped to the middle of a cell layer. */
	y: number;
	/** Air velocity components, m/s, and speed. */
	u: Float32Array;
	v: Float32Array;
	w: Float32Array;
	speed: Float32Array;
	/** Temperature above the reference, K; particulates, ppm by mass. */
	theta: Float32Array;
	particulates: Float32Array;
	/** 1 where there is air at this height, 0 where there is furniture or space outside the plan. */
	fluid: Uint8Array;
}

/** Values at a point, in the order of `POINT_FIELDS`. */
export const POINT_FIELDS = ['u', 'v', 'w', 'theta', 'particulates'] as const;

export interface RoomStats {
	/** Room volume, m³; mean speed, m/s; mean temperature above the reference, K; mean particulates, ppm. */
	volume: number;
	speed: number;
	theta: number;
	particulates: number;
	/** Air entering the room across every opening and doorway, m³/s, and that as air changes per hour. */
	inflow: number;
	changesPerHour: number;
}

export type Turbulence = 'shear-length' | 'none';

/** Plain semi-Lagrangian advection is stable but smears the flow; the MacCormack correction removes most of that. */
export type Advection = 'maccormack' | 'semi-lagrangian';

export interface PressureSettings {
	/** V-cycles per step. */
	cycles: number;
	/** Gauss-Seidel sweeps before and after each correction on every level but the coarsest, and on the coarsest. */
	pre: number;
	post: number;
	coarse: number;
}

export interface SolverConfig {
	grid: GridSpec;
	fluid: FluidProperties;
	geometry: Geometry;
	/** Per side (-x, +x, -y, +y, -z, +z); a side left out, or undefined, is a still, no-slip, adiabatic wall. */
	sides?: (SideCondition | undefined)[];
	turbulence?: Turbulence;
	advection?: Advection;
	pressure?: Partial<PressureSettings>;
	/** Substeps for scalar transport. Absent: as many as keep every cell under the CFL limit. */
	scalarSubsteps?: number;
	/** Largest eddy viscosity allowed, m²/s. */
	maxEddyViscosity?: number;
}

/**
 * Three V-cycles. The number is a matter of accuracy, not of safety: with the Galerkin coarse operator (see
 * `PressureSolver`) the solve is stable at any cycle count, where the earlier operator ran away at three and five
 * cycles and not at four and six. The residual falls only 0.7 to 0.97 per cycle on the plans, because aggregates
 * straddle thin walls, so more cycles buy accuracy slowly (two cycles at a cell size of 0.15 m leave a divergence
 * about three times that of three); a faster solve would need aggregates that follow the walls, or conjugate gradients.
 */
export const DEFAULT_PRESSURE: PressureSettings = { cycles: 3, pre: 2, post: 2, coarse: 24 };

/**
 * How far the MacCormack correction of the velocity advection may move a value away from the semi-Lagrangian one, as a
 * share of the way to the extremes of the eight values it was interpolated from: 1 is the plain clamp of Selle et al.
 * (2008), and a smaller share bounds the correction more tightly. The correction restores what the semi-Lagrangian step
 * smears, but on noise at the scale of the grid (waves two or three cells long) its estimate of the error is large and
 * wrong, and with the plain clamp it feeds that noise: in a sealed, isothermal room whose fan had stopped, the kinetic
 * energy fell and then grew back to more than the running fan had given it, 97 % of it at the grid scale, which showed as
 * an even blotchy circulation that nothing drove (`tests/solver/decay.spec.ts`). At 0.6 the room comes to rest, and the
 * benchmarks that are smooth flows (the cavities, the particulate decay) are unchanged to a few thousandths; a jet loses
 * a little more than before. Both backends read this: `cpu/advect.ts` and `gpu/shaders/flow.ts`.
 */
export const ADVECTION_LIMIT = 0.6;

/** Fills in the sides a caller left out: still, no-slip, adiabatic. */
export function sideConditions(partial: (SideCondition | undefined)[] = []): SideConditions {
	return [0, 1, 2, 3, 4, 5].map((s): SideCondition => ({ slip: 'no-slip', ...partial[s] })) as SideConditions;
}
