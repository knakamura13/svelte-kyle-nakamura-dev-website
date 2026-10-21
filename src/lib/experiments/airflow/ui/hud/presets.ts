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

/** A category of the US Air Quality Index for PM2.5. */
export type AqiCategory = 'Good' | 'Moderate' | 'Unhealthy for Sensitive Groups' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous';

/**
 * The US Air Quality Index's categories for PM2.5: each covers 24-hour means up to and including `upTo` µg/m³ (concentrations are
 * truncated to one decimal first), and its AQI values. From Table 6, "Breakpoints for the AQI", of US EPA, "Technical Assistance
 * Document for the Reporting of Daily Air Quality – the Air Quality Index (AQI)", EPA-403/B-26-003, May 2026,
 * https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf. These are the breakpoints of
 * the 2024 revision, in force since 6 May 2024 (US EPA, "Final Updates to the Air Quality Index (AQI) for Particulate Matter",
 * February 2024, https://www.epa.gov/system/files/documents/2024-02/pm-naaqs-air-quality-index-fact-sheet.pdf). Hazardous has no
 * top: the AQI's 500 sits at 325.4 µg/m³, and higher values follow the same line and are still Hazardous (the document's
 * "What does it mean when the AQI values are above 500?").
 */
export const PM25_AQI: readonly { category: AqiCategory; aqi: readonly [number, number]; upTo: number }[] = [
	{ category: 'Good', aqi: [0, 50], upTo: 9.0 },
	{ category: 'Moderate', aqi: [51, 100], upTo: 35.4 },
	{ category: 'Unhealthy for Sensitive Groups', aqi: [101, 150], upTo: 55.4 },
	{ category: 'Unhealthy', aqi: [151, 200], upTo: 125.4 },
	{ category: 'Very Unhealthy', aqi: [201, 300], upTo: 225.4 },
	{ category: 'Hazardous', aqi: [301, 500], upTo: Infinity }
];

/** The AQI category of a 24-hour PM2.5 mean, µg/m³ (`PM25_AQI`). */
export function aqiCategory(micrograms: number): AqiCategory {
	const truncated = Math.floor(Math.max(0, micrograms) * 10 + 1e-9) / 10;
	return (PM25_AQI.find((band) => truncated <= band.upTo) ?? PM25_AQI[PM25_AQI.length - 1]).category;
}

/** An outdoor air preset: its PM2.5, µg/m³, and the AQI category that concentration is in. */
export interface AirPreset extends Preset {
	category: AqiCategory;
}

/**
 * Outdoor air, as PM2.5 in µg/m³: one round value in each of four AQI categories (`PM25_AQI`), on the control's 5 µg/m³ step. Clean
 * is air with no smoke in it (Good, up to 9.0), Hazy the top of Moderate (9.1 to 35.4), Smoky inside Very Unhealthy (125.5 to 225.4)
 * and Wildfire inside Hazardous (225.5 and up). They are illustrations, not measurements of a named day.
 */
export const AIR_PRESETS: readonly AirPreset[] = [
	{ id: 'clean', label: 'Clean', value: 0, category: 'Good' },
	{ id: 'hazy', label: 'Hazy', value: 35, category: 'Moderate' },
	{ id: 'smoky', label: 'Smoky', value: 150, category: 'Very Unhealthy' },
	{ id: 'wildfire', label: 'Wildfire', value: 350, category: 'Hazardous' }
];

/** The outdoor air preset a PM2.5 value is, or null between them. */
export const airPreset = (micrograms: number) => AIR_PRESETS.find((preset) => Math.abs(preset.value - micrograms) < 0.5) ?? null;

/** Metres per second in a knot (1852 m an hour). */
export const KNOT = 1852 / 3600;

/**
 * Forces of the Beaufort wind scale, in knots at weather-report height (10 m): the limits of each force, whole knots inclusive, and its
 * mean. US National Weather Service, Storm Prediction Center, "Beaufort Wind Scale", https://www.spc.noaa.gov/faq/tornado/beaufort.html,
 * for the limits, and the Met Office, "Beaufort wind force scale", https://weather.metoffice.gov.uk/guides/coast-and-sea/beaufort-scale,
 * for the same limits with each force's mean. Force 0, calm, is under 1 knot.
 */
export const BEAUFORT = {
	calm: { force: 0, name: 'Calm', knots: [0, 0.99], mean: 0 },
	lightAir: { force: 1, name: 'Light air', knots: [1, 3], mean: 2 },
	light: { force: 2, name: 'Light breeze', knots: [4, 6], mean: 5 },
	gentle: { force: 3, name: 'Gentle breeze', knots: [7, 10], mean: 9 },
	moderate: { force: 4, name: 'Moderate breeze', knots: [11, 16], mean: 13 },
	fresh: { force: 5, name: 'Fresh breeze', knots: [17, 21], mean: 19 },
	strong: { force: 6, name: 'Strong breeze', knots: [22, 27], mean: 24 },
	nearGale: { force: 7, name: 'Near gale', knots: [28, 33], mean: 30 }
} as const;

/** The force of the Beaufort scale a wind speed is, m/s: whole knots, rounded, then the force whose limits hold them. */
export function beaufortForce(metresPerSecond: number): number {
	const knots = Math.round(Math.max(0, metresPerSecond) / KNOT);
	return Object.values(BEAUFORT).find((band) => knots <= band.knots[1])?.force ?? 8;
}

/** A wind preset's speed: its force's mean (`BEAUFORT`) in m/s, on the control's 0.5 m/s step. */
const windAt = (band: { mean: number }) => Math.round((band.mean * KNOT) / 0.5) * 0.5;

/**
 * Wind speeds, m/s at weather-report height (what `Conditions.windSpeed` holds): calm, and the mean of four forces of the Beaufort
 * scale, a light, a gentle, a fresh and a strong breeze, each rounded to the control's step, which keeps it inside its force.
 */
export const WIND_PRESETS: readonly (Preset & { force: number })[] = (['calm', 'light', 'gentle', 'fresh', 'strong'] as const).map((id) => ({
	id,
	label: BEAUFORT[id].name,
	value: windAt(BEAUFORT[id]),
	force: BEAUFORT[id].force
}));

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
