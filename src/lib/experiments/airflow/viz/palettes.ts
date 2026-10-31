import { LIMITS, type LayerId } from '../state';

/**
 * The color scales of the slice plane, the tracers and the legends. They are fixed and in real units, so a color
 * means the same speed, temperature or concentration in every room and every frame. They follow the dataviz method:
 * magnitude is one hue from light to dark, polarity is two hues either side of a neutral gray, and each scale passes
 * the method's color-vision checks (asserted in tests/solver/viz.spec.ts).
 *
 * Each scale is a 256-entry RGBA8 lookup that the shaders sample, plus constants that turn a value into a position on
 * it. `colorFor` does the shader's arithmetic on the CPU, so the legends and the tests see what the GPU draws.
 *
 * The dataviz validator (validate_palette.js, surface #f7f8f5) on these scales:
 * - speed, blue 100–700 (every other step, --ordinal): monotone, ΔL ≥ 0.06 and one hue pass; the light end is 1.24:1,
 *   which the method allows for a continuous heatmap (near zero recedes toward the surface).
 * - tracers, blue 350–650: all four ordinal checks pass (light end 2.80:1).
 * - particulates, orange 100–700: as speed (light end 1.26:1, by design).
 * - temperature arms, 150–550 each: monotone, ΔL and one hue pass; the poles (450, 550) pass all categorical checks
 *   (worst CVD ΔE 22.0 protan, normal 25.8). Mirrored arm steps stay ≥ 9.8 apart under protan and deutan even at 150.
 * - direction, N/E/S/W with --pairs all: band, chroma, CVD (14.1 deutan, tritan 11.1) and normal (18.5) pass; contrast
 *   WARN for the west teal (2.2:1), relieved by the arrows and the text readout. 45° neighbours: CVD 6.3 (the floor
 *   band, legal with the arrows as secondary encoding), normal 9.3, below 15 as for any continuous scale's neighbours.
 */

export type Rgb = [number, number, number];

/** What the scales depend on besides the value. */
export interface ScaleOptions {
	/** 0.25 to 4: multiplies the range a scale covers, so below 1 shows weaker flow more strongly. */
	sensitivity: number;
	/** The temperature the diverging scale is centred on, as theta (K above the solver's reference). */
	baseline: number;
}

/** Speed scale at sensitivity 1: 0 to 3 m/s (6.7 mph). */
export const SPEED_RANGE = 3;
/** Temperature scale at sensitivity 1: 6 K either side of the baseline. */
export const TEMPERATURE_HALF_RANGE = 6;
/** Particulate scale at sensitivity 1, ppm by mass: 1.2 µg/m³ to 12 mg/m³, four decades. */
export const PARTICULATE_WINDOW: readonly [number, number] = [0.001, 10];
/** Direction layer: color strength is the speed fraction to this power, so slow air still shows its heading faintly. */
export const DIRECTION_EXPONENT = 0.5;
/** Tracers start at blue step 350 (5 of 12 steps up), so a dot in still air still clears 2:1 against the pale Stage. */
export const TRACER_FLOOR = 5 / 12;
export const LUT_SIZE = 256;

/** The documented blue ramp, steps 100 to 700: one hue, equal steps of OKLab lightness (about 0.048). */
const BLUE = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

/**
 * Orange at the blue ramp's thirteen lightness steps. Steps 350 and 400 are the documented slot-2 oranges (light and
 * dark mode), which sit exactly on that lightness scale; the other steps keep their hue (OKLCH 40.4°) and the same
 * 86 % of the chroma sRGB allows at their lightness.
 */
const ORANGE = ['#fbd7ca', '#f9c2ae', '#f7ad92', '#f69673', '#f47d51', '#eb6834', '#d95926', '#c25125', '#ac4820', '#973e1a', '#833516', '#702c11', '#5d230c'];

/** The documented diverging midpoint gray. Its lightness is one ramp step above step 100. */
const NEUTRAL = '#f0efec';

/** Blue and orange arms of equal lightness (steps 550 to 150) either side of the neutral: cooler is blue. */
const DIVERGING = [BLUE[9], BLUE[7], BLUE[5], BLUE[3], BLUE[1], NEUTRAL, ORANGE[1], ORANGE[3], ORANGE[5], ORANGE[7], ORANGE[9]];

/**
 * Direction: a loop of hues around the compass at almost constant lightness and chroma, the heading the air moves
 * toward. A flat hue circle folds onto itself for red-green color blindness (opposite headings would match), so the
 * loop is tilted: lightness rises by `tilt` toward `tiltBearing`. That keeps the four compass points apart under every
 * simulated deficiency at the smallest change of lightness with heading. Hue turns against the bearing.
 */
const LOOP = { lightness: 0.64, tilt: 0.08, tiltBearing: 275, chroma: 0.12, hueAtNorth: 89 };

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex: string): Rgb {
	const n = parseInt(hex.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** sRGB (0 to 1) to OKLab. */
export function rgbToOklab([r, g, b]: Rgb): Rgb {
	const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

/** OKLab to sRGB (0 to 1), clamped to the gamut. */
export function oklabToRgb([L, a, b]: Rgb): Rgb {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
	return linear.map((c) => toSrgb(Math.min(1, Math.max(0, c)))) as Rgb;
}

function write(lut: Uint8Array, index: number, [r, g, b]: Rgb) {
	lut[4 * index] = Math.round(r * 255);
	lut[4 * index + 1] = Math.round(g * 255);
	lut[4 * index + 2] = Math.round(b * 255);
	lut[4 * index + 3] = 255;
}

/** Evenly spaced stops, interpolated in OKLab so equal steps of value look like equal steps of color. */
function ramp(stops: string[]) {
	const labs = stops.map((hex) => rgbToOklab(hexToRgb(hex)));
	const lut = new Uint8Array(LUT_SIZE * 4);
	for (let i = 0; i < LUT_SIZE; i++) {
		const x = (i / (LUT_SIZE - 1)) * (stops.length - 1);
		const k = Math.min(Math.floor(x), stops.length - 2);
		const f = x - k;
		const [a, b] = [labs[k], labs[k + 1]];
		write(lut, i, oklabToRgb([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]));
	}
	return lut;
}

/** The direction loop's color at full strength, for a compass bearing in degrees. */
export function headingRim(bearing: number): Rgb {
	const rad = Math.PI / 180;
	const hue = (LOOP.hueAtNorth - bearing) * rad;
	return oklabToRgb([
		LOOP.lightness + LOOP.tilt * Math.cos((bearing - LOOP.tiltBearing) * rad),
		LOOP.chroma * Math.cos(hue),
		LOOP.chroma * Math.sin(hue)
	]);
}

/** Entry i is the heading i/256 of a full turn: the lookup wraps, so north follows the last entry. */
function loop() {
	const lut = new Uint8Array(LUT_SIZE * 4);
	for (let i = 0; i < LUT_SIZE; i++) write(lut, i, headingRim((i / LUT_SIZE) * 360));
	return lut;
}

/** Each layer's 256 × 1 RGBA8 lookup, sRGB-encoded. */
export const PALETTES: Readonly<Record<LayerId, Uint8Array>> = {
	speed: ramp(BLUE),
	direction: loop(),
	particulates: ramp(ORANGE),
	temperature: ramp(DIVERGING)
};

/** The direction lookup wraps around (heading); the others clamp at their ends. */
export const isCyclic = (layer: LayerId) => layer === 'direction';

/** What slow air fades to on the direction layer, and the diverging midpoint: the lookup's own bytes, 0 to 1. */
export const NEUTRAL_RGB: Readonly<Rgb> = hexToRgb(NEUTRAL);

/** The ramp stops behind each lookup, for documentation and the tests. */
export const STOPS = { blue: BLUE, orange: ORANGE, diverging: DIVERGING, neutral: NEUTRAL } as const;

const sensitivityOf = (options: Pick<ScaleOptions, 'sensitivity'>) =>
	Math.min(LIMITS.sensitivity.max, Math.max(LIMITS.sensitivity.min, Number.isFinite(options.sensitivity) ? options.sensitivity : 1));

/**
 * Where a value falls on its layer's scale: `t = clamp(scale · x + offset, 0, 1)`, with x the value itself, or its
 * base-10 logarithm for particulates. The direction layer's mapping applies to horizontal speed (color strength).
 */
export interface ScaleMapping {
	scale: number;
	offset: number;
	log: boolean;
}

export function scaleMapping(layer: LayerId, options: ScaleOptions): ScaleMapping {
	const sensitivity = sensitivityOf(options);
	if (layer === 'temperature') {
		const span = 2 * TEMPERATURE_HALF_RANGE * sensitivity;
		return { scale: 1 / span, offset: 0.5 - options.baseline / span, log: false };
	}
	if (layer === 'particulates') {
		// Sensitivity multiplies both ends, which slides the four-decade window along the log axis.
		const decades = Math.log10(PARTICULATE_WINDOW[1] / PARTICULATE_WINDOW[0]);
		return { scale: 1 / decades, offset: -Math.log10(PARTICULATE_WINDOW[0] * sensitivity) / decades, log: true };
	}
	return { scale: 1 / (SPEED_RANGE * sensitivity), offset: 0, log: false };
}

/** The values at the two ends of a scale, in its own unit (m/s, theta, ppm). Direction gives its speed range. */
export function scaleRange(layer: LayerId, options: ScaleOptions): [number, number] {
	const sensitivity = sensitivityOf(options);
	if (layer === 'temperature') {
		const half = TEMPERATURE_HALF_RANGE * sensitivity;
		return [options.baseline - half, options.baseline + half];
	}
	if (layer === 'particulates') return [PARTICULATE_WINDOW[0] * sensitivity, PARTICULATE_WINDOW[1] * sensitivity];
	return [0, SPEED_RANGE * sensitivity];
}

/** A value's position on its scale, 0 to 1. Particulates at or below zero sit at the bottom. */
export function scaleFraction(layer: LayerId, value: number, options: ScaleOptions) {
	const { scale, offset, log } = scaleMapping(layer, options);
	const x = log ? Math.log10(Math.max(value, 1e-30)) : value;
	return Math.min(1, Math.max(0, x * scale + offset));
}

/** Direction layer: how far from the neutral toward the heading's color, 0 to 1, for a horizontal speed in m/s. */
export function directionStrength(horizontal: number, options: ScaleOptions) {
	const t = scaleFraction('direction', horizontal, options);
	return t > 0 ? t ** DIRECTION_EXPONENT : 0;
}

/** Compass bearing the air moves toward, as a fraction of a turn: 0 north, 0.25 east. x is east and z south. */
export function headingFraction(east: number, south: number) {
	const turn = Math.atan2(east, -south) / (2 * Math.PI);
	return turn - Math.floor(turn);
}

/**
 * Reads a lookup the way the GPU's linear filter does: texel centres at (i + 0.5) / 256, so a fraction t lands
 * between entries floor(255·t) and the next; a cyclic lookup spreads a full turn over all 256 and wraps.
 */
export function sampleLut(lut: Uint8Array, t: number, cyclic: boolean, out: Rgb = [0, 0, 0]): Rgb {
	const x = cyclic ? (t - Math.floor(t)) * LUT_SIZE : Math.min(1, Math.max(0, t)) * (LUT_SIZE - 1);
	const base = Math.floor(x);
	const f = x - base;
	const i = cyclic ? base % LUT_SIZE : Math.min(base, LUT_SIZE - 1);
	const j = cyclic ? (i + 1) % LUT_SIZE : Math.min(i + 1, LUT_SIZE - 1);
	for (let c = 0; c < 3; c++) out[c] = (lut[4 * i + c] + (lut[4 * j + c] - lut[4 * i + c]) * f) / 255;
	return out;
}

/**
 * The color the slice plane draws for a value: r, g, b from 0 to 1, sRGB-encoded. Direction takes the horizontal
 * velocity [east, south] in m/s: hue is the heading, and the color fades to the neutral as the air slows.
 */
export function colorFor(layer: LayerId, value: number | readonly [number, number], options: ScaleOptions, out: Rgb = [0, 0, 0]): Rgb {
	if (layer !== 'direction') {
		if (typeof value !== 'number') throw new TypeError(`The ${layer} scale takes a single value.`);
		return sampleLut(PALETTES[layer], scaleFraction(layer, value, options), false, out);
	}
	if (typeof value === 'number') throw new TypeError('The direction scale takes [east, south] velocity.');
	const [east, south] = value;
	const horizontal = Math.hypot(east, south);
	if (horizontal < 1e-6) {
		out[0] = NEUTRAL_RGB[0];
		out[1] = NEUTRAL_RGB[1];
		out[2] = NEUTRAL_RGB[2];
		return out;
	}
	sampleLut(PALETTES.direction, headingFraction(east, south), true, out);
	const strength = directionStrength(horizontal, options);
	for (let c = 0; c < 3; c++) out[c] = NEUTRAL_RGB[c] + (out[c] - NEUTRAL_RGB[c]) * strength;
	return out;
}

/** A tracer's color: the speed scale, starting at `TRACER_FLOOR` so slow dots stay visible. */
export function tracerColor(speed: number, options: ScaleOptions, out: Rgb = [0, 0, 0]): Rgb {
	return sampleLut(PALETTES.speed, Math.max(TRACER_FLOOR, scaleFraction('speed', speed, options)), false, out);
}

const glslFloat = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/**
 * The GLSL twin of `colorFor`: `uPalette` is the layer's lookup (a 256 × 1 RGBA8 texture, linear filter, repeat
 * wrapping for direction and clamping for the rest) and `uMapping` is (scale, offset) from `scaleMapping`. Values reach
 * `scaleFraction` already in mapping space, so particulates arrive as log10(ppm). Colors come out sRGB-encoded.
 */
export const PALETTE_GLSL = /* glsl */ `
uniform highp sampler2D uPalette;
uniform vec2 uMapping;
const vec3 PALETTE_NEUTRAL = vec3(${NEUTRAL_RGB.map(glslFloat).join(', ')});
const float DIRECTION_EXPONENT = ${glslFloat(DIRECTION_EXPONENT)};
const float TRACER_FLOOR = ${glslFloat(TRACER_FLOOR)};

float scaleFraction(float x) {
	return clamp(x * uMapping.x + uMapping.y, 0.0, 1.0);
}

vec3 paletteColor(float t) {
	return textureLod(uPalette, vec2((t * ${glslFloat(LUT_SIZE - 1)} + 0.5) / ${glslFloat(LUT_SIZE)}, 0.5), 0.0).rgb;
}

vec3 headingColor(float east, float south) {
	float horizontal = length(vec2(east, south));
	if (horizontal < 1e-6) return PALETTE_NEUTRAL;
	float turn = fract(atan(east, -south) / 6.283185307179586);
	vec3 rim = textureLod(uPalette, vec2((turn * ${glslFloat(LUT_SIZE)} + 0.5) / ${glslFloat(LUT_SIZE)}, 0.5), 0.0).rgb;
	float t = scaleFraction(horizontal);
	return mix(PALETTE_NEUTRAL, rim, t > 0.0 ? pow(t, DIRECTION_EXPONENT) : 0.0);
}
`;
