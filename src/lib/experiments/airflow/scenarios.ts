import { blankSetup, type Clock, type Setup, type View } from './state';

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

/**
 * The guided scenarios. The two that need an air purifier, clearing the smoke and the smoky day, wait for the device
 * catalog. `tests/solver/scenario-presets.spec.ts` runs each one in the solver and checks that what `notice` says happens.
 */
export const SCENARIOS: Scenario[] = [
	{
		id: 'cross-ventilation',
		name: 'Cross-ventilation',
		blurb: 'Open windows at both ends of a home and let the wind blow through.',
		notice:
			'Air comes in at the living room windows that face the wind, crosses the hall, and leaves by the bedroom windows at the far end. Close a bedroom door and the flow through that bedroom drops to almost nothing.',
		setup: {
			...blankSetup('two-bedroom'),
			openings: { 'living-window-1': 1, 'living-window-2': 1, 'bedroom-1-door': 1, 'bedroom-2-door': 1, 'bedroom-1-window': 1, 'bedroom-2-window': 1 },
			conditions: { windFrom: 270, windSpeed: 4, outdoorTemp: 18, indoorTemp: 21, outdoorPm25: 0 }
		},
		view: { layer: 'speed' },
		clock: { speed: 5 }
	},
	{
		id: 'stack-effect',
		name: 'Stack effect',
		blurb: 'On a still, cold day, warm air leaves high and cold air comes in low.',
		notice:
			'With no wind, the only push on the air is that warm air is lighter than cold air. Cold air flows in through the low windows and warm air flows out through the high window, so the living room cools from the floor up.',
		setup: {
			...blankSetup('house'),
			openings: { 'living-north-window-1': 1, 'living-north-window-2': 1, 'clerestory-window': 1 },
			conditions: { windFrom: 270, windSpeed: 0, outdoorTemp: -5, indoorTemp: 21, outdoorPm25: 0 }
		},
		view: { layer: 'temperature' },
		clock: { speed: 5 }
	}
];
