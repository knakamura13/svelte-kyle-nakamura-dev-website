import { GUST_SEED, GustSeries, gustAt } from '../../src/lib/experiments/airflow/homes/gust';
import { OPENING_LIMITS, type HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { WIND_AT_EAVES, facadeWindPressure } from '../../src/lib/experiments/airflow/homes/weather';
import { World, type BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { blankSetup, type Setup } from '../../src/lib/experiments/airflow/state';

/**
 * Issue 92's room: 6 × 3 m with a casement window 1.2 m square in each short wall, both open, the wind square on to the west one at
 * 10 m/s at the weather station (5.5 m/s at the eaves, so the gusts' time scale is L/Ū = 5.8 s), and the air outside at the room's
 * temperature, so the wind alone drives it. Cross-ventilation: in through the west window, out through the east.
 *
 * Both backends run it through `World`, as the page does, with `beforeStep` before every step: tests/solver/gusts.spec.ts on the CPU in
 * this thread and behind a worker, tests/gpu/gusts.gpu.ts on WebGPU.
 */
export const PLAN: HomePlan = {
	id: 'studio',
	name: 'Gusty room',
	blurb: '',
	width: 6,
	depth: 3,
	ceiling: 2.4,
	rooms: [{ id: 'room', name: 'Room', rects: [{ x: 0, z: 0, w: 6, d: 3 }] }],
	walls: [],
	furniture: [],
	openings: [
		{ id: 'west', name: 'West window', kind: 'casement', placement: { facade: 'west', center: 1.5 }, width: 1.2, height: 1.2, sill: 0.9, maxOpen: OPENING_LIMITS.casement.maxOpen, anchor: 'start' },
		{ id: 'east', name: 'East window', kind: 'casement', placement: { facade: 'east', center: 1.5 }, width: 1.2, height: 1.2, sill: 0.9, maxOpen: OPENING_LIMITS.casement.maxOpen, anchor: 'start' }
	]
};

/** The weather report's wind, m/s, and so the mean at the eaves. */
export const STATION = 10;
export const MEAN = STATION * WIND_AT_EAVES;
export const STEP = 0.1;
export const CELL = 0.3;

export function gustySetup(gusty: boolean): Setup {
	const setup = blankSetup('studio');
	setup.openings = { west: 1, east: 1 };
	setup.conditions = { windFrom: 270, windSpeed: STATION, outdoorTemp: 21, indoorTemp: 21, outdoorPm25: 0, ...(gusty ? { gusty: true } : {}) };
	return setup;
}

/** The west window's outside pressure the gust series says, Pa, at `time`: ½ρU(t)²Cp(θ(t)) on the west wall. */
export function seriesPressure(series: GustSeries, time: number, rho: number) {
	const gust = gustAt(series, time, MEAN);
	return facadeWindPressure(PLAN, 'west', 270 + gust.veer, gust.speed, rho);
}

export interface Minute {
	kind: string;
	/** Seconds at the start of each step, the time its gust was taken at. */
	times: number[];
	/** The west window's outside pressure as the solver used it in each step, Pa, read back from its flow (below). */
	outside: number[];
	/** The same from the gust series alone, Pa. */
	series: number[];
	/** Net flow in through the west window after each step, m³/s. */
	flow: number[];
}

/**
 * Runs `seconds` of the room from still air, `beforeStep` and then a step of STEP each time, and reads back after each step what the west
 * window did. The pressure the solver put outside it is not among the fields, so it is read back from the window's own law: the speed
 * through a face is Cd·√(2|Δp|/ρ) toward the lower pressure, so Δp = sign(u)·ρ/2·(u/Cd)², and the outside pressure is the pressure of
 * the cell beside the face plus that. The solver linearises the law about the last solve's pressure, so the two agree to second order in
 * how far the room's pressure moved in a step.
 */
export async function runMinute(make: BackendFactory, gusty: boolean, seconds = 60): Promise<Minute> {
	const world = await World.create(gustySetup(gusty), { plans: [PLAN], models: new Map(), make, h: CELL });
	const { rho, cd } = world.fluid;
	const west = world.raster.openings.find((o) => o.spec.id === 'west')!;
	const { h } = world.backend.grid;
	const series = new GustSeries(GUST_SEED);
	const minute: Minute = { kind: world.backend.kind, times: [], outside: [], series: [], flow: [] };
	const steps = Math.round(seconds / STEP);
	for (let n = 0; n < steps; n++) {
		const time = n * STEP;
		world.beforeStep(time);
		world.backend.step(STEP);
		const { u, p } = await world.backend.readFields();
		let outside = 0;
		let flow = 0;
		let faces = 0;
		for (const face of west.faces) {
			const open = world.raster.geometry.au[face.index];
			if (open <= 0) continue;
			// The west wall is the box's −x side: a face's speed into the room is +u, and the cell beside it has the face's own index.
			const speed = u[face.index];
			outside += p[face.index] + Math.sign(speed) * 0.5 * rho * (speed / cd) ** 2;
			flow += speed * open * h * h;
			faces++;
		}
		minute.times.push(time);
		minute.outside.push(outside / faces);
		minute.series.push(gusty ? seriesPressure(series, time, rho) : facadeWindPressure(PLAN, 'west', 270, MEAN, rho));
		minute.flow.push(flow);
	}
	world.dispose();
	return minute;
}

/** Pearson's correlation of two series. */
export function correlation(a: number[], b: number[]) {
	const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
	const [ma, mb] = [mean(a), mean(b)];
	let ab = 0;
	let aa = 0;
	let bb = 0;
	for (let n = 0; n < a.length; n++) {
		ab += (a[n] - ma) * (b[n] - mb);
		aa += (a[n] - ma) ** 2;
		bb += (b[n] - mb) ** 2;
	}
	return ab / Math.sqrt(aa * bb);
}

/**
 * What the two runs show, for both specs to assert on: how closely the pressure the solver used follows the series (after the first
 * `settle` seconds, while the room fills with moving air), and the air each run moved through the west window over the whole minute.
 */
export function compare(gusty: Minute, steady: Minute, settle = 2) {
	const from = gusty.times.findIndex((t) => t >= settle);
	const outside = gusty.outside.slice(from);
	const series = gusty.series.slice(from);
	const spread = Math.sqrt(series.reduce((s, v, n, all) => s + (v - all.reduce((a, b) => a + b, 0) / all.length) ** 2, 0) / series.length);
	const error = Math.sqrt(outside.reduce((s, v, n) => s + (v - series[n]) ** 2, 0) / outside.length);
	const volume = (minute: Minute) => minute.flow.reduce((s, q) => s + q * STEP, 0);
	return {
		correlation: correlation(outside, series),
		/** RMS difference between the pressure used and the series', as a share of the series' own spread. */
		error: error / spread,
		spread,
		mean: series.reduce((a, b) => a + b, 0) / series.length,
		/** The steady run's outside pressure, which should be the mean wind's exactly. */
		steadyOutside: steady.outside[steady.outside.length - 1],
		steadySeries: steady.series[0],
		gustyVolume: volume(gusty),
		steadyVolume: volume(steady)
	};
}

/**
 * What quasi-steady theory expects the gusty minute to move against the steady one: through-flow goes as the square root of the
 * pressure difference across the room, so as √(Δp(t)/Δp̄) averaged over the minute, with Δp the west wall's pressure less the east's.
 */
export function quasiSteadyRatio(seconds = 60, rho = 1.204) {
	const series = new GustSeries(GUST_SEED);
	const mean = facadeWindPressure(PLAN, 'west', 270, MEAN, rho) - facadeWindPressure(PLAN, 'east', 270, MEAN, rho);
	let sum = 0;
	let speed = 0;
	const steps = Math.round(seconds / STEP);
	for (let n = 0; n < steps; n++) {
		const gust = gustAt(series, n * STEP, MEAN);
		const across = facadeWindPressure(PLAN, 'west', 270 + gust.veer, gust.speed, rho) - facadeWindPressure(PLAN, 'east', 270 + gust.veer, gust.speed, rho);
		sum += Math.sign(across) * Math.sqrt(Math.abs(across) / mean);
		speed += gust.speed / MEAN;
	}
	return { ratio: sum / steps, meanSpeed: speed / steps };
}
