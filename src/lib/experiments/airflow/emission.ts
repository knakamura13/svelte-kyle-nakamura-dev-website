/**
 * Smoke strength. The slider runs from a trickle to a burst on a log scale, with real sources marked along it so
 * a visitor can pick "about a candle" or "about frying". Rates are milligrams of PM2.5 per minute.
 *
 * This table is the one place the numbers live: the solver's release rate (`emissionRate`) and the marks the slider
 * draws (`emissionMarks`) both read it, so a mark and the rate at its position cannot disagree. Each row is one candle,
 * one stick of incense or one cooking event, and is documented in docs/research/airflow/devices-and-particulates.md,
 * section 7, which carries its source, its unit conversion and its uncertainty (a factor of 1.5 to 7 either way), and
 * a test holds that table and this one to the same numbers.
 */
export interface EmissionReference {
	id: string;
	/** What the slider's mark says. */
	label: string;
	/** Milligrams of PM2.5 released per minute. */
	mgPerMinute: number;
	/** `sourced`: the research note cites a measurement for it. `unconfirmed`: it is a placeholder, and the note says why. */
	status: 'sourced' | 'unconfirmed';
}

export const EMISSION_REFERENCES: EmissionReference[] = [
	{ id: 'candle', label: 'A candle', mgPerMinute: 0.02, status: 'sourced' },
	{ id: 'incense', label: 'Incense', mgPerMinute: 0.6, status: 'sourced' },
	{ id: 'frying', label: 'Frying', mgPerMinute: 2, status: 'sourced' },
	{ id: 'burst', label: 'A cooking burst', mgPerMinute: 10, status: 'sourced' }
];

const LOW = EMISSION_REFERENCES[0].mgPerMinute;
const HIGH = EMISSION_REFERENCES[EMISSION_REFERENCES.length - 1].mgPerMinute;

/** Slider position (0 to 1) to mg of particles per minute, evenly by decade. */
export const emissionRate = (strength: number) => LOW * (HIGH / LOW) ** Math.max(0, Math.min(1, strength));

/** Where along the slider a rate falls, 0 to 1. */
export const emissionPosition = (mgPerMinute: number) => Math.log(mgPerMinute / LOW) / Math.log(HIGH / LOW);

/** The marks along the slider: each reference with its position. What the Dock draws, from the same rows the solver's rate comes from. */
export const emissionMarks = () => EMISSION_REFERENCES.map((reference) => ({ ...reference, position: emissionPosition(reference.mgPerMinute) }));
