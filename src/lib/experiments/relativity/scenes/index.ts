import { createFrames } from './frames';
import { createLightClock } from './lightClock';
import { createLightSpeed } from './lightSpeed';
import { createMuons } from './muons';
import { createTwinTrip } from './twinTrip';

/** Every scene the relativity page can host, by the id its chapter asks for. */
export const sceneFactories = {
	frames: createFrames,
	lightSpeed: createLightSpeed,
	lightClock: createLightClock,
	twinTrip: createTwinTrip,
	muons: createMuons
};

export type SceneId = keyof typeof sceneFactories;
