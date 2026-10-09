import { expect, test } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import type { PlanId } from '../../src/lib/experiments/airflow/homes/types';
import { LINK_VERSION, MAX_LINK_LENGTH, MAX_POSITION, decodeSetup, encodeSetup, linkCatalog, normalizeSetup, setupFromHash, setupToHash, type LinkCatalog } from '../../src/lib/experiments/airflow/link';
import { COMPASS_POINTS, bearingToVector, compassName, describeBearing, describeDirection, vectorToBearing } from '../../src/lib/experiments/airflow/readout';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import { DEFAULT_CLOCK, DEFAULT_CONDITIONS, DEFAULT_VIEW, LIMITS, MAX_DEVICES, blankSetup, type Conditions, type DeviceState, type Setup } from '../../src/lib/experiments/airflow/state';
import {
	PARTICULATE_FLOOR,
	QUANTITIES,
	UNIT_SPACE,
	detectUnits,
	displayRange,
	formatAirChanges,
	formatArea,
	formatDuration,
	formatFlow,
	formatLength,
	formatParticulates,
	formatPercent,
	formatSpeed,
	formatTemperature,
	formatTemperatureDelta,
	formatVolume,
	ppmFromUgPerM3,
	sliderRange,
	ugPerM3FromPpm,
	type LimitKey,
	type QuantityName
} from '../../src/lib/experiments/airflow/units';

/*
 * A note on speed. Playwright's `expect` costs about a millisecond a call, and more the more calls a test has already
 * made: a loop of 61,000 of them took 72 seconds, and the loop that decodes random links makes 217,000 and had not
 * finished after three and a half minutes. The test body is synchronous, so the per-test timeout cannot interrupt it,
 * and the test looked like a hang.
 * Every loop below therefore does plain checks, collects what it finds wrong as sentences, and makes one `expect` at the
 * end that shows the first few.
 */

/** Expected text with `_` for the narrow no-break space between a number and its unit. */
const n = (text: string) => text.replaceAll('_', UNIT_SPACE);

/** True when `a` and `b` differ by less than `toBeCloseTo(b, digits)` allows. */
const close = (a: number, b: number, digits: number) => Math.abs(a - b) < 10 ** -digits / 2;

/** A small seeded generator (mulberry32), so a failing random case can be replayed. */
function random(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

test.describe('units: the system a locale gets', () => {
	test('imperial for a United States, Liberia or Myanmar region, metric for anything else', () => {
		for (const tag of ['en-US', 'en-us', 'en_US', 'es-US', 'en-LR', 'my-MM', 'zh-Hant-US', 'zh-yue-US', 'en-US-u-ca-gregory', 'en-US-POSIX', ' en-US ']) expect(detectUnits(tag), tag).toBe('imperial');
		for (const tag of [undefined, '', 'en', 'my', 'en-GB', 'fr-CA', 'es-419', 'de-DE', 'en-Latn', 'zh-yue-HK', 'en-x-us', 'x-us', 'i-klingon', 'us', 'en-USA', '!!']) expect(detectUnits(tag), String(tag)).toBe('metric');
	});
});

test.describe('units: formatting', () => {
	test('temperatures read to a tenth of a degree, with a true minus sign and no negative zero', () => {
		expect(formatTemperature(21, 'metric')).toEqual({ value: '21.0', unit: '°C', text: n('21.0_°C'), spoken: '21.0 degrees Celsius' });
		expect(formatTemperature(21, 'imperial').text).toBe(n('69.8_°F'));
		expect(formatTemperature(0, 'imperial').text).toBe(n('32.0_°F'));
		expect(formatTemperature(-40, 'imperial')).toEqual({ value: '−40.0', unit: '°F', text: n('−40.0_°F'), spoken: 'minus 40.0 degrees Fahrenheit' });
		expect(formatTemperature(-0.04, 'metric').text).toBe(n('0.0_°C'));
		expect(formatTemperature(21.5, 'metric', { digits: 0 }).text).toBe(n('22_°C'));
		// A slider label in °F shows the whole degree the slider is on.
		expect(formatTemperature(QUANTITIES.temperature.fromDisplay(70, 'imperial'), 'imperial', { digits: 0 }).text).toBe(n('70_°F'));
	});

	test('a temperature difference converts at 1.8 °F per kelvin with no offset, signed unless asked not to be', () => {
		expect(formatTemperatureDelta(1, 'imperial').text).toBe(n('+1.8_°F'));
		expect(formatTemperatureDelta(2, 'imperial').spoken).toBe('plus 3.6 degrees Fahrenheit');
		expect(formatTemperatureDelta(-1, 'metric').text).toBe(n('−1.0_°C'));
		expect(formatTemperatureDelta(0, 'imperial').text).toBe(n('0.0_°F'));
		expect(formatTemperatureDelta(2, 'metric', { signed: false }).text).toBe(n('2.0_°C'));
	});

	test('speeds read 0.00 below 1, 0.0 below 10 and whole above, judged after rounding', () => {
		const metric = (value: number) => formatSpeed(value, 'metric').text;
		expect([0, 0.351, 0.996, 2.44, 9.96, 12.4].map(metric)).toEqual(['0.00_m/s', '0.35_m/s', '1.0_m/s', '2.4_m/s', '10_m/s', '12_m/s'].map(n));
		const imperial = (value: number) => formatSpeed(value, 'imperial').text;
		expect([0.1, 1, 15].map(imperial)).toEqual(['0.22_mph', '2.2_mph', '34_mph'].map(n));
		expect(formatSpeed(1, 'imperial').spoken).toBe('2.2 miles per hour');
		expect(formatSpeed(QUANTITIES.speed.fromDisplay(1, 'imperial'), 'imperial', { digits: 0 }).spoken).toBe('1 mile per hour');
		expect(formatSpeed(10.5, 'metric', { digits: 1 }).text).toBe(n('10.5_m/s'));
	});

	test('lengths read in metres, or in feet and inches below 10 ft', () => {
		expect([1.1, 12.34, 123.4].map((m) => formatLength(m, 'metric').text)).toEqual(['1.10_m', '12.3_m', '123_m'].map(n));
		expect(formatLength(1.1, 'metric').spoken).toBe('1.10 metres');
		expect(formatLength(1.1, 'imperial')).toEqual({ value: n('3_ft_7_in'), unit: '', text: n('3_ft_7_in'), spoken: '3 feet 7 inches' });
		expect(formatLength(0.2, 'imperial')).toEqual({ value: '8', unit: 'in', text: n('8_in'), spoken: '8 inches' });
		expect(formatLength(0.0254, 'imperial').spoken).toBe('1 inch');
		expect(formatLength(0.3302, 'imperial').spoken).toBe('1 foot 1 inch');
		expect(formatLength(2.4384, 'imperial').text).toBe(n('8_ft_0_in'));
		// 119.996 inches rounds to 120, which is 10 ft, so it switches to decimal feet.
		expect([3.0479, 6.6, 40].map((m) => formatLength(m, 'imperial').text)).toEqual(['10.0_ft', '21.7_ft', '131_ft'].map(n));
		expect(formatLength(1.1, 'imperial', { feetAndInches: false }).text).toBe(n('3.61_ft'));
		expect(formatLength(1.1, 'imperial', { digits: 1 }).text).toBe(n('3.6_ft'));
	});

	test('areas, volumes, flows, air changes and percentages', () => {
		expect([0.42, 4.25, 41.5].map((a) => formatArea(a, 'metric').text)).toEqual(['0.42_m²', '4.3_m²', '42_m²'].map(n));
		expect(formatArea(1500 * 0.09290304, 'imperial')).toEqual({ value: '1,500', unit: 'sq ft', text: n('1,500_sq ft'), spoken: '1,500 square feet' });
		expect(formatVolume(30, 'metric').text).toBe(n('30_m³'));
		expect(formatVolume(30, 'imperial').text).toBe(n('1,059_cu ft'));
		expect(formatFlow(0.1, 'metric').text).toBe(n('360_m³/h'));
		expect(formatFlow(0.0001, 'metric').text).toBe(n('0.36_m³/h'));
		expect(formatFlow(0.1, 'imperial').text).toBe(n('212_CFM'));
		expect(formatFlow(0.028316846592 / 60, 'imperial').spoken).toBe('1.0 cubic feet per minute');
		expect([0.35, 4.24, 12.4].map((ach) => formatAirChanges(ach).text)).toEqual(['0.35_ACH', '4.2_ACH', '12_ACH'].map(n));
		expect(formatAirChanges(4.24).spoken).toBe('4.2 air changes per hour');
		expect([0.5, 0.123, 1].map((f) => formatPercent(f).text)).toEqual(['50_%', '12_%', '100_%'].map(n));
		expect(formatPercent(0.1234, { digits: 1 }).spoken).toBe('12.3 percent');
	});

	test('simulated time reads as a clock, counting whole seconds and never below zero', () => {
		expect([0, 7.9, 59.99, 60, 723, 3723, 36000].map((s) => formatDuration(s).text)).toEqual(['0:00', '0:07', '0:59', '1:00', '12:03', '1:02:03', '10:00:00']);
		expect([-5, 0, 1, 60, 61, 723, 3723].map((s) => formatDuration(s).spoken)).toEqual(['0 seconds', '0 seconds', '1 second', '1 minute', '1 minute 1 second', '12 minutes 3 seconds', '1 hour 2 minutes 3 seconds']);
		expect(formatDuration(NaN)).toMatchObject({ text: '—', spoken: 'no reading' });
	});

	test('a value that is not a number reads as a dash, not NaN', () => {
		for (const reading of [formatTemperature(NaN, 'metric'), formatSpeed(Infinity, 'imperial'), formatLength(NaN, 'imperial'), formatArea(NaN, 'metric'), formatPercent(NaN)]) {
			expect(reading.text).toBe('—');
			expect(reading.spoken).toBe('no reading');
		}
		expect(formatParticulates(NaN).text).toBe('—');
	});

	test('particulates read in ppm by mass with µg/m³ beside them, to two significant digits, and "less than" below the floor', () => {
		expect(ugPerM3FromPpm(1)).toBeCloseTo(1204, 9);
		expect(ugPerM3FromPpm(1) / 1000).toBe(AIR.rho);
		expect(ppmFromUgPerM3(1204)).toBeCloseTo(1, 12);
		expect(ppmFromUgPerM3(ugPerM3FromPpm(0.0123))).toBeCloseTo(0.0123, 15);

		expect(formatParticulates(ppmFromUgPerM3(14))).toEqual({
			ppm: { value: '0.012', unit: 'ppm', text: n('0.012_ppm'), spoken: '0.012 parts per million' },
			micrograms: { value: '14', unit: 'µg/m³', text: n('14_µg/m³'), spoken: '14 micrograms per cubic metre' },
			text: n('0.012_ppm (14_µg/m³)'),
			spoken: '0.012 parts per million, 14 micrograms per cubic metre'
		});
		expect(formatParticulates(ppmFromUgPerM3(500)).text).toBe(n('0.42_ppm (500_µg/m³)'));
		expect(formatParticulates(ppmFromUgPerM3(1234)).text).toBe(n('1.0_ppm (1,200_µg/m³)'));
		expect(formatParticulates(0.00999).text).toBe(n('0.010_ppm (12_µg/m³)'));
		expect(formatParticulates(PARTICULATE_FLOOR).text).toBe(n('0.0010_ppm (1.2_µg/m³)'));
		for (const ppm of [0.0005, 0, -1e-6, 3e-12]) expect(formatParticulates(ppm).text).toBe(n('<_0.001_ppm (<_1.2_µg/m³)'));
		expect(formatParticulates(0).spoken).toBe('less than 0.001 parts per million, less than 1.2 micrograms per cubic metre');
	});
});

test.describe('units: sliders in display units', () => {
	const shape = ({ min, max, step, digits, unit }: ReturnType<typeof sliderRange>) => ({ min, max, step, digits, unit });

	test('each control in LIMITS gets a range in display units, rounded inward to whole steps in imperial', () => {
		expect(shape(sliderRange('windSpeed', 'metric'))).toEqual({ min: 0, max: 15, step: 0.5, digits: 1, unit: 'm/s' });
		expect(shape(sliderRange('windSpeed', 'imperial'))).toEqual({ min: 0, max: 33, step: 1, digits: 0, unit: 'mph' });
		expect(shape(sliderRange('outdoorTemp', 'imperial'))).toEqual({ min: -22, max: 113, step: 1, digits: 0, unit: '°F' });
		expect(shape(sliderRange('indoorTemp', 'metric'))).toEqual({ min: 10, max: 32, step: 0.5, digits: 1, unit: '°C' });
		expect(shape(sliderRange('indoorTemp', 'imperial'))).toEqual({ min: 50, max: 89, step: 1, digits: 0, unit: '°F' });
		expect(shape(sliderRange('sliceHeight', 'metric'))).toEqual({ min: 0.1, max: 2.3, step: 0.05, digits: 2, unit: 'm' });
		expect(shape(sliderRange('sliceHeight', 'imperial'))).toEqual({ min: 4, max: 90, step: 2, digits: 0, unit: 'in' });
		expect(shape(sliderRange('outdoorPm25', 'imperial'))).toEqual({ min: 0, max: 500, step: 5, digits: 0, unit: 'µg/m³' });
		expect(shape(sliderRange('sensitivity', 'imperial'))).toEqual({ min: 0.25, max: 4, step: 0.05, digits: 2, unit: '×' });
		expect(shape(sliderRange('tilt', 'imperial'))).toEqual({ min: -45, max: 60, step: 1, digits: 0, unit: '°' });
		expect(shape(sliderRange('oscillationPeriod', 'metric'))).toEqual({ min: 4, max: 20, step: 0.5, digits: 1, unit: 's' });
		// A range from the device catalog, such as a pedestal fan's head height.
		expect(shape(displayRange('length', { min: 0.9, max: 1.4, step: 0.05 }, 'imperial'))).toEqual({ min: 36, max: 55, step: 1, digits: 0, unit: 'in' });
	});

	test('every slider position survives the trip to SI exactly and lands inside LIMITS', () => {
		const found: string[] = [];
		for (const key of Object.keys(LIMITS) as LimitKey[])
			for (const units of ['metric', 'imperial'] as const) {
				const range = sliderRange(key, units);
				const positions = Math.round((range.max - range.min) / range.step);
				for (let i = 0; i <= positions; i++) {
					const shown = Number((range.min + i * range.step).toFixed(range.digits));
					const si = range.fromDisplay(shown);
					if (!Object.is(range.toDisplay(si), shown)) found.push(`${key} ${units} ${shown} comes back as ${range.toDisplay(si)}`);
					if (!(si >= LIMITS[key].min - 1e-9 && si <= LIMITS[key].max + 1e-9)) found.push(`${key} ${units} ${shown} is ${si} in SI, outside its LIMITS`);
				}
			}
		expect(found.slice(0, 10)).toEqual([]);
	});

	test('an SI value comes back from display units to within a billionth', () => {
		const next = random(7);
		const found: string[] = [];
		for (const name of Object.keys(QUANTITIES) as QuantityName[])
			for (const units of ['metric', 'imperial'] as const)
				for (let i = 0; i < 200; i++) {
					const value = (next() - 0.5) * 200;
					const back = QUANTITIES[name].fromDisplay(QUANTITIES[name].toDisplay(value, units), units);
					if (!(Math.abs(back - value) < 1e-9)) found.push(`${name} ${units} ${value} comes back as ${back}`);
				}
		expect(found.slice(0, 10)).toEqual([]);
		expect(QUANTITIES.temperature.toDisplay(20, 'imperial')).toBe(68);
		expect(QUANTITIES.temperature.toDisplay(100, 'imperial')).toBe(212);
		expect(QUANTITIES.speed.toDisplay(0.44704, 'imperial')).toBe(1);
		expect(QUANTITIES.length.toDisplay(0.3048, 'imperial')).toBe(12);
		expect(QUANTITIES.speed.toDisplay(3, 'metric')).toBe(3);
	});
});

test.describe('readout: which way the air is going', () => {
	test('16 compass points, each 22.5° wide and centred on its bearing', () => {
		expect(COMPASS_POINTS.map((_, i) => compassName(i * 22.5))).toEqual([...COMPASS_POINTS]);
		expect([359, 360, -45, 810, 11.24, 11.25, 348.74, 348.75, NaN].map(compassName)).toEqual(['N', 'N', 'NW', 'E', 'N', 'NNE', 'NNW', 'N', 'N']);
	});

	test('bearings and vectors use this repo’s axes: east is +x and north is −z', () => {
		expect(vectorToBearing(0, -1)).toBe(0);
		expect(vectorToBearing(1, 0)).toBe(90);
		expect(vectorToBearing(0, 1)).toBe(180);
		expect(vectorToBearing(-1, 0)).toBe(270);
		expect(vectorToBearing(1, -1)).toBeCloseTo(45, 12);
		expect(vectorToBearing(-2, 2)).toBeCloseTo(225, 12);
		expect(vectorToBearing(0, 0)).toBe(0);
		expect(bearingToVector(0)).toEqual({ east: 0, south: -1 });
		expect(bearingToVector(90)).toEqual({ east: 1, south: 0 });
		expect(bearingToVector(180)).toEqual({ east: 0, south: 1 });
		expect(bearingToVector(270)).toEqual({ east: -1, south: 0 });
		expect(bearingToVector(-90)).toEqual({ east: -1, south: 0 });
		expect(bearingToVector(450)).toEqual({ east: 1, south: 0 });
		const northeast = bearingToVector(45);
		expect(northeast.east).toBeCloseTo(Math.SQRT1_2, 12);
		expect(northeast.south).toBeCloseTo(-Math.SQRT1_2, 12);
		const found: string[] = [];
		for (let bearing = 0; bearing < 360; bearing += 7.3) {
			const { east, south } = bearingToVector(bearing);
			if (!close(Math.hypot(east, south), 1, 12)) found.push(`${bearing}: not a unit vector`);
			if (!close(vectorToBearing(east, south), bearing, 9)) found.push(`${bearing}: comes back as ${vectorToBearing(east, south)}`);
			if (!close(vectorToBearing(3 * east, 3 * south), bearing, 9)) found.push(`${bearing}: three times the vector gives ${vectorToBearing(3 * east, 3 * south)}`);
		}
		expect(found.slice(0, 10)).toEqual([]);
	});

	test('a bearing reads as a compass point and whole degrees, wrapped into 0 to 359', () => {
		expect(describeBearing(270)).toEqual({ degrees: 270, compass: 'W', text: 'W 270°', spoken: 'west, 270 degrees' });
		expect(describeBearing(359.6)).toEqual({ degrees: 0, compass: 'N', text: 'N 0°', spoken: 'north, 0 degrees' });
		expect(describeBearing(-90).text).toBe('W 270°');
		expect(describeBearing(1).spoken).toBe('north, 1 degree');
		expect(describeBearing(22).text).toBe('NNE 22°');
		expect([NaN, Infinity].map((x) => describeBearing(x).text)).toEqual(['N 0°', 'N 0°']);
	});

	test('the wording: a compass point or a cardinal word, then rising, sinking or level', () => {
		expect(describeDirection(0, 0, 0)).toEqual({ speed: 0, heading: 0, compass: 'N', tilt: 0, text: 'still', spoken: 'still' });
		expect(describeDirection(0.015, 0, 0.01).text).toBe('still');
		expect(describeDirection(0.05, 0, 0, 0.1).text).toBe('still');
		expect(describeDirection(NaN, 0, 0)).toMatchObject({ speed: 0, text: 'still' });

		expect(describeDirection(0, 0, 0.5)).toEqual({ speed: 0.5, heading: 180, compass: 'S', tilt: 0, text: 'toward the south, level', spoken: 'toward the south, level' });
		const rise = Math.tan((12 * Math.PI) / 180);
		const northeast = describeDirection(0.4 * Math.SQRT1_2, 0.4 * rise, -0.4 * Math.SQRT1_2);
		expect(northeast.heading).toBeCloseTo(45, 9);
		expect(northeast.tilt).toBeCloseTo(12, 9);
		expect(northeast).toMatchObject({ compass: 'NE', text: 'toward NE, rising 12°', spoken: 'toward the northeast, rising 12 degrees' });
		expect(describeDirection(-0.5, -0.1, 0).text).toBe('toward the west, sinking 11°');
		const nne = describeDirection(Math.sin(Math.PI / 8), 0, -Math.cos(Math.PI / 8));
		expect(nne).toMatchObject({ compass: 'NNE', text: 'toward NNE, level', spoken: 'toward the north-northeast, level' });
		// Under 3° reads as level; from 80° the air is going straight up or down.
		expect(describeDirection(0.3, 0.3 * Math.tan((2.4 * Math.PI) / 180), 0).text).toBe('toward the east, level');
		expect(describeDirection(0.3, 0.3 * Math.tan((3 * Math.PI) / 180), 0).text).toBe('toward the east, rising 3°');
		expect(describeDirection(0, 0.5, 0)).toMatchObject({ tilt: 90, text: 'straight up', spoken: 'straight up' });
		expect(describeDirection(0.05, -0.5, 0).text).toBe('straight down');
	});
});

const HOUSE_OPENINGS = [
	'front-door',
	'back-door',
	'patio-sliding-door',
	'garage-entry-door',
	'living-room-south-window',
	'living-room-west-window',
	'dining-room-south-window',
	'kitchen-east-window',
	'kitchen-garden-window',
	'primary-bedroom-north-window',
	'primary-bedroom-east-window',
	'primary-bedroom-door',
	'primary-bath-window',
	'primary-bath-door',
	'primary-closet-door',
	'bedroom-2-north-window',
	'bedroom-2-door',
	'bedroom-2-closet-door',
	'bedroom-3-west-window',
	'bedroom-3-door',
	'bedroom-3-closet-door',
	'hall-bath-window',
	'hall-bath-door',
	'hall-linen-door',
	'laundry-window',
	'laundry-door',
	'office-north-window',
	'office-door'
];

/** Hand-made stand-ins for the plans and the device catalog, with ids as long as real ones are likely to be. */
const CATALOG: LinkCatalog = {
	plans: [
		{ id: 'studio', openings: ['entry-door', 'main-window-east', 'main-window-west', 'kitchen-window', 'bath-door', 'bath-window'] },
		{ id: 'one-bedroom', openings: ['entry-door', 'living-window', 'living-sliding-door', 'bedroom-window', 'bedroom-door', 'bath-door', 'kitchen-window'] },
		{ id: 'two-bedroom', openings: ['entry-door', 'balcony-sliding-door', 'living-window', 'kitchen-window', 'bedroom-1-window', 'bedroom-1-door', 'bedroom-2-window', 'bedroom-2-door', 'bath-door', 'bath-window'] },
		{ id: 'house', openings: HOUSE_OPENINGS }
	],
	models: ['box-fan-lasko-b20200', 'box-fan-honeywell-hw-305', 'pedestal-fan-vornado-683', 'pedestal-fan-lasko-2535', 'window-fan-bionaire-bw2300', 'window-fan-holmes-hawf2041', 'purifier-small-levoit-core-300', 'purifier-medium-coway-ap-1512', 'purifier-large-blueair-211i']
};

/** The same shape from the real plans' ids, with the stand-in models: what the page will build with `linkCatalog`. */
const REAL_CATALOG = linkCatalog(
	plans,
	CATALOG.models.map((id) => ({ id }))
);

function randomSetup(next: () => number, wild = false): Setup {
	const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];
	const between = (min: number, max: number) => min + (max - min) * next();
	// Edge values often: the ends of a range, a default, or (when wild) something outside it or not a number.
	const value = (min: number, max: number, fallback: number) => {
		const roll = next();
		if (wild && roll < 0.1) return pick([NaN, Infinity, -Infinity, min - 50, max + 50, -0]);
		if (roll < 0.25) return pick([min, max, fallback]);
		return wild ? between(min - (max - min) / 2, max + (max - min) / 2) : between(min, max);
	};
	const plan = pick(CATALOG.plans);
	const devices = Array.from({ length: Math.floor(next() * (wild ? 9 : 7)) }, (_, i): DeviceState => {
		const device: DeviceState = {
			id: `fan-${i}`,
			model: pick(CATALOG.models),
			x: value(0, 15, 0),
			z: value(0, 10, 0),
			y: next() < 0.6 ? 0 : value(0, 1.2, 0),
			yaw: value(0, 360, 0),
			tilt: next() < 0.5 ? 0 : value(LIMITS.tilt.min, LIMITS.tilt.max, 0),
			power: value(0, 1, 1),
			height: next() < 0.5 ? 0 : value(0.8, 1.4, 1.2),
			oscillation: { on: next() < 0.5, sweep: value(LIMITS.oscillationSweep.min, LIMITS.oscillationSweep.max, 90), period: value(LIMITS.oscillationPeriod.min, LIMITS.oscillationPeriod.max, 8) }
		};
		if (next() < 0.3) device.opening = pick(plan.openings);
		if (next() < 0.3) device.intake = next() < 0.5;
		return device;
	});
	const openings: Record<string, number> = {};
	for (const id of plan.openings) if (next() < 0.5) openings[id] = value(0, 1, 0);
	const conditions =
		next() < 0.2
			? { ...DEFAULT_CONDITIONS }
			: {
					windFrom: value(0, 360, 270),
					windSpeed: value(LIMITS.windSpeed.min, LIMITS.windSpeed.max, 0),
					outdoorTemp: value(LIMITS.outdoorTemp.min, LIMITS.outdoorTemp.max, 10),
					indoorTemp: value(LIMITS.indoorTemp.min, LIMITS.indoorTemp.max, 21),
					outdoorPm25: value(LIMITS.outdoorPm25.min, LIMITS.outdoorPm25.max, 0)
				};
	return { plan: plan.id, furniture: next() < 0.5, devices, openings, conditions };
}

/** Six devices with every field away from its default, the longest model ids, and every opening of the biggest plan set. */
function maximalSetup(): Setup {
	const plan = CATALOG.plans.find((p) => p.id === 'house')!;
	const models = [...CATALOG.models].sort((a, b) => b.length - a.length).slice(0, MAX_DEVICES);
	const devices = models.map(
		(model, i): DeviceState => ({
			id: `fan-${i}`,
			model,
			x: 14.37 - i,
			z: 9.83 - i,
			y: 0.91,
			yaw: 359,
			tilt: -44,
			power: 0.73,
			height: 1.37,
			oscillation: { on: true, sweep: 117, period: 19.7 },
			opening: plan.openings[plan.openings.length - 1 - i],
			intake: true
		})
	);
	return {
		plan: 'house',
		furniture: true,
		devices,
		openings: Object.fromEntries(plan.openings.map((id, i) => [id, 0.37 + i / 100])),
		conditions: { windFrom: 359, windSpeed: 14.7, outdoorTemp: -29.5, indoorTemp: 31.5, outdoorPm25: 499 }
	};
}

/**
 * What is wrong with a decoded setup, as sentences (none when it is as it must be, and none for null): every number
 * within LIMITS and on the link's precision, only ids the catalog knows, at most MAX_DEVICES devices with fresh ids, and
 * a setup that survives another trip through the link unchanged. Plain checks, not `expect` calls: see the note on speed.
 */
function invalidities(setup: Setup | null, catalog = CATALOG): string[] {
	if (setup === null) return [];
	const bad: string[] = [];
	const plan = catalog.plans.find((p) => p.id === setup.plan);
	if (!plan) bad.push(`plan ${setup.plan} is not in the catalog`);
	const within = (what: string, x: number, min: number, max: number) => {
		if (!(Number.isFinite(x) && x >= min && x <= max)) bad.push(`${what} is ${x}, outside ${min} to ${max}`);
	};
	if (typeof setup.furniture !== 'boolean') bad.push('furniture is not true or false');
	if (setup.devices.length > MAX_DEVICES) bad.push(`${setup.devices.length} devices, more than ${MAX_DEVICES}`);
	setup.devices.forEach((device, i) => {
		const at = `device ${i + 1}`;
		if (device.id !== `d${i + 1}`) bad.push(`${at} has the id ${device.id}`);
		if (!catalog.models.includes(device.model)) bad.push(`${at} has the model ${device.model}, which the catalog lacks`);
		within(`${at} x`, device.x, 0, MAX_POSITION);
		within(`${at} z`, device.z, 0, MAX_POSITION);
		within(`${at} y`, device.y, 0, 2.4);
		within(`${at} height`, device.height, 0, 2.4);
		within(`${at} yaw`, device.yaw, 0, 359);
		within(`${at} tilt`, device.tilt, LIMITS.tilt.min, LIMITS.tilt.max);
		within(`${at} power`, device.power, 0, 1);
		within(`${at} sweep`, device.oscillation.sweep, LIMITS.oscillationSweep.min, LIMITS.oscillationSweep.max);
		within(`${at} period`, device.oscillation.period, LIMITS.oscillationPeriod.min, LIMITS.oscillationPeriod.max);
		if (typeof device.oscillation.on !== 'boolean') bad.push(`${at} oscillation.on is not true or false`);
		if (device.opening !== undefined && !plan?.openings.includes(device.opening)) bad.push(`${at} sits in the opening ${device.opening}, which its plan lacks`);
		if (device.intake !== undefined && typeof device.intake !== 'boolean') bad.push(`${at} intake is not true or false`);
	});
	for (const [id, amount] of Object.entries(setup.openings)) {
		if (!plan?.openings.includes(id)) bad.push(`the opening ${id} is not in the plan`);
		within(`opening ${id}`, amount, 0, 1);
	}
	within('windFrom', setup.conditions.windFrom, 0, 359);
	for (const key of ['windSpeed', 'outdoorTemp', 'indoorTemp', 'outdoorPm25'] as const) within(key, setup.conditions[key], LIMITS[key].min, LIMITS[key].max);
	// A decoded setup is already as the link keeps it, so it survives another trip unchanged.
	if (!isDeepStrictEqual(normalizeSetup(setup), setup)) bad.push('normalizeSetup changes it');
	if (!isDeepStrictEqual(decodeSetup(encodeSetup(setup), catalog), setup)) bad.push('another trip through the link changes it');
	return bad;
}

/** For a setup checked once. A loop collects `invalidities` itself. */
function expectValid(setup: Setup | null, catalog = CATALOG) {
	expect(invalidities(setup, catalog)).toEqual([]);
}

/** Raw link parts, to give the decoder links the encoder would never write: numbers become varints, arrays are bytes as they are. */
const varint = (value: number): number[] => {
	const bytes: number[] = [];
	for (; value >= 0x80; value = Math.floor(value / 0x80)) bytes.push((value % 0x80) | 0x80);
	return [...bytes, value];
};
const strings = (...texts: string[]) => [...varint(texts.length), ...texts.flatMap((text) => [0, ...varint(Buffer.byteLength(text)), ...Buffer.from(text)])];
const craft = (...parts: (number | number[])[]) => LINK_VERSION + Buffer.from(parts.flatMap((part) => (Array.isArray(part) ? part : varint(part)))).toString('base64url');
/** The device mask bits, as documented in link.ts. */
const BIT = { x: 1, z: 2, yaw: 4, power: 8, tilt: 16, y: 32, height: 64, sweep: 128, period: 256, oscillating: 512, opening: 1024, intakeSet: 2048, intake: 4096 };
/** The largest five-byte varint, 2^35 − 1, and the even number below it. */
const HUGE_ODD = [0xff, 0xff, 0xff, 0xff, 0x7f];
const HUGE_EVEN = [0xfe, 0xff, 0xff, 0xff, 0x7f];

test.describe('link: the shareable setup', () => {
	test('decoding an encoded setup gives normalizeSetup of it, for random setups in and out of range', () => {
		const next = random(30);
		const found: string[] = [];
		for (let i = 0; i < 400; i++) {
			const setup = randomSetup(next, i % 2 === 1);
			const normal = normalizeSetup(setup);
			const link = encodeSetup(setup);
			if (!isDeepStrictEqual(decodeSetup(link, CATALOG), normal)) found.push(`setup ${i}: ${link} does not decode to normalizeSetup of it`);
			if (encodeSetup(normal) !== link) found.push(`setup ${i}: the normalized setup encodes to another link`);
			if (!isDeepStrictEqual(normalizeSetup(normal), normal)) found.push(`setup ${i}: normalizeSetup is not idempotent`);
			found.push(...invalidities(normal).map((what) => `setup ${i}: ${what}`));
		}
		expect(found.slice(0, 10)).toEqual([]);
	});

	test('numbers keep a fixed precision: centimetres, degrees, percent, half degrees', () => {
		const setup: Setup = {
			plan: 'studio',
			furniture: false,
			devices: [{ id: 'fan', model: 'pedestal-fan-vornado-683', x: 1.234, z: 2.346, y: 0.756, yaw: 359.6, tilt: -12.4, power: 0.556, height: 1.2049, oscillation: { on: true, sweep: 87.5, period: 7.96 }, opening: 'bath-window', intake: false }],
			openings: { 'bath-door': 0.333, 'entry-door': 0.004 },
			conditions: { windFrom: 0.4, windSpeed: 3.14, outdoorTemp: -7.3, indoorTemp: 21.26, outdoorPm25: 35.5 }
		};
		const expected: Setup = {
			plan: 'studio',
			furniture: false,
			devices: [{ id: 'd1', model: 'pedestal-fan-vornado-683', x: 1.23, z: 2.35, y: 0.76, yaw: 0, tilt: -12, power: 0.56, height: 1.2, oscillation: { on: true, sweep: 88, period: 8 }, opening: 'bath-window', intake: false }],
			openings: { 'bath-door': 0.33, 'entry-door': 0 },
			conditions: { windFrom: 0, windSpeed: 3.1, outdoorTemp: -7.5, indoorTemp: 21.5, outdoorPm25: 36 }
		};
		expect(normalizeSetup(setup)).toEqual(expected);
		expect(decodeSetup(encodeSetup(setup), CATALOG)).toEqual(expected);
	});

	test('values that are not numbers take their defaults, and infinities clamp', () => {
		const weird = {
			plan: 'studio',
			furniture: 'yes',
			devices: [{ id: 'q', model: 'box-fan-lasko-b20200', x: NaN, z: Infinity, y: -Infinity, yaw: -Infinity, tilt: 1e308, power: '0.5', height: -5, oscillation: { on: 1, sweep: NaN, period: 1e9 }, opening: '' }, { id: 'no-model', x: 1 }],
			openings: { 'entry-door': NaN, 'bath-door': 7, 'main-window-east': -1 },
			conditions: { windFrom: NaN, windSpeed: -3, outdoorTemp: Infinity, indoorTemp: '20', outdoorPm25: 1e12 }
		} as unknown as Setup;
		const expected: Setup = {
			plan: 'studio',
			furniture: true,
			devices: [{ id: 'd1', model: 'box-fan-lasko-b20200', x: 0, z: MAX_POSITION, y: 0, yaw: 0, tilt: 60, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 20 } }],
			openings: { 'bath-door': 1, 'entry-door': 0, 'main-window-east': 0 },
			conditions: { windFrom: 270, windSpeed: 0, outdoorTemp: 45, indoorTemp: 21, outdoorPm25: 500 }
		};
		expect(normalizeSetup(weird)).toEqual(expected);
		expect(decodeSetup(encodeSetup(weird), CATALOG)).toEqual(expected);
	});

	test('a maximal setup encodes to under 1,500 characters, and an empty one to a few', () => {
		const setup = maximalSetup();
		const link = encodeSetup(setup);
		console.log(`maximal setup (6 devices, ${HOUSE_OPENINGS.length} openings): ${link.length} characters; blank setup: ${encodeSetup(blankSetup('studio')).length}`);
		expect(link.length).toBeLessThan(1500);
		expect(decodeSetup(link, CATALOG)).toEqual(normalizeSetup(setup));
		expect(encodeSetup(blankSetup('studio')).length).toBeLessThan(30);
		expect(decodeSetup(encodeSetup(blankSetup('house')), CATALOG)).toEqual(blankSetup('house'));
	});

	test('the link is a version tag and URL-safe base64url without padding', () => {
		for (const link of [encodeSetup(maximalSetup()), encodeSetup(blankSetup('studio'))]) {
			expect(link).toMatch(/^1\.[A-Za-z0-9_-]+$/);
			const payload = link.slice(LINK_VERSION.length);
			expect(Buffer.from(payload, 'base64url').toString('base64url')).toBe(payload);
		}
	});

	test('equal setups give the same link, whatever their key order; the view, pins, clock and units are not carried', () => {
		const setup = maximalSetup();
		const link = encodeSetup(setup);
		const reordered = structuredClone(setup);
		reordered.openings = Object.fromEntries(Object.entries(setup.openings).reverse());
		expect(encodeSetup(reordered)).toBe(link);
		const withExtras = { ...setup, view: { ...DEFAULT_VIEW, units: 'imperial' }, pins: [{ id: 'p1', x: 1, y: 1.1, z: 1 }], clock: DEFAULT_CLOCK, smoke: [1, 2, 3] } as unknown as Setup;
		expect(encodeSetup(withExtras)).toBe(link);
		expect(encodeSetup({ ...setup, devices: setup.devices.map((device, i) => ({ ...device, id: `other-${i}` })) })).toBe(link);
		expect(encodeSetup({ ...setup, furniture: false })).not.toBe(link);
	});

	test('fields a link leaves out take their defaults', () => {
		const link = craft(strings('box-fan-lasko-b20200', 'studio'), 1, 1, 0, 1, 0, 0, 0);
		expect(decodeSetup(link, CATALOG)).toEqual({
			plan: 'studio',
			furniture: true,
			devices: [{ id: 'd1', model: 'box-fan-lasko-b20200', x: 0, z: 0, y: 0, yaw: 0, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 } }],
			openings: {},
			// The link's own defaults, which are not DEFAULT_CONDITIONS: see V1_CONDITIONS in link.ts.
			conditions: { windFrom: 270, windSpeed: 0, outdoorTemp: 10, indoorTemp: 21, outdoorPm25: 0 }
		});
	});

	test('links made by version 1 keep decoding to the same setup, whatever the page changes later', () => {
		// Written by the first version of the codec, with a negative outdoor temperature (the zigzag-coded field). If this fails
		// the wire format changed: give the new format a new version tag and keep decoding these, do not edit the strings.
		const typical = '1.BgANYmF0aHJvb20tZG9vcgENZWRyb29tLTEtZG9vcgETb3gtZmFuLWxhc2tvLWIyMDIwMAAKZnJvbnQtZG9vcgAdcHVyaWZpZXItbWVkaXVtLWNvd2F5LWFwLTE1MTIAC3R3by1iZWRyb29tBQEHWigdAgIP1ALXAVpCBAOMBpcEAwAyARkDZA';
		const blank = '1.AQAGc3R1ZGlvAAEAAAA';
		expect(decodeSetup(blank, REAL_CATALOG)).toEqual({ plan: 'studio', furniture: true, devices: [], openings: {}, conditions: { windFrom: 270, windSpeed: 0, outdoorTemp: 10, indoorTemp: 21, outdoorPm25: 0 } });
		expect(decodeSetup(typical, REAL_CATALOG)).toEqual({
			plan: 'two-bedroom',
			furniture: true,
			devices: [
				{ id: 'd1', model: 'box-fan-lasko-b20200', x: 3.4, z: 2.15, y: 0, yaw: 90, tilt: 0, power: 0.66, height: 0, oscillation: { on: false, sweep: 90, period: 8 } },
				{ id: 'd2', model: 'purifier-medium-coway-ap-1512', x: 7.8, z: 5.35, y: 0, yaw: 0, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 } }
			],
			openings: { 'bathroom-door': 0.5, 'bedroom-1-door': 0.25, 'front-door': 1 },
			conditions: { windFrom: 90, windSpeed: 4, outdoorTemp: -7.5, indoorTemp: 21, outdoorPm25: 0 }
		});
	});

	test('numbers far outside LIMITS are clamped, and bearings wrapped', () => {
		const numbers = BIT.x | BIT.z | BIT.yaw | BIT.power | BIT.tilt | BIT.y | BIT.height | BIT.sweep | BIT.period;
		const fields = (huge: number[]) => [huge, huge, huge, huge, huge, huge, huge, huge, huge];
		const link = craft(strings('house', 'pedestal-fan-vornado-683'), 0, 0, 31, HUGE_ODD, HUGE_ODD, HUGE_ODD, HUGE_ODD, HUGE_ODD, 2, 1, numbers, ...fields(HUGE_ODD), 1, numbers, ...fields(HUGE_EVEN), 0);
		const setup = decodeSetup(link, CATALOG);
		const wrapped = (2 ** 35 - 1) % 360;
		// Odd varints are negative in the zigzag-coded fields (tilt, outdoor temperature), even ones positive.
		expect(setup?.conditions).toEqual({ windFrom: wrapped, windSpeed: 15, outdoorTemp: -30, indoorTemp: 32, outdoorPm25: 500 });
		expect(setup?.devices.map(({ x, z, y, yaw, tilt, power, height, oscillation }) => ({ x, z, y, yaw, tilt, power, height, oscillation }))).toEqual([
			{ x: MAX_POSITION, z: MAX_POSITION, y: 2.4, yaw: wrapped, tilt: -45, power: 1, height: 2.4, oscillation: { on: false, sweep: 120, period: 20 } },
			{ x: MAX_POSITION, z: MAX_POSITION, y: 2.4, yaw: (2 ** 35 - 2) % 360, tilt: 60, power: 1, height: 2.4, oscillation: { on: false, sweep: 120, period: 20 } }
		]);
		expectValid(setup);
	});

	test('unknown models and openings are dropped, devices are capped at six, and ids are fresh', () => {
		// Two devices of an unknown model, then seven known ones at x = 3 to 9 m; one known device sits in an unknown opening.
		// Every number is a varint: the mask for a device in an opening is 7,169 and x is in centimetres, both over 127.
		const device = (model: number, x: number, extra: number[] = []) => [...varint(model), ...varint(BIT.x | (extra.length ? BIT.opening | BIT.intakeSet | BIT.intake : 0)), ...varint(x * 100), ...extra.flatMap(varint)];
		const link = craft(
			strings('house', 'mystery-fan', 'box-fan-lasko-b20200', 'attic-hatch', 'front-door', 'back-door'),
			0,
			1,
			0,
			9,
			device(1, 1),
			device(1, 2),
			device(2, 3, [3]),
			...[4, 5, 6, 7, 8, 9].map((x) => device(2, x)),
			3,
			[4, 50, 3, 20, 5, 100]
		);
		const setup = decodeSetup(link, CATALOG);
		expect(setup?.devices.map((d) => [d.id, d.x])).toEqual([
			['d1', 3],
			['d2', 4],
			['d3', 5],
			['d4', 6],
			['d5', 7],
			['d6', 8]
		]);
		expect(setup?.devices[0].opening).toBeUndefined();
		expect(setup?.devices[0].intake).toBe(true);
		expect(setup?.openings).toEqual({ 'back-door': 1, 'front-door': 0.5 });
		expectValid(setup);

		// The same through the encoder: a catalog without a model drops its devices; one without the plan gives null.
		const setupWithTwoModels: Setup = { ...blankSetup('studio'), devices: [maximalSetup().devices[0], { ...maximalSetup().devices[1], opening: undefined }] };
		const smaller: LinkCatalog = { plans: CATALOG.plans.filter((p) => p.id !== 'house'), models: [setupWithTwoModels.devices[1].model] };
		const decoded = decodeSetup(encodeSetup(setupWithTwoModels), smaller);
		expect(decoded?.devices.map((d) => [d.id, d.model])).toEqual([['d1', setupWithTwoModels.devices[1].model]]);
		expect(decodeSetup(encodeSetup(maximalSetup()), smaller)).toBeNull();
	});

	test('ids are UTF-8, and strings that share a start share its bytes', () => {
		const catalog: LinkCatalog = { plans: [{ id: 'studio', openings: ['fenêtre-sud', 'fenêtre-nord', 'porte', 'p', 'porte-2'] }], models: ['ventilateur-électrique', 'ventilateur-🙂'] };
		const setup: Setup = {
			...blankSetup('studio'),
			devices: [{ ...maximalSetup().devices[0], model: 'ventilateur-🙂', opening: 'fenêtre-nord' }, { ...maximalSetup().devices[1], model: 'ventilateur-électrique', opening: 'porte-2' }],
			openings: { 'fenêtre-sud': 0.5, 'fenêtre-nord': 1, porte: 0.25, p: 0.1, 'porte-2': 0 }
		};
		expect(decodeSetup(encodeSetup(setup), catalog)).toEqual(normalizeSetup(setup));
		expectValid(decodeSetup(encodeSetup(setup), catalog), catalog);

		// A string longer than any known id is not kept whole, yet a later one built on its first bytes still matches.
		const front = (shared: number, text: string) => [shared, ...varint(Buffer.byteLength(text)), ...Buffer.from(text)];
		const link = craft([5, ...front(0, 'fenêtre-sud-annex-7'), ...front(18, '8'), ...front(9, 'nord'), ...front(0, 'studio'), ...front(0, 'ventilateur-🙂')], 3, 1, 0, 1, 4, BIT.opening, 2, 2, [2, 40, 1, 20]);
		expect(decodeSetup(link, catalog)).toMatchObject({ devices: [{ model: 'ventilateur-🙂', opening: 'fenêtre-nord' }], openings: { 'fenêtre-nord': 0.4 } });
	});

	test('a wrong version, an unknown plan or a broken structure gives null', () => {
		const good = encodeSetup(maximalSetup());
		const fan = 'box-fan-lasko-b20200';
		const cases = {
			empty: '',
			'no payload': '1.',
			'no dot': '1',
			'version 2': `2.${good.slice(2)}`,
			'prefixed version': `v${good}`,
			padding: `${good}=`,
			'not base64url': `${good.slice(0, -1)}*`,
			'impossible base64 length': '1.AAAAA',
			truncated: craft(strings('studio'), 0, 1, 0, 0),
			'trailing byte': craft(strings('studio'), 0, 1, 0, 0, 0, 0),
			'unknown plan': craft(strings('penthouse'), 0, 1, 0, 0, 0),
			'plan index outside the strings': craft(strings('studio'), 1, 1, 0, 0, 0),
			'unknown flag': craft(strings('studio'), 0, 2, 0, 0, 0),
			'unknown condition': craft(strings('studio'), 0, 1, 32, 0, 0, 0),
			'unknown device bit': craft(strings('studio', fan), 0, 1, 0, 1, 1, 1 << 13, 0),
			'intake value without intake': craft(strings('studio', fan), 0, 1, 0, 1, 1, BIT.intake, 0),
			'opening index outside the strings': craft(strings('studio', fan), 0, 1, 0, 1, 1, BIT.opening, 9, 0),
			'more strings than bytes': craft(1000, 0, 6, ...Buffer.from('studio')),
			'more devices than bytes': craft(strings('studio'), 0, 1, 0, 500, 0),
			'shares more than the string before': craft([1, 3, 6, ...Buffer.from('studio')], 0, 1, 0, 0, 0),
			'six-byte varint': craft(strings('studio'), 0, 1, [0x80, 0x80, 0x80, 0x80, 0x80, 0x00], 0, 0)
		};
		for (const [name, text] of Object.entries(cases)) expect(decodeSetup(text, CATALOG), name).toBeNull();
		expect(decodeSetup(` ${good}\n`, CATALOG)).toEqual(normalizeSetup(maximalSetup()));
	});

	test('decoding never throws: random text and bytes, truncated and corrupted links, wrong types', () => {
		const next = random(99);
		const base64url = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
		const noise = `${base64url}.=+/ %#&~é🙂\u0000\n`;
		const found: string[] = [];
		/** Decodes without `expect`, noting a throw or an invalid setup instead (see the note on speed). The catalog is this file's unless one is passed, `undefined` included. */
		const decode = (text: unknown, ...given: [unknown?]): Setup | null => {
			const catalog = (given.length ? given[0] : CATALOG) as LinkCatalog;
			try {
				const setup = decodeSetup(text as string, catalog);
				found.push(...invalidities(setup, catalog).map((what) => `${what}, from ${String(text).slice(0, 60)}`));
				return setup;
			} catch (error) {
				found.push(`threw ${String(error)} on ${String(text).slice(0, 60)}`);
				return null;
			}
		};
		const randomBytes = (count: number) => Array.from({ length: count }, () => Math.floor(next() * 256));
		for (let i = 0; i < 2000; i++) {
			const characters = next() < 0.8 ? base64url : noise;
			let text = next() < 0.7 ? LINK_VERSION : '';
			for (let length = Math.floor(next() ** 2 * 600); length > 0; length--) text += characters[Math.floor(next() * characters.length)];
			decode(text);
		}

		// Random bytes behind the version tag, alone and behind the start of a real link (two strings, the plan, furniture), so the decoder gets past the strings.
		const start = [...strings('studio', 'box-fan-lasko-b20200'), 0, 1];
		for (let i = 0; i < 2000; i++) decode(LINK_VERSION + Buffer.from([...(i % 2 ? start : []), ...randomBytes(Math.floor(next() ** 2 * 300))]).toString('base64url'));

		const link = encodeSetup(maximalSetup());
		for (let end = 0; end <= link.length; end++) decode(link.slice(0, end));

		// Corrupted links: characters replaced, and bytes overwritten, in links to random setups.
		let decoded = 0;
		const trials = 3000;
		for (let i = 0; i < trials; i++) {
			const original = encodeSetup(randomSetup(next));
			let text: string;
			if (i % 2) {
				const chars = [...original];
				for (let k = 1 + Math.floor(next() * 3); k > 0; k--) chars[2 + Math.floor(next() * (chars.length - 2))] = base64url[Math.floor(next() * 64)];
				text = chars.join('');
			} else {
				const bytes = Buffer.from(original.slice(2), 'base64url');
				bytes[Math.floor(next() * bytes.length)] = Math.floor(next() * 256);
				text = LINK_VERSION + bytes.toString('base64url');
			}
			if (decode(text)) decoded++;
		}
		console.log(`corrupted links: ${decoded} of ${trials} still decoded to a valid setup, the rest to null`);
		// Enough of them decode that the checks above were exercised on real setups.
		expect(decoded).toBeGreaterThan(trials / 10);

		const notNull: string[] = [];
		for (const value of [undefined, null, 42, {}, [], true, Symbol('link')]) if (decode(value) !== null) notNull.push(`a ${typeof value} gave a setup`);
		for (const catalog of [null, undefined, {}, { plans: 'none', models: 5 }, { plans: [null], models: [] }]) if (decode(link, catalog) !== null) notNull.push(`the catalog ${JSON.stringify(catalog)} gave a setup`);
		expect(notNull).toEqual([]);
		expect(found.slice(0, 10)).toEqual([]);
	});

	test(`decoding reads at most ${MAX_LINK_LENGTH} characters, whatever it is given`, () => {
		const setup = maximalSetup();
		const link = encodeSetup(setup);
		expect(decodeSetup(link.padEnd(MAX_LINK_LENGTH, ' '), CATALOG)).toEqual(normalizeSetup(setup));
		expect(decodeSetup(link.padEnd(MAX_LINK_LENGTH + 1, ' '), CATALOG)).toBeNull();
		const huge = `${LINK_VERSION}${'A'.repeat(10_000_000)}`;
		const hash = `#s=${huge}`;
		let refused = 0;
		const started = performance.now();
		for (let i = 0; i < 100; i++) {
			if (decodeSetup(huge, CATALOG) === null) refused++;
			if (setupFromHash(hash, CATALOG) === null) refused++;
		}
		const elapsed = performance.now() - started;
		expect(refused).toBe(200);
		// Both look at the length and stop: scanning ten megabytes a hundred times would take seconds.
		expect(elapsed).toBeLessThan(500);
	});

	test('the location hash carries the link as s=', () => {
		const setup = randomSetup(random(3));
		const hash = setupToHash(setup);
		expect(hash.startsWith(`#s=${LINK_VERSION}`)).toBe(true);
		expect(hash).toBe(`#s=${encodeSetup(setup)}`);
		for (const text of [hash, hash.slice(1), `#view=top&${hash.slice(1)}`, `#view=top&${hash.slice(1)}&units=imperial`]) expect(setupFromHash(text, CATALOG), text).toEqual(normalizeSetup(setup));
		for (const text of ['', '#', '#s=', '#x=1', `#ss=${encodeSetup(setup)}`, `#xs=${encodeSetup(setup)}`, undefined]) expect(setupFromHash(text as string, CATALOG), String(text)).toBeNull();
	});

	test('a typical setup, two devices and three openings changed, is a short link', () => {
		const [first, second, third] = plans.find((p) => p.id === 'two-bedroom')!.openings.map((o) => o.id);
		const setup: Setup = {
			plan: 'two-bedroom',
			furniture: true,
			devices: [
				{ id: 'd1', model: 'box-fan-lasko-b20200', x: 3.4, z: 2.15, y: 0, yaw: 90, tilt: 0, power: 0.66, height: 0, oscillation: { on: false, sweep: 90, period: 8 } },
				{ id: 'd2', model: 'purifier-medium-coway-ap-1512', x: 7.8, z: 5.35, y: 0, yaw: 0, tilt: 0, power: 1, height: 0, oscillation: { on: false, sweep: 90, period: 8 } }
			],
			openings: { [first]: 1, [second]: 0.5, [third]: 0.25 },
			conditions: { ...DEFAULT_CONDITIONS, windFrom: 90, windSpeed: 4, outdoorTemp: 28 }
		};
		const link = encodeSetup(setup);
		console.log(`typical setup (2 devices, 3 openings changed, new weather): ${link.length} characters`);
		// The brief allows about 1.5 kB; this is a tenth of that.
		expect(link.length).toBeLessThan(300);
		expect(decodeSetup(link, REAL_CATALOG)).toEqual(normalizeSetup(setup));
	});

	test('every real plan, with every opening changed and six devices, survives the link in under 1,500 characters', () => {
		const found: string[] = [];
		const lengths: string[] = [];
		for (const plan of plans) {
			const ids = plan.openings.map((o) => o.id);
			const setup: Setup = {
				plan: plan.id,
				furniture: plan.id !== 'studio',
				devices: CATALOG.models.slice(0, MAX_DEVICES).map(
					(model, i): DeviceState => ({
						id: `x${i}`,
						model,
						x: 0.5 + (i * (plan.width - 1)) / MAX_DEVICES,
						z: 0.5 + (i * (plan.depth - 1)) / MAX_DEVICES,
						y: i === 2 ? 0.74 : 0,
						yaw: (i * 55) % 360,
						tilt: i * 9 - 10,
						power: 0.2 + i / 10,
						height: i % 2 ? 1.2 : 0,
						oscillation: { on: i % 2 === 0, sweep: 60 + i * 10, period: 6 + i },
						opening: i % 2 ? ids[i % ids.length] : undefined,
						intake: i % 3 === 0 ? true : undefined
					})
				),
				openings: Object.fromEntries(ids.map((id, i) => [id, (i % 5) / 4])),
				conditions: { windFrom: 200, windSpeed: 6.5, outdoorTemp: -4, indoorTemp: 23.5, outdoorPm25: 150 }
			};
			const link = encodeSetup(setup);
			lengths.push(`${plan.id} ${link.length}`);
			if (link.length >= 1500) found.push(`${plan.id}: ${link.length} characters`);
			const decoded = decodeSetup(link, REAL_CATALOG);
			if (!isDeepStrictEqual(decoded, normalizeSetup(setup))) found.push(`${plan.id}: does not decode to normalizeSetup of it`);
			if (Object.keys(decoded?.openings ?? {}).length !== ids.length) found.push(`${plan.id}: ${Object.keys(decoded?.openings ?? {}).length} of ${ids.length} openings came back`);
			found.push(...invalidities(decoded, REAL_CATALOG).map((what) => `${plan.id}: ${what}`));
		}
		console.log(`real plans, every opening changed and six devices: ${lengths.join(', ')} characters`);
		expect(found).toEqual([]);
	});

	test(`at most ${MAX_DEVICES} devices: more are dropped from the end, by the encoder and by the decoder`, () => {
		const device = (i: number): DeviceState => ({ ...maximalSetup().devices[0], id: `x${i}`, model: CATALOG.models[i % CATALOG.models.length], x: 1 + i, opening: undefined });
		const upTo = (count: number): Setup => ({ ...blankSetup('house'), devices: Array.from({ length: count }, (_, i) => device(i)) });
		const full = upTo(MAX_DEVICES);
		const decoded = decodeSetup(encodeSetup(full), CATALOG);
		expect(decoded).toEqual(normalizeSetup(full));
		expect(decoded?.devices.map((d) => [d.id, d.x])).toEqual(Array.from({ length: MAX_DEVICES }, (_, i) => [`d${i + 1}`, 1 + i]));
		// The encoder stops at the limit, so a seventh device (or a tenth) changes nothing.
		expect(encodeSetup(upTo(MAX_DEVICES + 1))).toBe(encodeSetup(full));
		expect(normalizeSetup(upTo(MAX_DEVICES + 4)).devices).toHaveLength(MAX_DEVICES);
		// None, one and one fewer than the most all work. (The decoder's cap is the 'unknown models and openings' test above.)
		for (const count of [0, 1, MAX_DEVICES - 1]) expect(decodeSetup(encodeSetup(upTo(count)), CATALOG)?.devices, `${count} devices`).toHaveLength(count);
	});

	test('an unknown plan id gives null, and an unknown model id drops its device and nothing else', () => {
		const base = maximalSetup();
		const found: string[] = [];
		for (const plan of ['penthouse', '', 'HOUSE', ' house', 'house ', '__proto__', 'constructor', 'studio2', 'one-bedroom\u0000'])
			if (decodeSetup(encodeSetup({ ...base, plan: plan as PlanId }), CATALOG) !== null) found.push(`the plan ${JSON.stringify(plan)} decoded`);
		const known = CATALOG.models[1];
		for (const model of ['mystery-fan', '', '__proto__', known.toUpperCase(), `${known}-2`, known.slice(0, -1), `${known}\u0000`]) {
			const setup: Setup = { ...blankSetup('studio'), devices: [{ ...base.devices[0], model, opening: undefined }, { ...base.devices[1], model: known, opening: undefined }] };
			const models = decodeSetup(encodeSetup(setup), CATALOG)?.devices.map((d) => `${d.id}:${d.model}`);
			if (JSON.stringify(models) !== JSON.stringify([`d1:${known}`])) found.push(`the model ${JSON.stringify(model)} gave ${JSON.stringify(models)}`);
		}
		// An opening of another plan is dropped from the device and from the openings, and a device keeps the rest of what it says.
		const elsewhere: Setup = { ...blankSetup('house'), devices: [{ ...base.devices[0], opening: 'bath-window' }], openings: { 'bath-window': 1, 'front-door': 0.5 } };
		const there = decodeSetup(encodeSetup(elsewhere), CATALOG);
		if (there?.devices[0].opening !== undefined || JSON.stringify(there?.openings) !== JSON.stringify({ 'front-door': 0.5 })) found.push(`an opening of another plan survived: ${JSON.stringify(there)}`);
		expect(found).toEqual([]);
	});

	test('an id such as __proto__ is an ordinary key, not a prototype', () => {
		const catalog: LinkCatalog = { plans: [{ id: 'studio', openings: ['__proto__', 'constructor', 'toString'] }], models: [] };
		// JSON.parse makes "__proto__" an own property, which an object literal would not.
		const openings = JSON.parse('{"__proto__": 0.5, "constructor": 1, "toString": 0.25}') as Record<string, number>;
		const decoded = decodeSetup(encodeSetup({ ...blankSetup('studio'), openings }), catalog);
		expect(Object.keys(decoded?.openings ?? {}).sort()).toEqual(['__proto__', 'constructor', 'toString']);
		expect(Object.getPrototypeOf(decoded?.openings)).toBe(Object.prototype);
		expect(Object.getOwnPropertyDescriptor(decoded?.openings ?? {}, '__proto__')?.value).toBe(0.5);
		expect(Object.keys(Object.prototype)).toEqual([]);
	});

	/** What the link carries, by field. A field added to Setup, DeviceState or Conditions stops this file type-checking until it is listed here. */
	const CARRIED = {
		setup: { plan: true, furniture: true, devices: true, openings: true, conditions: true },
		// A device's id is renumbered d1, d2, ... on decoding, because the id only identifies a device on the page.
		device: { id: false, model: true, x: true, z: true, y: true, yaw: true, tilt: true, power: true, height: true, oscillation: true, opening: true, intake: true },
		oscillation: { on: true, sweep: true, period: true },
		conditions: { windFrom: true, windSpeed: true, outdoorTemp: true, indoorTemp: true, outdoorPm25: true }
	} satisfies { setup: Record<keyof Setup, boolean>; device: Record<keyof DeviceState, boolean>; oscillation: Record<keyof DeviceState['oscillation'], boolean>; conditions: Record<keyof Conditions, boolean> };

	test('every field of a Setup is carried: the maximal setup sets them all, and each comes back', () => {
		const setup = maximalSetup();
		const keys = (object: object) => Object.keys(object).sort();
		// The maximal setup sets every field there is, so a field added to the types without being listed above or set there fails here.
		expect(keys(setup)).toEqual(keys(CARRIED.setup));
		expect(keys(setup.devices[0])).toEqual(keys(CARRIED.device));
		expect(keys(setup.devices[0].oscillation)).toEqual(keys(CARRIED.oscillation));
		expect(keys(setup.conditions)).toEqual(keys(CARRIED.conditions));
		const decoded = decodeSetup(encodeSetup(setup), CATALOG)!;
		const normal = normalizeSetup(setup);
		const lost: string[] = [];
		const compare = (what: string, a: object, b: object, fields: Record<string, boolean>) => {
			const at = (object: object, key: string) => (object as Record<string, unknown>)[key];
			for (const [key, carried] of Object.entries(fields)) if (carried && !isDeepStrictEqual(at(a, key), at(b, key))) lost.push(`${what}.${key}`);
		};
		compare('setup', decoded, normal, CARRIED.setup);
		compare('conditions', decoded.conditions, normal.conditions, CARRIED.conditions);
		decoded.devices.forEach((device, i) => {
			compare(`devices[${i}]`, device, normal.devices[i], CARRIED.device);
			compare(`devices[${i}].oscillation`, device.oscillation, normal.devices[i].oscillation, CARRIED.oscillation);
		});
		expect(lost).toEqual([]);
	});
});
