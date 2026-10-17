import { FAN_MARKS, PURIFIER_MARKS } from '../../devices/model';
import type { DeviceModel } from '../../devices/types';
import type { OpeningKind } from '../../homes/types';
import { LIMITS, type UnitSystem } from '../../state';
import { sliderRange } from '../../units';

/**
 * The HUD's one-press settings: how far a window or door opens, a fan's or purifier's speed, the outdoor air and the wind. Each
 * preset is a value the state already allows, so pressing one is the same as setting the fine control to it. Plain data, so Node
 * tests them against the limits.
 */

export interface Preset {
	id: string;
	label: string;
	/** The value it sets: travel 0 to 1 for an Opening, power 0 to 1 for a device, µg/m³ for the outdoor air, m/s for the wind. */
	value: number;
}

/**
 * A window's presets, as a share of its travel: what the fine control moves, from shut to as far as it goes. A window opens only
 * part of its frame at the end of its travel (a double-hung window half, a casement 80 %), so Wide is that limit, not the whole frame.
 */
export const WINDOW_PRESETS: readonly Preset[] = [
	{ id: 'closed', label: 'Closed', value: 0 },
	{ id: 'cracked', label: 'Cracked', value: 0.1 },
	{ id: 'half', label: 'Half', value: 0.5 },
	{ id: 'wide', label: 'Wide', value: 1 }
];

/** A swinging door is open or closed. */
export const DOOR_PRESETS: readonly Preset[] = [
	{ id: 'closed', label: 'Closed', value: 0 },
	{ id: 'open', label: 'Open', value: 1 }
];

/** A swinging door gets the door's two presets; a window or a sliding door, which open part of their frame, get the window's four and a fine control. */
export const isSwingDoor = (kind: OpeningKind) => kind === 'door';
export const openingPresets = (kind: OpeningKind) => (isSwingDoor(kind) ? DOOR_PRESETS : WINDOW_PRESETS);

/** A setting this close to a preset is that preset. */
const SAME = 0.005;

/** The preset a value is on, or null when it is between them. */
export function activePreset(presets: readonly Preset[], value: number): Preset | null {
	return presets.find((preset) => Math.abs(preset.value - value) < SAME) ?? null;
}

/** A fan's speeds: Off and the three its maker rates, at the marks the power control already has. */
export const FAN_PRESETS: readonly Preset[] = [
	{ id: 'off', label: 'Off', value: 0 },
	{ id: 'low', label: 'Low', value: FAN_MARKS.low },
	{ id: 'medium', label: 'Medium', value: FAN_MARKS.medium },
	{ id: 'high', label: 'High', value: FAN_MARKS.high }
];

/** A purifier's speeds: Off, and Sleep to High at their power marks. */
export const PURIFIER_PRESETS: readonly Preset[] = [
	{ id: 'off', label: 'Off', value: 0 },
	{ id: 'sleep', label: 'Sleep', value: PURIFIER_MARKS.sleep },
	{ id: 'low', label: 'Low', value: PURIFIER_MARKS.low },
	{ id: 'medium', label: 'Medium', value: PURIFIER_MARKS.medium },
	{ id: 'high', label: 'High', value: PURIFIER_MARKS.high }
];

export const powerPresets = (model: Pick<DeviceModel, 'kind'>) => (model.kind === 'air-purifier' ? PURIFIER_PRESETS : FAN_PRESETS);

/**
 * Outdoor air, as PM2.5 in µg/m³. Round values picked to sit inside the US EPA's PM2.5 AQI categories (2024 breakpoints): Clean is
 * clean air, Hazy the top of Moderate (9.1 to 35.4), Smoky inside Very Unhealthy (125.5 to 225.4) and Wildfire inside Hazardous
 * (225.5 and up). They are illustrations, not measurements of a named day.
 */
export const AIR_PRESETS: readonly Preset[] = [
	{ id: 'clean', label: 'Clean', value: 0 },
	{ id: 'hazy', label: 'Hazy', value: 35 },
	{ id: 'smoky', label: 'Smoky', value: 150 },
	{ id: 'wildfire', label: 'Wildfire', value: 350 }
];

/** The outdoor air preset a PM2.5 value is, or null between them. */
export const airPreset = (micrograms: number) => AIR_PRESETS.find((preset) => Math.abs(preset.value - micrograms) < 0.5) ?? null;

/**
 * Wind speeds, m/s at weather-report height (what `Conditions.windSpeed` holds), each inside its band of the Beaufort scale: calm, a
 * light breeze (about 1.6 to 3.3), a gentle breeze (3.4 to 5.4), a fresh breeze (8.0 to 10.7) and a strong breeze (10.8 to 13.8).
 */
export const WIND_PRESETS: readonly Preset[] = [
	{ id: 'calm', label: 'Calm', value: 0 },
	{ id: 'light', label: 'Light breeze', value: 2.5 },
	{ id: 'gentle', label: 'Gentle breeze', value: 4.5 },
	{ id: 'fresh', label: 'Fresh breeze', value: 9 },
	{ id: 'strong', label: 'Strong breeze', value: 12 }
];

export const windPreset = (metresPerSecond: number) => WIND_PRESETS.find((preset) => Math.abs(preset.value - metresPerSecond) < 0.01) ?? null;

export type StepKey = 'windSpeed' | 'outdoorTemp' | 'indoorTemp';

/**
 * One press of a stepper: the value in SI after moving one step of the control's slider in the visitor's units (a whole °F in
 * imperial, half a degree Celsius indoors), from where it shows now, held to the limits. The state keeps SI; a value between steps
 * (from a shared link) moves to the next step in the direction pressed.
 */
export function stepValue(key: StepKey, si: number, units: UnitSystem, direction: 1 | -1): number {
	const range = sliderRange(key, units);
	const shown = range.toDisplay(si);
	const steps = shown / range.step;
	// From between two steps, the first press lands on the step in the direction pressed; from a step, it moves one.
	const near = Math.round(steps);
	const from = Math.abs(steps - near) < 1e-6 ? near : direction > 0 ? Math.floor(steps) : Math.ceil(steps);
	const next = Math.min(range.max, Math.max(range.min, Number(((from + direction) * range.step).toFixed(range.digits))));
	const limits = LIMITS[key];
	return Math.min(limits.max, Math.max(limits.min, range.fromDisplay(next)));
}

/** Whether a stepper can go further that way. */
export function canStep(key: StepKey, si: number, units: UnitSystem, direction: 1 | -1): boolean {
	const range = sliderRange(key, units);
	const shown = range.toDisplay(si);
	return direction > 0 ? shown < range.max - 1e-9 : shown > range.min + 1e-9;
}
