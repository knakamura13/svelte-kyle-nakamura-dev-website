import { LIMITS, type LayerId, type UnitSystem } from '../state';
import { formatLength, sliderRange } from '../units';

/**
 * The View group's controls, as logic and words with no Svelte in them, so Node tests them: the four Layers, the logarithmic
 * slider for sensitivity, the slice height slider in the visitor's units, and everything a screen reader is told after a change.
 */

/** The Layers, in the order the picker lists them. */
export const LAYER_OPTIONS: { value: LayerId; label: string }[] = [
	{ value: 'speed', label: 'Speed' },
	{ value: 'direction', label: 'Direction' },
	{ value: 'particulates', label: 'Particulates' },
	{ value: 'temperature', label: 'Temperature' }
];

export const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
	{ value: 'imperial', label: 'Imperial' },
	{ value: 'metric', label: 'Metric' }
];

/** Two significant digits, with no trailing zeros: 0.25, 0.5, 1, 1.4, 4. */
const significant = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 });

/**
 * The sensitivity slider counts octaves (doublings), so that equal distances along it are equal ratios, which is what a
 * multiplier wants: -2 is 0.25 and 2 is 4, `LIMITS.sensitivity`'s two ends, with a stop every quarter octave (17 of them).
 */
export const SENSITIVITY_SLIDER = { min: Math.log2(LIMITS.sensitivity.min), max: Math.log2(LIMITS.sensitivity.max), step: 0.25 } as const;

const clampSensitivity = (sensitivity: number) => Math.min(LIMITS.sensitivity.max, Math.max(LIMITS.sensitivity.min, sensitivity));

/** The sensitivity at a slider stop, to two significant digits so that it reads as a round number: 0.25, 0.3, 0.35, 0.42, 0.5 ... 4. */
export function sensitivityFromSlider(position: number): number {
	return clampSensitivity(Number((2 ** position).toPrecision(2)));
}

/** The slider stop nearest a sensitivity, so a value that came from elsewhere still has a place on the slider. */
export function sliderFromSensitivity(sensitivity: number): number {
	const { min, max, step } = SENSITIVITY_SLIDER;
	return Math.min(max, Math.max(min, Math.round(Math.log2(clampSensitivity(sensitivity)) / step) * step));
}

/** "0.5×". */
export const formatSensitivity = (sensitivity: number) => `${significant.format(sensitivity)}×`;
/** For a screen reader, which may say "×" as the letter x. */
export const spokenSensitivity = (sensitivity: number) => `${significant.format(sensitivity)} times`;

/**
 * What a sensitivity below and above 1 does to what the Layer shows. `View.sensitivity` multiplies the color range, so below 1
 * the scale covers less and the same value sits further along it, in stronger color (the speed scale at 0.5 is 0 to 1.5 m/s).
 */
const EFFECT: Record<LayerId, { less: string; more: string }> = {
	speed: { less: 'weaker flow shows in stronger colour', more: 'only stronger flow shows in strong colour' },
	direction: { less: 'weaker flow shows in stronger colour', more: 'only stronger flow shows in strong colour' },
	particulates: { less: 'lower particulate levels show in stronger colour', more: 'only higher levels show in strong colour' },
	temperature: { less: 'smaller temperature differences show in stronger colour', more: 'only larger differences show in strong colour' }
};

/** The sentence under the sensitivity slider: what moving it each way does to this Layer. */
export const sensitivityHint = (layer: LayerId) => `Lower: ${EFFECT[layer].less}. Higher: ${EFFECT[layer].more}.`;

/**
 * What is announced once the slider stops: the sensitivity, what it did, and the Layer's scale in words
 * (`DockLegend.description`), because the scale is what moved. "Colour sensitivity 0.5: weaker flow shows in stronger colour. Air speed, 0 to 1.5 ..."
 */
export function describeSensitivity(layer: LayerId, sensitivity: number, scale: string): string {
	const effect = sensitivity < 1 ? EFFECT[layer].less : sensitivity > 1 ? EFFECT[layer].more : '';
	return `Colour sensitivity ${significant.format(sensitivity)}${effect ? `: ${effect}` : ''}. ${scale}`;
}

const clampHeight = (metres: number) => Math.min(LIMITS.sliceHeight.max, Math.max(LIMITS.sliceHeight.min, metres));

/** The slice height slider's position: the height in the unit shown (metres, or inches so that its steps land on whole inches), kept on the slider. */
export function sliderFromSliceHeight(metres: number, units: UnitSystem): number {
	const range = sliderRange('sliceHeight', units);
	return Math.min(range.max, Math.max(range.min, range.toDisplay(metres)));
}

/** The slice height in metres, for a position of the slider in the unit shown, kept within `LIMITS.sliceHeight`. */
export function sliceHeightFromSlider(position: number, units: UnitSystem): number {
	return clampHeight(sliderRange('sliceHeight', units).fromDisplay(position));
}

/** The height a Probe is pinned and smoke is released at (the solver's slice is read there; nothing is drawn): "Probe and smoke height: 3 feet 8 inches." */
export const describeSliceHeight = (metres: number, units: UnitSystem) => `Probe and smoke height: ${formatLength(metres, units).spoken}.`;

/** "Layer: Air speed, 0 to 1.5 metres per second, from pale to dark blue." */
export const describeLayer = (scale: string) => `Layer: ${scale}`;

/** "Top-down view on." */
export const describeToggle = (name: string, on: boolean) => `${name} ${on ? 'on' : 'off'}.`;

/** "Units: metric." */
export const describeUnits = (units: UnitSystem) => `Units: ${units}.`;
