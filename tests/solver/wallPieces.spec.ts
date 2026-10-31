import { expect, test } from '@playwright/test';
import { rasterizePlan } from '../../src/lib/experiments/airflow/homes/rasterize';
import { OPENING_LIMITS, type HomePlan } from '../../src/lib/experiments/airflow/homes/types';
import { validatePlan } from '../../src/lib/experiments/airflow/homes/validate';
import { coveredSpan, doorSwing, frameLayouts, frameSpan, openRegion, openingPanels, spanArea, wallPieces, wallRuns, type Span } from '../../src/lib/experiments/airflow/scene/wallPieces';

/** A small two-room plan with every opening kind and anchor, and no furniture near an opening. */
const PLAN: HomePlan = {
	id: 'studio',
	name: 'Test flat',
	blurb: 'Two rooms with one of every opening.',
	width: 6,
	depth: 4.8,
	ceiling: 2.4,
	rooms: [
		{ id: 'living', name: 'Living room', rects: [{ x: 0, z: 0, w: 3.6, d: 4.8 }] },
		{ id: 'bedroom', name: 'Bedroom', rects: [{ x: 3.6, z: 0, w: 2.4, d: 4.8 }] }
	],
	walls: [{ axis: 'z', at: 3.6, from: 0, to: 4.8 }],
	openings: [
		{ id: 'awning', name: 'Awning', kind: 'casement', placement: { facade: 'north', center: 0.65 }, width: 0.6, height: 0.6, sill: 1.4, maxOpen: OPENING_LIMITS.casement.maxOpen, anchor: 'bottom' },
		{ id: 'hung', name: 'Double-hung', kind: 'double-hung', placement: { facade: 'north', center: 1.8 }, width: 1, height: 1.2, sill: 0.9, maxOpen: 0.5, anchor: 'bottom' },
		{ id: 'slider-end', name: 'Slider', kind: 'sliding-door', placement: { facade: 'north', center: 4.5 }, width: 1.6, height: 2.1, sill: 0, maxOpen: 0.5, anchor: 'end' },
		{ id: 'patio', name: 'Patio door', kind: 'sliding-door', placement: { facade: 'south', center: 1.8 }, width: 1.8, height: 2.1, sill: 0, maxOpen: 0.5, anchor: 'start' },
		{ id: 'front', name: 'Front door', kind: 'door', placement: { facade: 'south', center: 4.8 }, width: 0.9, height: 2.1, sill: 0, maxOpen: 1, anchor: 'end' },
		{ id: 'hopper', name: 'Upper sash', kind: 'double-hung', placement: { facade: 'west', center: 3.4 }, width: 0.8, height: 1.2, sill: 0.9, maxOpen: 0.5, anchor: 'top' },
		{ id: 'side', name: 'Casement', kind: 'casement', placement: { facade: 'west', center: 1.2 }, width: 0.8, height: 1.2, sill: 0.9, maxOpen: OPENING_LIMITS.casement.maxOpen, anchor: 'start' },
		{ id: 'east', name: 'Casement', kind: 'casement', placement: { facade: 'east', center: 2.4 }, width: 0.6, height: 1, sill: 1, maxOpen: OPENING_LIMITS.casement.maxOpen, anchor: 'end' },
		{ id: 'inner', name: 'Bedroom door', kind: 'door', placement: { axis: 'z', at: 3.6, center: 2.4 }, width: 0.9, height: 2.05, sill: 0, maxOpen: 1, anchor: 'start' }
	],
	furniture: [{ id: 'bed', name: 'Bed', x: 4.4, z: 1.2, w: 1.4, d: 1.4, h: 0.55 }]
};

const AMOUNTS = [0, 0.1, 0.25, 0.4, 0.5, 0.75, 0.9, 1];

/** Area of `region` ∩ `frame` that no rectangle in `covers` covers, exactly, by cutting along every edge. */
function uncovered(region: Span, frame: Span, covers: Span[]) {
	const us = [region.u0, region.u1, frame.u0, frame.u1, ...covers.flatMap((c) => [c.u0, c.u1])].sort((a, b) => a - b);
	const ys = [region.y0, region.y1, frame.y0, frame.y1, ...covers.flatMap((c) => [c.y0, c.y1])].sort((a, b) => a - b);
	let area = 0;
	for (let i = 0; i + 1 < us.length; i++)
		for (let j = 0; j + 1 < ys.length; j++) {
			const [u, y] = [(us[i] + us[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2];
			const inside = (s: Span) => u > s.u0 && u < s.u1 && y > s.y0 && y < s.y1;
			if (inside(region) && inside(frame) && !covers.some(inside)) area += (us[i + 1] - us[i]) * (ys[j + 1] - ys[j]);
		}
	return area;
}

test('the test plan is sound', () => {
	expect(validatePlan(PLAN)).toEqual([]);
});

test('for every kind and amount, what the panels leave open is the solver’s open region, face by face', () => {
	const runs = wallRuns(PLAN);
	for (const h of [0.1, 0.15, 0.3]) {
		const raster = rasterizePlan(PLAN, h, { furniture: false });
		raster.openings.forEach((opening) => {
			const run = runs.find((r) => r.openings.includes(opening.spec))!;
			const frame = frameSpan(opening.spec);
			for (const amount of AMOUNTS) {
				const covers = openingPanels(opening.spec, amount, run, 1).map(coveredSpan);
				expect(Math.abs(uncovered(frame, frame, covers) - opening.area(amount))).toBeLessThan(1e-9);
				expect(Math.abs(spanArea(openRegion(opening.spec, amount)) - opening.area(amount))).toBeLessThan(1e-9);
				const coverage = opening.coverage(amount);
				opening.faces.forEach((face, n) => {
					const cell = { u0: face.u0, u1: face.u1, y0: face.y0, y1: face.y1 };
					expect(Math.abs(uncovered(cell, frame, covers) - coverage[n] * h * h)).toBeLessThan(1e-9);
				});
			}
		});
	}
});

test('a lower sash rises, an upper sash lowers, a slider moves away from its anchor, and leaves stop at 90°', () => {
	const runs = wallRuns(PLAN);
	const at = (id: string, amount: number) => {
		const spec = PLAN.openings.find((o) => o.id === id)!;
		return openingPanels(spec, amount, runs.find((r) => r.openings.includes(spec))!, 1);
	};
	const motion = (id: string) => at(id, 1)[0].motion;
	expect(motion('hung')).toMatchObject({ type: 'slide', along: 'y' });
	expect((motion('hung') as { by: number }).by).toBeGreaterThan(0);
	expect((motion('hopper') as { by: number }).by).toBeLessThan(0);
	expect((motion('patio') as { by: number }).by).toBeGreaterThan(0);
	expect((motion('slider-end') as { by: number }).by).toBeLessThan(0);
	// A door opens all of its frame, which is a leaf turned square to its wall. A casement opens 0.8 of it, so its leaf turns less far: seen straight on it
	// covers the part of the frame the solver keeps shut, and the picture says what the solver does.
	for (const id of ['front', 'inner']) expect((motion(id) as { angle: number }).angle).toBeCloseTo(Math.PI / 2, 9);
	for (const id of ['awning', 'side', 'east']) expect((motion(id) as { angle: number }).angle).toBeCloseTo(Math.acos(1 - OPENING_LIMITS.casement.maxOpen), 9);
	// Casements swing out.
	expect(motion('side')).toMatchObject({ toward: 1 });
	expect(motion('east')).toMatchObject({ toward: -1 });
	// An outside door swings in.
	const front = PLAN.openings.find((o) => o.id === 'front')!;
	expect(doorSwing(PLAN, runs.find((r) => r.id === 'south')!, front)).toBe(-1);
});

test('wall pieces and holes tile each wall exactly, with nothing negative or overlapping', () => {
	const runs = wallRuns(PLAN);
	const cases: { from: number; to: number; holes: Span[] }[] = runs.map((run) => ({ from: run.from, to: run.to, holes: frameLayouts(run, PLAN.ceiling).map((l) => l.hole) }));
	// At the start and end of a wall, touching, overlapping, past the end, floor to ceiling.
	cases.push({ from: 0, to: 3, holes: [{ u0: 0, u1: 0.8, y0: 0, y1: 2 }, { u0: 2.2, u1: 3, y0: 0.9, y1: 2.1 }] });
	cases.push({ from: 0, to: 3, holes: [{ u0: 0.5, u1: 1, y0: 0.9, y1: 2.1 }, { u0: 1, u1: 1.6, y0: 0.9, y1: 2.1 }] });
	cases.push({ from: 0, to: 3, holes: [{ u0: 0.5, u1: 1.3, y0: 0.5, y1: 1.5 }, { u0: 1, u1: 1.6, y0: 1, y1: 2.4 }] });
	cases.push({ from: 0, to: 3, holes: [{ u0: -0.5, u1: 0.4, y0: 0, y1: 3 }, { u0: 2.8, u1: 3.4, y0: 1, y1: 2 }] });
	for (const { from, to, holes } of cases) {
		const pieces = wallPieces(from, to, PLAN.ceiling, holes);
		const wall = { u0: from, u1: to, y0: 0, y1: PLAN.ceiling };
		for (const p of pieces) {
			expect(p.u1 - p.u0).toBeGreaterThan(0);
			expect(p.y1 - p.y0).toBeGreaterThan(0);
			expect(p.u0).toBeGreaterThanOrEqual(from - 1e-9);
			expect(p.u1).toBeLessThanOrEqual(to + 1e-9);
		}
		for (let a = 0; a < pieces.length; a++)
			for (let b = a + 1; b < pieces.length; b++) {
				const du = Math.min(pieces[a].u1, pieces[b].u1) - Math.max(pieces[a].u0, pieces[b].u0);
				const dy = Math.min(pieces[a].y1, pieces[b].y1) - Math.max(pieces[a].y0, pieces[b].y0);
				expect(du > 1e-9 && dy > 1e-9).toBe(false);
			}
		const solid = pieces.reduce((sum, p) => sum + spanArea(p), 0);
		const open = spanArea(wall) - uncovered(wall, wall, holes);
		expect(Math.abs(solid + open - spanArea(wall))).toBeLessThan(1e-9);
	}
});

test('a frame’s jambs, head and sill fill its hole around the clear opening', () => {
	for (const run of wallRuns(PLAN))
		for (const { frame, hole, members } of frameLayouts(run, PLAN.ceiling)) {
			expect(Math.abs(members.reduce((sum, m) => sum + spanArea(m), 0) + spanArea(frame) - spanArea(hole))).toBeLessThan(1e-9);
			expect(hole.u0).toBeGreaterThanOrEqual(run.from - 1e-9);
			expect(hole.u1).toBeLessThanOrEqual(run.to + 1e-9);
		}
});
