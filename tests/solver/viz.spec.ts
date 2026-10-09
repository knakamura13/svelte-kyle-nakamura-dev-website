import { expect, test } from '@playwright/test';
import { legendFor } from '../../src/lib/experiments/airflow/viz/legend';
import { PALETTES, STOPS, colorFor, headingRim, hexToRgb, rgbToOklab, sampleLut, scaleFraction, type Rgb } from '../../src/lib/experiments/airflow/viz/palettes';
import { sampleAt } from '../../src/lib/experiments/airflow/scene/sliceLayer';
import type { Slice } from '../../src/lib/experiments/airflow/solver/types';

/** OKLab lightness of entry i of a lookup. */
const lightness = (lut: Uint8Array, i: number) => rgbToOklab([lut[4 * i] / 255, lut[4 * i + 1] / 255, lut[4 * i + 2] / 255])[0];
const options = { sensitivity: 1, baseline: 0 };
const format = { speed: (v: number) => `${v} m/s`, temperature: (v: number) => `${v} K`, particulates: (v: number) => `${v} ppm` };

test('sequential lookups get darker monotonically', () => {
	for (const layer of ['speed', 'particulates'] as const) {
		// Neighbouring entries can round to the same bytes, so allow a tie, never a rise.
		for (let i = 1; i < 256; i++) expect(lightness(PALETTES[layer], i)).toBeLessThanOrEqual(lightness(PALETTES[layer], i - 1) + 1e-3);
		expect(lightness(PALETTES[layer], 0) - lightness(PALETTES[layer], 255)).toBeGreaterThan(0.5);
	}
});

test('the diverging scale is symmetric in lightness about the baseline, and gray at it', () => {
	const at = (theta: number) => rgbToOklab(colorFor('temperature', theta, { sensitivity: 1, baseline: 2 }));
	for (const d of [0.5, 1.5, 3, 4.5, 6]) expect(Math.abs(at(2 + d)[0] - at(2 - d)[0])).toBeLessThan(0.01);
	const mid = at(2);
	expect(Math.hypot(mid[1], mid[2])).toBeLessThan(0.01);
});

test('the log scale maps decades evenly, and sensitivity slides its window', () => {
	const t = [0.001, 0.01, 0.1, 1, 10].map((ppm) => scaleFraction('particulates', ppm, options));
	t.forEach((v, i) => expect(v).toBeCloseTo(i / 4, 9));
	expect(scaleFraction('particulates', 0.25, { sensitivity: 0.25, baseline: 0 })).toBeCloseTo(0.75, 9);
});

test('colorFor reads the lookup the way the GPU filter does', () => {
	const out: Rgb = [0, 0, 0];
	sampleLut(PALETTES.speed, 1, false, out);
	expect(out[2] * 255).toBeCloseTo(PALETTES.speed[4 * 255 + 2], 6);
	expect(colorFor('speed', 3, options)).toEqual(sampleLut(PALETTES.speed, 1, false));
	expect(colorFor('direction', [0, 0], options)).toEqual(hexToRgb(STOPS.neutral));
});

test('the direction wheel keeps its four compass points apart (validator: normal >= 15 OKLab ΔE×100)', () => {
	const points = [0, 90, 180, 270].map((b) => rgbToOklab(headingRim(b)));
	for (let i = 0; i < 4; i++)
		for (let j = i + 1; j < 4; j++) expect(100 * Math.hypot(...points[i].map((v, k) => v - points[j][k]))).toBeGreaterThan(15);
	for (const [L] of points) expect(L).toBeGreaterThan(0.43);
});

test('legend ticks are ordered, in range and round, and scale with sensitivity', () => {
	for (const sensitivity of [0.25, 1, 4]) {
		const legend = legendFor('speed', { sensitivity, baseline: 0, format });
		const at = legend.ticks.map((tick) => tick.at);
		expect([...at].sort((a, b) => a - b)).toEqual(at);
		for (const tick of legend.ticks) {
			expect(tick.at).toBeGreaterThanOrEqual(0);
			expect(tick.at).toBeLessThanOrEqual(1);
			expect(tick.at).toBeCloseTo(tick.value / (3 * sensitivity), 9);
		}
	}
	const mph = legendFor('speed', { ...options, format, units: { speed: 2.23694 } });
	expect(mph.ticks.map((tick) => Math.round(tick.value * 2.23694 * 1e6) / 1e6)).toEqual([0, 2, 4, 6]);
	expect(legendFor('particulates', { ...options, format }).ticks.map((tick) => tick.value)).toEqual([0.001, 0.01, 0.1, 1, 10]);
});

test('a narrow legend thins its ticks evenly and keeps the ends; the baseline label is never crowded by a round tick', () => {
	const decades = legendFor('particulates', { ...options, format, maxTicks: 3 }).ticks;
	expect(decades.map((tick) => tick.value)).toEqual([0.001, 0.1, 10]);
	expect(decades.map((tick) => tick.at)).toEqual([0, 0.5, 1]);
	expect(legendFor('speed', { ...options, format, maxTicks: 3 }).ticks.length).toBeLessThanOrEqual(3);
	// 21 °C is 69.8 °F, a fifth of a degree from the round 70 °F: that tick would sit under the baseline's own label.
	const fahrenheit = { scale: 1.8, offset: 69.8 };
	for (const maxTicks of [undefined, 3, 4]) {
		const legend = legendFor('temperature', { ...options, format, units: { temperature: fahrenheit }, maxTicks });
		expect(legend.midpoint?.at).toBe(0.5);
		for (const tick of legend.ticks) expect(Math.abs(tick.at - 0.5)).toBeGreaterThanOrEqual(0.5 / (maxTicks ?? 6) - 1e-6);
		expect(legend.ticks.length).toBeLessThanOrEqual(maxTicks ?? 6);
		expect(legend.ticks.length).toBeGreaterThanOrEqual(2);
	}
	const celsius = legendFor('temperature', { ...options, baseline: 0, format, units: { temperature: { scale: 1, offset: 21 } } });
	expect(celsius.ticks.map((tick) => tick.value + 21)).toEqual([16, 18, 20, 22, 24, 26]);
});

test('sampleAt interpolates over air only and reports furniture as not air', () => {
	const nx = 4;
	const nz = 2;
	const fill = (v: number) => new Float32Array(nx * nz).fill(v);
	const slice: Slice = { nx, nz, h: 0.1, y: 1.05, u: fill(1), v: fill(0), w: fill(0), speed: fill(1), theta: fill(2), particulates: fill(0), fluid: new Uint8Array(nx * nz).fill(1) };
	slice.fluid[1] = 0;
	slice.speed[1] = 99;
	// Inside cell 0, whose bilinear neighbour (cell 1) is furniture and must not count.
	const inAir = sampleAt(slice, 0.06, 0.05);
	expect(inAir.air).toBe(true);
	expect(inAir.speed).toBeCloseTo(1, 6);
	expect(sampleAt(slice, 0.15, 0.05).air).toBe(false);
});
