/**
 * The Sims camera's maths, with no three.js and no DOM in it, so Node checks every rule: one orbit round a focus point on the
 * floor, and one zoom that runs from eye level (the camera 1.6 m up and looking nearly level, inside a room) to a bird's-eye
 * view of the whole Home. The pitch follows the zoom, as in The Sims 4, and a drag adds a tilt within limits. Every channel
 * eases to its goal on a critically damped spring that never overshoots.
 *
 * Axes are the solver's: metres, x east, y up, z south, the origin at the footprint's north-west floor corner. `yaw` is the
 * camera's bearing round the focus in radians: 0 puts the camera south of the focus looking north, and a positive yaw moves it
 * east (it is `atan2(dx, dz)` of the camera's offset from the focus).
 */

/** The part of a Home the camera cares about: its footprint and how high its walls stand, m. */
export interface CameraBounds {
	width: number;
	depth: number;
	ceiling: number;
}

/** Where the camera is, or wants to be. Zoom runs from 0 (eye level) to 1 (bird's-eye); tilt is radians added to the pitch the zoom gives. */
export interface CameraState {
	x: number;
	z: number;
	yaw: number;
	zoom: number;
	tilt: number;
}

/** A camera placed for one state: where it is, what it looks at, and its pitch (radians down from level) and distance to the target. */
export interface CameraPose {
	position: [number, number, number];
	target: [number, number, number];
	pitch: number;
	distance: number;
	/** How much of the inside-the-home rule applied, 0 to 1: 1 when the camera is below the roof and was kept inside the footprint. */
	inside: number;
}

const DEG = Math.PI / 180;

/** The camera's height at the closest zoom, m: a standing visitor's eyes. */
export const EYE_HEIGHT = 1.6;
/** How far the camera stands from the point it looks at, at eye level, m. */
export const NEAR_DISTANCE = 2.6;
/** Nearly level at eye level, and about 75 degrees down at bird's-eye. */
export const PITCH_NEAR = 5 * DEG;
export const PITCH_FAR = 75 * DEG;
/** How far a drag may tilt the camera from the pitch its zoom gives, either way. */
export const TILT_LIMIT = 24 * DEG;
/** The pitch never leaves this range, whatever the zoom and the tilt. */
export const PITCH_MIN = 1 * DEG;
export const PITCH_MAX = 86 * DEG;
/**
 * Close in, the focus stays inside the Home, this far off its walls: far enough that a camera brought in toward it (which keeps
 * at least 0.3 m from it) is still `CAMERA_INSET` inside the walls.
 */
export const FOCUS_INSET = 0.5;
/** Above the roof's band the camera may stand anywhere; below it, it stays this far inside the outside walls. */
export const CAMERA_INSET = 0.18;
/** The default view: from the south-west, a little more than half way out, so the whole Home shows at a three-quarter angle. */
export const HOME_YAW = -32 * DEG;
export const HOME_ZOOM = 0.8;

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (edge0: number, edge1: number, x: number) => {
	const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
	return t * t * (3 - 2 * t);
};

/** The pitch a zoom gives, before any tilt: level for a while near eye level, then rising to bird's-eye as the camera pulls out. */
export function pitchAt(zoom: number): number {
	return lerp(PITCH_NEAR, PITCH_FAR, clamp(zoom, 0, 1) ** 1.6);
}

/** The camera's distance from what it looks at: `NEAR_DISTANCE` at eye level and `far` at bird's-eye, growing by the same ratio for each step of zoom. */
export function distanceAt(zoom: number, far: number): number {
	return NEAR_DISTANCE * Math.pow(Math.max(far, NEAR_DISTANCE) / NEAR_DISTANCE, clamp(zoom, 0, 1));
}

/**
 * How high the point the camera looks at is, m. At eye level it is just below the eyes, so the camera looks nearly level across
 * the room; it sinks to the floor as the camera pulls out, so the overview looks at the floor plan.
 */
export function lookHeightAt(zoom: number): number {
	const atEye = EYE_HEIGHT - NEAR_DISTANCE * Math.sin(PITCH_NEAR);
	return atEye * (1 - smoothstep(0, 0.45, clamp(zoom, 0, 1)));
}

/** The distance at bird's-eye at which the whole footprint, with a margin round it, fits the view: `fov` is the vertical field of view, radians. */
export function farDistance(bounds: CameraBounds, fov: number, aspect: number): number {
	const radius = Math.hypot(bounds.width, bounds.depth) / 2 + 1.6;
	const half = Math.min(fov / 2, Math.atan(Math.tan(fov / 2) * Math.max(aspect, 0.2)));
	return Math.max(NEAR_DISTANCE * 2, radius / Math.sin(half));
}

/** The default view of a Home: its middle, from the south-west, far enough out to see all of it. */
export function homeView(bounds: CameraBounds): CameraState {
	return { x: bounds.width / 2, z: bounds.depth / 2, yaw: HOME_YAW, zoom: HOME_ZOOM, tilt: 0 };
}

/**
 * Keeps a focus point where it belongs. Close in, it stays inside the Home, off the walls; pulled out, it may go a few metres past
 * them, so the visitor can look at a corner of the house from outside. The two blend over the middle of the zoom.
 */
export function clampFocus(x: number, z: number, zoom: number, bounds: CameraBounds): { x: number; z: number } {
	// Up to half way out the camera can still be below the roof, where it must stay inside, so the focus does too.
	const margin = lerp(-FOCUS_INSET, 3, smoothstep(0.5, 0.8, zoom));
	return { x: clamp(x, -margin, bounds.width + margin), z: clamp(z, -margin, bounds.depth + margin) };
}

/** The tilt a drag may add at this zoom: within `TILT_LIMIT`, and never past the pitch's own limits. */
export function clampTilt(tilt: number, zoom: number): number {
	const base = pitchAt(zoom);
	return clamp(tilt, Math.max(-TILT_LIMIT, PITCH_MIN - base), Math.min(TILT_LIMIT, PITCH_MAX - base));
}

/** Zoom kept in 0 to 1. */
export const clampZoom = (zoom: number) => clamp(zoom, 0, 1);

/**
 * How far along the ray from (x, z) by (dx, dz) a point stays inside the rectangle [lo, hiX] by [lo, hiZ]: 1 when the whole ray
 * does, less when it leaves, 0 when it starts outside.
 */
function insideFraction(x: number, z: number, dx: number, dz: number, lo: number, hiX: number, hiZ: number): number {
	if (x < lo || z < lo || x > hiX || z > hiZ) return 0;
	let s = 1;
	if (dx > 1e-9) s = Math.min(s, (hiX - x) / dx);
	if (dx < -1e-9) s = Math.min(s, (lo - x) / dx);
	if (dz > 1e-9) s = Math.min(s, (hiZ - z) / dz);
	if (dz < -1e-9) s = Math.min(s, (lo - z) / dz);
	return clamp(s, 0, 1);
}

/**
 * The camera for a state. The camera orbits the target (the focus, raised by `lookHeightAt`) at the zoom's distance and pitch.
 * Below the roof it is kept inside the Home: it slides in along its line of sight until it is `CAMERA_INSET` inside the outside
 * walls, so it never sees a wall from inside its thickness. The rule fades out over a band above the walls' tops, so the camera
 * never jumps as it rises out of the Home.
 */
export function pose(state: CameraState, bounds: CameraBounds, far: number): CameraPose {
	const zoom = clamp(state.zoom, 0, 1);
	const pitch = clamp(pitchAt(zoom) + state.tilt, PITCH_MIN, PITCH_MAX);
	const full = distanceAt(zoom, far);
	const ty = lookHeightAt(zoom);
	const back = [Math.cos(pitch) * Math.sin(state.yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(state.yaw)];
	const freeY = ty + full * back[1];
	const inside = 1 - smoothstep(bounds.ceiling + 0.2, bounds.ceiling + 1.6, freeY);
	let distance = full;
	let kept = 0;
	if (inside > 0) {
		const s = insideFraction(state.x, state.z, full * back[0], full * back[2], CAMERA_INSET, bounds.width - CAMERA_INSET, bounds.depth - CAMERA_INSET);
		// A focus outside the footprint cannot keep the camera inside it along this line, so the rule only applies from inside.
		if (s > 0) {
			const within = Math.max(s * full, 0.3);
			distance = lerp(full, Math.min(full, within), inside);
			kept = inside;
		}
	}
	// A camera brought in keeps its height (eyes stay at 1.6 m) and its pitch: the point it looks at rises by what the slide took off.
	const lifted = ty + (full - distance) * back[1];
	return {
		position: [state.x + distance * back[0], lifted + distance * back[1], state.z + distance * back[2]],
		target: [state.x, lifted, state.z],
		pitch,
		distance,
		inside: kept
	};
}

/**
 * A camera that `?camera=x,z,heading,zoom,tilt` in the address asks for, for QA and for screenshots: the focus in metres, the way the
 * camera looks in degrees clockwise from north (as the page's `data-yaw` reports it), the zoom from 0 to 1 and the tilt in degrees.
 * Missing or unreadable parts are left out; null when there is no such parameter.
 */
export function cameraFromSearch(search: string): Partial<CameraState> | null {
	const asked = new URLSearchParams(search).get('camera');
	if (!asked) return null;
	const [x, z, heading, zoom, tilt] = asked.split(',').map((part) => (part.trim() === '' ? NaN : Number(part)));
	const state: Partial<CameraState> = {};
	if (Number.isFinite(x)) state.x = x;
	if (Number.isFinite(z)) state.z = z;
	if (Number.isFinite(heading)) state.yaw = wrapAngle(-heading * DEG);
	if (Number.isFinite(zoom)) state.zoom = clampZoom(zoom);
	if (Number.isFinite(tilt)) state.tilt = tilt * DEG;
	return Object.keys(state).length ? state : null;
}

/** An angle brought into (-π, π]. */
export function wrapAngle(angle: number): number {
	const turn = Math.PI * 2;
	let a = (angle + Math.PI) % turn;
	if (a <= 0) a += turn;
	return a - Math.PI;
}

/**
 * One step of a critically damped spring from `x` (moving at `v`) toward `goal`, at stiffness `omega` (1/s), over `dt` seconds,
 * solved exactly so a long frame is as stable as a short one. A step that would cross the goal stops on it instead: the camera
 * never overshoots. Returns the new position and velocity.
 */
export function spring(x: number, v: number, goal: number, omega: number, dt: number): [number, number] {
	if (!(dt > 0)) return [x, v];
	const y = x - goal;
	const c = v + omega * y;
	const e = Math.exp(-omega * dt);
	let nx = goal + (y + c * dt) * e;
	let nv = (v - omega * c * dt) * e;
	if (y !== 0 && Math.sign(nx - goal) !== Math.sign(y)) {
		nx = goal;
		nv = 0;
	}
	if (Math.abs(nx - goal) < 1e-5 && Math.abs(nv) < 1e-4) {
		nx = goal;
		nv = 0;
	}
	return [nx, nv];
}

/** How stiff each channel's spring is, 1/s: higher settles sooner. About a quarter of a second to settle, as The Sims feels. */
export const STIFFNESS = { focus: 11, yaw: 12, zoom: 10, tilt: 12 } as const;

export interface CameraMotion {
	x: number;
	z: number;
	yaw: number;
	zoom: number;
	tilt: number;
}

export const still = (): CameraMotion => ({ x: 0, z: 0, yaw: 0, zoom: 0, tilt: 0 });

/**
 * Moves `state` (with its velocities `motion`) one step toward `goal`, in place. With `instant` (reduced motion) it jumps there.
 * The yaw takes the short way round. Returns true while anything is still moving.
 */
export function stepCamera(state: CameraState, motion: CameraMotion, goal: CameraState, dt: number, instant: boolean): boolean {
	if (instant) {
		Object.assign(state, goal);
		Object.assign(motion, still());
		return false;
	}
	// The goal's yaw is taken to the turn nearest the current one, so a spring never goes the long way round.
	const yawGoal = state.yaw + wrapAngle(goal.yaw - state.yaw);
	[state.x, motion.x] = spring(state.x, motion.x, goal.x, STIFFNESS.focus, dt);
	[state.z, motion.z] = spring(state.z, motion.z, goal.z, STIFFNESS.focus, dt);
	[state.yaw, motion.yaw] = spring(state.yaw, motion.yaw, yawGoal, STIFFNESS.yaw, dt);
	[state.zoom, motion.zoom] = spring(state.zoom, motion.zoom, goal.zoom, STIFFNESS.zoom, dt);
	[state.tilt, motion.tilt] = spring(state.tilt, motion.tilt, goal.tilt, STIFFNESS.tilt, dt);
	return state.x !== goal.x || state.z !== goal.z || state.yaw !== yawGoal || state.zoom !== goal.zoom || state.tilt !== goal.tilt;
}

/**
 * The floor distance one screen pixel covers at the target, m, for panning: the view's height at the target's distance over the
 * screen's height, and more along the line of sight, where the floor is foreshortened (`along`).
 */
export function panScale(distance: number, fov: number, viewHeight: number, pitch: number): { across: number; along: number } {
	const across = (2 * distance * Math.tan(fov / 2)) / Math.max(1, viewHeight);
	return { across, along: across / Math.max(Math.sin(pitch), 0.35) };
}

/**
 * Moves a focus by a step in the camera's own frame: `right` metres to the camera's right and `forward` metres away from it,
 * along the floor. Returns the new focus (not yet clamped).
 */
export function panBy(x: number, z: number, yaw: number, right: number, forward: number): { x: number; z: number } {
	// Forward is away from the camera: the camera sits at +(sin yaw, cos yaw) from the focus, so forward is the opposite.
	const fx = -Math.sin(yaw);
	const fz = -Math.cos(yaw);
	// Right of the view is forward turned a quarter clockwise seen from above.
	const rx = -fz;
	const rz = fx;
	return { x: x + right * rx + forward * fx, z: z + right * rz + forward * fz };
}
