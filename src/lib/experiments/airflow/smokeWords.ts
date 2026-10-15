import { EMISSION_REFERENCES, emissionMarks, emissionRate } from './emission';
import { UNIT_SPACE, type Formatted } from './units';

/**
 * What the Dock says about the Smoke strength slider: the rate it stands for, which real source that is about, and the same
 * in words for a screen reader. The numbers come from `emission.ts`, the one table the solver's release rate and the slider's
 * marks both read, so what is said here is what the solver releases. Nothing here touches Svelte, so Node can test it.
 */

const twoSignificant = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 });

/** Milligrams of PM2.5 released per minute, to two significant digits: "0.02 mg/min", "0.6 mg/min", "1.4 mg/min", "10 mg/min". */
export function formatEmissionRate(mgPerMinute: number): Formatted {
	if (!Number.isFinite(mgPerMinute)) return { value: '—', unit: 'mg/min', text: '—', spoken: 'no reading' };
	const value = twoSignificant.format(mgPerMinute);
	return { value, unit: 'mg/min', text: `${value}${UNIT_SPACE}mg/min`, spoken: `${value} ${value === '1' ? 'milligram' : 'milligrams'} per minute` };
}

/** Within this factor of a source's rate, either way, the slider is "about" that source. The table's own uncertainty is 1.5 to 7 either way. */
export const ABOUT = 1.5;

/** A mark's label in the middle of a sentence: "A candle" reads "a candle". */
const inSentence = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

/** Which real source a rate is near: "about frying", or where it falls between two of them. */
export function nearestSource(mgPerMinute: number): string {
	const sources = EMISSION_REFERENCES;
	for (const source of sources) {
		const ratio = mgPerMinute / source.mgPerMinute;
		if (ratio <= ABOUT && ratio >= 1 / ABOUT) return `about ${inSentence(source.label)}`;
	}
	const above = sources.findIndex((source) => source.mgPerMinute > mgPerMinute);
	if (above === 0) return `less than ${inSentence(sources[0].label)}`;
	if (above < 0) return `more than ${inSentence(sources[sources.length - 1].label)}`;
	return `between ${inSentence(sources[above - 1].label)} and ${inSentence(sources[above].label)}`;
}

export interface StrengthWords {
	rate: Formatted;
	/** "about frying", "between incense and frying". */
	near: string;
	/** For the slider's value as a screen reader says it: "2 milligrams per minute, about frying". */
	spoken: string;
	/** For the announcement that follows a change: "Smoke strength about frying, 2 milligrams per minute". */
	announcement: string;
}

/** The slider's position (0 to 1) in words. */
export function describeStrength(strength: number): StrengthWords {
	const mgPerMinute = emissionRate(strength);
	const rate = formatEmissionRate(mgPerMinute);
	const near = nearestSource(mgPerMinute);
	return { rate, near, spoken: `${rate.spoken}, ${near}`, announcement: `Smoke strength ${near}, ${rate.spoken}` };
}

export interface SmokeMark {
	id: string;
	/** The mark's name, as the table gives it. */
	label: string;
	/** Where along the slider it falls, 0 to 1. */
	position: number;
	rate: Formatted;
}

/** The marks along the slider, each with its rate in the Dock's format. */
export const smokeMarks = (): SmokeMark[] => emissionMarks().map((mark) => ({ id: mark.id, label: mark.label, position: mark.position, rate: formatEmissionRate(mark.mgPerMinute) }));
