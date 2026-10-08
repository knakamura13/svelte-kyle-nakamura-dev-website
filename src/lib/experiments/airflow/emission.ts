/**
 * Smoke strength. The slider runs from a trickle to a burst on a log scale, with real sources marked along it so
 * a visitor can pick "about a candle" or "about frying". Rates are milligrams of PM2.5 per minute.
 */
export interface EmissionReference {
	id: string;
	label: string;
	mgPerMinute: number;
}

export const EMISSION_REFERENCES: EmissionReference[] = [
	{ id: 'candle', label: 'A candle', mgPerMinute: 0.02 },
	{ id: 'incense', label: 'Incense', mgPerMinute: 0.2 },
	{ id: 'frying', label: 'Frying', mgPerMinute: 2 },
	{ id: 'burst', label: 'A cooking burst', mgPerMinute: 20 }
];

const LOW = EMISSION_REFERENCES[0].mgPerMinute;
const HIGH = EMISSION_REFERENCES[EMISSION_REFERENCES.length - 1].mgPerMinute;

/** Slider position (0 to 1) to mg of particles per minute, evenly by decade. */
export const emissionRate = (strength: number) => LOW * (HIGH / LOW) ** Math.max(0, Math.min(1, strength));

/** Where along the slider a rate falls, 0 to 1. */
export const emissionPosition = (mgPerMinute: number) => Math.log(mgPerMinute / LOW) / Math.log(HIGH / LOW);
