import type { Grid } from './grid';
import type { Diagnostics, Emitter, Exterior, FanDisk, RoomStats, Slice } from './types';

/**
 * What the page talks to. Three things implement it: the CPU reference (cpu/backend.ts), the same solver behind a
 * Web Worker (cpu/proxy.ts, which the page runs where there is no WebGPU), and the WebGPU solver (gpu/). The page never
 * touches a solver's arrays; it steps the backend, tells it what changed, and asks for snapshots, which arrive
 * asynchronously because on the GPU they are reads back and on the worker they are replies.
 */
export interface FlowBackend {
	readonly kind: 'webgpu' | 'cpu';
	readonly grid: Grid;
	/** Fluid cells (excluding padding and furniture), for the physics panel and the auto-tuner. */
	readonly fluidCells: number;

	/**
	 * Steps given to the backend that it has not finished, for a backend that works in the background (the worker). The
	 * page sends no more while this is at its limit, so a backend that cannot keep up makes the simulation run slower than
	 * real time instead of falling further behind. Absent where `step` does its work before it returns (the CPU in the page,
	 * which the page times instead) or where the device queues the work (the GPU).
	 */
	readonly stepsInFlight?: number;

	/**
	 * Calls `listener` once if the backend can no longer run: the GPU device was lost, or the worker crashed. Whatever it is
	 * asked afterwards does nothing or rejects. Returns the function that stops listening. Absent on a backend that cannot fail.
	 */
	onFailure?(listener: (failure: BackendFailure) => void): () => void;

	/** Advances the flow, temperature and particulates by exactly `dt` seconds. May return before the work is done. */
	step(dt: number): void;

	/** Applies whatever changed since the last call. Take effect from the next step. */
	update(change: BackendUpdate): void;

	/**
	 * Turns on the dots that make the flow visible, or changes how many there are: `tracers` drift with the air
	 * through the room and carry its speed, `smoke` particles carry the particulate concentration and only count
	 * where there is some. `scale` is the concentration, ppm, that counts as dense smoke. Zero turns them off.
	 */
	configureParticles(options: { tracers: number; smoke: number; scale: number; seed?: number }): void;

	/** Moves the particles along the flow for `dt` seconds. Call once per drawn frame. */
	stepParticles(dt: number): void;

	/** Reads back what the page needs to draw a frame and refresh its readouts. Resolves once the GPU has caught up to the call. */
	snapshot(request: SnapshotRequest): Promise<Snapshot>;

	/** Velocity, temperature and particulates at points (x, y, z in metres, three numbers per point): POINT_FIELDS.length numbers per point. */
	samplePoints(points: Float32Array): Promise<Float32Array>;

	/** Every field, for resampling onto another grid when the auto-tuner changes the resolution, and for tests. Cell fields use the padded layout of grid.ts. */
	readFields(): Promise<FieldState>;
	/** Overwrites the fields (the inverse of `readFields`). */
	writeFields(fields: FieldState): void;

	/** Releases GPU memory or the worker. */
	dispose(): void;
}

/** Why a backend stopped. */
export interface BackendFailure {
	/** `lost`: the GPU device went away, and the page starts the simulation again on the worker. `crashed`: the worker stopped. */
	reason: 'lost' | 'crashed';
	message: string;
}

/** No solver can run here: the browser has neither WebGPU nor Web Workers. The page says so and keeps showing the Home. */
export class BackendUnavailable extends Error {
	constructor(
		message: string,
		/** The browser's own message, for the console. */
		readonly detail?: string
	) {
		super(message);
		this.name = 'BackendUnavailable';
	}
}

/** The state that persists from step to step. */
export interface FieldState {
	u: Float32Array;
	v: Float32Array;
	w: Float32Array;
	/** Pressure, Pa, the last solve's answer, which is the next one's starting guess. */
	p: Float32Array;
	theta: Float32Array;
	particulates: Float32Array;
}

/** Faces whose open fraction changed (a door swung, a window slid), on one axis's face array. */
export interface FaceUpdate {
	axis: 0 | 1 | 2;
	indices: Uint32Array;
	values: Float32Array;
}

export interface BackendUpdate {
	faces?: FaceUpdate[];
	exterior?: Exterior;
	fans?: FanDisk[];
	emitters?: Emitter[];
	sinks?: import('./types').Sink[];
}

export interface SnapshotRequest {
	/** Cut the box at this height, m. */
	sliceY?: number;
	/** Include the particle positions. */
	particles?: boolean;
	/** Include per-room averages. They need a pass over the whole grid, so ask only a few times a second. */
	rooms?: boolean;
}

export interface Snapshot {
	diagnostics: Diagnostics;
	slice?: Slice;
	/** x, y, z in metres and the air speed in m/s, four numbers per tracer. */
	tracers?: Float32Array;
	/** x, y, z in metres and the particulate concentration in ppm, four numbers per smoke particle. */
	smoke?: Float32Array;
	rooms?: RoomStats[];
	/** Flow through each fan's disk as of the last step, m³/s. */
	fanFlow: Float64Array;
}
