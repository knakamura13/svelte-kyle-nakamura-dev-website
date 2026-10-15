import type { LayerId, UnitSystem } from '../state';
import { QUANTITIES, UNIT_SPACE, formatSpeed, formatTemperature, ugPerM3FromPpm, type Formatted } from '../units';
import { legendFor } from './legend';
import { scaleRange, type ScaleOptions } from './palettes';

/**
 * What the Dock's legend draws for the layer on the Slice, in the visitor's units: `legendFor`'s gradient, ticks and wheel with
 * every label turned into text a visitor and a screen reader can read, the scale in words for the bar's accessible name, and a
 * sentence on what the colors mean, so that no information is in color alone. Pure, so Node tests it. The scale is the Stage's:
 * the same sensitivity and a baseline of 0 (the temperature scale is centered on where the indoor air started).
 */

export interface DockLegendOptions {
	layer: LayerId;
	/** The view's sensitivity, which multiplies the color range (see `ScaleOptions`). */
	sensitivity: number;
	units: UnitSystem;
	/** Where the indoor air started, °C: the temperature the diverging scale is centered on, which is the solver's reference. */
	reference: number;
	/** The most ticks on the bar or rings on the wheel, for a narrow bar (default 6 for a bar and 4 for the wheel, so three rings). */
	maxTicks?: number;
}

/** One value on the legend, as text. */
export interface DockTick {
	/** From left to right along the bar, 0 to 1; for a ring, out from the centre as a fraction of the radius. */
	at: number;
	label: Formatted;
	/** The same value in a second unit: particulates read in ppm by mass and in µg/m³ beside it. */
	second?: Formatted;
}

export interface DockWheel {
	/** CSS background for a round element: the compass hues, fading to neutral toward the centre. */
	background: string;
	/** Speeds on the wheel: a ring each, at the speed's share of the radius. */
	rings: DockTick[];
	/** The four compass points, as the bearing the air moves toward. */
	headings: { label: string; spoken: string; bearing: number }[];
}

export interface DockLegend {
	layer: LayerId;
	title: string;
	/** The unit the labels are in, said once beside the title so that the ticks can be bare numbers: "m/s", "°F", "ppm above, µg/m³ below". */
	unit: string;
	/** CSS gradient for the bar, low to high. Direction has a wheel instead, and its gradient is the compass. */
	gradient: string;
	ticks: DockTick[];
	/** The temperature scale's neutral middle. */
	midpoint?: DockTick;
	wheel?: DockWheel;
	/** The scale's two ends in a few words, for a control that sets it: "0 to 1.5 m/s", "64.4 to 75.2 °F", "full colour at 1.5 m/s" for the wheel. */
	range: string;
	/** The scale in words: "Air speed, 0 to 1.5 metres per second, from pale to dark blue." For the bar's accessible name and for announcing a new layer. */
	description: string;
	/** What the colors mean, for the eye: one or two short sentences under the title. */
	caption: string;
}

const SPOKEN_COMPASS: Record<string, string> = { N: 'north', E: 'east', S: 'south', W: 'west' };

/** Two significant digits, grouped, with no trailing zeros: 0.001, 0.0005, 1.2, 12, 1,200. */
const significant = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 });

/** A value that has no unit system of its own, as a reading. */
function plain(value: number, unit: string, spokenUnit: string): Formatted {
	const number = significant.format(value);
	return { value: number, unit, text: `${number}${UNIT_SPACE}${unit}`, spoken: `${number} ${spokenUnit}` };
}

/** The fewest decimals (up to two) that show every value exactly, so a row of ticks reads 0.0 0.5 1.0 1.5 and not 0 0.5 1 1.5. */
function decimalsFor(values: readonly number[]): number {
	for (let digits = 0; digits < 2; digits++) if (values.every((v) => Math.abs(v * 10 ** digits - Math.round(v * 10 ** digits)) < 1e-6)) return digits;
	return 2;
}

/** 0 decimals for a value that is whole to a tenth, else 1: a temperature such as 21 °C, 69.8 °F or 64.4 °F. */
const tenths = (x: number) => (Math.abs(x - Math.round(x)) < 0.05 ? 0 : 1);

/** `tick` with its label made by `label`. */
const labelled = (at: number, label: Formatted, second?: Formatted): DockTick => (second ? { at, label, second } : { at, label });

export function dockLegend(options: DockLegendOptions): DockLegend {
	const { layer, sensitivity, units, reference } = options;
	const scale: ScaleOptions = { sensitivity, baseline: 0 };
	const imperial = units === 'imperial';
	// Display units per m/s, and display temperature = theta × scale + offset, so that ticks land on round numbers in the unit shown.
	const perMps = imperial ? QUANTITIES.speed.factor : 1;
	const kelvin = imperial ? QUANTITIES.temperature.factor : 1;
	const offset = imperial ? reference * kelvin + QUANTITIES.temperature.offset : reference;
	// The labels are built here, from each tick's value, so `legendFor` is given formatters that only have to return something.
	const text = (value: number) => String(value);
	const legend = legendFor(layer, {
		...scale,
		format: { speed: text, temperature: text, particulates: text },
		units: { speed: perMps, temperature: { scale: kelvin, offset } },
		maxTicks: options.maxTicks ?? (layer === 'direction' ? 4 : undefined)
	});
	const base = { layer, title: legend.title, gradient: legend.gradient };

	if (layer === 'speed' || layer === 'direction') {
		const [, top] = scaleRange(layer, scale);
		const shown = (mps: number) => mps * perMps;
		const speeds = (ticks: { value: number; at: number }[]) => {
			const digits = decimalsFor(ticks.map((tick) => shown(tick.value)));
			return ticks.map((tick) => labelled(tick.at, formatSpeed(tick.value, units, { digits: tick.value === 0 ? 0 : digits })));
		};
		// The top of the scale in a sentence: "3 metres per second", not "3.0", unless it has a fraction.
		const highest = formatSpeed(top, units, { digits: Math.abs(shown(top) - Math.round(shown(top))) < 0.005 ? 0 : undefined });
		const unit = highest.unit;
		if (layer === 'speed') {
			return {
				...base,
				unit,
				ticks: speeds(legend.ticks),
				range: `0 to ${highest.text}`,
				description: `${legend.title}, 0 to ${highest.spoken}, from pale to dark blue.`,
				caption: 'Darker blue is faster air.'
			};
		}
		const wheel = legend.wheel!;
		return {
			...base,
			unit,
			ticks: [],
			wheel: {
				background: wheel.background,
				rings: speeds(wheel.rings),
				headings: wheel.headings.map((heading) => ({ ...heading, spoken: SPOKEN_COMPASS[heading.label] }))
			},
			range: `full colour at ${highest.text}`,
			description: `${legend.title}, a colour wheel with north at the top. The hue is the compass heading the air moves toward, and it fades to grey as the air slows, to full colour at ${highest.spoken}.`,
			caption: 'Hue is the way the air is heading, with north at the top. It fades to grey as the air slows.'
		};
	}

	if (layer === 'particulates') {
		const [lo, hi] = scaleRange('particulates', scale);
		const micrograms = (ppm: number) => plain(ugPerM3FromPpm(ppm), 'µg/m³', 'micrograms per cubic metre');
		const ppm = (value: number) => plain(value, 'ppm', 'parts per million by mass');
		return {
			...base,
			unit: 'ppm above, µg/m³ below',
			ticks: legend.ticks.map((tick) => labelled(tick.at, ppm(tick.value), micrograms(tick.value))),
			range: `${significant.format(lo)} to ${ppm(hi).text}`,
			description: `${legend.title}, ${significant.format(lo)} to ${ppm(hi).spoken}, which is ${significant.format(ugPerM3FromPpm(lo))} to ${micrograms(hi).spoken}, on a logarithmic scale, from pale to dark orange.`,
			caption: `Darker orange is more particulates, ten times more at each tick. The palest is ${ppm(lo).text} or less.`
		};
	}

	// Temperature: the scale is centered on `reference`, cooler is blue and warmer orange.
	const [lo, hi] = scaleRange('temperature', scale);
	const ends = [reference + lo, reference + hi].map((celsius) => QUANTITIES.temperature.toDisplay(celsius, units));
	const endDigits = ends.every((x) => tenths(x) === 0) ? 0 : 1;
	const [low, high] = [reference + lo, reference + hi].map((celsius) => formatTemperature(celsius, units, { digits: endDigits }));
	const tickDigits = decimalsFor(legend.ticks.map((tick) => tick.value * kelvin + offset));
	const middle = formatTemperature(reference, units, { digits: tenths(QUANTITIES.temperature.toDisplay(reference, units)) });
	return {
		...base,
		unit: middle.unit,
		ticks: legend.ticks.map((tick) => labelled(tick.at, formatTemperature(reference + tick.value, units, { digits: tickDigits }))),
		midpoint: labelled(0.5, middle),
		range: `${low.value} to ${high.text}`,
		description: `${legend.title}, ${low.value} to ${high.spoken}, from blue for cooler through grey at ${middle.spoken} to orange for warmer.`,
		caption: `Blue is cooler and orange is warmer. Grey is where the indoor air started, ${middle.text}.`
	};
}
