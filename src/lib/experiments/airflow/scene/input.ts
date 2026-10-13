import type { PointerPhase, SceneInput } from '../../engine/types';
import type { HoverReading } from '../readouts';
import type { PointerMode } from '../state';
import type { Point3 } from './deviceMath';

/** How long a still press takes to become a hold, ms, and how far it may wander first, px. */
export const HOLD_MS = 380;
export const SLOP_PX = 7;
/** The keyboard cursor's step over the slice, m, and its step with Shift held. */
export const CURSOR_STEP = 0.25;
export const CURSOR_STEP_FAST = 1;
/** Two taps this close in time and place are a double click, which resets the camera and is not two probes: how close, ms and px (a finger needs more room). */
export const DOUBLE_MS = 350;
export const DOUBLE_PX = 12;
export const DOUBLE_TOUCH_PX = 30;

/** What the input needs from the scene and the page. Everything here is plain data and callbacks, so the input runs in Node. */
export interface InputHost {
	/** What a touch or a key does now. A mouse needs no mode. */
	mode(): PointerMode;
	/** Where the pointer's ray meets the slice plane inside the home, or null. */
	pick(at: { x: number; y: number }): Point3 | null;
	/** The home's footprint and the slice plane's height, m, for the keyboard cursor. */
	plane(): { width: number; depth: number; y: number };
	/** What the air is doing at a point of the slice, or null before the first reading. */
	read(point: Point3): HoverReading | null;
	/** Shows where the visitor is looking (the marker and the Dock's readout), or clears it. */
	hover(point: Point3 | null, reading: HoverReading | null): void;
	/** Pins a probe. Returns its id, or null when the home already holds the most it allows. */
	pin(point: Point3): string | null;
	/** Takes a probe back, as when a pin turns out to have been the first click of a double click. */
	unpin(id: string): void;
	/** Starts releasing smoke at a point, moves the source, or stops it (null). */
	emit(point: Point3 | null): void;
	now(): number;
}

interface Press {
	id: number;
	touch: boolean;
	/** Where it began on screen, px, and when. */
	x: number;
	y: number;
	at: number;
	/** Where it began on the slice, and whether that is air (smoke and probes need air). */
	point: Point3 | null;
	air: boolean;
	/** It wandered past the slop, so it is a drag, which the orbit rig takes. */
	dragged: boolean;
	/** The scene keeps this press for itself (touch in probe or emit mode), so the rig never sees it. */
	owned: boolean;
	/** Smoke is being released for this press. */
	emitting: boolean;
	/** The last point the press looked at. */
	last: Point3 | null;
}

/**
 * What the pointer and the keys do on the Stage. A mouse needs no mode: hovering reads the air under it, a click pins a
 * probe, a hold releases smoke, and a drag orbits. A finger and the keyboard use the mode toggle: in look mode they only
 * orbit and scroll, in probe mode a finger reads where it is and a lift pins there (the arrow keys move a cursor and Enter
 * pins it), and in emit mode a finger releases smoke where it is, following it (Enter toggles smoke at the keyboard
 * cursor). The press that becomes a hold is timed by `tick`, once a frame, so nothing here needs a timer.
 */
export class AirflowInput implements SceneInput {
	private press: Press | null = null;
	private cursor: { x: number; z: number } | null = null;
	private cursorEmitting = false;
	/** The probe the last tap pinned, and where and when. */
	private lastPin: { id: string; at: number; x: number; y: number } | null = null;

	constructor(private readonly host: InputHost) {}

	/** True while the Stage must keep drawing for the input: a press that may still become a hold, or smoke being released. */
	get busy() {
		const press = this.press;
		return this.cursorEmitting || (!!press && (press.emitting || (!press.owned && !press.dragged)));
	}

	touchAction(): 'pan-y' | 'none' {
		return this.host.mode() === 'look' ? 'pan-y' : 'none';
	}

	pointer(phase: PointerPhase, event: PointerEvent, ndc: { x: number; y: number }): boolean {
		const touch = event.pointerType !== 'mouse';
		if (phase === 'leave') {
			// The keyboard cursor stays where it is when the mouse leaves.
			if (!this.press && !this.cursor) this.show(null);
			return false;
		}
		if (phase === 'down') return this.down(event, ndc, touch);
		const press = this.press?.id === event.pointerId ? this.press : null;
		if (phase === 'move') {
			if (press) this.move(press, event, ndc);
			else if (!touch) this.show(this.host.pick(ndc));
			return false;
		}
		if (press) this.up(press, event);
		return false;
	}

	private down(event: PointerEvent, ndc: { x: number; y: number }, touch: boolean) {
		if (this.press) this.end(this.press);
		const mode = this.host.mode();
		// A finger in look mode only orbits and scrolls, and has no hover.
		if (touch && mode === 'look') return false;
		const point = this.host.pick(ndc);
		const owned = touch;
		const press: Press = { id: event.pointerId, touch, x: event.clientX, y: event.clientY, at: this.host.now(), point, air: !!point && !!this.host.read(point)?.inAir, dragged: false, owned, emitting: false, last: point };
		this.press = press;
		this.show(point);
		if (owned && mode === 'emit' && press.air) this.startSmoke(press);
		return owned;
	}

	private move(press: Press, event: PointerEvent, ndc: { x: number; y: number }) {
		const point = this.host.pick(ndc);
		if (press.owned) {
			// The finger reads where it is, and a finger releasing smoke drags the source along.
			press.last = point;
			this.show(point);
			if (press.emitting && point && this.host.read(point)?.inAir) this.host.emit(point);
			return;
		}
		if (!press.dragged && Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP_PX) press.dragged = true;
		// A mouse keeps reading under the pointer, even while the camera orbits, until smoke is coming from where it pressed.
		if (!press.emitting) this.show(point);
	}

	private up(press: Press, event: PointerEvent) {
		this.press = null;
		if (press.emitting) this.host.emit(null);
		else if (press.owned) {
			// A finger in probe mode pins where it lifted.
			if (this.host.mode() === 'probe' && press.last && this.host.read(press.last)?.inAir) this.tap(press.last, event.clientX, event.clientY, true);
		} else if (!press.dragged && press.air && press.point && this.host.now() - press.at < HOLD_MS) this.tap(press.point, press.x, press.y, false);
		if (press.touch) this.show(null);
	}

	/**
	 * Pins a probe at `point` for a tap that ended at screen (x, y). The second tap of a double click takes the first probe
	 * back instead and pins nothing: the camera resets on a double click, and that is all it was meant to do.
	 */
	private tap(point: Point3, x: number, y: number, touch: boolean) {
		const now = this.host.now();
		const last = this.lastPin;
		if (last && now - last.at < DOUBLE_MS && Math.hypot(x - last.x, y - last.y) < (touch ? DOUBLE_TOUCH_PX : DOUBLE_PX)) {
			this.host.unpin(last.id);
			this.lastPin = null;
			return;
		}
		const id = this.host.pin(point);
		this.lastPin = id ? { id, at: now, x, y } : null;
	}

	/** Drops a press without acting on it, as when a second finger arrives before the first lifts. */
	private end(press: Press) {
		this.press = null;
		if (press.emitting) this.host.emit(null);
	}

	private startSmoke(press: Press) {
		press.emitting = true;
		this.host.emit(press.point);
	}

	/** Once a frame: a still press that has lasted long enough becomes a hold, which releases smoke. Returns `busy`. */
	tick() {
		const press = this.press;
		if (press && !press.owned && !press.dragged && !press.emitting && this.host.now() - press.at >= HOLD_MS) {
			// Nothing to release smoke into on furniture or outside the home: let the press be a plain press.
			if (press.air) this.startSmoke(press);
			else press.dragged = true;
		}
		return this.busy;
	}

	key(event: KeyboardEvent): boolean {
		const mode = this.host.mode();
		if (mode === 'look' || event.altKey || event.ctrlKey || event.metaKey) return false;
		const down = event.type === 'keydown';
		switch (event.key) {
			case 'ArrowLeft':
			case 'ArrowRight':
			case 'ArrowUp':
			case 'ArrowDown': {
				if (!down) return true;
				const step = event.shiftKey ? CURSOR_STEP_FAST : CURSOR_STEP;
				// North is up the plan, so the up arrow is toward -z.
				this.moveCursor(event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
				return true;
			}
			case 'Enter':
			case ' ': {
				if (!down || event.repeat) return true;
				const point = this.moveCursor(0, 0);
				if (mode === 'probe') {
					if (this.host.read(point)?.inAir) this.host.pin(point);
				} else if (this.cursorEmitting) this.stopCursorSmoke();
				else if (this.host.read(point)?.inAir) {
					this.cursorEmitting = true;
					this.host.emit(point);
				}
				return true;
			}
			case 'Escape': {
				if (!this.cursor && !this.cursorEmitting) return false;
				if (down) this.reset();
				return true;
			}
			default:
				return false;
		}
	}

	/** Moves the keyboard cursor over the slice, starting from the middle of the home, and shows it. Returns where it is. */
	private moveCursor(dx: number, dz: number): Point3 {
		const { width, depth, y } = this.host.plane();
		const from = this.cursor ?? { x: width / 2, z: depth / 2 };
		this.cursor = { x: Math.min(width, Math.max(0, from.x + dx)), z: Math.min(depth, Math.max(0, from.z + dz)) };
		const point = { x: this.cursor.x, y, z: this.cursor.z };
		this.show(point);
		// Smoke follows the cursor.
		if (this.cursorEmitting && this.host.read(point)?.inAir) this.host.emit(point);
		return point;
	}

	private stopCursorSmoke() {
		this.cursorEmitting = false;
		this.host.emit(null);
	}

	private show(point: Point3 | null) {
		this.host.hover(point, point ? this.host.read(point) : null);
	}

	/** Forgets everything in progress: the mode changed, the home changed, or the Stage is going away. */
	reset() {
		if (this.press?.emitting) this.host.emit(null);
		this.press = null;
		if (this.cursorEmitting) this.stopCursorSmoke();
		this.cursor = null;
		this.show(null);
	}
}
