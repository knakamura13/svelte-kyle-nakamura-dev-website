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
	dispose(): void;
}

/** Builds a scene that reads `params` (written by the Dock) and writes `readout` (read by the Dock). */
export type SceneFactory<P, R> = (host: SceneHost, params: P, readout: R) => SceneInstance;
