import { expect, test } from '@playwright/test';
import type { HomePlan, OpeningSpec } from '../../src/lib/experiments/airflow/homes/types';
import { clampToHome, snapToWindow, tiltFromPointer, windowOpening, wrapDegrees, yawFromPointer } from '../../src/lib/experiments/airflow/scene/deviceMath';
import { LIMITS, type DeviceState } from '../../src/lib/experiments/airflow/state';

/** The pure math behind placing and aiming Devices in the dollhouse, on a small hand-made plan. */

const window = (id: string, kind: OpeningSpec['kind'], placement: OpeningSpec['placement'], anchor: OpeningSpec['anchor'] = 'bottom'): OpeningSpec => ({
	id,
	name: id,
	kind,
	placement,
	width: 0.9,
	height: 1.2,
	sill: 0.9,
	maxOpen: kind === 'double-hung' || kind === 'sliding-door' ? 0.5 : 1,
	anchor
});

/** 6 × 4.8 m, a north-south wall at x = 3 from the north wall to z = 3.6 (a doorway south of it). */
const PLAN: HomePlan = {
	id: 'studio',
	name: 'Test home',
	blurb: '',
	width: 6,
	depth: 4.8,
	ceiling: 2.4,
	rooms: [
		{ id: 'west', name: 'West', rects: [{ x: 0, z: 0, w: 3, d: 4.8 }] },
		{ id: 'east', name: 'East', rects: [{ x: 3, z: 0, w: 3, d: 4.8 }] }
	],
	walls: [{ axis: 'z', at: 3, from: 0, to: 3.6 }],
	openings: [
		window('wn1', 'double-hung', { facade: 'north', center: 1.5 }),
		window('wn2', 'casement', { facade: 'north', center: 4.5 }, 'start'),
		window('we', 'double-hung', { facade: 'east', center: 2.4 }),
		window('sd', 'sliding-door', { facade: 'south', center: 3 }, 'start'),
		window('door', 'door', { axis: 'z', at: 3, center: 4.2 }, 'start')
	],
	furniture: []
};

const fanIn = (opening: string): DeviceState => ({
	id: `fan-${opening}`,
	model: 'window',
	x: 0,
	y: 0,
	z: 0,
	yaw: 0,
	tilt: 0,
	power: 0.5,
	height: 0,
	oscillation: { on: false, sweep: 90, period: 8 },
	opening,
	intake: true
});

test.describe('yaw from the pointer', () => {
	const centre = { x: 2, z: 3 };

	test('the four compass points and the points between them', () => {
		expect(yawFromPointer(centre, { x: 2, z: 1 })).toBeCloseTo(0, 9);
		expect(yawFromPointer(centre, { x: 4, z: 3 })).toBeCloseTo(90, 9);
		expect(yawFromPointer(centre, { x: 2, z: 5 })).toBeCloseTo(180, 9);
		expect(yawFromPointer(centre, { x: 0, z: 3 })).toBeCloseTo(270, 9);
		expect(yawFromPointer(centre, { x: 3, z: 2 })).toBeCloseTo(45, 9);
		expect(yawFromPointer(centre, { x: 3, z: 4 })).toBeCloseTo(135, 9);
		expect(yawFromPointer(centre, { x: 1, z: 4 })).toBeCloseTo(225, 9);
		expect(yawFromPointer(centre, { x: 1, z: 2 })).toBeCloseTo(315, 9);
	});

	test('wraps into [0, 360): just west of north is just under 360, never negative or 360', () => {
		const yaw = yawFromPointer(centre, { x: 1.999, z: 1 });
		expect(yaw).toBeGreaterThan(359.9);
		expect(yaw).toBeLessThan(360);
		expect(wrapDegrees(-90)).toBe(270);
		expect(wrapDegrees(720)).toBe(0);
		expect(wrapDegrees(-1e-15)).toBe(0);
		expect(yawFromPointer(centre, centre)).toBe(0);
	});
});

test.describe('tilt from the pointer', () => {
	const head = { x: 0, y: 1, z: 0 };
	const radius = 0.3;
	/** A ray from the east looking west through the arc point at `tilt` of a fan facing north. */
	const fromSide = (tilt: number) => {
		const t = (tilt * Math.PI) / 180;
		return { origin: { x: 5, y: 1 + radius * Math.sin(t), z: -radius * Math.cos(t) }, direction: { x: -1, y: 0, z: 0 } };
	};

	test('a pointer above the head aims up, below aims down', () => {
		expect(tiltFromPointer(head, 0, radius, fromSide(30))).toBeCloseTo(30, 0);
		expect(tiltFromPointer(head, 0, radius, fromSide(-20))).toBeCloseTo(-20, 0);
		// Seen from the front the arc is edge on: 0.15 m above the head on a 0.3 m arc is 30° up.
		expect(tiltFromPointer(head, 0, radius, { origin: { x: 0, y: 1.15, z: -5 }, direction: { x: 0, y: 0, z: 1 } })).toBeCloseTo(30, 0);
		// A fan facing east, seen from the south.
		const t = (25 * Math.PI) / 180;
		expect(tiltFromPointer(head, 90, radius, { origin: { x: radius * Math.cos(t), y: 1 + radius * Math.sin(t), z: 5 }, direction: { x: 0, y: 0, z: -1 } })).toBeCloseTo(25, 0);
	});

	test('is clamped to the tilt limits', () => {
		expect(tiltFromPointer(head, 0, radius, { origin: { x: 5, y: 3, z: 0 }, direction: { x: -1, y: 0, z: 0 } })).toBe(LIMITS.tilt.max);
		expect(tiltFromPointer(head, 0, radius, { origin: { x: 5, y: -2, z: -0.1 }, direction: { x: -1, y: 0, z: 0 } })).toBe(LIMITS.tilt.min);
	});
});

test.describe('snapping a window fan', () => {
	test('picks the nearest free window and returns the seat a window fan takes there', () => {
		expect(snapToWindow(PLAN, 1.4, 0.5, [], 1.2)).toEqual({ opening: 'wn1', x: 1.5, y: 0.9, z: 0, yaw: 180 });
		expect(snapToWindow(PLAN, 5.5, 2.2, [], 1.2)).toEqual({ opening: 'we', x: 6, y: 0.9, z: 2.4, yaw: 270 });
		// Both north windows are within reach along the wall; the nearer one wins.
		expect(snapToWindow(PLAN, 2.9, 0.5, [], 2)?.opening).toBe('wn1');
	});

	test('respects maxDistance along the facade', () => {
		expect(snapToWindow(PLAN, 3, 0.5, [], 1)).toBeNull();
		expect(snapToWindow(PLAN, 3, 0.5, [], 1.6)?.opening).toBe('wn1');
	});

	test('does not offer a window that already holds a fan, a door or an interior opening', () => {
		expect(snapToWindow(PLAN, 1.4, 0.5, [fanIn('wn1')], 1.2)).toBeNull();
		expect(snapToWindow(PLAN, 1.4, 0.5, [fanIn('wn1')], 5)?.opening).toBe('wn2');
		expect(snapToWindow(PLAN, 3, 4.7, [], 0.5)).toBeNull();
		expect(snapToWindow(PLAN, 3, 4.2, [], 0.5)).toBeNull();
	});

	test('a window fan fills the open part of the window at full travel', () => {
		expect(windowOpening(PLAN.openings[0])).toEqual({ u0: 1.05, u1: 1.95, y0: 0.9, y1: 1.5 });
		expect(windowOpening(PLAN.openings[1])).toEqual({ u0: 4.05, u1: 4.95, y0: 0.9, y1: 2.1 });
	});
});

test.describe('clamping to the home', () => {
	test('keeps the footprint inside the outside walls', () => {
		expect(clampToHome(PLAN, -1, 2, 0.2)).toEqual({ x: 0.2, z: 2 });
		const corner = clampToHome(PLAN, 7, 5, 0.2);
		expect(corner.x).toBeCloseTo(5.8, 9);
		expect(corner.z).toBeCloseTo(4.6, 9);
		expect(clampToHome(PLAN, 1, 1, 0.2)).toEqual({ x: 1, z: 1 });
	});

	test('never leaves a device on an interior wall: out the near side, or round the end into the doorway', () => {
		expect(clampToHome(PLAN, 3.02, 1.5, 0.2).x).toBeCloseTo(3.25, 9);
		expect(clampToHome(PLAN, 2.95, 1.5, 0.2).x).toBeCloseTo(2.75, 9);
		const doorway = clampToHome(PLAN, 3, 3.75, 0.2);
		expect(doorway.x).toBeCloseTo(3, 9);
		expect(doorway.z).toBeCloseTo(3.8, 9);
		// A box fan turned side-on to the wall needs less room across it.
		expect(clampToHome(PLAN, 3.2, 1.5, { x: 0.3, z: 0.1 }).x).toBeCloseTo(3.35, 9);
	});
});
