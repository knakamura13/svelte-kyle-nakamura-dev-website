import { expect, test } from '@playwright/test';
import { EMISSION_REFERENCES, emissionMarks, emissionPosition, emissionRate } from '../../src/lib/experiments/airflow/emission';

/**
 * Smoke strength: the table of reference points, the rate the solver releases at a slider position, and the marks the slider
 * draws. They read one table (emission.ts), so these tests are about that table being usable, not about the numbers in it:
 * where each number comes from is held to the research note in tests/solver/particle-constants.spec.ts.
 */
test.describe('smoke strength', () => {
	test('the reference points are named once each and rise from a trickle to a burst', () => {
		const ids = EMISSION_REFERENCES.map((reference) => reference.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const reference of EMISSION_REFERENCES) {
			expect(reference.label.trim().length, reference.id).toBeGreaterThan(0);
			expect(reference.mgPerMinute, reference.id).toBeGreaterThan(0);
		}
		const rates = EMISSION_REFERENCES.map((reference) => reference.mgPerMinute);
		expect(rates, 'rising').toEqual([...rates].sort((a, b) => a - b));
		expect(new Set(rates).size, 'no two marks on the same spot').toBe(rates.length);
	});

	test('the slider runs from the first reference to the last, evenly by decade, and holds to its ends', () => {
		const first = EMISSION_REFERENCES[0].mgPerMinute;
		const last = EMISSION_REFERENCES[EMISSION_REFERENCES.length - 1].mgPerMinute;
		expect(emissionRate(0)).toBeCloseTo(first, 12);
		expect(emissionRate(1)).toBeCloseTo(last, 9);
		expect(emissionRate(-3), 'below the slider').toBe(emissionRate(0));
		expect(emissionRate(7), 'above the slider').toBe(emissionRate(1));
		// Evenly by decade: the middle is the geometric mean.
		expect(emissionRate(0.5)).toBeCloseTo(Math.sqrt(first * last), 9);
		let before = 0;
		for (let n = 0; n <= 20; n++) {
			const rate = emissionRate(n / 20);
			expect(rate).toBeGreaterThan(before);
			before = rate;
		}
	});

	test('a mark and the rate at its position are the same number: what the slider says is what the solver releases', () => {
		const marks = emissionMarks();
		expect(marks.map((mark) => mark.id)).toEqual(EMISSION_REFERENCES.map((reference) => reference.id));
		for (const mark of marks) {
			expect(mark.position, mark.id).toBeGreaterThanOrEqual(0);
			expect(mark.position, mark.id).toBeLessThanOrEqual(1);
			expect(emissionRate(mark.position) / mark.mgPerMinute, mark.id).toBeCloseTo(1, 9);
			expect(emissionPosition(mark.mgPerMinute), mark.id).toBe(mark.position);
		}
		expect(marks[0].position).toBe(0);
		expect(marks[marks.length - 1].position).toBe(1);
		expect(marks.map((mark) => mark.position), 'in order along the slider').toEqual([...marks.map((mark) => mark.position)].sort((a, b) => a - b));
	});
});
