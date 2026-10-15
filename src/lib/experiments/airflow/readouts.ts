import type { MassBalance } from './solver/types';

/** What the air is doing at a point: the numbers behind the hover readout and a Probe. Speeds are m/s, temperature °C, particulates ppm by mass. */
export interface AirReading {
	/** Velocity: u east, v up, w south. */
	u: number;
	v: number;
	w: number;
	speed: number;
	/** Mean speed at this point over the last ten simulated seconds, once ten seconds of history exist. */
	averageSpeed: number | null;
	temperature: number;
	particulates: number;
	/** False where the point is inside furniture or outside the Home. */
	inAir: boolean;
}

export interface HoverReading extends AirReading {
	x: number;
	y: number;
	z: number;
}

export interface ProbeReading extends HoverReading {
	id: string;
	label: string;
}

export interface RoomReading {
	id: string;
	name: string;
	/** m³. */
	volume: number;
	speed: number;
	temperature: number;
	particulates: number;
	/** Air entering the room across every opening and doorway, m³/s, and that as air changes per hour. */
	inflow: number;
	changesPerHour: number;
}

export interface PhysicsReading {
	/** Simulated seconds since the run began. */
	time: number;
	backend: 'webgpu' | 'cpu' | null;
	/** Cell size, m, and cell count, once a backend is running. */
	cellSize: number | null;
	cells: number;
	/** How many simulated seconds go by per real second right now. */
	rate: number | null;
	/** Fastest air, m/s. */
	maxSpeed: number;
	/** How far the flow is from incompressible after the last pressure solve, as a fraction of its own speed. */
	divergence: number;
	/** Particulate mass balance, mg, or null before the first step. */
	mass: MassBalance | null;
	/** True on the CPU fallback: a coarse grid, so fans are barely resolved. */
	reducedDetail: boolean;
}

export type RunStatus = 'idle' | 'loading' | 'running' | 'paused' | 'unsupported' | 'error';

/** Everything the scene and the simulation write for the page to show. */
export interface AirflowReadout {
	status: RunStatus;
	/** A sentence for the Stage's note when it is not running. */
	note: string;
	hover: HoverReading | null;
	probes: ProbeReading[];
	rooms: RoomReading[];
	physics: PhysicsReading;
	/** Flow the solver measured through each fan's disk, by device id, m³/s. */
	deviceFlow: Record<string, number>;
}

export const emptyReadout = (): AirflowReadout => ({
	status: 'idle',
	note: '',
	hover: null,
	probes: [],
	rooms: [],
	physics: { time: 0, backend: null, cellSize: null, cells: 0, rate: null, maxSpeed: 0, divergence: 0, mass: null, reducedDetail: false },
	deviceFlow: {}
});
