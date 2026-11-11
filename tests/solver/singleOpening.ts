import type { FlowBackend } from '../../src/lib/experiments/airflow/solver/backend';
import { boxGeometry } from '../../src/lib/experiments/airflow/solver/geometry';
import { Grid } from '../../src/lib/experiments/airflow/solver/grid';
import { AIR, type Exterior, type FluidProperties, type SolverConfig } from '../../src/lib/experiments/airflow/solver/types';

/**
 * One open window and no wind, colder outside than in: single-sided ventilation driven by the temperature difference alone. The
 * window's lower half takes cold air in and its upper half lets warm air out, about a neutral plane at mid-height, and the flow each way is
 *
 *   Q = (Cd/3)·A·√(g·H·ΔT/T̄)
 *
 * (Warren and Parkins 1985, as given by Larsen and Heiselberg 2007, eq. 1, and Pan et al. 2019, eq. 15; see
 * docs/research/airflow/openings-and-wind.md, section 3d). A is the window's whole area, H its height, T̄ the mean of the inside and
 * outside temperatures in kelvin. The formula takes the room to be at one temperature; so does the solver's outside pressure, the
 * hydrostatic ρ·g·β·ΔT·y of `homes/weather.ts` with β = 1/T_room, so the model's own form of it has T_room where the formula has T̄,
 * 0.9 % less flow at these temperatures.
 *
 * The room is 4 × 2.7 × 4 m with a window 0.9 m wide and 1.2 m tall in the −x wall, its sill 0.9 m up: a bedroom's casement. With
 * `isothermal` the air that comes in is the room's own temperature (outdoor θ of 0), so the room stays well mixed as the formula
 * assumes and only the opening's pressure law is under test; without it the cold air comes in cold and pools on the floor.
 */
export const ROOM = { length: 4, height: 2.7, width: 4, sill: 0.9, window: { width: 0.9, height: 1.2 } } as const;
export const INSIDE = 293.15;
export const OUTSIDE = 283.15;

export type BackendMaker = (config: SolverConfig, initial: { theta: number; particulates: number }) => FlowBackend | Promise<FlowBackend>;

export interface SingleOpening {
	backend: FlowBackend;
	/** Index of each window face in the u array. */
	faces: number[];
	/** The window's area as the grid has it, m², and the formula's flow each way for that area, m³/s. */
	area: number;
	formula: number;
	/** The same with the solver's Boussinesq T (the room's), m³/s. */
	boussinesq: number;
}

export async function singleOpening(make: BackendMaker, h: number, isothermal: boolean): Promise<SingleOpening> {
	const [nx, ny, nz] = [Math.round(ROOM.length / h), Math.round(ROOM.height / h), Math.round(ROOM.width / h)];
	const spec = { nx, ny, nz, h };
	const grid = new Grid(spec);
	const geometry = boxGeometry(spec);
	const fluid: FluidProperties = { ...AIR, beta: 1 / INSIDE, cd: 0.62 };
	const rows = Math.round(ROOM.window.height / h);
	const columns = Math.round(ROOM.window.width / h);
	const first = Math.round(ROOM.sill / h);
	const left = Math.round((nz - columns) / 2);
	const sides = [0, 1, 2, 3, 4, 5].map((s) => new Float32Array(3 * grid.sideSize(s as 0))) as Exterior['sides'];
	const faces: number[] = [];
	const difference = OUTSIDE - INSIDE;
	for (let j = first; j < first + rows; j++)
		for (let k = left; k < left + columns; k++) {
			const face = grid.sx * j + grid.sxy * k;
			geometry.au[face] = 1;
			faces.push(face);
			sides[0][3 * (j + ny * k)] = fluid.rho * fluid.g * fluid.beta * difference * (j + 0.5) * h;
		}
	const backend = await make({ grid: spec, fluid, geometry }, { theta: 0, particulates: 0 });
	backend.update({ exterior: { sides, theta: isothermal ? 0 : difference, particulates: 0 } });
	const area = rows * columns * h * h;
	const height = rows * h;
	const mean = (INSIDE + OUTSIDE) / 2;
	const flow = (temperature: number) => (fluid.cd / 3) * area * Math.sqrt((fluid.g * height * (INSIDE - OUTSIDE)) / temperature);
	return { backend, faces, area, formula: flow(mean), boussinesq: flow(INSIDE) };
}

/**
 * Flow in through the window and out through it, m³/s, from the backend's fields as they are, and how many of the window's faces below
 * its mid-height take air in and above it let air out, as shares of the faces there.
 */
export async function exchange(room: SingleOpening) {
	const { u } = await room.backend.readFields();
	const { h, sx, sxy } = room.backend.grid;
	const middle = (Math.round(ROOM.sill / h) + Math.round(ROOM.window.height / h) / 2) * h;
	let into = 0;
	let out = 0;
	let low = 0;
	let lowIn = 0;
	let high = 0;
	let highOut = 0;
	for (const face of room.faces) {
		const q = u[face] * h * h;
		if (q > 0) into += q;
		else out -= q;
		const y = (Math.floor((face % sxy) / sx) + 0.5) * h;
		if (y < middle) {
			low++;
			if (q > 0) lowIn++;
		} else {
			high++;
			if (q < 0) highOut++;
		}
	}
	return { into, out, lowIn: lowIn / low, highOut: highOut / high };
}

/**
 * Runs `seconds` in steps of `dt` and averages the flow in and out over the last `window` seconds, in case the exchange flickers as the
 * incoming and outgoing layers shear past each other. `layered` is the smallest share, at any step of the window, of the faces below
 * mid-height taking air in and above it letting air out.
 */
export async function averageExchange(room: SingleOpening, seconds: number, dt: number, window: number) {
	const steps = Math.round(seconds / dt);
	const from = steps - Math.round(window / dt);
	let into = 0;
	let out = 0;
	let samples = 0;
	let fastest = 0;
	let layered = 1;
	for (let n = 0; n < steps; n++) {
		room.backend.step(dt);
		if (n + 1 > from) {
			const flow = await exchange(room);
			into += flow.into;
			out += flow.out;
			layered = Math.min(layered, flow.lowIn, flow.highOut);
			samples++;
			fastest = Math.max(fastest, (await room.backend.snapshot({})).diagnostics.maxSpeed);
		}
	}
	return { into: into / samples, out: out / samples, fastest, layered };
}
