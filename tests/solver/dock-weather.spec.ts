import { expect, test } from '@playwright/test';
import { LIMITS, type Conditions, type UnitSystem } from '../../src/lib/experiments/airflow/state';
import { UNIT_SPACE } from '../../src/lib/experiments/airflow/units';
import { KEEPING_UP, shortfall } from '../../src/lib/experiments/airflow/ui/clock';
import {
	WEATHER_NAMES,
	formatPm25,
	weatherAnnouncement,
	weatherField,
	weatherHint,
	windFromAnnouncement,
	windFromNote,
	type WeatherKey
} from '../../src/lib/experiments/airflow/ui/weather';

/**
 * The words and numbers of the transport bar and the Weather group: the clock's shortfall, the sliders in each unit system with
 * their units, what a screen reader is told, and the closed group's few words. The sliders hold display units while the state holds
 * SI, so the round trip between them is held for every position of every slider.
 */

/** Expected text with `_` for the narrow no-break space between a number and its unit. */
const n = (text: string) => text.replaceAll('_', UNIT_SPACE);

const UNITS: UnitSystem[] = ['metric', 'imperial'];
const KEYS: WeatherKey[] = ['windSpeed', 'outdoorTemp', 'indoorTemp', 'outdoorPm25'];

test.describe('the clock: when the simulation cannot keep up', () => {
	test('says how fast it does run when it is slower than the clock asks, in the words the status line uses', () => {
		expect(shortfall('running', 0.64, 5)).toBe('Running at 0.6× real time.');
		expect(shortfall('running', 1.8, 20)).toBe('Running at 1.8× real time.');
		expect(shortfall('running', 12, 20)).toBe('Running at 12.0× real time.');
		expect(shortfall('running', 0.09, 1)).toBe('Running at under 0.1× real time.');
		expect(shortfall('running', 0, 1)).toBe('Running at under 0.1× real time.');
	});

	test('says nothing while it keeps up, which is within 85% of the speed asked for, nor when it is not running', () => {
		for (const speed of [1, 5, 20] as const) {
			expect(shortfall('running', speed, speed), `${speed}x at ${speed}x`).toBe('');
			expect(shortfall('running', speed * KEEPING_UP, speed), 'exactly 85%').toBe('');
			expect(shortfall('running', speed * KEEPING_UP - 0.01, speed), 'just under 85%').not.toBe('');
		}
		for (const status of ['idle', 'loading', 'paused', 'unsupported', 'error'] as const) expect(shortfall(status, 0.2, 5), status).toBe('');
		expect(shortfall('running', null, 5), 'no rate yet').toBe('');
	});
});

test.describe('the weather sliders', () => {
	test('show their value with its unit, in the visitor’s units', () => {
		expect(weatherField('windSpeed', 4, 'metric').display).toBe(n('4.0_m/s'));
		expect(weatherField('windSpeed', 0, 'metric').display).toBe(n('0.0_m/s'));
		expect(weatherField('windSpeed', 4, 'imperial').display).toBe(n('9_mph'));
		expect(weatherField('outdoorTemp', 18, 'metric').display).toBe(n('18_°C'));
		expect(weatherField('outdoorTemp', 18, 'imperial').display).toBe(n('64_°F'));
		expect(weatherField('outdoorTemp', -5, 'metric').display).toBe(n('−5_°C'));
		expect(weatherField('indoorTemp', 21, 'metric').display).toBe(n('21.0_°C'));
		expect(weatherField('indoorTemp', 21.5, 'metric').display).toBe(n('21.5_°C'));
		expect(weatherField('indoorTemp', 21, 'imperial').display).toBe(n('70_°F'));
		// Particulates are the same in both systems, a whole number of micrograms.
		for (const units of UNITS) expect(weatherField('outdoorPm25', 35, units).display).toBe(n('35_µg/m³'));
		expect(formatPm25(0).text).toBe(n('0_µg/m³'));
		expect(formatPm25(NaN).text).toBe(n('0_µg/m³'));
	});

	test('say their value to a screen reader with the unit in words', () => {
		expect(weatherField('windSpeed', 4, 'metric').spoken).toBe('4.0 metres per second');
		expect(weatherField('windSpeed', 4, 'imperial').spoken).toBe('9 miles per hour');
		expect(weatherField('outdoorTemp', -5, 'metric').spoken).toBe('minus 5 degrees Celsius');
		expect(weatherField('outdoorTemp', 18, 'imperial').spoken).toBe('64 degrees Fahrenheit');
		expect(weatherField('outdoorPm25', 35, 'metric').spoken).toBe('35 micrograms per cubic metre');
		expect(weatherField('outdoorPm25', 1, 'metric').spoken).toBe('1 microgram per cubic metre');
		expect(weatherField('outdoorPm25', 0, 'metric').spoken).toBe('0 micrograms per cubic metre');
	});

	test('keep the state in SI: every position of every slider converts to a value the state allows, and back to the same position', () => {
		const problems: string[] = [];
		for (const units of UNITS)
			for (const key of KEYS) {
				const { range } = weatherField(key, LIMITS[key].min, units);
				const limits = LIMITS[key];
				const unit = units === 'imperial' ? { windSpeed: 'mph', outdoorTemp: '°F', indoorTemp: '°F', outdoorPm25: 'µg/m³' }[key] : { windSpeed: 'm/s', outdoorTemp: '°C', indoorTemp: '°C', outdoorPm25: 'µg/m³' }[key];
				if (range.unit !== unit) problems.push(`${key} ${units}: unit ${range.unit}`);
				let positions = 0;
				for (let position = range.min; position <= range.max + 1e-9; position = Number((position + range.step).toFixed(6))) {
					positions++;
					const si = range.fromDisplay(position);
					// A step of the slider is a value the state allows, to a thousandth of a unit (the ends of an imperial slider are rounded in).
					if (si < limits.min - 1e-6 || si > limits.max + 1e-6) problems.push(`${key} ${units}: position ${position} is ${si} in SI, outside ${limits.min} to ${limits.max}`);
					const back = weatherField(key, si, units).value;
					if (Math.abs(back - position) > 1e-9) problems.push(`${key} ${units}: position ${position} comes back as ${back}`);
				}
				if (positions < 10) problems.push(`${key} ${units}: only ${positions} positions`);
			}
		expect(problems.slice(0, 8)).toEqual([]);
	});

	test('give the same slider ends and steps the state’s limits do in metric, and whole units in imperial', () => {
		for (const key of KEYS) {
			const metric = weatherField(key, LIMITS[key].min, 'metric').range;
			expect([metric.min, metric.max, metric.step]).toEqual([LIMITS[key].min, LIMITS[key].max, LIMITS[key].step]);
		}
		expect(weatherField('windSpeed', 0, 'imperial').range).toMatchObject({ min: 0, max: 33, step: 1 });
		expect(weatherField('outdoorTemp', 0, 'imperial').range).toMatchObject({ min: -22, max: 113, step: 1 });
		expect(weatherField('indoorTemp', 21, 'imperial').range).toMatchObject({ min: 50, max: 89, step: 1 });
	});

	test('are announced once with the name and the value, and a new starting temperature says it starts the air over', () => {
		expect(weatherAnnouncement('windSpeed', 6, 'metric')).toBe('Wind speed 6.0 metres per second.');
		expect(weatherAnnouncement('windSpeed', 4.4704, 'imperial')).toBe('Wind speed 10 miles per hour.');
		expect(weatherAnnouncement('outdoorTemp', -2, 'metric')).toBe('Outdoor temperature minus 2 degrees Celsius.');
		expect(weatherAnnouncement('outdoorPm25', 150, 'imperial')).toBe('Outdoor PM2.5 150 micrograms per cubic metre.');
		expect(weatherAnnouncement('indoorTemp', 24, 'metric')).toBe('Indoor starting temperature 24.0 degrees Celsius. The air starts over at that temperature.');
		for (const key of KEYS) expect(weatherAnnouncement(key, LIMITS[key].min, 'metric').startsWith(WEATHER_NAMES[key])).toBe(true);
	});
});

test.describe('the wind’s direction', () => {
	test('is the compass point the wind blows from, and the sentence says where it blows to', () => {
		expect(windFromNote(270, 4)).toBe('The wind blows from the west, toward the east.');
		expect(windFromNote(0, 4)).toBe('The wind blows from the north, toward the south.');
		expect(windFromNote(45, 1)).toBe('The wind blows from the northeast, toward the southwest.');
		expect(windFromNote(290, 1)).toBe('The wind blows from the west-northwest, toward the east-southeast.');
		expect(windFromNote(360, 1)).toBe('The wind blows from the north, toward the south.');
		expect(windFromAnnouncement(270, 4)).toBe('Wind from the west, 270 degrees.');
		expect(windFromAnnouncement(5, 4)).toBe('Wind from the north, 5 degrees.');
	});

	test('says so when the wind is calm, because then its direction changes nothing', () => {
		expect(windFromNote(270, 0)).toBe('The wind is calm, so its direction changes nothing yet.');
		expect(windFromAnnouncement(270, 0)).toBe('Wind from the west, 270 degrees. The wind is calm, so this changes nothing yet.');
	});

	test('the opposite point agrees with the point for every step of the slider', () => {
		for (let degrees = 0; degrees <= 360; degrees += 5) {
			const [from, to] = windFromNote(degrees, 1).match(/from the (\S+), toward the (\S+)\./)!.slice(1);
			const [oppositeFrom, oppositeTo] = windFromNote(degrees + 180, 1).match(/from the (\S+), toward the (\S+)\./)!.slice(1);
			expect([from, to], `${degrees} degrees`).toEqual([oppositeTo, oppositeFrom]);
		}
	});
});

test.describe('the closed Weather group', () => {
	const conditions = (patch: Partial<Conditions> = {}): Conditions => ({ windFrom: 270, windSpeed: 4, outdoorTemp: 18, indoorTemp: 21, outdoorPm25: 0, ...patch });

	test('says the weather in a few words, in the visitor’s units', () => {
		expect(weatherHint(conditions(), 'metric')).toBe(n('4.0_m/s from the west, 18_°C'));
		expect(weatherHint(conditions(), 'imperial')).toBe(n('9_mph from the west, 64_°F'));
		expect(weatherHint(conditions({ windFrom: 45, windSpeed: 7.5, outdoorTemp: -5 }), 'metric')).toBe(n('7.5_m/s from the northeast, −5_°C'));
	});

	test('says calm when there is no wind, and mentions smoke outdoors only when there is some', () => {
		expect(weatherHint(conditions({ windSpeed: 0 }), 'metric')).toBe(n('Calm, 18_°C'));
		expect(weatherHint(conditions({ windSpeed: 0, outdoorPm25: 35 }), 'metric')).toBe(n('Calm, 18_°C, 35_µg/m³ PM2.5'));
		expect(weatherHint(conditions({ outdoorPm25: 0 }), 'metric')).not.toContain('PM2.5');
	});
});
