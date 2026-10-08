import { AIR } from './solver/types';
import { LIMITS, type UnitSystem } from './state';

/**
 * Display units. The state and the solver stay SI; this turns SI values into text in the visitor's unit system and lets
 * a slider hold a display value while the state keeps SI. Digits are grouped the English way whatever the locale,
 * because the page's copy is English: the locale only picks the unit system.
 *
 * Digits, unless the caller passes `digits` (a slider label shows its step's decimals instead):
 * - temperature, absolute or a difference: one decimal ("21.5 °C", "+1.8 °F");
 * - speed, area, volume, flow and air changes per hour: two decimals below 1, one below 10, none from 10
 *   ("0.35 m/s", "2.4 m/s", "12 m/s");
 * - length in metres: two decimals below 10 m, one below 100 m; in imperial, feet and whole inches below 10 ft
 *   ("3 ft 7 in", "8 in"), then feet with one decimal below 100 ft ("21.7 ft");
 * - percent: whole;
 * - particulates: two significant digits, and a "less than" form below 0.001 ppm.
 * The size bands are judged on the rounded value, so 0.996 m/s reads "1.0 m/s", not "1.00 m/s".
 */

/** A narrow no-break space: keeps a number and its unit on one line, closer than a word space. */
export const UNIT_SPACE = ' ';
const MINUS = '−';
const NO_READING = '—';

export interface Formatted {
	value: string;
	unit: string;
	/** `value`, a narrow no-break space and `unit`. */
	text: string;
	/** For a screen reader, with the unit in words: "minus 3.5 degrees Celsius". */
	spoken: string;
}

export interface FormatOptions {
	/** Decimals, in place of the size rule. */
	digits?: number;
}

/** The regions that measure in US customary units. */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

/**
 * The unit system for a BCP 47 language tag such as `navigator.language`: imperial when its region is the United
 * States, Liberia or Myanmar, metric otherwise, including a tag with no region ("en"). The page's toggle overrides it.
 */
export function detectUnits(locale: string | undefined): UnitSystem {
	if (typeof locale !== 'string') return 'metric';
	const subtags = locale.trim().split(/[-_]/);
	// A one-letter first subtag is a private-use or grandfathered tag, which has no region.
	if (!/^[a-z]{2,8}$/i.test(subtags[0])) return 'metric';
	// The region is the first two-letter subtag; scripts have four letters, extended languages three, and a one-letter subtag starts an extension.
	for (const subtag of subtags.slice(1)) {
		if (subtag.length === 1) break;
		if (/^[a-z]{2}$/i.test(subtag)) return IMPERIAL_REGIONS.has(subtag.toUpperCase()) ? 'imperial' : 'metric';
	}
	return 'metric';
}

/** Exact by definition. */
const METRES_PER_SECOND_PER_MPH = 0.44704;
const METRES_PER_INCH = 0.0254;
const SQUARE_METRES_PER_SQUARE_FOOT = 0.09290304;
const CUBIC_METRES_PER_CUBIC_FOOT = 0.028316846592;

interface UnitName {
	symbol: string;
	one: string;
	many: string;
}

const unitName = (symbol: string, one: string, many = `${one}s`): UnitName => ({ symbol, one, many });
const CELSIUS = unitName('°C', 'degree Celsius', 'degrees Celsius');
const FAHRENHEIT = unitName('°F', 'degree Fahrenheit', 'degrees Fahrenheit');
const METRES_PER_SECOND = unitName('m/s', 'metre per second', 'metres per second');
const MILES_PER_HOUR = unitName('mph', 'mile per hour', 'miles per hour');
const METRE = unitName('m', 'metre');
const FOOT = unitName('ft', 'foot', 'feet');
const INCH = unitName('in', 'inch', 'inches');
const SQUARE_METRE = unitName('m²', 'square metre');
const SQUARE_FOOT = unitName('sq ft', 'square foot', 'square feet');
const CUBIC_METRE = unitName('m³', 'cubic metre');
const CUBIC_FOOT = unitName('cu ft', 'cubic foot', 'cubic feet');
const CUBIC_METRES_PER_HOUR = unitName('m³/h', 'cubic metre per hour', 'cubic metres per hour');
const CUBIC_FEET_PER_MINUTE = unitName('CFM', 'cubic foot per minute', 'cubic feet per minute');
const AIR_CHANGES = unitName('ACH', 'air change per hour', 'air changes per hour');
const PERCENT = unitName('%', 'percent', 'percent');
const PPM = unitName('ppm', 'part per million', 'parts per million');
const MICROGRAMS = unitName('µg/m³', 'microgram per cubic metre', 'micrograms per cubic metre');

const fixedFormats = new Map<number, Intl.NumberFormat>();
const twoSignificant = new Intl.NumberFormat('en-US', { minimumSignificantDigits: 2, maximumSignificantDigits: 2 });

/** `x` to `digits` decimals, grouped, with a true minus sign and never "−0". `plus` marks a positive value, for a difference. */
function fixed(x: number, digits: number, plus = false): string {
	const places = Math.min(10, Math.max(0, Math.round(digits)));
	const scale = 10 ** places;
	const magnitude = Math.round(Math.abs(x) * scale) / scale;
	let format = fixedFormats.get(places);
	if (!format) fixedFormats.set(places, (format = new Intl.NumberFormat('en-US', { minimumFractionDigits: places, maximumFractionDigits: places })));
	const sign = magnitude === 0 ? '' : x < 0 ? MINUS : plus ? '+' : '';
	return sign + format.format(magnitude);
}

/** Decimals for a size: the first band whose limit the rounded value is under, else none. */
type Bands = readonly (readonly [below: number, digits: number])[];
const BY_SIZE: Bands = [
	[1, 2],
	[10, 1]
];
const LENGTH: Bands = [
	[10, 2],
	[100, 1]
];

function digitsFor(x: number, bands: Bands): number {
	for (const [below, digits] of bands) if (Math.round(Math.abs(x) * 10 ** digits) / 10 ** digits < below) return digits;
	return 0;
}

/** The number in words a screen reader says well: a true minus sign and "<" are not read reliably. */
const spokenNumber = (value: string) => value.replace(MINUS, 'minus ').replace(/^\+/, 'plus ').replace(`<${UNIT_SPACE}`, 'less than ').replaceAll(UNIT_SPACE, ' ');

function reading(value: string, unit: UnitName): Formatted {
	if (value === NO_READING) return { value, unit: unit.symbol, text: NO_READING, spoken: 'no reading' };
	const singular = value.replace(/^[^0-9]+/, '') === '1';
	return { value, unit: unit.symbol, text: `${value}${UNIT_SPACE}${unit.symbol}`, spoken: `${spokenNumber(value)} ${singular ? unit.one : unit.many}` };
}

/** A non-finite value, from a probe outside the air for instance, reads as a dash rather than "NaN". */
const measured = (x: number, digits: number, unit: UnitName, plus = false) => reading(Number.isFinite(x) ? fixed(x, digits, plus) : NO_READING, unit);

/** An absolute temperature, from °C. */
export function formatTemperature(celsius: number, units: UnitSystem, { digits = 1 }: FormatOptions = {}): Formatted {
	return measured(QUANTITIES.temperature.toDisplay(celsius, units), digits, units === 'imperial' ? FAHRENHEIT : CELSIUS);
}

/** A temperature difference, from kelvin: 1.8 °F per kelvin with no offset. Signed by default ("+1.8 °F"). */
export function formatTemperatureDelta(kelvin: number, units: UnitSystem, { digits = 1, signed = true }: FormatOptions & { signed?: boolean } = {}): Formatted {
	return measured(units === 'imperial' ? kelvin * QUANTITIES.temperature.factor : kelvin, digits, units === 'imperial' ? FAHRENHEIT : CELSIUS, signed);
}

export function formatSpeed(metresPerSecond: number, units: UnitSystem, { digits }: FormatOptions = {}): Formatted {
	const x = QUANTITIES.speed.toDisplay(metresPerSecond, units);
	return measured(x, digits ?? digitsFor(x, BY_SIZE), units === 'imperial' ? MILES_PER_HOUR : METRES_PER_SECOND);
}

/**
 * A length. In imperial, lengths under 10 ft read as feet and whole inches ("3 ft 7 in", whose units are in `value`, so
 * `unit` is empty; "8 in" under a foot); `feetAndInches: false` or `digits` gives decimal feet instead.
 */
export function formatLength(metres: number, units: UnitSystem, { digits, feetAndInches = true }: FormatOptions & { feetAndInches?: boolean } = {}): Formatted {
	if (units === 'metric') return measured(metres, digits ?? digitsFor(metres, LENGTH), METRE);
	const inches = QUANTITIES.length.toDisplay(metres, 'imperial');
	const whole = Math.round(Math.abs(inches));
	if (feetAndInches && digits === undefined && whole < 120) {
		const sign = inches < 0 && whole > 0 ? MINUS : '';
		const feet = Math.floor(whole / 12);
		const rest = whole % 12;
		if (feet === 0) return reading(`${sign}${rest}`, INCH);
		const value = [`${sign}${feet}`, FOOT.symbol, `${rest}`, INCH.symbol].join(UNIT_SPACE);
		return { value, unit: '', text: value, spoken: `${sign ? 'minus ' : ''}${feet} ${feet === 1 ? FOOT.one : FOOT.many} ${rest} ${rest === 1 ? INCH.one : INCH.many}` };
	}
	const feet = inches / 12;
	return measured(feet, digits ?? digitsFor(feet, LENGTH), FOOT);
}

export function formatArea(squareMetres: number, units: UnitSystem, { digits }: FormatOptions = {}): Formatted {
	const x = units === 'imperial' ? squareMetres / SQUARE_METRES_PER_SQUARE_FOOT : squareMetres;
	return measured(x, digits ?? digitsFor(x, BY_SIZE), units === 'imperial' ? SQUARE_FOOT : SQUARE_METRE);
}

export function formatVolume(cubicMetres: number, units: UnitSystem, { digits }: FormatOptions = {}): Formatted {
	const x = units === 'imperial' ? cubicMetres / CUBIC_METRES_PER_CUBIC_FOOT : cubicMetres;
	return measured(x, digits ?? digitsFor(x, BY_SIZE), units === 'imperial' ? CUBIC_FOOT : CUBIC_METRE);
}

/** An air flow, from m³/s: cubic feet per minute or cubic metres per hour, the units fans and purifiers are rated in. */
export function formatFlow(cubicMetresPerSecond: number, units: UnitSystem, { digits }: FormatOptions = {}): Formatted {
	const x = units === 'imperial' ? (cubicMetresPerSecond * 60) / CUBIC_METRES_PER_CUBIC_FOOT : cubicMetresPerSecond * 3600;
	return measured(x, digits ?? digitsFor(x, BY_SIZE), units === 'imperial' ? CUBIC_FEET_PER_MINUTE : CUBIC_METRES_PER_HOUR);
}

/** Air changes per hour, the same in both systems. */
export function formatAirChanges(perHour: number, { digits }: FormatOptions = {}): Formatted {
	return measured(perHour, digits ?? digitsFor(perHour, BY_SIZE), AIR_CHANGES);
}

/** A fraction from 0 to 1, such as a fan's power or how far a window is open, as a percentage. */
export function formatPercent(fraction: number, { digits = 0 }: FormatOptions = {}): Formatted {
	return measured(fraction * 100, digits, PERCENT);
}

/** Air density at 20 °C and 1 atm, kg/m³: what turns ppm by mass into µg/m³. */
export const AIR_DENSITY = AIR.rho;

/** ppm by mass is mg of particles per kg of air, so 1 ppm is 1,204 µg/m³. */
export const ugPerM3FromPpm = (ppm: number) => ppm * AIR_DENSITY * 1000;
export const ppmFromUgPerM3 = (micrograms: number) => micrograms / (AIR_DENSITY * 1000);

/** Below this many ppm (1.2 µg/m³) the air is effectively clean and more digits would be noise, so a reading says "less than" it. */
export const PARTICULATE_FLOOR = 0.001;

export interface ParticulateReading {
	ppm: Formatted;
	micrograms: Formatted;
	/** Both, as "0.012 ppm (14 µg/m³)". */
	text: string;
	spoken: string;
}

/** Particulates, from ppm by mass, with µg/m³ beside them: two significant digits, which suits a log scale. */
export function formatParticulates(ppm: number): ParticulateReading {
	if (!Number.isFinite(ppm)) {
		const none = reading(NO_READING, PPM);
		return { ppm: none, micrograms: reading(NO_READING, MICROGRAMS), text: NO_READING, spoken: none.spoken };
	}
	const below = !(ppm >= PARTICULATE_FLOOR);
	const parts = below ? [`<${UNIT_SPACE}${fixed(PARTICULATE_FLOOR, 3)}`, `<${UNIT_SPACE}${twoSignificant.format(ugPerM3FromPpm(PARTICULATE_FLOOR))}`] : [twoSignificant.format(ppm), twoSignificant.format(ugPerM3FromPpm(ppm))];
	const byMass = reading(parts[0], PPM);
	const byVolume = reading(parts[1], MICROGRAMS);
	return { ppm: byMass, micrograms: byVolume, text: `${byMass.text} (${byVolume.text})`, spoken: `${byMass.spoken}, ${byVolume.spoken}` };
}

/**
 * A quantity a slider can show in display units while the state keeps SI. `toDisplay` and `fromDisplay` are exact
 * inverses: `toDisplay` rounds off floating-point noise below a billionth of a display unit, so a whole number of mph or
 * °F comes back exactly after the trip to SI, and an SI value comes back to within a billionth.
 */
export interface Quantity {
	/** Unit of the number a slider holds. */
	unit(units: UnitSystem): string;
	toDisplay(value: number, units: UnitSystem): number;
	fromDisplay(value: number, units: UnitSystem): number;
	/** Imperial display value = SI value × factor + offset. 1 and 0 when both systems share the unit. */
	readonly factor: number;
	readonly offset: number;
	/** An imperial slider's step when its caller names none, display units. */
	readonly imperialStep: number;
}

function denoise(x: number): number {
	if (!(Math.abs(x) < 1e6)) return x;
	const rounded = Math.round(x * 1e9) / 1e9;
	return rounded === 0 ? 0 : rounded;
}

function quantity(metric: string, imperial: string, factor = 1, offset = 0): Quantity {
	const converts = (units: UnitSystem) => units === 'imperial' && (factor !== 1 || offset !== 0);
	return {
		factor,
		offset,
		imperialStep: 1,
		unit: (units) => (units === 'imperial' ? imperial : metric),
		toDisplay: (value, units) => (converts(units) ? denoise(value * factor + offset) : value),
		fromDisplay: (value, units) => (converts(units) ? (value - offset) / factor : value)
	};
}

export const QUANTITIES = {
	temperature: quantity('°C', '°F', 1.8, 32),
	speed: quantity('m/s', 'mph', 1 / METRES_PER_SECOND_PER_MPH),
	/** An imperial slider counts inches so its steps land on whole inches; `formatLength` shows feet and inches. */
	length: quantity('m', 'in', 1 / METRES_PER_INCH),
	concentration: quantity('µg/m³', 'µg/m³'),
	angle: quantity('°', '°'),
	duration: quantity('s', 's'),
	ratio: quantity('×', '×')
} satisfies Record<string, Quantity>;

export type QuantityName = keyof typeof QUANTITIES;

export type LimitKey = keyof typeof LIMITS;

/** What each control in LIMITS measures, a step where LIMITS gives none, and its imperial step where whole units would be finer than the metric one. */
const CONTROLS: Record<LimitKey, { quantity: QuantityName; step?: number; imperialStep?: number }> = {
	windSpeed: { quantity: 'speed' },
	outdoorTemp: { quantity: 'temperature' },
	indoorTemp: { quantity: 'temperature' },
	outdoorPm25: { quantity: 'concentration' },
	sliceHeight: { quantity: 'length', imperialStep: 2 },
	sensitivity: { quantity: 'ratio' },
	tilt: { quantity: 'angle', step: 1 },
	oscillationSweep: { quantity: 'angle', step: 5 },
	oscillationPeriod: { quantity: 'duration', step: 0.5 }
};

/** A slider in display units: its range and step, the decimals that show one step, and the conversions bound to the unit system. */
export interface SliderRange {
	min: number;
	max: number;
	step: number;
	digits: number;
	unit: string;
	toDisplay(value: number): number;
	fromDisplay(value: number): number;
}

function decimals(step: number): number {
	for (let digits = 0; digits < 10; digits++) if (Math.abs(step * 10 ** digits - Math.round(step * 10 ** digits)) < 1e-9) return digits;
	return 10;
}

/**
 * A slider for an SI range in display units. Metric keeps the range as it is. Imperial steps by `imperialStep` (default
 * one display unit) and rounds the ends inward to a step, so every position of the slider is a value the range allows:
 * wind speed 0 to 15 m/s becomes 0 to 33 mph.
 */
export function displayRange(name: QuantityName, range: { min: number; max: number; step: number }, units: UnitSystem, imperialStep?: number): SliderRange {
	const quantity: Quantity = QUANTITIES[name];
	const toDisplay = (value: number) => quantity.toDisplay(value, units);
	const fromDisplay = (value: number) => quantity.fromDisplay(value, units);
	const unit = quantity.unit(units);
	if (units === 'metric' || (quantity.factor === 1 && quantity.offset === 0)) return { min: range.min, max: range.max, step: range.step, digits: decimals(range.step), unit, toDisplay, fromDisplay };
	const step = imperialStep ?? quantity.imperialStep;
	const digits = decimals(step);
	const onGrid = (n: number) => Number((n * step).toFixed(digits));
	return { min: onGrid(Math.ceil(toDisplay(range.min) / step - 1e-9)), max: onGrid(Math.floor(toDisplay(range.max) / step + 1e-9)), step, digits, unit, toDisplay, fromDisplay };
}

/** The slider for one of the controls in LIMITS. */
export function sliderRange(key: LimitKey, units: UnitSystem): SliderRange {
	const control = CONTROLS[key];
	const limits: { min: number; max: number; step?: number } = LIMITS[key];
	return displayRange(control.quantity, { min: limits.min, max: limits.max, step: limits.step ?? control.step ?? 1 }, units, control.imperialStep);
}
