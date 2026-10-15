import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { CFM, type DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { emissionRate } from '../../src/lib/experiments/airflow/emission';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { massAccounted, massBalanceError, massGained } from '../../src/lib/experiments/airflow/massBalance';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import type { MassBalance } from '../../src/lib/experiments/airflow/solver/types';
import { blankSetup, type DeviceState, type Setup } from '../../src/lib/experiments/airflow/state';

/**
 * One run of the particulate mass balance through `World`, for any backend: the Studio in a west wind with its front door and
 * two windows open, smoke in the air at the start, outdoor smoke coming in, a purifier cleaning, and smoke released at a
 * point for the first 40 s; then the release stops, and at 120 s the Openings are shut and the purifier is turned down. It is
 * written once and run three times: on the WebGPU backend in a browser (tests/gpu/massbalance.gpu.ts), on the CPU solver
 * behind a Web Worker in Node (tests/solver/massbalance.spec.ts), and on the CPU solver in this thread (the same spec).
 *
 * Plain TypeScript with no Node or browser API, so the GPU suite's bundler can carry it into the page.
 */

/** A purifier of the catalog's shape: the catalog lists none yet, so the test brings its own. 240 cfm at High is 0.113 m³/s. */
export const PURIFIER: DeviceModel = {
	id: 'test-purifier',
	name: 'Test purifier',
	kind: 'air-purifier',
	size: 'medium',
	body: { width: 0.3, depth: 0.3, height: 0.6 },
	source: 'test',
	cadr: { sleep: 40 * CFM, low: 80 * CFM, medium: 160 * CFM, high: 240 * CFM },
	inlet: { from: 0.1, to: 0.35 },
	outletDiameter: 0.2
};

export const MODELS: ReadonlyMap<string, DeviceModel> = new Map([...DEVICE_MODELS, PURIFIER].map((m) => [m.id, m]));

/** Smoke in the indoor air when the run begins, ppm by mass: 0.02 ppm is 24 µg/m³. */
export const STARTING_SMOKE = 0.02;
/** Outdoor PM2.5, µg/m³: what the wind carries in through the Openings. */
export const OUTDOOR_PM25 = 12;
/** Where the smoke is released (the main room, at the Slice's default height), and for how long. */
export const RELEASE_POINT = { x: 5.2, y: 1.1, z: 2.0 };
export const RELEASE_SECONDS = 40;
/** The release is the top of the smoke slider, the cooking burst: 10 mg a minute. */
export const RELEASE_RATE = emissionRate(1) / 60;
/** When the Openings are shut and the purifier is turned down, s. */
export const SHUT_AT = 120;

const purifier = (power: number): DeviceState => ({
	id: 'purifier',
	model: PURIFIER.id,
	x: 5.2,
	z: 1.2,
	y: 0,
	yaw: 0,
	tilt: 0,
	power,
	height: 0,
	oscillation: { on: false, sweep: 90, period: 8 }
});

/** The Studio with its front door and its two east windows open in a 3 m/s wind from the west, a purifier at High. */
export function openSetup(): Setup {
	const setup = blankSetup('studio');
	setup.openings = { 'front-door': 1, 'main-east-window-1': 1, 'main-east-window-2': 1 };
	setup.conditions = { windFrom: 270, windSpeed: 3, outdoorTemp: 21, indoorTemp: 21, outdoorPm25: OUTDOOR_PM25 };
	setup.devices = [purifier(1)];
	return setup;
}

/** The same Studio with every Opening shut and the purifier at its Low mark. */
export function shutSetup(): Setup {
	return { ...openSetup(), openings: { 'front-door': 0, 'main-east-window-1': 0, 'main-east-window-2': 0 }, devices: [purifier(0.5)] };
}

export interface BalanceSample {
	/** Simulated seconds. */
	time: number;
	mass: MassBalance;
	/** |gained − accounted| / gained. */
	error: number | null;
}

export interface BalanceRun {
	kind: 'webgpu' | 'cpu';
	h: number;
	cells: number;
	steps: number;
	samples: BalanceSample[];
	final: MassBalance;
}

export interface BalanceOptions {
	make: BackendFactory;
	/** Cell size, m. */
	h: number;
	/** Simulated seconds to run. */
	seconds: number;
	/** Seconds of simulated time between snapshots; the default is the page's, which reads one every twentieth of a second. */
	every?: number;
	/** The solver's step, s. The default is the page's stable step at 5 times real time and faster; at real time it takes one step a frame, 1/60 s. */
	dt?: number;
	/** The Studio sealed and still, from the first step: no Openings, no purifier, no outdoor smoke and no release, so deposition is the only loss. */
	still?: boolean;
}

/** The sealed Studio of `still`: smoke in the air at the start and nothing else going on. */
export function stillSetup(): Setup {
	return { ...openSetup(), openings: {}, devices: [], conditions: { ...openSetup().conditions, outdoorPm25: 0 } };
}

/**
 * Builds the world on `make`, runs it through the three stages above (or, for `still`, none) and takes a snapshot every `every`
 * simulated seconds, so the balance is checked as it goes and not only at the end. A GPU backend needs a snapshot at least every
 * 8,192 steps and a CFL reading now and then (see `GpuBackend.step`); the snapshots give it both, as the page's own do.
 */
export async function runBalance({ make, h, seconds, every = 0.2, dt = 0.05, still = false }: BalanceOptions): Promise<BalanceRun> {
	const world = await World.create(still ? stillSetup() : openSetup(), { plans, models: MODELS, h, make: (config, initial) => make(config, { ...initial, particulates: STARTING_SMOKE }) });
	try {
		const samples: BalanceSample[] = [];
		const take = async () => {
			const { diagnostics } = await world.backend.snapshot({});
			samples.push({ time: diagnostics.time, mass: diagnostics.mass, error: massBalanceError(diagnostics.mass) });
		};
		await take();
		if (!still) world.emit(RELEASE_POINT, RELEASE_RATE);
		const perBatch = Math.max(1, Math.round(every / dt));
		let steps = 0;
		let released = !still;
		let shut = still;
		while (steps * dt < seconds - 1e-9) {
			for (let n = 0; n < perBatch; n++) {
				world.backend.step(dt);
				steps++;
			}
			const time = steps * dt;
			if (released && time >= RELEASE_SECONDS) {
				world.emit(null, 0);
				released = false;
			}
			if (!shut && time >= SHUT_AT) {
				world.apply(shutSetup(), time);
				shut = true;
			}
			await take();
		}
		const final = samples[samples.length - 1].mass;
		return { kind: world.backend.kind, h, cells: world.backend.fluidCells, steps, samples, final };
	} finally {
		world.dispose();
	}
}

/** A line of the numbers for a log: every term, the two sides and the error. */
export function describeMass(mass: MassBalance): string {
	const mg = (x: number) => x.toPrecision(5);
	const gained = massGained(mass);
	const accounted = massAccounted(mass);
	const error = massBalanceError(mass);
	return `initial ${mg(mass.initial)} + emitted ${mg(mass.emitted)} + inflow ${mg(mass.inflow)} = ${mg(gained)} mg gained; in air ${mg(mass.inAir)} + outflow ${mg(mass.outflow)} + removed ${mg(mass.removed)} + deposited ${mg(mass.deposited)} = ${mg(accounted)} mg accounted; error ${error === null ? 'n/a' : error.toExponential(2)}`;
}
