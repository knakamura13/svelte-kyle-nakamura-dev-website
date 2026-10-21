import { MathUtils, type PerspectiveCamera } from 'three';
import {
	clampFocus,
	clampTilt,
	clampZoom,
	farDistance,
	homeView,
	panBy,
	panScale,
	pose,
	still,
	stepCamera,
	type CameraBounds,
	type CameraMotion,
	type CameraPose,
	type CameraState
} from './sims';

/** What the camera needs from the Stage: the motion preference, the view's size, and where a point on the screen meets the floor. */
export interface CameraHost {
	reducedMotion(): boolean;
	/** The view's size in CSS pixels. */
	size(): { width: number; height: number };
	/** Where a point on the screen (normalized device coordinates, y up) meets the floor of the Home, or null. */
	floorAt(ndc: { x: number; y: number }): { x: number; z: number } | null;
}

/** The parts of a pointer event the camera reads, so tests can hand it plain objects. */
export type CameraPointer = Pick<PointerEvent, 'pointerId' | 'pointerType' | 'button' | 'altKey' | 'clientX' | 'clientY'>;
export type CameraWheel = Pick<WheelEvent, 'deltaY' | 'deltaMode' | 'ctrlKey' | 'metaKey'>;
export type CameraKey = Pick<KeyboardEvent, 'key' | 'type' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

/** The vertical field of view, degrees. */
export const FOV = 45;
/** Radians a pixel of right-drag turns the camera, and tilts it. */
const TURN_PER_PX = 0.0055;
const TILT_PER_PX = 0.0042;
/** Zoom per pixel of wheel, for a mouse wheel and for a trackpad pinch (which arrives as a wheel with Ctrl held, in small steps). */
const ZOOM_PER_PX = 0.0011;
const PINCH_ZOOM_PER_PX = 0.009;
/** Zoom per press of + or -, and how fast Q and E turn, radians a second. */
const ZOOM_STEP = 0.1;
const TURN_SPEED = 1.7;
/** A key pan's speed is this share of the camera's distance per second, within these limits, m/s. */
const PAN_SPEED = 0.6;
const PAN_SPEED_RANGE: [number, number] = [1.4, 14];
/** A tap of a pan key moves at least this long's worth. */
const NUDGE = 0.12;
/** A pinch's spread change, as a ratio, per unit of zoom. */
const PINCH_RATIO = 3;

type Hold = 'forward' | 'back' | 'left' | 'right' | 'turn-left' | 'turn-right' | 'zoom-in' | 'zoom-out';

const KEYS: Record<string, Hold> = {
	w: 'forward',
	arrowup: 'forward',
	s: 'back',
	arrowdown: 'back',
	a: 'left',
	arrowleft: 'left',
	d: 'right',
	arrowright: 'right',
	q: 'turn-left',
	e: 'turn-right'
};

interface Drag {
	kind: 'turn' | 'pan';
	x: number;
	y: number;
}

/**
 * The Sims camera, driven by the pointer, the wheel, the keys and fingers. It keeps a goal that every input moves, and eases the
 * camera to it on critically damped springs (or jumps there, for reduced motion). Left clicks and drags are not its: they belong
 * to the tools. The camera takes a right drag (turn and tilt), Alt with a left drag (the same), a middle drag (pan), the wheel
 * (zoom), a double click on the floor (fly there), WASD or the arrows (pan), Q and E (turn), + and - (zoom) and Home (the default
 * view); on a touch screen one finger pans, and two pinch to zoom and twist to turn.
 */
export class SimsCamera {
	readonly state: CameraState;
	readonly goal: CameraState;
	private readonly motion: CameraMotion = still();
	private bounds: CameraBounds;
	private far = 20;
	private aspect = 1.6;
	private current: CameraPose;
	private readonly drags = new Map<number, Drag>();
	private readonly touches = new Map<number, { x: number; y: number }>();
	private pinch: { spread: number; angle: number; zoom: number; yaw: number } | null = null;
	private readonly held = new Set<Hold>();
	/** True once the visitor has moved the camera, so a scene can stop an opening drift. */
	touched = false;

	constructor(
		private readonly camera: PerspectiveCamera,
		private readonly host: CameraHost,
		bounds: CameraBounds
	) {
		this.bounds = { ...bounds };
		this.goal = homeView(bounds);
		this.state = { ...this.goal };
		this.camera.fov = FOV;
		this.measure();
		this.current = pose(this.state, this.bounds, this.far);
		this.apply();
	}

	/** A new Home: the camera jumps to its default view, because the old Home is gone. */
	setBounds(bounds: CameraBounds) {
		this.bounds = { ...bounds };
		this.measure();
		Object.assign(this.goal, homeView(bounds));
		Object.assign(this.state, this.goal);
		Object.assign(this.motion, still());
		this.drags.clear();
		this.pinch = null;
		this.apply();
	}

	setAspect(aspect: number) {
		this.aspect = aspect;
		this.camera.aspect = aspect;
		this.measure();
		this.apply();
	}

	private measure() {
		this.far = farDistance(this.bounds, MathUtils.degToRad(FOV), this.aspect);
	}

	/** The focus the camera eases toward, m, and the pose it is in now. */
	get focus() {
		return { x: this.state.x, z: this.state.z };
	}

	get pose(): CameraPose {
		return this.current;
	}

	/**
	 * Which way the camera looks, degrees clockwise from north as seen from above (0 looks north, 90 east), for the page's data. The
	 * camera sits at (sin yaw, cos yaw) from its focus and looks the other way, so this is minus the yaw.
	 */
	get yawDegrees() {
		return Math.round(MathUtils.radToDeg(MathUtils.euclideanModulo(-this.goal.yaw, Math.PI * 2))) % 360;
	}

	get pitchDegrees() {
		return Math.round(MathUtils.radToDeg(this.current.pitch));
	}

	get dragging() {
		return this.drags.size > 0 || this.pinch !== null;
	}

	/** Back to the Home's default view. */
	reset() {
		Object.assign(this.goal, homeView(this.bounds));
		this.touched = true;
	}

	/** Puts the camera at a state at once, goal and all, within the usual limits: a link's `?camera=` (`cameraFromSearch`). */
	jumpTo(state: Partial<CameraState>) {
		Object.assign(this.goal, state);
		this.goal.zoom = clampZoom(this.goal.zoom);
		this.goal.tilt = clampTilt(this.goal.tilt, this.goal.zoom);
		this.setFocus(this.goal.x, this.goal.z);
		Object.assign(this.state, this.goal);
		Object.assign(this.motion, still());
		this.apply();
	}

	/**
	 * Takes a pointer for the camera: a right or middle button, Alt with the left, or a finger the tools did not take. The page has
	 * already offered a left press to the tools. Returns true when the camera took it.
	 */
	pointerDown(event: CameraPointer): boolean {
		if (event.pointerType === 'touch') {
			this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
			this.touched = true;
			if (this.touches.size === 2) {
				// A second finger turns the gesture into a pinch and a twist; the first finger's pan ends.
				this.drags.clear();
				const [a, b] = [...this.touches.values()];
				this.pinch = { spread: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), zoom: this.goal.zoom, yaw: this.goal.yaw };
			} else if (this.touches.size === 1) this.drags.set(event.pointerId, { kind: 'pan', x: event.clientX, y: event.clientY });
			return true;
		}
		const kind = event.button === 2 || (event.button === 0 && event.altKey) ? 'turn' : event.button === 1 ? 'pan' : null;
		if (!kind) return false;
		this.drags.set(event.pointerId, { kind, x: event.clientX, y: event.clientY });
		this.touched = true;
		return true;
	}

	/** Returns true when the goal moved. */
	pointerMove(event: CameraPointer): boolean {
		if (event.pointerType === 'touch' && this.touches.has(event.pointerId)) {
			this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (this.pinch && this.touches.size >= 2) {
				const [a, b] = [...this.touches.values()];
				const spread = Math.hypot(a.x - b.x, a.y - b.y);
				const angle = Math.atan2(b.y - a.y, b.x - a.x);
				if (this.pinch.spread > 1) this.setZoom(this.pinch.zoom - Math.log(spread / this.pinch.spread) / Math.log(PINCH_RATIO));
				this.goal.yaw = this.pinch.yaw - (angle - this.pinch.angle);
				return true;
			}
		}
		const drag = this.drags.get(event.pointerId);
		if (!drag) return false;
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		drag.x = event.clientX;
		drag.y = event.clientY;
		if (drag.kind === 'turn') {
			this.goal.yaw -= dx * TURN_PER_PX;
			this.goal.tilt = clampTilt(this.goal.tilt + dy * TILT_PER_PX, this.goal.zoom);
		} else {
			const { height } = this.host.size();
			const scale = panScale(this.current.distance, MathUtils.degToRad(FOV), height, this.current.pitch);
			this.moveFocus(-dx * scale.across, dy * scale.along);
		}
		return true;
	}

	pointerUp(event: Pick<PointerEvent, 'pointerId' | 'pointerType' | 'clientX' | 'clientY'>) {
		this.drags.delete(event.pointerId);
		if (!this.touches.delete(event.pointerId)) return;
		if (this.touches.size < 2) this.pinch = null;
		// The finger left on the screen pans again from where it is.
		if (this.touches.size === 1) {
			const [[id, at]] = [...this.touches.entries()];
			this.drags.set(id, { kind: 'pan', x: at.x, y: at.y });
		}
	}

	/** Lets go of every pointer, as when the Stage loses them all at once. */
	release() {
		this.drags.clear();
		this.touches.clear();
		this.pinch = null;
	}

	/** The wheel zooms; a trackpad pinch arrives as a wheel with Ctrl held, in finer steps. Returns true when it was used. */
	wheel(event: CameraWheel): boolean {
		const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
		const pixels = event.deltaY * unit;
		if (!pixels) return false;
		this.setZoom(this.goal.zoom + pixels * (event.ctrlKey || event.metaKey ? PINCH_ZOOM_PER_PX : ZOOM_PER_PX));
		this.touched = true;
		return true;
	}

	/** A double click: the focus flies to the floor under the pointer. Returns true when the pointer was over the floor. */
	flyTo(ndc: { x: number; y: number }): boolean {
		const point = this.host.floorAt(ndc);
		if (!point) return false;
		this.setFocus(point.x, point.z);
		this.touched = true;
		return true;
	}

	/** Key presses and releases. Returns true when the key was the camera's. */
	key(event: CameraKey): boolean {
		if (event.altKey || event.ctrlKey || event.metaKey) return false;
		const down = event.type === 'keydown';
		const name = event.key.toLowerCase();
		const hold = KEYS[name];
		if (hold) {
			if (down) {
				// A tap moves a little at once, so a single press does something even between frames.
				if (!this.held.has(hold)) this.drive(hold, NUDGE);
				this.held.add(hold);
			} else this.held.delete(hold);
			this.touched = true;
			return true;
		}
		if (!down) return name === '+' || name === '=' || name === '-' || name === '_' || name === 'home';
		switch (name) {
			case '+':
			case '=':
				this.setZoom(this.goal.zoom - ZOOM_STEP);
				break;
			case '-':
			case '_':
				this.setZoom(this.goal.zoom + ZOOM_STEP);
				break;
			case 'home':
				this.reset();
				break;
			default:
				return false;
		}
		this.touched = true;
		return true;
	}

	/** Forgets keys that are held, as when the page loses focus and their releases will never come. */
	releaseKeys() {
		this.held.clear();
	}

	private drive(hold: Hold, seconds: number) {
		const speed = Math.min(PAN_SPEED_RANGE[1], Math.max(PAN_SPEED_RANGE[0], PAN_SPEED * this.current.distance)) * seconds;
		switch (hold) {
			case 'forward':
				return this.moveFocus(0, speed);
			case 'back':
				return this.moveFocus(0, -speed);
			case 'left':
				return this.moveFocus(-speed, 0);
			case 'right':
				return this.moveFocus(speed, 0);
			case 'turn-left':
				this.goal.yaw += TURN_SPEED * seconds;
				return;
			case 'turn-right':
				this.goal.yaw -= TURN_SPEED * seconds;
				return;
			default:
				return;
		}
	}

	private moveFocus(right: number, forward: number) {
		const moved = panBy(this.goal.x, this.goal.z, this.goal.yaw, right, forward);
		this.setFocus(moved.x, moved.z);
	}

	private setFocus(x: number, z: number) {
		const kept = clampFocus(x, z, this.goal.zoom, this.bounds);
		this.goal.x = kept.x;
		this.goal.z = kept.z;
	}

	setZoom(zoom: number) {
		this.goal.zoom = clampZoom(zoom);
		this.goal.tilt = clampTilt(this.goal.tilt, this.goal.zoom);
		// Pulling in brings the focus inside the Home, which a far view let it leave.
		this.setFocus(this.goal.x, this.goal.z);
	}

	/** Once a frame: held keys move the goal, the springs move the camera toward it. Returns true while the camera is moving. */
	update(dt: number): boolean {
		for (const hold of this.held) this.drive(hold, dt);
		const moving = stepCamera(this.state, this.motion, this.goal, dt, this.host.reducedMotion());
		this.apply();
		return moving || this.held.size > 0;
	}

	private apply() {
		this.current = pose(this.state, this.bounds, this.far);
		const [px, py, pz] = this.current.position;
		const [tx, ty, tz] = this.current.target;
		this.camera.position.set(px, py, pz);
		this.camera.lookAt(tx, ty, tz);
		// Close in, things are near the lens; far out, depth precision matters more than the last few centimetres.
		this.camera.near = Math.min(0.5, Math.max(0.04, this.current.distance * 0.015));
		this.camera.far = Math.max(400, this.far * 6);
		this.camera.updateProjectionMatrix();
		this.camera.updateMatrixWorld();
	}
}
