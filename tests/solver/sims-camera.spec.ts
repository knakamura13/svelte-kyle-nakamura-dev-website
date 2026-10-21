import { expect, test } from '@playwright/test';
import { PerspectiveCamera } from 'three';
import { SimsCamera, type CameraHost, type CameraPointer } from '../../src/lib/experiments/airflow/scene/camera/controls';
import {
	CAMERA_INSET,
	EYE_HEIGHT,
	FOCUS_INSET,
	HOME_TILT,
	HOME_ZOOM,
	PITCH_FAR,
	PITCH_MAX,
	PITCH_MIN,
	TILT_LIMIT,
	FIT_FILL,
	cameraFromSearch,
	clampFocus,
	clampTilt,
	distanceAt,
	farDistance,
	fitZoom,
	frameLens,
	homeCorners,
	homeView,
	pitchAt,
	pose,
	projectThrough,
	spring,
	still,
	stepCamera,
	wrapAngle,
	type CameraBounds,
	type CameraState,
	type ViewFrame
} from '../../src/lib/experiments/airflow/scene/camera/sims';

/**
 * The Sims camera: the maths of the orbit (pure), and the controls that move its goal. Everything in the solver's axes: x east, z
 * south, metres; the two-bedroom Home is 12 by 7.8 m with 2.4 m walls.
 */

const HOME: CameraBounds = { width: 12, depth: 7.8, ceiling: 2.4 };
const FOV = (45 * Math.PI) / 180;
const FAR = farDistance(HOME, FOV, 1.6);
const DEG = Math.PI / 180;

/** A seeded generator, so a failure names the case that failed. */
function random(seed: number) {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state >>>= 0;
		state ^= state >>> 17;
		state ^= state << 5;
		state >>>= 0;
		return state / 4294967296;
	};
}

test.describe('the orbit', () => {
	test('at eye level the camera stands 1.6 m up and looks nearly level across the room', () => {
		const at = pose({ x: 2.4, z: 5.4, yaw: 0.3, zoom: 0, tilt: 0 }, HOME, FAR);
		expect(at.position[1]).toBeCloseTo(EYE_HEIGHT, 2);
		expect(at.pitch / DEG).toBeLessThan(8);
		expect(at.pitch / DEG).toBeGreaterThan(1);
		// It looks at a point just below its eyes, a couple of metres away, not at the floor.
		expect(at.target[1]).toBeGreaterThan(1.2);
		expect(at.distance).toBeGreaterThan(1.5);
		expect(at.distance).toBeLessThan(3.5);
	});

	test('at bird’s-eye it looks down about 75 degrees from far enough out to see the whole Home', () => {
		const at = pose({ ...homeView(HOME), zoom: 1, tilt: 0 }, HOME, FAR);
		expect(at.pitch).toBeCloseTo(PITCH_FAR, 5);
		expect(at.target[1]).toBe(0);
		// Every corner of the footprint is within the vertical field of view from there.
		const [px, py, pz] = at.position;
		for (const [x, z] of [
			[0, 0],
			[HOME.width, 0],
			[0, HOME.depth],
			[HOME.width, HOME.depth]
		]) {
			const to = [x - px, -py, z - pz];
			const look = [at.target[0] - px, at.target[1] - py, at.target[2] - pz];
			const cos = (to[0] * look[0] + to[1] * look[1] + to[2] * look[2]) / (Math.hypot(...to) * Math.hypot(...look));
			expect(Math.acos(cos), `corner ${x},${z}`).toBeLessThan(FOV / 2);
		}
	});

	test('the pitch follows the zoom, and the distance grows by the same ratio for each step of zoom', () => {
		let lastPitch = -Infinity;
		const ratios: number[] = [];
		for (let zoom = 0; zoom <= 1.0001; zoom += 0.05) {
			const pitch = pitchAt(zoom);
			expect(pitch).toBeGreaterThanOrEqual(lastPitch);
			lastPitch = pitch;
			if (zoom > 0) ratios.push(distanceAt(zoom, FAR) / distanceAt(zoom - 0.05, FAR));
		}
		for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0], 6);
		expect(distanceAt(1, FAR)).toBeCloseTo(FAR, 6);
		// The default view is a three-quarter view, between the two: far out, tilted back.
		expect((pitchAt(HOME_ZOOM) + HOME_TILT) / DEG).toBeGreaterThan(40);
		expect((pitchAt(HOME_ZOOM) + HOME_TILT) / DEG).toBeLessThan(60);
	});

	test('a drag tilts within limits, and the pitch never leaves its range whatever the zoom and the tilt', () => {
		expect(clampTilt(10, 0.5)).toBeLessThanOrEqual(TILT_LIMIT);
		expect(clampTilt(-10, 0.5)).toBeGreaterThanOrEqual(-TILT_LIMIT);
		for (let zoom = 0; zoom <= 1; zoom += 0.1)
			for (const tilt of [-10, -0.3, 0, 0.3, 10]) {
				const pitch = pose({ x: 6, z: 3.9, yaw: 0, zoom, tilt: clampTilt(tilt, zoom) }, HOME, FAR).pitch;
				expect(pitch).toBeGreaterThanOrEqual(PITCH_MIN - 1e-9);
				expect(pitch).toBeLessThanOrEqual(PITCH_MAX + 1e-9);
			}
	});

	test('close in, the focus stays inside the Home, off its walls; far out it may go a little past them', () => {
		const near = clampFocus(-5, 30, 0, HOME);
		expect(near).toEqual({ x: FOCUS_INSET, z: HOME.depth - FOCUS_INSET });
		const far = clampFocus(-5, 30, 1, HOME);
		expect(far.x).toBeLessThan(0);
		expect(far.z).toBeGreaterThan(HOME.depth);
		expect(far.x).toBeGreaterThanOrEqual(-3);
		// A focus already inside is left where it is.
		expect(clampFocus(4, 4, 0, HOME)).toEqual({ x: 4, z: 4 });
	});

	test('below the roof the camera never leaves the Home, whatever the focus inside it and whichever way it faces', () => {
		const next = random(7);
		for (let n = 0; n < 2000; n++) {
			const zoom = next() * 0.5;
			const focus = clampFocus(next() * HOME.width, next() * HOME.depth, zoom, HOME);
			const at = pose({ ...focus, yaw: next() * Math.PI * 2, zoom, tilt: clampTilt((next() - 0.5) * 2, zoom) }, HOME, FAR);
			if (at.position[1] > HOME.ceiling + 0.2) continue;
			const [x, , z] = at.position;
			const where = `case ${n}: (${x.toFixed(2)}, ${z.toFixed(2)})`;
			expect(x, where).toBeGreaterThanOrEqual(CAMERA_INSET - 1e-6);
			expect(x, where).toBeLessThanOrEqual(HOME.width - CAMERA_INSET + 1e-6);
			expect(z, where).toBeGreaterThanOrEqual(CAMERA_INSET - 1e-6);
			expect(z, where).toBeLessThanOrEqual(HOME.depth - CAMERA_INSET + 1e-6);
		}
	});

	test('pulling out from a corner moves the camera smoothly: it never jumps as it rises out of the Home', () => {
		for (const yaw of [0, 0.8, 2.4, -2]) {
			let last = pose({ x: 0.5, z: 0.5, yaw, zoom: 0, tilt: 0 }, HOME, FAR).position;
			for (let zoom = 0.002; zoom <= 1; zoom += 0.002) {
				const focus = clampFocus(0.5, 0.5, zoom, HOME);
				const now = pose({ ...focus, yaw, zoom, tilt: 0 }, HOME, FAR).position;
				const step = Math.hypot(now[0] - last[0], now[1] - last[1], now[2] - last[2]);
				// The whole sweep spans about 20 m, so 500 steps average 4 cm; a jump would be metres.
				expect(step, `yaw ${yaw}, zoom ${zoom.toFixed(3)}`).toBeLessThan(0.35);
				last = now;
			}
		}
	});
});

test.describe('the springs', () => {
	test('settle on the goal without overshooting, from rest and from a run at it, and at any frame length', () => {
		for (const dt of [1 / 240, 1 / 60, 1 / 20, 0.5, 2]) {
			for (const v0 of [0, 3, 30]) {
				let [x, v] = [0, v0];
				let t = 0;
				while (t < 3) {
					[x, v] = spring(x, v, 1, 11, dt);
					expect(x, `dt ${dt}, v0 ${v0}`).toBeLessThanOrEqual(1);
					t += dt;
				}
				expect(x).toBe(1);
			}
		}
	});

	test('take about a quarter of a second to get most of the way', () => {
		let [x, v] = [0, 0];
		for (let i = 0; i < 15; i++) [x, v] = spring(x, v, 1, 11, 1 / 60);
		expect(x).toBeGreaterThan(0.75);
		expect(x).toBeLessThan(1);
	});

	test('turn the short way round', () => {
		const state: CameraState = { x: 0, z: 0, yaw: 170 * DEG, zoom: 0.5, tilt: 0 };
		const goal: CameraState = { ...state, yaw: -170 * DEG };
		const motion = still();
		let crossed = false;
		for (let i = 0; i < 120; i++) {
			stepCamera(state, motion, goal, 1 / 60, false);
			if (Math.abs(wrapAngle(state.yaw)) < 90 * DEG) crossed = true;
		}
		expect(crossed, 'it never passes through north').toBe(false);
		expect(wrapAngle(state.yaw - goal.yaw)).toBeCloseTo(0, 4);
	});

	test('jump straight to the goal for reduced motion', () => {
		const state = homeView(HOME);
		const goal = { ...state, x: 1, zoom: 0.1, yaw: 2 };
		expect(stepCamera(state, still(), goal, 1 / 60, true)).toBe(false);
		expect(state).toEqual(goal);
	});
});

test.describe('the controls', () => {
	function rig(options: { reduced?: boolean; floor?: { x: number; z: number } | null } = {}) {
		const camera = new PerspectiveCamera(45, 1.6, 0.1, 400);
		const host: CameraHost = { reducedMotion: () => options.reduced ?? false, size: () => ({ width: 1440, height: 900 }), floorAt: () => (options.floor === undefined ? { x: 3, z: 2 } : options.floor) };
		const controls = new SimsCamera(camera, host, HOME);
		controls.setAspect(1.6);
		return { camera, controls };
	}
	const mouse = (button: number, x: number, y: number, extra: Partial<CameraPointer> = {}) => ({ pointerId: 1, pointerType: 'mouse', button, altKey: false, clientX: x, clientY: y, ...extra }) as CameraPointer;
	const finger = (id: number, x: number, y: number) => ({ pointerId: id, pointerType: 'touch', button: 0, altKey: false, clientX: x, clientY: y }) as CameraPointer;
	const key = (name: string, type = 'keydown') => ({ key: name, type, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }) as KeyboardEvent;
	const settle = (controls: SimsCamera) => {
		for (let i = 0; i < 240; i++) controls.update(1 / 60);
	};

	test('start at the default view of the Home and leave the left button to the tools', () => {
		const { controls } = rig();
		expect(controls.goal).toEqual(homeView(HOME));
		expect(controls.pointerDown(mouse(0, 100, 100)), 'a left press is a tool’s').toBe(false);
		expect(controls.pointerMove(mouse(0, 300, 100))).toBe(false);
		expect(controls.goal).toEqual(homeView(HOME));
	});

	test('turn and tilt with a right drag, or Alt and a left drag', () => {
		for (const [button, alt] of [
			[2, false],
			[0, true]
		] as const) {
			const { controls } = rig();
			const before = { ...controls.goal };
			expect(controls.pointerDown(mouse(button, 100, 100, { altKey: alt }))).toBe(true);
			controls.pointerMove(mouse(button, 180, 140, { altKey: alt }));
			expect(controls.goal.yaw).toBeLessThan(before.yaw);
			expect(controls.goal.tilt).toBeGreaterThan(before.tilt);
			expect(controls.goal.x).toBe(before.x);
			controls.pointerUp(mouse(button, 180, 140));
			expect(controls.dragging).toBe(false);
		}
	});

	test('pan with a middle drag: the Home follows the pointer', () => {
		const { controls } = rig();
		settle(controls);
		const before = { ...controls.goal };
		controls.pointerDown(mouse(1, 700, 450));
		controls.pointerMove(mouse(1, 600, 450));
		// The pointer went left, so the Home moved left on screen: the focus moved to the right of the view.
		const right = { x: Math.cos(controls.goal.yaw), z: -Math.sin(controls.goal.yaw) };
		const moved = { x: controls.goal.x - before.x, z: controls.goal.z - before.z };
		expect(moved.x * right.x + moved.z * right.z).toBeGreaterThan(0.3);
	});

	test('zoom with the wheel and with + and -, and fly to the floor on a double click', () => {
		const { controls } = rig({ floor: { x: 3, z: 2 } });
		const zoom = controls.goal.zoom;
		controls.wheel({ deltaY: -200, deltaMode: 0, ctrlKey: false, metaKey: false });
		expect(controls.goal.zoom, 'the wheel rolled forward zooms in').toBeLessThan(zoom);
		const wheeled = controls.goal.zoom;
		controls.key(key('-'));
		expect(controls.goal.zoom, '- zooms out').toBeGreaterThan(wheeled);
		controls.key(key('+'));
		expect(controls.goal.zoom, '+ zooms in').toBeCloseTo(wheeled, 6);
		controls.wheel({ deltaY: -10_000, deltaMode: 0, ctrlKey: false, metaKey: false });
		expect(controls.goal.zoom).toBe(0);
		expect(controls.flyTo({ x: 0, y: 0 })).toBe(true);
		expect(controls.goal.x).toBe(3);
		expect(controls.goal.z).toBe(2);
		const { controls: sky } = rig({ floor: null });
		expect(sky.flyTo({ x: 0, y: 0.9 }), 'the sky is not a place to go').toBe(false);
	});

	test('pan with WASD and the arrows, turn with Q and E, and go back to the default view with Home', () => {
		const { controls } = rig();
		settle(controls);
		const start = { ...controls.goal };
		controls.key(key('w'));
		for (let i = 0; i < 30; i++) controls.update(1 / 60);
		controls.key(key('w', 'keyup'));
		// Forward is away from the camera: the camera is at (sin yaw, cos yaw) from the focus.
		const away = { x: -Math.sin(start.yaw), z: -Math.cos(start.yaw) };
		const moved = { x: controls.goal.x - start.x, z: controls.goal.z - start.z };
		expect(moved.x * away.x + moved.z * away.z).toBeGreaterThan(0.5);
		const held = { ...controls.goal };
		for (let i = 0; i < 30; i++) controls.update(1 / 60);
		expect(controls.goal.x, 'a released key stops').toBe(held.x);
		controls.key(key('ArrowLeft'));
		controls.update(1 / 60);
		controls.key(key('ArrowLeft', 'keyup'));
		controls.key(key('q'));
		controls.update(0.2);
		controls.key(key('q', 'keyup'));
		expect(controls.goal.yaw).toBeGreaterThan(start.yaw);
		controls.key(key('e'));
		controls.update(0.5);
		controls.key(key('e', 'keyup'));
		expect(controls.goal.yaw).toBeLessThan(start.yaw);
		expect(controls.key(key('Home'))).toBe(true);
		expect(controls.goal).toEqual(homeView(HOME));
		expect(controls.key({ ...key('w'), ctrlKey: true } as KeyboardEvent), 'browser shortcuts are not the camera’s').toBe(false);
	});

	test('on a touch screen one finger pans, and two pinch to zoom and twist to turn', () => {
		const { controls } = rig();
		settle(controls);
		const start = { ...controls.goal };
		controls.pointerDown(finger(1, 500, 500));
		controls.pointerMove(finger(1, 400, 500));
		expect(Math.hypot(controls.goal.x - start.x, controls.goal.z - start.z)).toBeGreaterThan(0.2);
		const panned = { ...controls.goal };
		controls.pointerDown(finger(2, 600, 500));
		// Spread the fingers apart (zoom in) and turn them a quarter turn.
		controls.pointerMove(finger(2, 400, 800));
		expect(controls.goal.zoom).toBeLessThan(panned.zoom);
		expect(Math.abs(controls.goal.yaw - panned.yaw)).toBeGreaterThan(0.5);
		controls.pointerUp(finger(2, 400, 800));
		expect(controls.dragging, 'the finger left on the screen pans again').toBe(true);
		controls.pointerUp(finger(1, 400, 500));
		expect(controls.dragging).toBe(false);
	});

	test('ease the camera to its goal, or jump for reduced motion, and say how it is posed', () => {
		const eased = rig();
		eased.controls.setZoom(0);
		expect(eased.controls.update(1 / 60), 'still moving after one frame').toBe(true);
		settle(eased.controls);
		expect(eased.controls.update(1 / 60)).toBe(false);
		expect(eased.camera.position.y).toBeCloseTo(EYE_HEIGHT, 1);
		const reduced = rig({ reduced: true });
		reduced.controls.setZoom(0);
		expect(reduced.controls.update(1 / 60)).toBe(false);
		expect(reduced.camera.position.y).toBeCloseTo(EYE_HEIGHT, 1);
		// The default view looks north-north-east, from the south-west, about 50 degrees down.
		const home = rig();
		expect(home.controls.yawDegrees).toBe(32);
		expect(home.controls.pitchDegrees).toBeGreaterThan(40);
	});

	test('on a screen taller than wide, start from bird’s-eye looking along the Home’s long side, until the visitor moves the camera', () => {
		const { controls } = rig();
		controls.setAspect(390 / 844);
		expect(controls.goal).toEqual(homeView(HOME, 390 / 844));
		expect(controls.goal.zoom).toBeGreaterThan(HOME_ZOOM - 0.05);
		// The two-bedroom is wider than deep, so the camera looks east by north, nearly along its 12 m.
		expect(controls.yawDegrees).toBe(82);
		// Turned the other way up, it goes back to the landscape view; once moved, a new shape leaves the camera where it is.
		controls.setAspect(1.6);
		expect(controls.goal).toEqual(homeView(HOME));
		controls.wheel({ deltaY: -100, deltaMode: 0, ctrlKey: false, metaKey: false });
		const moved = { ...controls.goal };
		controls.setAspect(0.5);
		expect(controls.goal).toEqual(moved);
	});

	test('start anywhere a link asks for, at once and within the limits: ?camera=x,z,heading,zoom,tilt', () => {
		expect(cameraFromSearch('')).toBeNull();
		expect(cameraFromSearch('?camera=')).toBeNull();
		expect(cameraFromSearch('?camera=nonsense')).toBeNull();
		// The heading is the way the camera looks, clockwise from north, as the page's data-yaw says it.
		const asked = cameraFromSearch('?quality=high&camera=2.8,4.5,215,0,3')!;
		expect(asked.x).toBe(2.8);
		expect(asked.z).toBe(4.5);
		expect(asked.zoom).toBe(0);
		expect(asked.tilt).toBeCloseTo(3 * DEG, 9);
		const { controls, camera } = rig();
		controls.jumpTo(asked);
		expect(controls.yawDegrees).toBe(215);
		expect(controls.state).toEqual(controls.goal);
		expect(controls.update(1 / 60), 'already there').toBe(false);
		// At eye level, tilted 3 degrees down from the 5 the zoom gives.
		expect(controls.pitchDegrees).toBe(8);
		expect(camera.position.y).toBeGreaterThan(EYE_HEIGHT);
		// A part left out keeps the default; a zoom past the end is the end; a focus outside the Home, close in, is brought inside.
		const partial = rig();
		partial.controls.jumpTo(cameraFromSearch('?camera=,,,2')!);
		expect(partial.controls.goal.zoom).toBe(1);
		expect(partial.controls.goal.x).toBe(homeView(HOME).x);
		const outside = rig();
		outside.controls.jumpTo({ x: -5, z: 3, zoom: 0 });
		expect(outside.controls.goal.x).toBe(FOCUS_INSET);
	});
});

test.describe('a phone’s frame', () => {
	/** The frame a phone's HUD leaves at 390 by 844: under the top bar, and over the toolbar with room for a sheet at its peek. */
	const PHONE = { width: 390, height: 844 };
	const FRAME: ViewFrame = { top: 72, right: 0, bottom: 232, left: 0 };

	test('the lens of a frame: the frame’s own field of view and shape, and the shift that centres the picture on it, at the same scale', () => {
		const none = frameLens(PHONE, null, FOV);
		expect(none).toEqual({ fov: FOV, aspect: 390 / 844, shift: { x: 0, y: 0 } });
		const lens = frameLens(PHONE, FRAME, FOV);
		// 540 of the 844 px: the same angle a pixel, so the frame's field is the share of the view's tangent that its height is.
		expect(Math.tan(lens.fov / 2)).toBeCloseTo((Math.tan(FOV / 2) * 540) / 844, 9);
		expect(lens.aspect).toBeCloseTo(390 / 540, 9);
		// The frame's middle is 72 + 270 = 342 px down, 80 px over the view's.
		expect(lens.shift).toEqual({ x: 0, y: -80 });
		// A frame from a HUD caught mid-layout, taller than the view, is held to a share of it, with its middle on the view.
		const squashed = frameLens(PHONE, { top: 600, right: 0, bottom: 600, left: 0 }, FOV);
		expect(squashed.fov).toBeGreaterThan(0);
		expect(Math.abs(squashed.shift.y)).toBeLessThanOrEqual(844 / 2);
	});

	test('the default view in a frame comes as close as keeps the whole home in it, and no closer', () => {
		const lens = frameLens(PHONE, FRAME, FOV);
		const fit = { fov: lens.fov, aspect: lens.aspect, far: farDistance(HOME, lens.fov, lens.aspect) };
		const view = homeView(HOME, lens.aspect, fit);
		const inside = (zoom: number) =>
			homeCorners(HOME).every((corner) => {
				const at = projectThrough(pose({ ...view, zoom, tilt: clampTilt(view.tilt, zoom) }, HOME, fit.far), corner, lens);
				return !!at && Math.abs(at.x) <= FIT_FILL + 1e-9 && Math.abs(at.y) <= FIT_FILL + 1e-9;
			});
		expect(view.zoom).toBe(fitZoom(view, HOME, fit));
		expect(inside(view.zoom), 'every corner of the home, and the ground round it, is in the frame').toBe(true);
		expect(inside(view.zoom - 0.02), 'a little closer, one is not').toBe(false);
		// The home is wider than deep and the frame is narrow, so it is the width that binds: some corner is at the frame's side.
		const widest = Math.max(...homeCorners(HOME).map((corner) => Math.abs(projectThrough(pose(view, HOME, fit.far), corner, lens)!.x)));
		expect(widest).toBeGreaterThan(FIT_FILL - 0.02);
	});

	test('the controls frame the home where the HUD leaves room, shift the picture to the frame’s middle, and leave a desktop as it was', () => {
		let frame: ViewFrame | null = FRAME;
		const camera = new PerspectiveCamera(45, 390 / 844, 0.1, 400);
		const host: CameraHost = { reducedMotion: () => true, size: () => PHONE, floorAt: () => null, frame: () => frame };
		const controls = new SimsCamera(camera, host, HOME);
		controls.setAspect(390 / 844);
		controls.update(1 / 60);
		const lens = frameLens(PHONE, FRAME, FOV);
		const fit = { fov: lens.fov, aspect: lens.aspect, far: farDistance(HOME, lens.fov, lens.aspect) };
		expect(controls.goal).toEqual(homeView(HOME, lens.aspect, fit));
		// What the camera looks at is drawn in the middle of the frame, 342 px down, not of the screen.
		const [tx, ty, tz] = controls.pose.target;
		const target = camera.position.clone().set(tx, ty, tz).project(camera);
		expect((-target.y * 0.5 + 0.5) * PHONE.height).toBeCloseTo(342, 3);
		expect((target.x * 0.5 + 0.5) * PHONE.width).toBeCloseTo(195, 3);
		// And a pick through the shifted lens is where the picture shows: the frame's middle unprojects onto the line to the target.
		const ray = camera.position.clone().set(0, (1 - (2 * 342) / PHONE.height), 0.5).unproject(camera).sub(camera.position).normalize();
		const toTarget = camera.position.clone().set(tx, ty, tz).sub(camera.position).normalize();
		expect(ray.dot(toTarget)).toBeCloseTo(1, 6);
		// No frame (a desktop's HUD): the desktop's view, and no shift.
		frame = null;
		controls.update(1 / 60);
		expect(controls.goal).toEqual(homeView(HOME, 390 / 844));
		expect(camera.projectionMatrix.elements[9]).toBe(0);
	});
});
