import { expect, test } from '@playwright/test';
import { AVERAGE_WINDOW, NOT_IN_AIR, WAITING, describePlace, describeSpot, probeName } from '../../src/lib/experiments/airflow/probeWords';
import type { AirReading } from '../../src/lib/experiments/airflow/readouts';
import { UNIT_SPACE } from '../../src/lib/experiments/airflow/units';

/**
 * The words the Dock uses for a point of the air: where it is, and what the air does there, once for the eye (labelled values)
 * and once for a screen reader (one sentence, every unit spelled out). Pure logic, so Node can hold it to the exact text.
 */

const air = (over: Partial<AirReading> = {}): AirReading => ({
	u: 0.2,
	v: 0,
	w: 0,
	speed: 0.2,
	averageSpeed: 0.18,
	temperature: 21.5,
	particulates: 0.012,
	inAir: true,
	...over
});

const spot = { x: 1.2, y: 1.1, z: 3.4 };
const nb = UNIT_SPACE;

test.describe('where a point is', () => {
	test('is said from the north-west corner, east then south, with the height, in the unit system the visitor has', () => {
		expect(describePlace(spot, 'metric')).toEqual({
			text: `1.20${nb}m east, 3.40${nb}m south of the north-west corner, at a height of 1.10${nb}m`,
			spoken: '1.20 metres east and 3.40 metres south of the north-west corner, at a height of 1.10 metres'
		});
		// 1.2 m is 47 in, 3.4 m is 133.9 in: feet and whole inches under 10 ft, decimal feet from there.
		const feet = describePlace(spot, 'imperial');
		expect(feet.text).toBe(`3${nb}ft${nb}11${nb}in east, 11.2${nb}ft south of the north-west corner, at a height of 3${nb}ft${nb}7${nb}in`);
		expect(feet.spoken).toBe('3 feet 11 inches east and 11.2 feet south of the north-west corner, at a height of 3 feet 7 inches');
	});

	test('reads the corner itself as zero, not as nothing', () => {
		expect(describePlace({ x: 0, y: 0, z: 0 }, 'metric').spoken).toBe('0.00 metres east and 0.00 metres south of the north-west corner, at a height of 0.00 metres');
	});
});

test.describe('what the air does at a point', () => {
	test('lists direction, speed, the ten-second average, temperature and PM2.5, in that order, and says them as one sentence', () => {
		const words = describeSpot('Probe 1', spot, air(), 'metric');
		expect(words.rows).toEqual([
			{ key: 'direction', name: 'Direction', value: 'toward the east, level' },
			{ key: 'speed', name: 'Speed', value: `0.20${nb}m/s` },
			{ key: 'average', name: 'Average, 10 s', value: `0.18${nb}m/s`, empty: false },
			{ key: 'temperature', name: 'Temperature', value: `21.5${nb}°C` },
			{ key: 'particulates', name: 'PM2.5', value: `0.012${nb}ppm (14${nb}µg/m³)` }
		]);
		expect(words.message).toBe('');
		expect(words.sentence).toBe(
			'Probe 1, 1.20 metres east and 3.40 metres south of the north-west corner, at a height of 1.10 metres. ' +
				'Air moving toward the east, level, at 0.20 metres per second. ' +
				'Average over the last 10 seconds, 0.18 metres per second. ' +
				'Temperature 21.5 degrees Celsius. ' +
				'PM2.5 0.012 parts per million, 14 micrograms per cubic metre.'
		);
		expect(words.name).toBe('Probe 1');
		expect(words.place.text).toContain('3.40');
	});

	test('leaves out the name for a point that is named where it is shown, and starts with where it is', () => {
		const words = describeSpot('', spot, air(), 'metric');
		expect(words.sentence.startsWith('1.20 metres east and 3.40 metres south of the north-west corner, at a height of 1.10 metres. Air moving')).toBe(true);
		expect(words.name).toBe('');
	});

	test('follows the unit system: miles per hour, degrees Fahrenheit and feet, with the particulates in the same ppm and µg/m³', () => {
		const words = describeSpot('Probe 2', spot, air({ u: 0.4470, speed: 0.447, averageSpeed: 0.2235, temperature: 21.5 }), 'imperial');
		expect(words.rows.map((row) => row.value)).toEqual([`toward the east, level`, `1.0${nb}mph`, `0.50${nb}mph`, `70.7${nb}°F`, `0.012${nb}ppm (14${nb}µg/m³)`]);
		expect(words.sentence).toContain('Air moving toward the east, level, at 1.0 miles per hour.');
		expect(words.sentence).toContain('Average over the last 10 seconds, 0.50 miles per hour.');
		expect(words.sentence).toContain('Temperature 70.7 degrees Fahrenheit.');
		expect(words.sentence).toContain('PM2.5 0.012 parts per million, 14 micrograms per cubic metre.');
	});

	test('says "not yet" for an average that has not had ten seconds, in the labelled value and in the sentence', () => {
		const words = describeSpot('Probe 3', spot, air({ averageSpeed: null }), 'metric');
		const average = words.rows.find((row) => row.key === 'average')!;
		expect(average).toMatchObject({ value: 'not yet', empty: true });
		expect(words.sentence).toContain(`The average over the last ${AVERAGE_WINDOW} seconds is not available yet.`);
		expect(words.sentence).not.toContain('Average over the last');
		expect(words.sentence, 'the other readings are still there').toContain('Temperature 21.5 degrees Celsius.');
	});

	test('names still air, straight up and straight down by what they are, and tilt by how much', () => {
		expect(describeSpot('p', spot, air({ u: 0.005, speed: 0.005 }), 'metric').sentence).toContain('Air is still, at 0.01 metres per second.');
		expect(describeSpot('p', spot, air({ u: 0, v: 0.3, speed: 0.3 }), 'metric').rows[0].value).toBe('straight up');
		expect(describeSpot('p', spot, air({ u: 0, v: -0.3, speed: 0.3 }), 'metric').sentence).toContain('Air moving straight down, at 0.30 metres per second.');
		// Air going south-east and rising: u east, w south, v up. Its climb is atan(0.14 / 0.283), which is 26 degrees.
		const rising = describeSpot('p', spot, air({ u: 0.2, v: 0.14, w: 0.2, speed: 0.3 }), 'metric');
		expect(rising.rows[0].value).toBe('toward SE, rising 26°');
		expect(rising.sentence).toContain('Air moving toward the southeast, rising 26 degrees, at 0.30 metres per second.');
	});

	test('has nothing to read where the point is not in the air, or before its reading arrives, and says why', () => {
		const furniture = describeSpot('Probe 1', spot, air({ inAir: false }), 'metric');
		expect(furniture.rows).toEqual([]);
		expect(furniture.message).toBe(NOT_IN_AIR);
		expect(furniture.sentence).toBe(`Probe 1, 1.20 metres east and 3.40 metres south of the north-west corner, at a height of 1.10 metres. ${NOT_IN_AIR}`);
		const waiting = describeSpot('Probe 1', spot, null, 'metric');
		expect(waiting.rows).toEqual([]);
		expect(waiting.message).toBe(WAITING);
		expect(describeSpot('Probe 1', spot, undefined, 'metric').sentence).toContain(WAITING);
	});

	test('reads a missing number as no reading and not as NaN', () => {
		const words = describeSpot('Probe 1', spot, air({ temperature: NaN, particulates: NaN }), 'metric');
		expect(words.rows.find((row) => row.key === 'temperature')!.value).toBe('—');
		expect(words.rows.find((row) => row.key === 'particulates')!.value).toBe('—');
		expect(words.sentence).not.toMatch(/NaN|undefined|null/);
	});

	test('keeps every symbol a screen reader says badly out of the sentence: degrees, micro, less-than, the minus sign and the cube', () => {
		const readings: Partial<AirReading>[] = [
			{ temperature: -3.5, particulates: 0 },
			{ temperature: -30, particulates: 0.0004 },
			{ temperature: 45, particulates: 12.5, u: -0.3, v: 0.5, w: -0.2, speed: 0.62 },
			{ u: 0, v: 0, w: 0, speed: 0, averageSpeed: 0 }
		];
		for (const units of ['metric', 'imperial'] as const) {
			for (const over of readings) {
				const { sentence } = describeSpot('Probe 4', spot, air(over), units);
				expect(sentence, JSON.stringify([units, over])).not.toMatch(/[°µ<−³²+]/);
				expect(sentence).toMatch(/^Probe 4, /);
				for (const part of ['Temperature', 'PM2.5', 'Air ']) expect(sentence).toContain(part);
			}
		}
		// A temperature below zero is "minus", and particulates under the floor are "less than".
		expect(describeSpot('p', spot, air({ temperature: -3.5, particulates: 0 }), 'metric').sentence).toContain('Temperature minus 3.5 degrees Celsius.');
		expect(describeSpot('p', spot, air({ temperature: -3.5, particulates: 0 }), 'metric').sentence).toContain('PM2.5 less than 0.001 parts per million, less than 1.2 micrograms per cubic metre.');
	});

	test('gives every labelled row a key the Dock can style by, once each, and the same five whenever there is a reading', () => {
		for (const over of [{}, { averageSpeed: null }, { u: 0, speed: 0 }]) {
			const keys = describeSpot('p', spot, air(over), 'metric').rows.map((row) => row.key);
			expect(keys).toEqual(['direction', 'speed', 'average', 'temperature', 'particulates']);
		}
	});
});

test.describe('a Probe', () => {
	test('is named by its id the way the scene labels its readings', () => {
		expect(probeName('p1')).toBe('Probe 1');
		expect(probeName('p4')).toBe('Probe 4');
	});
});
