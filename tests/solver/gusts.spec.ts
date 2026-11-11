import { expect, test } from '@playwright/test';
import {
	GUST_DIRECTIONS,
	GUST_FACTOR,
	GUST_INTENSITY,
	GUST_MEAN_SQUARE,
	GUST_LATERAL,
	GUST_LENGTH,
	GustSeries,
	gustAt,
	gustDirectionWeights
} from '../../src/lib/experiments/airflow/homes/gust';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import { WIND_AT_EAVES, exteriorState, facadeWindPressure, gustPressures, meanGustPressure, meanGustPressures } from '../../src/lib/experiments/airflow/homes/weather';
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
	test('are each side’s ½ρU(t)²Cp(θ(t)) less its long-run mean, on top of the steady wind’s, which exteriorState already holds, and nothing when steady', () => {
		const raster = rasterizePlan(PLAN, 0.3, { furniture: false });
		const gusty = gustySetup(true).conditions;
		const series = new GustSeries(1);
		const gust = gustAt(new GustSeries(1), 7.3, MEAN);
		const pressures = gustPressures(raster, gusty, series, 7.3, AIR.rho);
		const steady = exteriorState(raster, gusty, gusty.indoorTemp, AIR);
		const west = raster.openings.find((o) => o.spec.id === 'west')!;
		const at = (side: number) => steady.sides[side][3 * west.faces[0].slot];
		const departure = (facade: 'west' | 'east') => facadeWindPressure(PLAN, facade, 270 + gust.veer, gust.speed, AIR.rho) - meanGustPressure(PLAN, facade, 270, MEAN, AIR.rho);
		expect(pressures[SIDE.X0] + at(SIDE.X0)).toBeCloseTo(facadeWindPressure(PLAN, 'west', 270, MEAN, AIR.rho) + departure('west'), 4);
		expect(pressures[SIDE.X1]).toBeCloseTo(departure('east'), 5);
		for (const side of [SIDE.Y0, SIDE.Y1, SIDE.Z0, SIDE.Z1]) expect(pressures[side]).toBe(0);
		// The world works the means out once per setup and passes them in; the result is the same.
		const means = meanGustPressures(raster, gusty, AIR.rho);
		expect([...gustPressures(raster, gusty, new GustSeries(1), 7.3, AIR.rho, new Float32Array(6), means)]).toEqual([...pressures]);
		expect([...gustPressures(raster, gustySetup(false).conditions, series, 7.3, AIR.rho)]).toEqual([0, 0, 0, 0, 0, 0]);
		// Calm: no gusts and no mean to take away; nothing is divided by the speed.
		expect([...gustPressures(raster, { ...gusty, windSpeed: 0 }, series, 7.3, AIR.rho)]).toEqual([0, 0, 0, 0, 0, 0]);
		expect([...meanGustPressures(raster, { ...gusty, windSpeed: 0 }, AIR.rho)]).toEqual([0, 0, 0, 0, 0, 0]);
	});

	test('their long-run mean is a weighted sum over directions that scales with the speed squared, and the weights sum to the series’ mean square speed', () => {
		const weights = gustDirectionWeights();
		expect(weights.length).toBe(GUST_DIRECTIONS);
		const sum = weights.reduce((a, b) => a + b, 0);
		// 1 + Iu²(2 + ρu)/3 + Iv²(2 + ρv)/3: the sourced mean square less the interpolation's quarter of a percent (homes/gust.ts).
		const interpolated = 1 + GUST_INTENSITY ** 2 * ((2 + Math.exp(-1 / 50)) / 3) + (GUST_LATERAL * GUST_INTENSITY) ** 2 * ((2 + Math.exp(-3 / 50)) / 3);
		expect(sum).toBeCloseTo(interpolated, 5);
		expect(sum / GUST_MEAN_SQUARE).toBeGreaterThan(0.997);
		// Even in the direction: a veer one way is as likely as the other.
		for (let k = 1; k < GUST_DIRECTIONS / 2; k++) expect(weights[GUST_DIRECTIONS - k]).toBeCloseTo(weights[k], 12);
		const at = (speed: number) => meanGustPressure(PLAN, 'west', 250, speed, AIR.rho);
		expect(at(2 * MEAN) / at(MEAN)).toBeCloseTo(4, 10);
		expect(at(0)).toBe(0);
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
 *   σu/Ū·√(2T/60) = 0.355·√(11.5/60) = 0.16, and 30 % is about two of those. Over a long run the gusty wind moves about 92 % of the
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
 * The gusts' long-run mean pressure. Each wall's gust term is ½ρU(t)²Cp(θ(t)) less its own long-run mean, worked out from the series'
 * statistics (homes/gust.ts `gustDirectionWeights`), so the mean pressure is the steady wind's on every wall at every bearing. Before
 * (PR #103's /interrogate, finding 3) the dynamic pressure was divided by GUST_MEAN_SQUARE and the direction's wobble through Cp was
 * left in, which put the difference across the room anywhere from 89.7 % (wind from 180°) to 102.3 % (202.5°) of the steady wind's
 * and a single wall from 84 % to 113 % (63 % on a wall the wind runs along).
 *
 * Tolerances, for 100 h of the series. The mean is now exact, so what is left is sampling: the standard error of each mean, from 100
 * one-hour batches, is at most 0.0027 of the dynamic pressure q = ½ρŪ² on a wall and 0.42 % of the steady difference across the room,
 * at every bearing tested. A wall's mean is held within 0.01 q of the steady wind's (in q, not as a share, because a wall the wind runs
 * along has a steady Cp near zero: 0.07 on the south wall from 247.5°), and the difference across the room within 1.5 %: both about 3.7
 * standard errors. At 270° the same bounds as shares are 2 % on the west wall (Cp 0.60) and 5 % on the east (Cp −0.23). Measured: every
 * wall within 0.0014 q and every difference across within 0.2 %.
 *
 * The gusts keep their sourced size: the windward wall's pressure spreads by about twice the turbulence intensity times its mean, as the
 * linear quasi-steady relation gives (p′ = ½ρŪ²Cp·2u′/Ū), measured at 0.365 against Iu = 0.355 and held within 6 %; the square of the
 * speed and the direction's wobble add the rest. Through the square-root law the cross-flow of 100 h is 91.5 % of the steady wind's
 * (93.4 % before, when the gusts were scaled down by 1.207), held between 85 and 97 %.
 *
 * For an hour of the solver: each wall within 15 % of the steady wind's and the difference across within 8 %. From the same batches an
 * hour's mean varies by about 4 % of itself on either wall and across the room, so these are about 3.7 and 2 standard deviations. And the
 * solver's mean within 1 % of the series' own at the same moments, which is what the backends are tested for.
 */
test('the series’ long-run mean dynamic pressure is the sourced one, and at 270° each wall’s mean pressure and the difference across the room are the steady wind’s', () => {
	const mean = seriesMeanPressure(100);
	const at = mean.bearings[0];
	const flow = quasiSteadyRatio(100 * 3600);
	const share = (facade: 'west' | 'east') => at.wall[facade].mean / at.wall[facade].steady;
	const intensity = at.wall.west.spread / (2 * at.wall.west.steady);
	console.log(
		`100 h of the series: dynamic pressure ${(mean.dynamic * 100).toFixed(2)} % of the sourced (GUST_MEAN_SQUARE ${GUST_MEAN_SQUARE.toFixed(4)}); wall pressure ${(share('west') * 100).toFixed(2)} % on the west wall, ${(share('east') * 100).toFixed(2)} % on the east, ${(at.across * 100).toFixed(2)} % across the room; the west wall's spread over twice its mean ${intensity.toFixed(3)} (Iu ${GUST_INTENSITY.toFixed(3)}); quasi-steady cross-flow ${(flow.ratio * 100).toFixed(2)} % of the steady wind's at a mean speed of ${(flow.meanSpeed * 100).toFixed(2)} % of Ū`
	);
	expect(GUST_MEAN_SQUARE).toBeCloseTo(1 + GUST_INTENSITY ** 2 * (1 + GUST_LATERAL ** 2), 12);
	expect(Math.abs(mean.dynamic - 1)).toBeLessThan(0.015);
	expect(at.pair).toEqual(['west', 'east']);
	expect(Math.abs(share('west') - 1)).toBeLessThan(0.02);
	expect(Math.abs(share('east') - 1)).toBeLessThan(0.05);
	expect(Math.abs(at.across - 1)).toBeLessThan(0.015);
	expect(Math.abs(intensity / GUST_INTENSITY - 1)).toBeLessThan(0.06);
	// The gusts still cost the cross-flow a little over the long run: a square root's mean is below the square root of the mean.
	expect(flow.ratio).toBeGreaterThan(0.85);
	expect(flow.ratio).toBeLessThan(0.97);
});

test('at every bearing, each wall’s long-run mean pressure under the gusts and the difference across the room are the steady wind’s', () => {
	// Square on to the long (south) facade, three obliques through the diagonal, square on to the short (west) facade, and oblique to it.
	const bearings = [180, 202.5, 225, 247.5, 270, 300];
	const { bearings: results } = seriesMeanPressure(100, bearings);
	const q = 0.5 * AIR.rho * MEAN * MEAN;
	const failures: string[] = [];
	for (const r of results) {
		const walls = Object.entries(r.wall).map(([facade, w]) => `${facade} ${((w.mean - w.steady) / q).toFixed(4)} q off (${((100 * w.mean) / w.steady).toFixed(1)} % of ${(w.steady / q).toFixed(3)} q)`);
		const line = `from ${r.from}°: across ${r.pair.join('–')} ${(100 * r.across).toFixed(2)} %; ${walls.join(', ')}`;
		console.log(line);
		const worst = Math.max(...Object.values(r.wall).map((w) => Math.abs(w.mean - w.steady) / q));
		if (worst >= 0.01 || Math.abs(r.across - 1) >= 0.015) failures.push(line);
	}
	expect(failures, 'bearings with a wall more than 0.01 q from the steady wind’s mean, or the difference across more than 1.5 % from it').toEqual([]);
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
