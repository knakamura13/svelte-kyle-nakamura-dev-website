import { homeView, wrapAngle, type CameraBounds, type CameraState } from './sims';

/**
 * The opening's camera move: the first thing a visitor sees once the world has loaded. The camera starts on the Home's default
 * three-quarter view, the whole home and a margin of lawn at golden hour, and drifts in toward the living room, turning as it comes so
 * that the room's west windows, where the cross-ventilation Scenario's wind pours in, end up across the frame from the camera, with
 * the streaks crossing the room. The camera's own motion is the only thing here: the air is the solver's.
 *
 * Pure, with no three.js and no DOM, so Node checks it. `CameraOpening` drives any camera that can be put at a state, once a frame;
 * whatever the visitor does first stops it where it is (the host calls `stop`).
 */

/** How long the drift takes, s: long enough to read as a move, short enough that the visitor is soon holding the camera. */
export const OPENING_SECONDS = 6;

const DEG = Math.PI / 180;

/**
 * Where the drift ends, relative to the living room's middle: the camera south-south-east of it, looking 28 degrees west of north
 * across the room, so the two west windows are on the left with the air coming in through them and spreading across the floor to the
 * right, at zoom 0.6 (a little over half way from eye level to bird's-eye), looking down 12 degrees more than that zoom does, over the
 * bookcase by the south wall. Picked from screenshots of the Two-bedroom at 1440 by 900 (`?camera=2.0,5.0,332,0.6,12`); at check-in 3
 * it looked down 2 degrees more, and the bookcase hid twice as much of the south window's air.
 */
export const OPENING_END = { dx: -0.4, dz: -0.4, heading: 332, zoom: 0.6, tilt: 12 } as const;
/** On a screen taller than it is wide the room needs a little more distance to fit across. */
const PORTRAIT_ZOOM = 0.72;

/** What the opening needs of a Home: its size, and where its living room is. */
export interface OpeningHome extends CameraBounds {
	rooms: readonly { id: string; rects: readonly { x: number; z: number; w: number; d: number }[] }[];
}

/** The two ends of the drift and how long it takes. */
export interface Opening {
	from: CameraState;
	to: CameraState;
	seconds: number;
}

/** The middle of a room's footprint, by area, m. */
function middleOf(rects: OpeningHome['rooms'][number]['rects']) {
	let area = 0;
	let x = 0;
	let z = 0;
	for (const r of rects) {
		const a = r.w * r.d;
		area += a;
		x += a * (r.x + r.w / 2);
		z += a * (r.z + r.d / 2);
	}
	return area > 0 ? { x: x / area, z: z / area } : null;
}

/** The opening for a Home seen on a screen of this `aspect` (width over height): from its default view to its living room (or its middle, in a Home without one). */
export function openingFor(home: OpeningHome, aspect = 1.6): Opening {
	const from = homeView(home, aspect);
	const living = home.rooms.find((room) => room.id === 'living');
	const middle = (living && middleOf(living.rects)) ?? { x: home.width / 2, z: home.depth / 2 };
	const to: CameraState = {
		x: middle.x + OPENING_END.dx,
		z: middle.z + OPENING_END.dz,
		// A heading is the way the camera looks, clockwise from north; the camera's yaw is minus that (sims.ts).
		yaw: wrapAngle(-OPENING_END.heading * DEG),
		zoom: aspect < 1 ? PORTRAIT_ZOOM : OPENING_END.zoom,
		tilt: OPENING_END.tilt * DEG
	};
	return { from, to, seconds: OPENING_SECONDS };
}

/** A cubic Bézier easing with its ends at (0, 0) and (1, 1), as CSS's `cubic-bezier(x1, y1, x2, y2)`. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
	const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
	const slope = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
	return (x: number) => {
		if (x <= 0) return 0;
		if (x >= 1) return 1;
		// Newton's method for the t whose x is `x`, then bisection if it wanders.
		let t = x;
		for (let n = 0; n < 8; n++) {
			const error = at(x1, x2, t) - x;
			const d = slope(x1, x2, t);
			if (Math.abs(error) < 1e-7) return at(y1, y2, t);
			if (Math.abs(d) < 1e-6) break;
			t -= error / d;
		}
		let lo = 0;
		let hi = 1;
		t = x;
		for (let n = 0; n < 40; n++) {
			const value = at(x1, x2, t);
			if (Math.abs(value - x) < 1e-7) break;
			if (value < x) lo = t;
			else hi = t;
			t = (lo + hi) / 2;
		}
		return at(y1, y2, t);
	};
}

/**
 * The drift's pace: it gets going gently under the fade-in, glides, and settles into the end with no stop the eye can catch. About 70%
 * of the way is covered by half time; a longer tail (0.18 for the second point) left the last two seconds moving too little to see.
 */
export const OPENING_EASE = cubicBezier(0.45, 0, 0.25, 1);

/** Where the camera is `t` seconds into the opening. The yaw turns the short way round. */
export function openingAt(opening: Opening, t: number): CameraState {
	const s = OPENING_EASE(Math.min(1, Math.max(0, t / opening.seconds)));
	const { from, to } = opening;
	const lerp = (a: number, b: number) => a + (b - a) * s;
	return {
		x: lerp(from.x, to.x),
		z: lerp(from.z, to.z),
		yaw: from.yaw + wrapAngle(to.yaw - from.yaw) * s,
		zoom: lerp(from.zoom, to.zoom),
		tilt: lerp(from.tilt, to.tilt)
	};
}

/** A camera the opening can drive: one that can be put at a state at once (`SimsCamera.jumpTo`). */
export interface OpeningCamera {
	jumpTo(state: Partial<CameraState>): void;
}

/** Plays an opening on a camera, a frame at a time, until it ends or the visitor takes the camera. */
export class CameraOpening {
	private t = 0;
	private done = false;

	constructor(
		private readonly camera: OpeningCamera,
		readonly opening: Opening
	) {
		camera.jumpTo(openingAt(opening, 0));
	}

	/** True until the drift has ended or been stopped. */
	get playing() {
		return !this.done;
	}

	/** Moves the camera `dt` seconds on. Returns true while the drift is still playing. */
	update(dt: number): boolean {
		if (this.done) return false;
		this.t += Math.max(0, dt);
		this.camera.jumpTo(openingAt(this.opening, this.t));
		if (this.t >= this.opening.seconds) this.done = true;
		return !this.done;
	}

	/** The visitor took the camera: the drift stops where it is, and the camera is theirs from there. */
	stop() {
		this.done = true;
	}
}
