import { GUST_MEAN_SQUARE, GUST_SEED, GustSeries, gustAt, type Gust } from '../../src/lib/experiments/airflow/homes/gust';
import { OPENING_LIMITS, type Facade, type HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { WIND_AT_EAVES, facadeWindPressure, meanGustPressure } from '../../src/lib/experiments/airflow/homes/weather';
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

/**
 * A wall of the room under the gusts, for the mean wind from `from`: its steady pressure ½ρŪ²Cp(θ̄), the gusts' long-run mean of
 * ½ρU²Cp(θ), and its pressure at a gust, the steady one plus the gust's ½ρU(t)²Cp(θ(t)) less that mean (homes/weather.ts), Pa.
 */
export function gustyWall(facade: Facade, from = 270, rho = 1.204) {
	const steady = facadeWindPressure(PLAN, facade, from, MEAN, rho);
	const mean = meanGustPressure(PLAN, facade, from, MEAN, rho);
	return { steady, mean, at: (gust: Gust) => steady + facadeWindPressure(PLAN, facade, from + gust.veer, gust.speed, rho) - mean };
}

/** The west window's outside pressure the gust series says, Pa, at `time`. */
export function seriesPressure(series: GustSeries, time: number, rho: number) {
	return gustyWall('west', 270, rho).at(gustAt(series, time, MEAN));
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
	const [west, east] = [gustyWall('west', 270, rho), gustyWall('east', 270, rho)];
	const mean = west.steady - east.steady;
	let sum = 0;
	let speed = 0;
	const steps = Math.round(seconds / STEP);
	for (let n = 0; n < steps; n++) {
		const gust = gustAt(series, n * STEP, MEAN);
		const across = west.at(gust) - east.at(gust);
		sum += Math.sign(across) * Math.sqrt(Math.abs(across) / mean);
		speed += gust.speed / MEAN;
	}
	return { ratio: sum / steps, meanSpeed: speed / steps };
}

export interface LongRun {
	kind: string;
	/** Mean outside pressure on the west (windward) and east (leeward) windows over the run, Pa, read back from their flow as in `runMinute`. */
	west: number;
	east: number;
	/** The same from the gust series at the same moments, and the steady wind's, Pa. */
	seriesWest: number;
	seriesEast: number;
	steadyWest: number;
	steadyEast: number;
}

/**
 * Runs the gusty room for `seconds` and averages the outside pressure the solver used on each window, read every `every` steps after
 * the first `settle` seconds. Its long-run mean should be the steady wind's, as the gusts' departure has a long-run mean of zero.
 */
export async function runLong(make: BackendFactory, seconds: number, every = 10, settle = 10): Promise<LongRun> {
	const world = await World.create(gustySetup(true), { plans: [PLAN], models: new Map(), make, h: CELL });
	const { rho, cd } = world.fluid;
	const { au } = world.raster.geometry;
	const west = world.raster.openings.find((o) => o.spec.id === 'west')!;
	const east = world.raster.openings.find((o) => o.spec.id === 'east')!;
	const series = new GustSeries(GUST_SEED);
	const [westWall, eastWall] = [gustyWall('west', 270, rho), gustyWall('east', 270, rho)];
	const run: LongRun = { kind: world.backend.kind, west: 0, east: 0, seriesWest: 0, seriesEast: 0, steadyWest: westWall.steady, steadyEast: eastWall.steady };
	// A window's outside pressure from its faces: `sign` turns u into the speed into the room, and the cell beside a face is `shift` before it.
	const outside = (faces: { index: number }[], u: Float32Array, p: Float32Array, sign: 1 | -1, shift: 0 | 1) => {
		let sum = 0;
		let count = 0;
		for (const face of faces) {
			if (au[face.index] <= 0) continue;
			const into = sign * u[face.index];
			sum += p[face.index - shift] + Math.sign(into) * 0.5 * rho * (into / cd) ** 2;
			count++;
		}
		return sum / count;
	};
	const steps = Math.round(seconds / STEP);
	let samples = 0;
	for (let n = 0; n < steps; n++) {
		const time = n * STEP;
		world.beforeStep(time);
		world.backend.step(STEP);
		if (time < settle || n % every) continue;
		const { u, p } = await world.backend.readFields();
		run.west += outside(west.faces, u, p, 1, 0);
		run.east += outside(east.faces, u, p, -1, 1);
		const gust = gustAt(series, time, MEAN);
		run.seriesWest += westWall.at(gust);
		run.seriesEast += eastWall.at(gust);
		samples++;
	}
	world.dispose();
	for (const key of ['west', 'east', 'seriesWest', 'seriesEast'] as const) run[key] /= samples;
	return run;
}

const FACADES = ['north', 'east', 'south', 'west'] as const;

/** The windward and leeward walls across the room for a wind from `from`: the pair whose steady pressures differ most. */
export function acrossPair(from: number, rho = 1.204): [Facade, Facade] {
	const pairs: [Facade, Facade][] = [
		['west', 'east'],
		['south', 'north']
	];
	const size = ([a, b]: [Facade, Facade]) => Math.abs(facadeWindPressure(PLAN, a, from, MEAN, rho) - facadeWindPressure(PLAN, b, from, MEAN, rho));
	const [w, l] = size(pairs[0]) >= size(pairs[1]) ? pairs[0] : pairs[1];
	return facadeWindPressure(PLAN, w, from, MEAN, rho) >= facadeWindPressure(PLAN, l, from, MEAN, rho) ? [w, l] : [l, w];
}

export interface SeriesMean {
	from: number;
	/** Each wall's mean pressure under the gusts and its steady pressure, Pa. */
	wall: Record<Facade, { mean: number; steady: number; spread: number }>;
	/** The windward and leeward walls across the room, and the mean pressure difference between them over the steady wind's. */
	pair: [Facade, Facade];
	across: number;
}

/**
 * The series' own long-run mean wall pressure on every wall of the room, for the mean wind from each of `bearings`, from `hours` of it
 * sampled every 0.1 s, as the solver is sent it: the steady pressure plus the gust's departure from its long-run mean. `dynamic` is the
 * mean of (U(t)/Ū)² over GUST_MEAN_SQUARE, the series' own mean square speed against the sourced one.
 */
export function seriesMeanPressure(hours: number, bearings: readonly number[] = [270], rho = 1.204) {
	const series = new GustSeries(GUST_SEED);
	const walls = bearings.map((from) => FACADES.map((facade) => gustyWall(facade, from, rho)));
	const sum = bearings.map(() => FACADES.map(() => 0));
	const square = bearings.map(() => FACADES.map(() => 0));
	const pairs = bearings.map((from) => acrossPair(from, rho));
	let dynamic = 0;
	const steps = Math.round((hours * 3600) / STEP);
	for (let n = 0; n < steps; n++) {
		const gust = gustAt(series, n * STEP, MEAN);
		dynamic += (gust.speed / MEAN) ** 2;
		for (let b = 0; b < bearings.length; b++)
			for (let f = 0; f < FACADES.length; f++) {
				const p = walls[b][f].at(gust);
				sum[b][f] += p;
				square[b][f] += p * p;
			}
	}
	const results: SeriesMean[] = bearings.map((from, b) => {
		const wall = Object.fromEntries(
			FACADES.map((facade, f) => {
				const mean = sum[b][f] / steps;
				return [facade, { mean, steady: walls[b][f].steady, spread: Math.sqrt(Math.max(0, square[b][f] / steps - mean * mean)) }];
			})
		) as SeriesMean['wall'];
		const [w, l] = pairs[b];
		return { from, wall, pair: pairs[b], across: (wall[w].mean - wall[l].mean) / (wall[w].steady - wall[l].steady) };
	});
	return { dynamic: dynamic / steps / GUST_MEAN_SQUARE, bearings: results };
}
