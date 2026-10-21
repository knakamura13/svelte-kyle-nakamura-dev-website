import type { PlanId } from './homes/types';

/**
 * What a visitor can change, as plain serializable data. `Setup` is what the share link carries; `View`, `Clock`
 * and the pins are the visitor's own and are not shared. The page keeps these in reactive state (`experience.svelte.ts`);
 * nothing here knows about Svelte, three.js or the solver, so it can be tested in Node.
 */

/** The four things the slice plane can show. */
export type LayerId = 'speed' | 'direction' | 'particulates' | 'temperature';

/** What a drag or a press on the Stage does. A mouse needs no mode (hover reads, a click pins, a hold emits, a drag orbits); touch and keyboard use this toggle. */
export type PointerMode = 'look' | 'probe' | 'emit';

/** What a click on the 3D world does, picked in the HUD's tool rail. Each tool also sets `View.mode`, which a finger and the keys follow. */
export type Tool = 'select' | 'build' | 'probe' | 'smoke';

/** Something in the Home the visitor can choose, by id: a door or window, a fan or purifier, or a Probe. */
export interface Target {
	kind: 'opening' | 'device' | 'probe';
	id: string;
}

/** What the HUD's overlay switcher colours the streaks by: nothing, or one field. */
export type OverlayId = 'off' | 'speed' | 'temperature' | 'smoke';

/** How the walls stand (the HUD's bottom bar): full height, cut away between the camera and the room it looks into, or down. */
export type WallMode = 'up' | 'cutaway' | 'down';

/** The graphics quality tier the Advanced panel asks for. `auto` lets the page pick one for the device. */
export type Quality = 'auto' | 'low' | 'medium' | 'high';

export type UnitSystem = 'imperial' | 'metric';

/** The weather outside and the starting state inside. */
export interface Conditions {
	/** Compass bearing the wind blows FROM, degrees: 0 north, 90 east, 180 south, 270 west. */
	windFrom: number;
	/** Wind speed as a weather report gives it (10 m up, open ground), m/s. The wind that reaches the home is `WIND_AT_EAVES` of it. 0 is calm. */
	windSpeed: number;
	/** Outdoor air temperature, °C. */
	outdoorTemp: number;
	/** Temperature the indoor air starts at, °C. Changing it resets the indoor air to that temperature. */
	indoorTemp: number;
	/** Outdoor PM2.5, µg/m³. 0 is clean air. */
	outdoorPm25: number;
}

export type DeviceKind = 'box-fan' | 'pedestal-fan' | 'window-fan' | 'air-purifier';

export interface DeviceState {
	id: string;
	/** A model id from the device catalog. */
	model: string;
	/** Where its base stands: x east and z south in metres, y the height of what it stands on (0 for the floor). */
	x: number;
	z: number;
	y: number;
	/** Turn about the vertical, degrees clockwise seen from above, 0 facing north. */
	yaw: number;
	/** Aim up (positive) or down (negative), degrees. */
	tilt: number;
	/** 0 to 1: the slider. Low, Medium and High are marks on it. */
	power: number;
	/** Height of a pedestal fan's head above its base, m. */
	height: number;
	/** A pedestal fan's sweep: whether it turns, the total angle, and seconds for a full sweep out and back. */
	oscillation: { on: boolean; sweep: number; period: number };
	/** A window fan: the id of the opening it sits in and whether it draws air in. */
	opening?: string;
	intake?: boolean;
}

/** Everything the share link carries. */
export interface Setup {
	plan: PlanId;
	/** Whether the plan's furniture is built in. */
	furniture: boolean;
	devices: DeviceState[];
	/** How far open each door and window is, 0 to 1 of its travel, by opening id. */
	openings: Record<string, number>;
	conditions: Conditions;
}

/** How the visitor is looking, not what is happening. */
export interface View {
	layer: LayerId;
	/** Multiplies the layer's color scale range: below 1 shows weaker flow brighter. */
	sensitivity: number;
	/** Height above the floor, m, at which the pointer reads the air, pins a probe and releases smoke: the slice the solver reads there. No plane is drawn. */
	sliceHeight: number;
	/** Whether the little dots that follow the air are drawn. */
	tracers: boolean;
	mode: PointerMode;
	units: UnitSystem;
	/** The HUD's overlay: Off, or the quantity the streaks are coloured by, with a faint haze of it through the rooms (scene/air). */
	overlay: OverlayId;
	/** The HUD's wall mode, for the cutaway walls to follow. */
	walls: WallMode;
	/** The HUD's graphics quality, for the lighting and post-processing to follow. */
	quality: Quality;
}

export interface Clock {
	paused: boolean;
	/** Simulated seconds per real second the page tries for: 1, 5 or 20. */
	speed: 1 | 5 | 20;
}

/** A pinned probe: a point on the slice plane at the height it was pinned. */
export interface Pin {
	id: string;
	x: number;
	y: number;
	z: number;
}

export const DEFAULT_CONDITIONS: Conditions = { windFrom: 270, windSpeed: 0, outdoorTemp: 10, indoorTemp: 21, outdoorPm25: 0 };

/**
 * Sensitivity starts at 0.5, not 1: QA with the visualization harness found that at 1 the speed scale (0 to 3 m/s) shows ordinary
 * room air nearly the same pale blue as still air, and that 0.5 (0 to 1.5 m/s) shows it better. Below 1 the scale covers less, so
 * weaker flow shows in stronger color.
 *
 * The overlay starts Off: the streaks show the air on their own (scene/air), and an overlay colours them by its quantity.
 */
export const DEFAULT_VIEW: Omit<View, 'units'> = { layer: 'speed', sensitivity: 0.5, sliceHeight: 1.1, tracers: true, mode: 'look', overlay: 'off', walls: 'cutaway', quality: 'auto' };

export const DEFAULT_CLOCK: Clock = { paused: false, speed: 1 };

/** Limits of every control, so sliders, the link decoder and the scenarios agree. */
export const LIMITS = {
	windSpeed: { min: 0, max: 15, step: 0.5 },
	outdoorTemp: { min: -30, max: 45, step: 1 },
	indoorTemp: { min: 10, max: 32, step: 0.5 },
	outdoorPm25: { min: 0, max: 500, step: 5 },
	sliceHeight: { min: 0.1, max: 2.3, step: 0.05 },
	sensitivity: { min: 0.25, max: 4, step: 0.05 },
	tilt: { min: -45, max: 60 },
	oscillationSweep: { min: 20, max: 120 },
	oscillationPeriod: { min: 4, max: 20 }
} as const;

/** The most devices at once (fans and air purifiers together), and pinned probes. */
export const MAX_DEVICES = 6;
export const MAX_PINS = 4;

/** An empty setup for a plan: closed up, no devices, calm weather. */
export function blankSetup(plan: PlanId): Setup {
	return { plan, furniture: true, devices: [], openings: {}, conditions: { ...DEFAULT_CONDITIONS } };
}
