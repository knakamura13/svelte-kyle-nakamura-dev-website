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
	/** Height of the slice plane above the floor, m. */
	sliceHeight: number;
	topDown: boolean;
	/** Whether the little dots that follow the air are drawn. */
	tracers: boolean;
	mode: PointerMode;
	units: UnitSystem;
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

export const DEFAULT_VIEW: Omit<View, 'units'> = { layer: 'speed', sensitivity: 1, sliceHeight: 1.1, topDown: false, tracers: true, mode: 'look' };

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
