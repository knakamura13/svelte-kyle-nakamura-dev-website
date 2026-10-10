import { expect, test } from '@playwright/test';
import { PerspectiveCamera } from 'three';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { Dollhouse, dollhouseRig } from '../../src/lib/experiments/airflow/scene/dollhouse';

/**
 * Node-only checks of the `Dollhouse` class and its camera framing: it builds for every plan, its calls do not throw, and its
 * easing settles. What it looks like is checked in a browser with `scripts/airflow-qa/dollhouse/`. Started in the
 * 2026-10-08 session and tightened when the two worktrees were merged.
 */

const TINT = 0xe1e9d9;

test.describe('Dollhouse', () => {
	test('builds for every plan, with an anchor for every room and something to pick', () => {
		for (const plan of plans) {
			const dollhouse = new Dollhouse(plan, { furniture: false, tint: TINT });
			expect(dollhouse.group.children.length, plan.id).toBeGreaterThan(0);
			expect(dollhouse.roomAnchors, plan.id).toHaveLength(plan.rooms.length);
			for (const anchor of dollhouse.roomAnchors) {
				for (const value of [anchor.position.x, anchor.position.y, anchor.position.z]) expect(Number.isFinite(value), `${plan.id}: ${anchor.id}`).toBe(true);
			}
			expect(dollhouse.pickables.length, plan.id).toBeGreaterThan(0);
			dollhouse.dispose();
		}
	});

	test('setOpenings, setTopDown and setFurniture accept any state in any order', () => {
		for (const plan of plans) {
			const dollhouse = new Dollhouse(plan, { furniture: true, tint: TINT });
			const everyOpening = (amount: number) => Object.fromEntries(plan.openings.map((o) => [o.id, amount]));
			expect(() => {
				dollhouse.setOpenings({});
				dollhouse.setOpenings(everyOpening(0.5));
				dollhouse.setOpenings(everyOpening(1));
				dollhouse.setOpenings({ [plan.openings[0].id]: 0 });
				dollhouse.setTopDown(true);
				dollhouse.setTopDown(false);
				dollhouse.setFurniture(false);
				dollhouse.setFurniture(true);
			}, plan.id).not.toThrow();
			dollhouse.dispose();
		}
	});

	test('hiding the furniture takes it out of what can be picked, and showing it puts it back', () => {
		const plan = plans.find((p) => p.furniture.length > 0)!;
		const dollhouse = new Dollhouse(plan, { furniture: true, tint: TINT });
		const withFurniture = dollhouse.pickables.length;
		dollhouse.setFurniture(false);
		expect(dollhouse.pickables.length).toBeLessThan(withFurniture);
		dollhouse.setFurniture(true);
		expect(dollhouse.pickables.length).toBe(withFurniture);
		dollhouse.dispose();
	});

	test('update eases, and an infinite step settles everything at once', () => {
		const dollhouse = new Dollhouse(plans[0], { furniture: false, tint: TINT });
		const camera = new PerspectiveCamera(30, 1, 0.01, 1000);
		camera.position.set(9, 12, 14);
		camera.lookAt(4, 0, 3);
		camera.updateMatrixWorld();
		expect(typeof dollhouse.update(camera, 0.016)).toBe('boolean');
		dollhouse.update(camera, Infinity);
		expect(dollhouse.update(camera, 0.016), 'nothing is left to ease after settling').toBe(false);
		dollhouse.dispose();
	});
});

test.describe('dollhouseRig', () => {
	test('frames every plan from three-quarters and from above, looking at the house', () => {
		for (const plan of plans) {
			const threeQuarter = dollhouseRig(plan, false);
			const above = dollhouseRig(plan, true);
			for (const rig of [threeQuarter, above]) {
				expect(rig.target.every(Number.isFinite), plan.id).toBe(true);
				expect(rig.fit.width, plan.id).toBeGreaterThan(0);
				expect(rig.fit.height, plan.id).toBeGreaterThan(0);
			}
			// From above it looks almost straight down (radians), from three-quarters well short of that.
			expect(Math.abs(above.pitch - Math.PI / 2), plan.id).toBeLessThan(0.1);
			expect(threeQuarter.pitch, plan.id).toBeLessThan(above.pitch - 0.2);
			// The target is inside the footprint.
			expect(threeQuarter.target[0], plan.id).toBeGreaterThan(0);
			expect(threeQuarter.target[0], plan.id).toBeLessThan(plan.width);
			expect(threeQuarter.target[2], plan.id).toBeGreaterThan(0);
			expect(threeQuarter.target[2], plan.id).toBeLessThan(plan.depth);
		}
	});
});
