import type { LayerId, OverlayId, UnitSystem } from '../../state';
import { dockLegend, type DockLegend } from '../../viz/dockLegend';
import { scaleMapping, type ScaleMapping } from '../../viz/palettes';

/**
 * The overlays' scales, shared by the shader that tints the rooms (`overlay.ts`) and the legend the HUD draws under it, so a colour
 * means the same in both. Each overlay is one of the slice's old layers drawn through the whole volume: Air speed on the blue ramp,
 * Temperature on the diverging scale centred on where the indoor air started, and Smoke on the orange ramp over four decades of
 * PM2.5. Pure, so Node tests it.
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
 * How strongly the overlay tints air at a place on its scale, 0 to 1, before the depth of air it is seen through: faint for still,
 * clean air at its starting temperature, full where the value is strong. Speed and smoke grow with their fraction; temperature grows
 * either way from the middle. The shader computes the same (`OVERLAY_STRENGTH_GLSL`).
 */
export function overlayStrength(kind: OverlayKind, t: number) {
	const x = Math.min(1, Math.max(0, t));
	const signal = kind === 'temperature' ? Math.abs(2 * x - 1) : x;
	return OVERLAY_FLOOR[kind] + (1 - OVERLAY_FLOOR[kind]) * signal;
}

/** The faint tint of air with nothing to show, so the rooms still read as full of air: none for smoke, whose absence is the news. */
export const OVERLAY_FLOOR: Readonly<Record<OverlayKind, number>> = { speed: 0.12, temperature: 0.1, smoke: 0 };

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
