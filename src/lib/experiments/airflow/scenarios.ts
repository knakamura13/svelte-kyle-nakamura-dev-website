import type { Clock, Setup, View } from './state';

/** A prepared Home, Devices, Openings and weather that shows one idea. */
export interface Scenario {
	id: string;
	name: string;
	/** One line for the picker. */
	blurb: string;
	/** What to look at once it runs, a sentence or two. */
	notice: string;
	setup: Setup;
	view?: Partial<Omit<View, 'units'>>;
	clock?: Partial<Clock>;
	/** Particulates in the indoor air at the start, ppm by mass: smoke already in the room. Not part of a shared link. */
	smoke?: number;
}
