import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import type { RigSetup } from './types';

const { clamp, degToRad } = MathUtils;

const KEY_YAW = 0.14;
const KEY_PITCH = 0.09;
const KEY_ZOOM = 1.18;

/**
 * Orbits a camera around a target. Written for this page instead of using OrbitControls because the
 * Stage sits in the middle of a scrolling article: a vertical swipe on a phone has to scroll the page
 * (the canvas declares `touch-action: pan-y`), the wheel must scroll too, and the keyboard needs to
 * orbit as well.
 */
export class OrbitRig {
	private goalYaw: number;
	private goalPitch: number;
	private goalZoom = 1;
	private yaw: number;
	private pitch: number;
	private zoom = 1;
	private distance = 0;
	private fitDistance = 10;
	private aspect = 1;
	private fit: { width: number; height: number };
	private driftClock = 0;
	private touched = false;
	private readonly target: Vector3;
	private readonly tanHalfFov: number;
	private readonly pointers = new Map<number, { x: number; y: number }>();
	private pinchSpread = 0;
	private pinchZoom = 1;

	/** `motionAllowed` is asked every frame: idle drift and easing follow the visitor's preference. */
	constructor(
		private readonly camera: PerspectiveCamera,
		private readonly setup: RigSetup,
		private readonly motionAllowed: () => boolean
	) {
		this.yaw = this.goalYaw = setup.yaw;
		this.pitch = this.goalPitch = setup.pitch;
		this.fit = { ...setup.fit };
		this.target = new Vector3(...setup.target);
		this.tanHalfFov = Math.tan(degToRad(setup.fov) / 2);
		camera.fov = setup.fov;
	}

	get yawDegrees() {
		return Math.round((this.goalYaw * 180) / Math.PI);
	}

	get pitchDegrees() {
		return Math.round((this.goalPitch * 180) / Math.PI);
	}

	setAspect(aspect: number) {
		const first = this.distance === 0;
		this.aspect = aspect;
		this.camera.aspect = aspect;
		this.camera.updateProjectionMatrix();
		this.measure();
		if (first) this.distance = this.fitDistance;
		this.place();
	}

	setFit(fit: { width: number; height: number }) {
		if (fit.width === this.fit.width && fit.height === this.fit.height) return;
		this.fit = fit;
		this.measure();
	}

	setTarget(x: number, y: number, z: number) {
		this.target.set(x, y, z);
	}

	private measure() {
		const byHeight = this.fit.height / 2 / this.tanHalfFov;
		const byWidth = this.fit.width / 2 / (this.tanHalfFov * this.aspect);
		this.fitDistance = Math.max(byHeight, byWidth);
	}

	/** Eases toward the goals. Returns true while the camera is still moving. */
	update(dt: number, sceneMoving: boolean) {
		const easy = this.motionAllowed();
		const drifting = easy && sceneMoving && !this.touched;
		if (drifting) this.driftClock += dt;
		const drift = Math.sin(this.driftClock * 0.5) * 0.11;
		const k = easy ? 1 - Math.exp(-dt * 10) : 1;
		const yawGoal = this.goalYaw + drift;
		const distanceGoal = this.fitDistance / this.zoom;
		const change =
			Math.abs(yawGoal - this.yaw) +
			Math.abs(this.goalPitch - this.pitch) +
			Math.abs(this.goalZoom - this.zoom) +
			Math.abs(distanceGoal - this.distance) * 0.05;
		this.yaw += (yawGoal - this.yaw) * k;
		this.pitch += (this.goalPitch - this.pitch) * k;
		this.zoom += (this.goalZoom - this.zoom) * k;
		this.distance += (this.fitDistance / this.zoom - this.distance) * k;
		this.place();
		return drifting || change > 1e-3;
	}

	private place() {
		const cosPitch = Math.cos(this.pitch);
		this.camera.position.set(
			this.target.x + this.distance * cosPitch * Math.sin(this.yaw),
			this.target.y + this.distance * Math.sin(this.pitch),
			this.target.z + this.distance * cosPitch * Math.cos(this.yaw)
		);
		this.camera.lookAt(this.target);
	}

	private get pitchRange() {
		return this.setup.pitchRange ?? [0.03, 1.35];
	}

	private get zoomRange() {
		return this.setup.zoomRange ?? [0.55, 2.6];
	}

	reset() {
		this.goalYaw = this.setup.yaw;
		this.goalPitch = this.setup.pitch;
		this.goalZoom = 1;
		this.touched = true;
	}

	pointerDown(event: PointerEvent) {
		this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		this.touched = true;
		if (this.pointers.size === 2) {
			this.pinchSpread = this.spread();
			this.pinchZoom = this.goalZoom;
		}
	}

	/** Returns true when the camera goals changed. */
	pointerMove(event: PointerEvent) {
		const last = this.pointers.get(event.pointerId);
		if (!last) return false;
		const dx = event.clientX - last.x;
		const dy = event.clientY - last.y;
		last.x = event.clientX;
		last.y = event.clientY;
		if (this.pointers.size >= 2) {
			if (this.pinchSpread > 0) this.setZoom((this.pinchZoom * this.spread()) / this.pinchSpread);
			return true;
		}
		this.goalYaw -= dx * 0.0065;
		this.goalPitch = clamp(this.goalPitch + dy * 0.0055, ...this.pitchRange);
		return true;
	}

	pointerUp(event: PointerEvent) {
		this.pointers.delete(event.pointerId);
	}

	get dragging() {
		return this.pointers.size > 0;
	}

	private spread() {
		const [a, b] = [...this.pointers.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	private setZoom(zoom: number) {
		this.goalZoom = clamp(zoom, ...this.zoomRange);
	}

	/** Zoom with Ctrl or Cmd held, which is also how a trackpad pinch arrives. Returns true if used. */
	wheel(event: WheelEvent) {
		if (!event.ctrlKey && !event.metaKey) return false;
		this.touched = true;
		this.setZoom(this.goalZoom * Math.exp(-event.deltaY * 0.01));
		return true;
	}

	/** Returns true when the key was ours. */
	key(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey) return false;
		switch (event.key) {
			case 'ArrowLeft':
				this.goalYaw -= KEY_YAW;
				break;
			case 'ArrowRight':
				this.goalYaw += KEY_YAW;
				break;
			case 'ArrowUp':
				this.goalPitch = clamp(this.goalPitch + KEY_PITCH, ...this.pitchRange);
				break;
			case 'ArrowDown':
				this.goalPitch = clamp(this.goalPitch - KEY_PITCH, ...this.pitchRange);
				break;
			case '+':
			case '=':
				this.setZoom(this.goalZoom * KEY_ZOOM);
				break;
			case '-':
			case '_':
				this.setZoom(this.goalZoom / KEY_ZOOM);
				break;
			case '0':
			case 'Home':
				this.reset();
				break;
			default:
				return false;
		}
		this.touched = true;
		return true;
	}
}
