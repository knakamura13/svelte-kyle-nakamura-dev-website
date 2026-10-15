import type { PerspectiveCamera, Scene } from 'three';
import type { LabelLayer } from './labels';

/** What a scene gets from the Stage that hosts it. */
export interface SceneHost {
	/** HTML labels that follow points in the scene. */
	labels: LabelLayer;
	/** True while the visitor prefers reduced motion. */
	reducedMotion: () => boolean;
	/** True while the Stage is narrow (a phone), so a scene can label less and frame tighter. */
	compact: () => boolean;
	/** Asks for one more frame, for a scene whose picture changed without a param changing (a hover marker, a readout that just arrived). */
	invalidate: () => void;
	/** Where the Stage is on the page right now, for a scene that works out where a pointer outside it (a drag from the Dock) would land inside it. */
	rect: () => DOMRect;
}

export type PointerPhase = 'down' | 'move' | 'up' | 'leave';

/** A scene that wants the pointer and the keys for itself (hover readouts, pinning, dragging things) implements this. */
export interface SceneInput {
	/**
	 * Every pointer event over the Stage, with its position in normalized device coordinates (x and y from -1 to 1,
	 * y up). Return true from a 'down' to claim the gesture: until its 'up' the orbit rig does not see that pointer.
	 * An unclaimed gesture is still reported ('down', every 'move' and its 'up') so a scene can tell a tap or a hold
	 * from a drag while the rig orbits; hover is 'move' with no button; 'leave' arrives when the pointer leaves the Stage.
	 */
	pointer(phase: PointerPhase, event: PointerEvent, ndc: { x: number; y: number }): boolean;
	/** Keys while the Stage has focus, key presses and releases alike (`event.type`). Return true to use a press; the rig then ignores it. */
	key?(event: KeyboardEvent): boolean;
	/** The touch-action the canvas should have right now: 'pan-y' lets a vertical swipe scroll the page, 'none' keeps a drag for the scene. */
	touchAction?(): 'pan-y' | 'none';
}

/** Where the camera starts and how far it may be pushed. */
export interface RigSetup {
	/** Radians around the vertical axis, 0 looking down -z. */
	yaw: number;
	/** Radians above the horizon. */
	pitch: number;
	target: [number, number, number];
	/** World units the default framing has to fit, whatever the Stage's aspect ratio. */
	fit: { width: number; height: number };
	fov: number;
	pitchRange?: [number, number];
	zoomRange?: [number, number];
}

export interface SceneInstance {
	scene: Scene;
	camera: PerspectiveCamera;
	rig: RigSetup;
	/**
	 * Advances the simulation by `dt` seconds and poses everything for the current params. Called once
	 * more whenever a param changes, with a small `dt`. Returns true while the scene keeps moving, so the
	 * Stage knows whether it needs another frame.
	 */
	update(dt: number): boolean;
	/** The framing to hold right now, for scenes that pull back as their params change. */
	fit?(): { width: number; height: number };
	/** The point the camera orbits right now, for scenes that follow something. */
	focus?(): [number, number, number];
	/** Takes over the pointer and keys where the scene needs them; absent, the orbit rig has them all. */
	input?: SceneInput;
	/**
	 * The camera framing to hold, for a scene that re-frames itself (another plan, a top-down view). The Stage
	 * snaps the camera to a framing when the object returned is not the one it last applied, so return the same
	 * object until the framing changes.
	 */
	framing?(): RigSetup;
	dispose(): void;
}

/** Builds a scene that reads `params` (written by the Dock) and writes `readout` (read by the Dock). */
export type SceneFactory<P, R> = (host: SceneHost, params: P, readout: R) => SceneInstance;

/**
 * Every scene an Experiment can host, by the key its chapters ask for. Each factory has its own params
 * and readout, which the controller only passes through, so they are `never` here.
 */
export type SceneRegistry = Record<string, SceneFactory<never, never>>;
