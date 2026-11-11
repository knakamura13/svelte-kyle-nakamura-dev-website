import { expect, test } from '@playwright/test';
import { GUST_FACTOR, GUST_INTENSITY, GUST_MEAN_SQUARE, GUST_LATERAL, GUST_LENGTH, GustSeries, gustAt } from '../../src/lib/experiments/airflow/homes/gust';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import { WIND_AT_EAVES, exteriorState, facadeWindPressure, gustPressures } from '../../src/lib/experiments/airflow/homes/weather';
import { SIDE } from '../../src/lib/experiments/airflow/solver/grid';
import { CpuBackend } from '../../src/lib/experiments/airflow/solver/cpu/backend';
import { WorkerBackend } from '../../src/lib/experiments/airflow/solver/cpu/proxy';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import type { BackendFactory } from '../../src/lib/experiments/airflow/sim/world';
import { inMemoryWorker } from './channel';
import { MEAN, PLAN, compare, gustySetup, quasiSteadyRatio, runLong, runMinute, seriesMeanPressure } from './gustyRoom';

/**
 * Issue 92: gusty wind. homes/gust.ts makes the series, docs/research/airflow/openings-and-wind.md section 2d sources its statistics,
 * and gustyRoom.ts is the room both backends run (tests/gpu/gusts.gpu.ts is the GPU's half).
 */

/** The series' statistics over `windows` ten-minute windows at a mean eaves speed, sampled every 0.05 s. */
function statistics(mean: number, windows: number, seed = 1) {
	const series = new GustSeries(seed);
	const dt = 0.05;
	const per = Math.round(600 / dt);
	const n = windows * per;
	const speed = new Float64Array(n);
	let veer = 0;
	for (let i = 0; i < n; i++) {
		const gust = gustAt(series, i * dt, mean);
		speed[i] = gust.speed;
		veer += gust.veer ** 2;
	}
	const average = speed.reduce((a, b) => a + b, 0) / n;
	const variance = speed.reduce((a, b) => a + (b - average) ** 2, 0) / n;
	// The integral time: the area under the autocorrelation up to its first zero, from the first 200 000 samples.
	let integral = 0;
	const span = Math.min(n, 200_000);
	for (let lag = 0; lag < span / 4; lag++) {
		let c = 0;
		for (let i = 0; i + lag < span; i++) c += (speed[i] - average) * (speed[i + lag] - average);
		c /= (span - lag) * variance;
		if (c <= 0) break;
		integral += c * dt;
	}
	// Gust factor: the highest 3 s mean speed in each ten minutes over that ten minutes' mean.
	const k = Math.round(3 / dt);
	const factors: number[] = [];
	for (let w = 0; w < windows; w++) {
		let total = 0;
		for (let i = 0; i < per; i++) total += speed[w * per + i];
		let run = 0;
		let best = 0;
		for (let i = 0; i < per; i++) {
			run += speed[w * per + i];
			if (i >= k) run -= speed[w * per + i - k];
			if (i >= k - 1) best = Math.max(best, run / k);
		}
		factors.push(best / (total / per));
	}
	return {
		mean: average / mean,
		intensity: Math.sqrt(variance) / mean,
		integral,
		veer: Math.sqrt(veer / n),
		gustFactor: factors.reduce((a, b) => a + b, 0) / windows
	};
}

test.describe('the gust series', () => {
	test('the sourced figures: Eurocode category III at its 5 m floor, and the Kaimal ratios', () => {
		expect(GUST_INTENSITY).toBeCloseTo(0.3554, 4);
		expect(GUST_LENGTH).toBeCloseTo(31.64, 2);
		expect(GUST_FACTOR).toBeCloseTo(1.868, 3);
		expect(GUST_LATERAL).toBe(0.8);
	});

	test('is the same function of time on every run and whatever order it is asked in', () => {
		const a = new GustSeries(1);
		const b = new GustSeries(1);
		const times = [0, 0.05, 3.3, 3.31, 40, 12, 12.7, 0, 500];
		// a is asked in this order, jumping back (which starts its series again); each fresh series is asked once.
		const first = times.map((t) => gustAt(a, t, MEAN));
		expect(first).toEqual(times.map((t) => gustAt(new GustSeries(1), t, MEAN)));
		expect(gustAt(b, 3.3, MEAN)).toEqual(first[2]);
		expect(gustAt(new GustSeries(2), 3.3, MEAN)).not.toEqual(first[2]);
		// Calm stays calm.
		expect(gustAt(a, 10, 0)).toEqual({ speed: 0, veer: 0 });
	});

	for (const station of [5, 10])
		test(`at ${station} m/s at the station its statistics match the sources: intensity, gust time scale, direction and gust factor`, () => {
			const mean = station * WIND_AT_EAVES;
			const s = statistics(mean, 100);
			console.log(
				`gusts at ${mean.toFixed(2)} m/s at the eaves, 100 × 10 min: mean ${s.mean.toFixed(3)} Ū, σ/Ū ${s.intensity.toFixed(3)} (sourced ${GUST_INTENSITY.toFixed(3)}), integral time ${s.integral.toFixed(2)} s (L/Ū ${(GUST_LENGTH / mean).toFixed(2)}), direction σ ${s.veer.toFixed(1)}° (σv/Ū ${((GUST_LATERAL * GUST_INTENSITY * 180) / Math.PI).toFixed(1)}°), gust factor ${s.gustFactor.toFixed(3)} (sourced ${GUST_FACTOR.toFixed(3)})`
			);
			// The speed's mean is the vector's, a little over Ū (section 2d), and its spread a little under σu.
			expect(s.mean).toBeGreaterThan(1);
			expect(s.mean).toBeLessThan(1.07);
			expect(Math.abs(s.intensity / GUST_INTENSITY - 1)).toBeLessThan(0.08);
			expect(Math.abs(s.integral / (GUST_LENGTH / mean) - 1)).toBeLessThan(0.1);
			// The direction turns further than σv/Ū in a lull; within a quarter of it.
			expect(Math.abs(s.veer / ((GUST_LATERAL * GUST_INTENSITY * 180) / Math.PI) - 1)).toBeLessThan(0.25);
			expect(Math.abs(s.gustFactor / GUST_FACTOR - 1)).toBeLessThan(0.05);
		});
});

test.describe('gust pressures', () => {
	test('are each side’s ½ρU(t)²Cp(θ(t)) less the steady wind’s, which exteriorState already holds, and nothing when steady', () => {
		const raster = rasterizePlan(PLAN, 0.3, { furniture: false });
		const gusty = gustySetup(true).conditions;
		const series = new GustSeries(1);
		const gust = gustAt(new GustSeries(1), 7.3, MEAN);
		const pressures = gustPressures(raster, gusty, series, 7.3, AIR.rho);
		const steady = exteriorState(raster, gusty, gusty.indoorTemp, AIR);
		const west = raster.openings.find((o) => o.spec.id === 'west')!;
		const at = (side: number) => steady.sides[side][3 * west.faces[0].slot];
		expect(pressures[SIDE.X0] + at(SIDE.X0)).toBeCloseTo(facadeWindPressure(PLAN, 'west', 270 + gust.veer, gust.speed / Math.sqrt(GUST_MEAN_SQUARE), AIR.rho), 4);
		expect(pressures[SIDE.X1]).toBeCloseTo(facadeWindPressure(PLAN, 'east', 270 + gust.veer, gust.speed / Math.sqrt(GUST_MEAN_SQUARE), AIR.rho) - facadeWindPressure(PLAN, 'east', 270, MEAN, AIR.rho), 5);
		for (const side of [SIDE.Y0, SIDE.Y1, SIDE.Z0, SIDE.Z1]) expect(pressures[side]).toBe(0);
		expect([...gustPressures(raster, gustySetup(false).conditions, series, 7.3, AIR.rho)]).toEqual([0, 0, 0, 0, 0, 0]);
		expect([...gustPressures(raster, { ...gusty, windSpeed: 0 }, series, 7.3, AIR.rho)]).toEqual([0, 0, 0, 0, 0, 0]);
	});
});

/**
 * The acceptance runs: a minute of the room on each CPU path, gusty and steady.
 *
 * - The west window's outside pressure, read back from its flow, follows the series: correlation over 0.99 and an RMS difference under
 *   5 % of the series' own spread, after the first 2 s.
 * - The air moved in the gusty minute is within 3 % of what quasi-steady theory expects of this minute of this series (the mean of
 *   √(Δp(t)/Δp̄)), which is what the model itself is held to. Against the steady minute it is within 30 %: one minute holds only about
 *   five gust time scales (L/Ū = 5.8 s), so the minute's own mean speed differs from the long-run mean by a standard error of
 *   σu/Ū·√(2T/60) = 0.355·√(11.5/60) = 0.16, and 30 % is about two of those. Over a long run the gusty wind moves about 93 % of the
 *   steady wind's air (the test below): the flow goes as the square root of a pressure whose mean is the steady wind's, and a square
 *   root's mean is below the square root of the mean.
 */
const cpu: BackendFactory = (config, initial) => new CpuBackend({ ...config, scalarSubsteps: undefined }, initial);
const workers: ReturnType<typeof inMemoryWorker>[] = [];
const worker: BackendFactory = (config, initial) => {
	const channel = inMemoryWorker();
	workers.push(channel);
	return WorkerBackend.create(channel.port, config, initial);
};

for (const [name, make] of [
	['the CPU in this thread', cpu],
	['the CPU behind a worker', worker]
] as const)
	test(`on ${name}, an opening's pressure follows the gust series, and a gusty minute of cross-ventilation moves about the steady wind's air`, async () => {
		test.setTimeout(300_000);
		const gusty = await runMinute(make, true);
		const steady = await runMinute(make, false);
		const r = compare(gusty, steady);
		const expected = quasiSteadyRatio();
		const ratio = r.gustyVolume / r.steadyVolume;
		console.log(
			`${name}: west pressure against the series: correlation ${r.correlation.toFixed(4)}, RMS difference ${(r.error * 100).toFixed(2)} % of its spread ${r.spread.toFixed(2)} Pa (mean ${r.mean.toFixed(2)} Pa); steady ${r.steadyOutside.toFixed(3)} Pa against ${r.steadySeries.toFixed(3)}; a minute moves ${r.gustyVolume.toFixed(2)} m³ gusty, ${r.steadyVolume.toFixed(2)} m³ steady (${(ratio * 100).toFixed(1)} %), quasi-steady theory ${(expected.ratio * 100).toFixed(1)} % (the minute's mean speed ${(expected.meanSpeed * 100).toFixed(1)} % of Ū)`
		);
		expect(gusty.kind).toBe('cpu');
		expect(r.correlation).toBeGreaterThan(0.99);
		expect(r.error).toBeLessThan(0.05);
		expect(Math.abs(r.steadyOutside / r.steadySeries - 1)).toBeLessThan(0.02);
		expect(Math.abs(ratio / expected.ratio - 1)).toBeLessThan(0.03);
		expect(Math.abs(ratio - 1)).toBeLessThan(0.3);
	});

/**
 * The gusts' long-run mean pressure. Dividing the dynamic pressure by GUST_MEAN_SQUARE makes its mean the steady wind's to the series'
 * own sampling (measured over 100 h: within 1 %, asserted to 1.5 %). What is left on a single wall is the direction's wobble through
 * the Cp curve: the windward wall's Cp is at its peak square on (0.603), so a wind turned either way pushes less, and the leeward wall's
 * grows more negative off its axis. Over 100 h of the series that is 92.8 % of the steady wind's pressure on the west wall and 108.0 %
 * on the east, which mostly cancel in the difference across the room that drives the cross-flow (97.0 %). The normalisation does not
 * correct the wobble's share; section 2d of the research note says why it is left. Through the square-root law the cross-flow of 100 h
 * is 93.4 % of the steady wind's.
 *
 * Tolerances. For 100 h of the series: the dynamic pressure within 1.5 %, each wall within 10 % (the wobble's 7 to 8 %), the difference
 * across the room within 5 % (the wobble's 3 %). For an hour of the solver: each wall within 15 % of the steady wind's and the
 * difference across within 8 % (the wobble's share plus an hour's sampling: an hour holds about 300 gust time scales, so a mean
 * pressure that varies by about 70 % of itself has a standard error near 0.7/√300 = 4 %, and two of those less the cancelling across
 * the room); and the solver's mean within 1 % of the series' own at the same moments, which is what the backends are tested for.
 */
test('the series’ long-run mean dynamic pressure is the steady wind’s, and so is the pressure difference across the room', () => {
	const mean = seriesMeanPressure(100);
	const flow = quasiSteadyRatio(100 * 3600);
	console.log(
		`100 h of the series: dynamic pressure ${(mean.dynamic * 100).toFixed(2)} % of the steady wind's (GUST_MEAN_SQUARE ${GUST_MEAN_SQUARE.toFixed(4)}); wall pressure ${(mean.west * 100).toFixed(2)} % on the west wall, ${(mean.east * 100).toFixed(2)} % on the east, ${(mean.across * 100).toFixed(2)} % across the room; quasi-steady cross-flow ${(flow.ratio * 100).toFixed(2)} % of the steady wind's at a mean speed of ${(flow.meanSpeed * 100).toFixed(2)} % of Ū`
	);
	expect(GUST_MEAN_SQUARE).toBeCloseTo(1 + GUST_INTENSITY ** 2 * (1 + GUST_LATERAL ** 2), 12);
	expect(Math.abs(mean.dynamic - 1)).toBeLessThan(0.015);
	expect(Math.abs(mean.west - 1)).toBeLessThan(0.1);
	expect(Math.abs(mean.east - 1)).toBeLessThan(0.1);
	expect(Math.abs(mean.across - 1)).toBeLessThan(0.05);
});

test('on the CPU, the long-run mean outside pressure on each window is the steady wind’s', async () => {
	test.setTimeout(600_000);
	const r = await runLong(cpu, 3600);
	const across = (r.west - r.east) / (r.steadyWest - r.steadyEast);
	console.log(
		`cpu, an hour: west ${r.west.toFixed(3)} Pa (series ${r.seriesWest.toFixed(3)}, steady ${r.steadyWest.toFixed(3)}, ${((r.west / r.steadyWest) * 100).toFixed(2)} %), east ${r.east.toFixed(3)} Pa (series ${r.seriesEast.toFixed(3)}, steady ${r.steadyEast.toFixed(3)}, ${((r.east / r.steadyEast) * 100).toFixed(2)} %), across ${(across * 100).toFixed(2)} %`
	);
	expect(r.kind).toBe('cpu');
	expect(Math.abs(r.west / r.steadyWest - 1)).toBeLessThan(0.15);
	expect(Math.abs(r.east / r.steadyEast - 1)).toBeLessThan(0.15);
	expect(Math.abs(across - 1)).toBeLessThan(0.08);
	expect(Math.abs(r.west / r.seriesWest - 1)).toBeLessThan(0.01);
	expect(Math.abs(r.east / r.seriesEast - 1)).toBeLessThan(0.01);
});

test.afterAll(() => {
	for (const channel of workers) expect(channel.terminated, 'every worker was stopped by its world').toBe(true);
});
