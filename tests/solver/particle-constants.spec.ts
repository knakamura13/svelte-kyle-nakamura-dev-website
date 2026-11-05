import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMISSION_REFERENCES } from '../../src/lib/experiments/airflow/emission';
import { CpuSolver } from '../../src/lib/experiments/airflow/solver/cpu/solver';
import { boxGeometry } from '../../src/lib/experiments/airflow/solver/geometry';
import { AIR } from '../../src/lib/experiments/airflow/solver/types';
import { PARTICLE } from '../../src/lib/experiments/airflow/sim/world';
import { advance } from './scenarios';

/**
 * The smoke amounts and the particle constants are numbers from the literature, and the research note
 * (docs/research/airflow/devices-and-particulates.md, sections 6 and 7) is where each one's source, working and
 * uncertainty are written down. These tests hold the code to that note: every row of the code's tables has a row there,
 * the number in both is the same, and the row cites a source or says UNCONFIRMED, shows its working and states its
 * uncertainty. A number changed in one place and not the other fails here. The last two check that the speeds, in the
 * solver, lose smoke at the rate the note derives them for.
 */
const NOTE = readFileSync(resolve(import.meta.dirname, '../../docs/research/airflow/devices-and-particulates.md'), 'utf8');

interface Row {
	used: string;
	source: string;
	working: string;
	uncertainty: string;
}

/** The rows of the table in a numbered section of the note whose first cell is a code-quoted id: `id` | used | source | working | uncertainty. */
function rows(section: number): Map<string, Row> {
	const start = NOTE.search(new RegExp(`^## ${section}\\. `, 'm'));
	expect(start, `section ${section} is in the note`).toBeGreaterThanOrEqual(0);
	const next = NOTE.slice(start + 3).search(/^## /m);
	const text = NOTE.slice(start, next < 0 ? undefined : start + 3 + next);
	const found = new Map<string, Row>();
	for (const line of text.split('\n')) {
		const match = line.match(/^\|\s*`([a-z-]+)`\s*\|(.*)\|\s*$/);
		if (!match) continue;
		const cells = match[2].split('|').map((cell) => cell.trim());
		expect(cells, `${match[1]} has a used value, a source, its working and its uncertainty`).toHaveLength(4);
		found.set(match[1], { used: cells[0], source: cells[1], working: cells[2], uncertainty: cells[3] });
	}
	return found;
}

const number = (cell: string) => Number(cell.match(/-?\d+(\.\d+)?(e-?\d+)?/i)?.[0]);

/** A row that cites something has a year in its source, shows arithmetic in its working, and says how sure it is. */
function expectDocumented(id: string, row: Row, sourced: boolean) {
	expect(row.uncertainty.length, `${id}: uncertainty is stated`).toBeGreaterThan(3);
	expect(row.working.length, `${id}: the working is shown`).toBeGreaterThan(3);
	if (sourced) {
		expect(row.source, `${id}: the source is cited with a year`).toMatch(/\b(19|20)\d{2}\b/);
		expect(row.source, `${id}: and says where in it`).toMatch(/\b(p\.|pp\.|table|tables|figure|fig\.|section|§)/i);
		expect(row.working, `${id}: the working is arithmetic`).toMatch(/[=×*/÷]/);
		expect(row.source + row.working, `${id}: a sourced row does not say UNCONFIRMED`).not.toMatch(/UNCONFIRMED/);
	} else {
		expect(row.source + row.working + row.uncertainty, `${id}: an unsourced row says why`).toMatch(/UNCONFIRMED/);
	}
}

test.describe('the research note and the code agree on the smoke amounts and the particle constants', () => {
	test('section 7 has a row for every smoke reference, with the same rate, its source, its unit conversion and its uncertainty', () => {
		const table = rows(7);
		expect([...table.keys()].sort(), 'one row for each reference, and no other').toEqual(EMISSION_REFERENCES.map((r) => r.id).sort());
		for (const reference of EMISSION_REFERENCES) {
			const row = table.get(reference.id)!;
			expect(number(row.used) / reference.mgPerMinute, `${reference.id}: mg per minute in the note and the code`).toBeCloseTo(1, 6);
			expectDocumented(reference.id, row, reference.status === 'sourced');
		}
	});

	test('section 6 has a row for the settling speed and one for the deposition speed, with the speeds the solver uses', () => {
		const table = rows(6);
		for (const [id, value] of [
			['settling', PARTICLE.settling],
			['deposition', PARTICLE.deposition]
		] as const) {
			const row = table.get(id);
			expect(row, `${id} has a row`).toBeDefined();
			expect(number(row!.used) / value, `${id}: m/s in the note and the code`).toBeCloseTo(1, 6);
			expectDocumented(id, row!, !/UNCONFIRMED/.test(row!.source + row!.working + row!.uncertainty));
		}
	});
});

/** The first-order loss rate of a sealed box, 1/s: deposition on every surface and settling onto the floor, each as a speed times an area over the volume. */
const lossRate = (length: number, height: number, width: number) =>
	(PARTICLE.deposition * 2 * (length * width + length * height + width * height) + PARTICLE.settling * length * width) / (length * height * width);

test.describe('the speeds in the solver lose smoke at the rate the note derives them for', () => {
	test('the pair loses about 0.4 per hour in a 3 × 4 × 2.4 m room, the rate measured in occupied homes that the note takes the deposition speed from', () => {
		const perHour = lossRate(3, 2.4, 4) * 3600;
		console.log(`3 × 4 × 2.4 m room: ${perHour.toFixed(3)} per hour (the note derives 0.405)`);
		expect(perHour).toBeGreaterThan(0.38);
		expect(perHour).toBeLessThan(0.43);
	});

	test('a sealed, well-mixed room loses smoke at v_d·A/V + v_s·A_floor/V, so settling and deposition are applied as the note derives them', () => {
		const h = 0.15;
		const [length, height, width] = [3, 2.4, 3];
		const [nx, ny, nz] = [Math.round(length / h), Math.round(height / h), Math.round(width / h)];
		// Nothing but the particulates moves: no openings, no fans, no temperature difference, and they start evenly spread, so the room stays
		// well mixed, which is what the box model assumes (a real room's mixing is the flow's business, tested elsewhere). With the solver's
		// settling set to zero the rate reads 89 % of the formula's, so a tolerance of 2 % notices a missing settling term; the run reads 0.4 % low.
		const solver = new CpuSolver({
			grid: { nx, ny, nz, h },
			fluid: { ...AIR, beta: 0, ...PARTICLE },
			geometry: boxGeometry({ nx, ny, nz, h })
		});
		solver.fill(0, 100);
		const samples: [number, number][] = [];
		advance(solver, 900, 10, (time) => {
			if (time % 30 === 0) samples.push([time, Math.log(solver.airborneMass())]);
		});
		const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
		const mt = mean(samples.map(([t]) => t));
		const my = mean(samples.map(([, y]) => y));
		const slope = -samples.reduce((a, [t, y]) => a + (t - mt) * (y - my), 0) / samples.reduce((a, [t]) => a + (t - mt) ** 2, 0);
		const predicted = lossRate(length, height, width);
		console.log(`sealed room: measured ${(slope * 3600).toFixed(4)} per hour, predicted ${(predicted * 3600).toFixed(4)} (${((slope / predicted) * 100).toFixed(2)} %)`);
		expect(slope / predicted).toBeGreaterThan(0.98);
		expect(slope / predicted).toBeLessThan(1.02);
	});
});
