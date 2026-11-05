import type { LayerId, OverlayId, UnitSystem } from '../../state';
import { dockLegend, type DockLegend } from '../../viz/dockLegend';
import { STOPS, colorFor, hexToRgb, scaleMapping, type Rgb, type ScaleMapping } from '../../viz/palettes';

/**
 * The overlays' scales, shared by the shaders (`streaks.ts` and `overlay.ts`) and the legend the HUD draws, so a colour means the
 * same in both. An overlay colours the streaks by its quantity, with a faint haze of the same colours through the rooms: Air speed
 * on the blue ramp, Temperature on the diverging scale centred on where the indoor air started, and Smoke on the orange ramp over four
 * decades of PM2.5. These are the slice's old layers and palettes; no plane is drawn. Pure, so Node tests it.
 */

export type OverlayKind = Exclude<OverlayId, 'off'>;

/** The palette layer each overlay draws with. */
export const OVERLAY_LAYER: Readonly<Record<OverlayKind, LayerId>> = { speed: 'speed', temperature: 'temperature', smoke: 'particulates' };

/** Which channel of the look texture (`fields.ts`) each overlay reads: speed, temperature or PM2.5. */
export const OVERLAY_CHANNEL: Readonly<Record<OverlayKind, 0 | 1 | 2>> = { speed: 0, temperature: 1, smoke: 2 };

/** How an overlay turns a value into a place on its palette: the slice's mapping, at the view's sensitivity and a baseline of 0. */
export function overlayMapping(kind: OverlayKind, sensitivity: number): ScaleMapping & { layer: LayerId; channel: 0 | 1 | 2 } {
	const layer = OVERLAY_LAYER[kind];
	return { ...scaleMapping(layer, { sensitivity, baseline: 0 }), layer, channel: OVERLAY_CHANNEL[kind] };
}

/**
 * The colour a streak takes under an overlay, for a value in the overlay's own unit (m/s, K above the reference, ppm): the palette
 * at the value's place on the scale, sRGB from 0 to 1, as the streaks' shader computes it. With the overlay Off it is `STREAK_AIR`.
 */
export function streakColor(kind: OverlayId, value: number, sensitivity: number, out: Rgb = [0, 0, 0]): Rgb {
	if (kind !== 'off') return colorFor(OVERLAY_LAYER[kind], value, { sensitivity, baseline: 0 }, out);
	out[0] = STREAK_AIR[0];
	out[1] = STREAK_AIR[1];
	out[2] = STREAK_AIR[2];
	return out;
}

/** The streaks' colour with no overlay on: the blue the old tracers began at, which reads on a pale wall and on a dark floor. */
export const STREAK_AIR: Readonly<Rgb> = hexToRgb(STOPS.blue[5]);

/**
 * How strongly the haze tints air at a place on its scale, 0 to 1, before the depth of air it is seen through: nothing for still,
 * clean air at its starting temperature, full where the value is strong. Speed and smoke grow with their fraction; temperature grows
 * either way from the middle. The haze's shader computes the same.
 */
export function overlayStrength(kind: OverlayKind, t: number) {
	const x = Math.min(1, Math.max(0, t));
	return kind === 'temperature' ? Math.abs(2 * x - 1) : x;
}

/**
 * The haze through the rooms under an overlay: how much a metre of air at full strength tints, per metre, and the most it may cover
 * whatever is behind it, so a room always reads through it.
 */
export const HAZE = { density: 0.5, cap: 0.22 } as const;

export interface OverlayLegendOptions {
	units: UnitSystem;
	/** The view's sensitivity, which multiplies the scale's range. */
	sensitivity: number;
	/** Where the indoor air started, °C: the solver's reference, which the temperature scale is centred on. */
	reference: number;
	/** The most ticks on the bar (default 6). */
	maxTicks?: number;
}

export interface OverlayLegend extends DockLegend {
	overlay: OverlayKind;
}

/**
 * The legend under an overlay, in the page's units: its title, gradient, ticks and words (`dockLegend`'s, which the slice's
 * legend used). Null for Off, which has no legend.
 */
export function overlayLegend(kind: OverlayId, options: OverlayLegendOptions): OverlayLegend | null {
	if (kind === 'off') return null;
	const legend = dockLegend({ layer: OVERLAY_LAYER[kind], sensitivity: options.sensitivity, units: options.units, reference: options.reference, maxTicks: options.maxTicks });
	return { ...legend, overlay: kind };
}
