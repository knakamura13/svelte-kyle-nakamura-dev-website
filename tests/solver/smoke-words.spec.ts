import { expect, test } from '@playwright/test';
import { EMISSION_REFERENCES, emissionMarks, emissionPosition, emissionRate } from '../../src/lib/experiments/airflow/emission';
import { ABOUT, describeStrength, formatEmissionRate, nearestSource, smokeMarks } from '../../src/lib/experiments/airflow/smokeWords';
import { UNIT_SPACE } from '../../src/lib/experiments/airflow/units';

/**
 * What the Dock says about the Smoke strength slider. The numbers come from emission.ts, the one table the solver's release
 * rate and the marks both read, so a test that follows the table fails when a number in it moves, and not before.
 */
const nb = UNIT_SPACE;
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

test.describe('the rate in words', () => {
	test('is two significant digits, in mg/min, with the unit spelled out for a screen reader', () => {
		expect(formatEmissionRate(0.02)).toEqual({ value: '0.02', unit: 'mg/min', text: `0.02${nb}mg/min`, spoken: '0.02 milligrams per minute' });
		expect(formatEmissionRate(0.6).text).toBe(`0.6${nb}mg/min`);
		expect(formatEmissionRate(2).spoken).toBe('2 milligrams per minute');
		expect(formatEmissionRate(10).text).toBe(`10${nb}mg/min`);
		expect(formatEmissionRate(0.0631).value).toBe('0.063');
		expect(formatEmissionRate(1.37).value).toBe('1.4');
		expect(formatEmissionRate(9.96).value, 'rounds up to the top of the slider, not to "9.96"').toBe('10');
		expect(formatEmissionRate(1).spoken, 'one is singular').toBe('1 milligram per minute');
		expect(formatEmissionRate(NaN)).toMatchObject({ value: '—', spoken: 'no reading' });
	});

	test('reads the slider ends and every mark to the number the table gives', () => {
		expect(formatEmissionRate(emissionRate(0)).value).toBe('0.02');
		expect(formatEmissionRate(emissionRate(1)).value).toBe('10');
		for (const mark of emissionMarks()) expect(formatEmissionRate(emissionRate(mark.position)).value, mark.id).toBe(formatEmissionRate(mark.mgPerMinute).value);
	});
});

test.describe('which real source the slider is near', () => {
	test('says "about" each source at its own rate, and for as far as the table is sure of it', () => {
		for (const source of EMISSION_REFERENCES) {
			const phrase = `about ${lower(source.label)}`;
			expect(nearestSource(source.mgPerMinute), source.id).toBe(phrase);
			expect(nearestSource(source.mgPerMinute * ABOUT), `${source.id} at the top of its band`).toBe(phrase);
			expect(nearestSource(source.mgPerMinute / ABOUT), `${source.id} at the bottom of its band`).toBe(phrase);
		}
		expect(nearestSource(2), 'frying').toBe('about frying');
	});

	test('says where it falls between two sources when it is not near either, never "about" one it is far from', () => {
		expect(nearestSource(Math.sqrt(0.02 * 0.6))).toBe('between a candle and incense');
		expect(nearestSource(0.6 * ABOUT * 1.001)).toBe('between incense and frying');
		expect(nearestSource(2 * ABOUT * 1.001)).toBe('between frying and a cooking burst');
		expect(nearestSource(0.02 * ABOUT * 1.001)).toBe('between a candle and incense');
	});

	test('has a phrase for a rate outside the table, though the slider cannot reach one', () => {
		expect(nearestSource(0.001)).toBe('less than a candle');
		expect(nearestSource(500)).toBe('more than a cooking burst');
	});

	test('gives every position of the slider a phrase, and one that changes only where the slider crosses a band', () => {
		let phrases = 0;
		let last = '';
		for (let n = 0; n <= 100; n++) {
			const { near } = describeStrength(n / 100);
			expect(near).toMatch(/^(about|between|less than|more than) /);
			if (near !== last) phrases++;
			last = near;
		}
		// Four "about" bands and the three gaps between them.
		expect(phrases).toBe(7);
	});
});

test.describe('the slider in words', () => {
	test('says frying the way the Dock announces it: the strength, the source and the rate', () => {
		const frying = describeStrength(emissionPosition(2));
		expect(frying.near).toBe('about frying');
		expect(frying.rate.text).toBe(`2${nb}mg/min`);
		expect(frying.announcement).toBe('Smoke strength about frying, 2 milligrams per minute');
		expect(frying.spoken).toBe('2 milligrams per minute, about frying');
	});

	test('says the two ends as a candle and a cooking burst', () => {
		expect(describeStrength(0).announcement).toBe('Smoke strength about a candle, 0.02 milligrams per minute');
		expect(describeStrength(1).announcement).toBe('Smoke strength about a cooking burst, 10 milligrams per minute');
	});

	test('keeps its symbols out of what a screen reader gets', () => {
		for (let n = 0; n <= 20; n++) {
			const words = describeStrength(n / 20);
			expect(words.announcement).not.toMatch(/mg\/min|[µ°]/);
			expect(words.spoken).toContain('milligram');
		}
	});
});

test.describe('the marks along the slider', () => {
	test('are the table\'s own marks, each with its position and its rate in the same format', () => {
		const marks = smokeMarks();
		const table = emissionMarks();
		expect(marks.map((mark) => [mark.id, mark.label, mark.position])).toEqual(table.map((mark) => [mark.id, mark.label, mark.position]));
		for (const [n, mark] of marks.entries()) expect(mark.rate).toEqual(formatEmissionRate(table[n].mgPerMinute));
		expect(marks.map((mark) => mark.rate.value)).toEqual(['0.02', '0.6', '2', '10']);
	});

	test('lie in order along the slider, the first at its start and the last at its end', () => {
		const positions = smokeMarks().map((mark) => mark.position);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
		expect(positions[0]).toBe(0);
		expect(positions[positions.length - 1]).toBe(1);
	});
});
