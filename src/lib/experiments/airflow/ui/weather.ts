import { compassWord, describeBearing } from '../directionWords';
import type { Conditions, UnitSystem } from '../state';
import { UNIT_SPACE, formatSpeed, formatTemperature, sliderRange, type Formatted, type SliderRange } from '../units';

/**
 * What the Weather group says: the sliders in the visitor's units, a sentence for each change and a few words for the closed
 * group. The state keeps SI (°C, m/s), so every number here goes through `units.ts`. Plain data and strings, so a Node test can hold them.
 */

/** The controls whose number is a quantity in units. The wind's direction is a bearing, the same in both systems, and has its own words below. */
export type WeatherKey = 'windSpeed' | 'outdoorTemp' | 'indoorTemp' | 'outdoorPm25';

/** What a slider is called, and so what is said when it changes. */
export const WEATHER_NAMES: Record<WeatherKey, string> = {
	windSpeed: 'Wind speed',
	outdoorTemp: 'Outdoor temperature',
	indoorTemp: 'Indoor starting temperature',
	outdoorPm25: 'Outdoor PM2.5'
};

/** Outdoor PM2.5 as the slider shows it: a whole number of µg/m³, the same in both unit systems. */
export function formatPm25(micrograms: number): Pick<Formatted, 'text' | 'spoken'> {
	const value = Math.round(Number.isFinite(micrograms) ? micrograms : 0);
	return { text: `${value}${UNIT_SPACE}µg/m³`, spoken: `${value} ${value === 1 ? 'microgram' : 'micrograms'} per cubic metre` };
}

export interface WeatherField {
	/** The slider's range, step and conversions in the current units. */
	range: SliderRange;
	/** Where the slider sits, in display units. */
	value: number;
	/** The value beside the label, with its unit. It shows the slider's own decimals, so it never claims more than a step. */
	display: string;
	/** The same for a screen reader, the unit in words. */
	spoken: string;
}

/** A weather slider for a value in SI. */
export function weatherField(key: WeatherKey, si: number, units: UnitSystem): WeatherField {
	const range = sliderRange(key, units);
	const shown = key === 'windSpeed' ? formatSpeed(si, units, { digits: range.digits }) : key === 'outdoorPm25' ? formatPm25(si) : formatTemperature(si, units, { digits: range.digits });
	return { range, value: range.toDisplay(si), display: shown.text, spoken: shown.spoken };
}

/** What to say, politely, once the visitor stops moving a weather slider; `si` is the value it was moved to. */
export function weatherAnnouncement(key: WeatherKey, si: number, units: UnitSystem): string {
	const sentence = `${WEATHER_NAMES[key]} ${weatherField(key, si, units).spoken}.`;
	// A new starting temperature builds the indoor air again; the others change the weather while the air moves.
	return key === 'indoorTemp' ? `${sentence} The air starts over at that temperature.` : sentence;
}

/** The wind's direction as the sentence under its slider says it. A calm wind has no direction to speak of. */
export function windFromNote(windFrom: number, windSpeed: number): string {
	if (!(windSpeed > 0)) return 'The wind is calm, so its direction changes nothing yet.';
	return `The wind blows from the ${compassWord(windFrom)}, toward the ${compassWord(windFrom + 180)}.`;
}

/** What to say, politely, once the visitor stops moving the wind's direction. */
export function windFromAnnouncement(windFrom: number, windSpeed: number): string {
	const sentence = `Wind from the ${describeBearing(windFrom).spoken}.`;
	return windSpeed > 0 ? sentence : `${sentence} The wind is calm, so this changes nothing yet.`;
}

/** The weather in a few words, for the closed group: "4.0 m/s from the west, 18 °C", "Calm, 10 °C", with smoke outdoors "…, 35 µg/m³ PM2.5". */
export function weatherHint(conditions: Conditions, units: UnitSystem): string {
	const wind = conditions.windSpeed > 0 ? `${weatherField('windSpeed', conditions.windSpeed, units).display} from the ${compassWord(conditions.windFrom)}` : 'Calm';
	const smoke = conditions.outdoorPm25 > 0 ? `, ${formatPm25(conditions.outdoorPm25).text} PM2.5` : '';
	return `${wind}, ${weatherField('outdoorTemp', conditions.outdoorTemp, units).display}${smoke}`;
}
