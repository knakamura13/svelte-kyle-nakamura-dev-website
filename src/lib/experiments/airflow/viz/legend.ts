import type { LayerId } from '../state';
import { DIRECTION_EXPONENT, NEUTRAL_RGB, PALETTES, isCyclic, sampleLut, scaleRange, type Rgb, type ScaleOptions } from './palettes';

/**
 * What a legend shows for each layer: a CSS gradient that matches the shader, ticks at round values in the visitor's
 * unit, and for direction a wheel. Text comes from the caller's formatters, so the legend knows no units of its own.
 */

export interface LegendFormat {
	/** A speed in m/s, as the visitor reads it ("2 mph"). */
	speed(mps: number): string;
	/** A temperature given as theta, K above the solver's reference, as the visitor reads it ("70 °F"). */
	temperature(theta: number): string;
	/** A concentration in ppm by mass, with µg/m³ beside it ("0.01 ppm · 12 µg/m³"). */
	particulates(ppm: number): string;
}

/**
 * How the visitor's units relate to the solver's, so ticks land on round numbers in the unit shown. Speed is display
 * units per m/s (2.23694 for mph). Temperature is display = theta × scale + offset: Celsius with a 20 °C reference is
 * { scale: 1, offset: 20 }, Fahrenheit { scale: 1.8, offset: 68 }. Left out: m/s, and kelvin above the reference.
 */
export interface LegendUnits {
	speed: number;
	temperature: { scale: number; offset: number };
}

export interface LegendOptions extends ScaleOptions {
	format: LegendFormat;
	units?: Partial<LegendUnits>;
	/**
	 * The most ticks to return, for a bar that is narrow or labels that are long (default 6; particulates default to
	 * every decade, which is five or fewer). Ticks are thinned evenly, keeping the ends.
	 */
	maxTicks?: number;
}

export interface LegendTick {
	/** In the scale's own unit: m/s, theta, ppm, or for direction a compass bearing in degrees. */
	value: number;
	label: string;
	/** 0 to 1 along the gradient from left to right; for the wheel's speed rings, out from the centre. */
	at: number;
}

export interface LegendWheel {
	/** Layered CSS background for a round element: the fade to neutral over a conic gradient, north at the top, clockwise. */
	background: string;
	/** Speed rings, with `at` as a fraction of the radius. */
	rings: LegendTick[];
	/** Compass points, as the bearing the air moves toward, degrees clockwise from north. */
	headings: { label: string; bearing: number }[];
}

export interface Legend {
	layer: LayerId;
	title: string;
	/** CSS linear-gradient, low to high; for direction the compass from north through east, south and west to north. */
	gradient: string;
	ticks: LegendTick[];
	/** The diverging scale's neutral middle: the baseline temperature. */
	midpoint?: LegendTick;
	wheel?: LegendWheel;
}

const TITLES: Record<LayerId, string> = {
	speed: 'Air speed',
	direction: 'Direction of flow',
	particulates: 'Particulates (PM2.5)',
	temperature: 'Temperature'
};

const COMPASS = [
	{ label: 'N', bearing: 0 },
	{ label: 'E', bearing: 90 },
	{ label: 'S', bearing: 180 },
	{ label: 'W', bearing: 270 }
];

const css = ([r, g, b]: Rgb, alpha = 1) =>
	`rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}${alpha < 1 ? ` / ${+alpha.toFixed(3)}` : ''})`;

/** Seventeen stops read from the lookup, which is close enough that the CSS and the shader match to the eye. */
function gradientOf(layer: LayerId) {
	const stops: string[] = [];
	for (let k = 0; k <= 16; k++) stops.push(`${css(sampleLut(PALETTES[layer], k / 16, isCyclic(layer)))} ${(k * 6.25).toFixed(2)}%`);
	return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/**
 * Round values from `lo` to `hi`, at most `most` of them: whole multiples of a step of 1, 2 or 5 times a power of ten,
 * the smallest such step that fits.
 */
export function roundValues(lo: number, hi: number, most = 6): number[] {
	const span = hi - lo;
	if (!(span > 0) || !Number.isFinite(span)) return [];
	let exponent = Math.floor(Math.log10(span / most));
	for (;;) {
		for (const m of [1, 2, 5]) {
			const step = m * 10 ** exponent;
			const first = Math.ceil(lo / step - 1e-9);
			const last = Math.floor(hi / step + 1e-9);
			if (last - first + 1 > most) continue;
			const decimals = Math.max(0, -exponent);
			const values: number[] = [];
			for (let n = first; n <= last; n++) values.push(Number((n * step).toFixed(decimals)));
			return values;
		}
		exponent++;
	}
}

const within = (at: number) => at > -1e-9 && at < 1 + 1e-9;
const clampAt = (at: number) => Math.min(1, Math.max(0, at));

/** The most round ticks a bar carries unless the caller asks for fewer. */
const DEFAULT_TICKS = 6;
const tickLimit = (options: LegendOptions) => Math.max(2, Math.floor(options.maxTicks ?? DEFAULT_TICKS));

/** At most `most` of `items`, evenly spaced by index, always keeping the first and the last. */
function thin<T>(items: T[], most: number): T[] {
	if (items.length <= most) return items;
	return Array.from({ length: most }, (_, n) => items[Math.round((n * (items.length - 1)) / (most - 1))]);
}

function speedTicks(options: LegendOptions): LegendTick[] {
	const perMps = options.units?.speed ?? 1;
	const [, top] = scaleRange('speed', options);
	return roundValues(0, top * perMps, tickLimit(options)).map((shown) => {
		const value = shown / perMps;
		return { value, label: options.format.speed(value), at: clampAt(value / top) };
	});
}

/** The wheel: color strength is the speed fraction to DIRECTION_EXPONENT, so the fade's stops follow that curve. */
function wheelOf(options: LegendOptions): LegendWheel {
	const turn: string[] = [];
	for (let k = 0; k <= 24; k++) turn.push(`${css(sampleLut(PALETTES.direction, k / 24, true))} ${k * 15}deg`);
	const fade: string[] = [];
	for (let k = 0; k <= 10; k++) {
		const strength = k / 10;
		const radius = strength ** (1 / DIRECTION_EXPONENT);
		fade.push(`${css(NEUTRAL_RGB as Rgb, 1 - strength)} ${(radius * 100).toFixed(2)}%`);
	}
	return {
		background: `radial-gradient(circle closest-side, ${fade.join(', ')}), conic-gradient(from 0deg, ${turn.join(', ')})`,
		rings: speedTicks(options).filter((tick) => tick.value > 0),
		headings: COMPASS.map((point) => ({ ...point }))
	};
}

/** Everything a legend for `layer` draws, at the current sensitivity and baseline. */
export function legendFor(layer: LayerId, options: LegendOptions): Legend {
	const base = { layer, title: TITLES[layer], gradient: gradientOf(layer) };
	if (layer === 'speed') return { ...base, ticks: speedTicks(options) };

	if (layer === 'direction') {
		const ticks = [...COMPASS, { label: 'N', bearing: 360 }].map(({ label, bearing }) => ({ value: bearing, label, at: bearing / 360 }));
		return { ...base, ticks, wheel: wheelOf(options) };
	}

	if (layer === 'particulates') {
		const [lo, hi] = scaleRange('particulates', options);
		const bottom = Math.log10(lo);
		const decades = Math.log10(hi) - bottom;
		const ticks: LegendTick[] = [];
		for (let k = Math.ceil(bottom - 1e-9); k <= Math.floor(Math.log10(hi) + 1e-9); k++) {
			// Parsed rather than computed, so a decade is exactly the number it is written as.
			const value = Number(`1e${k}`);
			ticks.push({ value, label: options.format.particulates(value), at: clampAt((k - bottom) / decades) });
		}
		return { ...base, ticks: options.maxTicks === undefined ? ticks : thin(ticks, tickLimit(options)) };
	}

	const { scale, offset } = { scale: 1, offset: 0, ...options.units?.temperature };
	const [lo, hi] = scaleRange('temperature', options);
	const most = tickLimit(options);
	// The baseline is labelled on its own, so a round tick that would sit on top of its label is dropped: in °F the
	// 21 °C baseline is 69.8, a fifth of a degree from the round 70.
	const clearance = 0.5 / most - 1e-9;
	const ticks = roundValues(lo * scale + offset, hi * scale + offset, most)
		.map((shown) => (shown - offset) / scale)
		.map((value) => ({ value, label: options.format.temperature(value), at: (value - lo) / (hi - lo) }))
		.filter((tick) => within(tick.at) && Math.abs(tick.at - 0.5) >= clearance)
		.map((tick) => ({ ...tick, at: clampAt(tick.at) }));
	return { ...base, ticks, midpoint: { value: options.baseline, label: options.format.temperature(options.baseline), at: 0.5 } };
}
