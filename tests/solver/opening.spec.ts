import { expect, test } from '@playwright/test';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import { CameraOpening, OPENING_EASE, OPENING_END, OPENING_SECONDS, cubicBezier, openingAt, openingFor } from '../../src/lib/experiments/airflow/scene/camera/opening';
import { CAMERA_INSET, clampFocus, clampTilt, clampZoom, farDistance, homeView, pose, wrapAngle, type CameraState } from '../../src/lib/experiments/airflow/scene/camera/sims';

/**
 * The opening's camera move (scene/camera/opening.ts): from the Home's default view toward the living room, in about six and a half
 * seconds, eased at both ends, and stopped the moment the visitor takes the camera.
 */

const twoBedroom = planById('two-bedroom')!;
const DEG = Math.PI / 180;
const FOV = 45 * DEG;

test.describe('the opening', () => {
	test('it starts on the default three-quarter view, so nothing jumps when the world comes up, and ends looking across the living room at its windows', () => {
		const opening = openingFor(twoBedroom, 1.6);
		expect(opening.from).toEqual(homeView(twoBedroom, 1.6));
		expect(opening.seconds).toBe(OPENING_SECONDS);
		expect(opening.seconds, 'five to eight seconds').toBeGreaterThanOrEqual(5);
		expect(opening.seconds).toBeLessThanOrEqual(8);
		// The living room is the west end's south half (x 0 to 4.8, z 3 to 7.8): the drift ends over it.
		const living = twoBedroom.rooms.find((room) => room.id === 'living')!.rects[0];
		expect(opening.to.x).toBeCloseTo(living.x + living.w / 2 + OPENING_END.dx, 9);
		expect(opening.to.z).toBeCloseTo(living.z + living.d / 2 + OPENING_END.dz, 9);
		// Looking west of north, toward the west windows, from nearer than the default view.
		const heading = (((-opening.to.yaw / DEG) % 360) + 360) % 360;
		expect(heading).toBeCloseTo(OPENING_END.heading, 6);
		expect(opening.to.zoom).toBeLessThan(opening.from.zoom);
	});

	test('the end is a view the camera can hold: inside its limits, so putting the camera there changes nothing', () => {
		for (const aspect of [1.6, 0.46]) {
			const { to } = openingFor(twoBedroom, aspect);
			expect(clampZoom(to.zoom)).toBe(to.zoom);
			expect(clampTilt(to.tilt, to.zoom)).toBeCloseTo(to.tilt, 12);
			expect(clampFocus(to.x, to.z, to.zoom, twoBedroom)).toEqual({ x: to.x, z: to.z });
		}
	});

	test('a Home without a living room drifts toward its middle', () => {
		const home = { width: 6, depth: 4, ceiling: 2.4, rooms: [{ id: 'studio', rects: [{ x: 0, z: 0, w: 6, d: 4 }] }] };
		const { to } = openingFor(home);
		expect(to.x).toBeCloseTo(3 + OPENING_END.dx, 9);
		expect(to.z).toBeCloseTo(2 + OPENING_END.dz, 9);
		for (const plan of plans) expect(Number.isFinite(openingFor(plan).to.x), plan.id).toBe(true);
	});

	test('the drift is eased at both ends and never goes back or overshoots: every channel moves one way, from where it starts to where it ends', () => {
		const opening = openingFor(twoBedroom);
		expect(openingAt(opening, 0)).toEqual(opening.from);
		const end = openingAt(opening, opening.seconds);
		for (const key of ['x', 'z', 'zoom', 'tilt'] as const) expect(end[key]).toBeCloseTo(opening.to[key], 9);
		expect(wrapAngle(end.yaw - opening.to.yaw)).toBeCloseTo(0, 9);
		let last: CameraState = opening.from;
		const step = 1 / 60;
		let fastest = 0;
		for (let t = step; t <= opening.seconds + 1; t += step) {
			const now = openingAt(opening, t);
			for (const key of ['x', 'z', 'zoom', 'tilt', 'yaw'] as const) {
				const total = key === 'yaw' ? wrapAngle(opening.to.yaw - opening.from.yaw) : opening.to[key] - opening.from[key];
				const moved = now[key] - last[key];
				expect(moved * Math.sign(total), `${key} at ${t.toFixed(2)} s`).toBeGreaterThanOrEqual(-1e-12);
			}
			fastest = Math.max(fastest, Math.abs(now.zoom - last.zoom) / step);
			last = now;
		}
		// Gentle at the start (the fade-in) and at the end, with nothing sudden in between.
		const speed = (t: number) => Math.abs(openingAt(opening, t + 0.01).zoom - openingAt(opening, t).zoom) / 0.01;
		expect(speed(0.05)).toBeLessThan(0.1 * fastest);
		expect(speed(opening.seconds - 0.1)).toBeLessThan(0.05 * fastest);
		expect(OPENING_EASE(0.5)).toBeGreaterThan(0.5);
	});

	test('the yaw turns the short way round', () => {
		const from = { x: 0, z: 0, yaw: 170 * DEG, zoom: 0.5, tilt: 0 };
		const to = { ...from, yaw: -170 * DEG };
		const half = openingAt({ from, to, seconds: 1 }, 1);
		expect(Math.abs(wrapAngle(half.yaw - to.yaw))).toBeLessThan(1e-9);
		const middle = openingAt({ from, to, seconds: 2 }, 1);
		expect(Math.abs(wrapAngle(middle.yaw - 180 * DEG)), 'through 180 degrees, not through 0').toBeLessThan(15 * DEG);
	});

	test('the camera stays clear of the Home all the way: above it at the start, inside its walls once it is below the roof', () => {
		const opening = openingFor(twoBedroom);
		const far = farDistance(twoBedroom, FOV, 1.6);
		for (let t = 0; t <= opening.seconds; t += 0.1) {
			const camera = pose(openingAt(opening, t), twoBedroom, far);
			const [x, y, z] = camera.position;
			expect([x, y, z].every(Number.isFinite)).toBe(true);
			expect(y, `above the floor at ${t.toFixed(1)} s`).toBeGreaterThan(1.5);
			if (y < twoBedroom.ceiling + 0.2) {
				expect(x, `inside at ${t.toFixed(1)} s`).toBeGreaterThanOrEqual(CAMERA_INSET - 1e-6);
				expect(z).toBeGreaterThanOrEqual(CAMERA_INSET - 1e-6);
			}
		}
	});

	test('a CSS-style Bézier easing matches its curve’s ends and runs one way', () => {
		const ease = cubicBezier(0.42, 0, 0.58, 1);
		expect(ease(0)).toBe(0);
		expect(ease(1)).toBe(1);
		expect(ease(0.5)).toBeCloseTo(0.5, 6);
		let last = 0;
		for (let x = 0.01; x <= 1; x += 0.01) {
			expect(ease(x)).toBeGreaterThanOrEqual(last - 1e-12);
			last = ease(x);
		}
	});

	test('played on a camera, it moves it a frame at a time, ends on its own, and stops at once when the visitor takes over', () => {
		const opening = openingFor(twoBedroom);
		const put: Partial<CameraState>[] = [];
		const camera = { jumpTo: (state: Partial<CameraState>) => put.push(state) };
		const playing = new CameraOpening(camera, opening);
		expect(put[0], 'it starts where the drift starts').toEqual(opening.from);
		let frames = 0;
		while (playing.update(1 / 60)) frames++;
		expect(frames / 60).toBeCloseTo(opening.seconds, 1);
		expect(playing.playing).toBe(false);
		expect(put.at(-1)!.zoom).toBeCloseTo(opening.to.zoom, 9);
		const count = put.length;
		expect(playing.update(1 / 60), 'and does nothing more').toBe(false);
		expect(put).toHaveLength(count);

		const taken = new CameraOpening(camera, opening);
		for (let n = 0; n < 60; n++) taken.update(1 / 60);
		const at = put.length;
		taken.stop();
		expect(taken.playing).toBe(false);
		expect(taken.update(1 / 60), 'a stopped drift never moves the camera again').toBe(false);
		expect(put).toHaveLength(at);
	});
});
