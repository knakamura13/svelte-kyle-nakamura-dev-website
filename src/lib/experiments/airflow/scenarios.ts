import { FAN_MODELS, PURIFIER_MODELS } from './devices/catalog';
import { deviceDefaults, newDevice } from './devices/placement';
import type { PurifierModel } from './devices/types';
import { planById } from './homes/plans';
import { blankSetup, type Clock, type DeviceState, type Setup, type View } from './state';
import { ppmFromUgPerM3 } from './units';

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

/** The catalog's window fan in the first window of a plan that can hold one, drawing air in at full speed. */
function windowFanIn(planId: string): DeviceState {
	const model = FAN_MODELS.find((m) => m.kind === 'window-fan')!;
	const made = newDevice(planById(planId)!, model, []);
	if (!('device' in made)) throw new Error(made.reason);
	return { ...made.device, id: 'window-fan', power: 1 };
}

/** The catalog's purifier of a size, on High: at `spot` (x and z in metres, `yaw` the way its front faces), or where the tray would put it. */
function purifierOnHigh(planId: string, size: PurifierModel['size'], spot?: { x: number; z: number; yaw: number }): DeviceState {
	const model = PURIFIER_MODELS.find((m) => m.size === size)!;
	if (spot) return { ...deviceDefaults(model), ...spot, id: 'purifier', power: 1 };
	const made = newDevice(planById(planId)!, model, []);
	if (!('device' in made)) throw new Error(made.reason);
	return { ...made.device, id: 'purifier', power: 1 };
}

/** The smoke in the air when the purifier scenarios start, µg/m³: the Smoky outdoor air's level. */
const SMOKY = 150;

/** The guided scenarios. `tests/solver/scenario-presets.spec.ts` runs each one in the solver and checks that what `notice` says happens. */
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
	},
	{
		id: 'window-fan',
		name: 'A fan in the window',
		blurb: 'No wind at all: one window fan pulls the air through the whole home.',
		notice:
			'The fan in the dining room window draws cool air in and pushes it toward the hall and bedroom 1, where it leaves by the open window. The living room and the closed rooms see little of it. Turn the fan off and the air slows to a drift within a minute.',
		setup: {
			...blankSetup('two-bedroom'),
			devices: [windowFanIn('two-bedroom')],
			openings: { 'bedroom-1-door': 1, 'bedroom-1-window': 1 },
			conditions: { windFrom: 270, windSpeed: 0, outdoorTemp: 16, indoorTemp: 24, outdoorPm25: 0 }
		},
		view: { layer: 'temperature' },
		clock: { speed: 5 }
	},
	{
		id: 'clearing-smoke',
		name: 'Clearing the smoke',
		blurb: 'Smoke from the kitchen fills the home, and a purifier clears a bedroom faster than its open window would.',
		notice:
			'With its door shut, the purifier on High halves the smoke in bedroom 2 every four to seven minutes, the longer the finer the grid your device runs: the Physics panel gives the grid and each room’s PM2.5. Turn it off and open the bedroom window instead, and on this still day the smoke takes about ten and a half minutes to halve on any grid. On Low the purifier takes about twice as long as on High, because the model takes Low to clean at half the rate of High: no maker publishes the lower speeds.',
		setup: {
			...blankSetup('two-bedroom'),
			devices: [purifierOnHigh('two-bedroom', 'medium', { x: 10.5, z: 4.8, yaw: 180 })],
			conditions: { windFrom: 270, windSpeed: 0, outdoorTemp: 18, indoorTemp: 21, outdoorPm25: 0 }
		},
		view: { layer: 'particulates' },
		clock: { speed: 20 },
		smoke: ppmFromUgPerM3(SMOKY)
	},
	{
		id: 'smoky-day',
		name: 'The smoky day',
		blurb: 'Wildfire smoke outside and in: shut the windows and run a purifier, or open them to the breeze.',
		notice:
			'The smoke outside has already come in. With every window shut, the purifier on High halves the smoke in the main room every eight to twelve minutes, the longer the finer the grid your device runs. This model’s home has no leaks; a real one’s would let some smoke back in. Open the windows to the breeze and the main room levels off at about 85 % of the smoke outside, even with the purifier on High.',
		setup: {
			...blankSetup('studio'),
			devices: [purifierOnHigh('studio', 'large')],
			conditions: { windFrom: 90, windSpeed: 3, outdoorTemp: 24, indoorTemp: 24, outdoorPm25: SMOKY }
		},
		view: { layer: 'particulates' },
		clock: { speed: 20 },
		smoke: ppmFromUgPerM3(SMOKY)
	}
];
