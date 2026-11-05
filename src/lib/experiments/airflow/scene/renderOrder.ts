/**
 * Draw order among the world's transparent things: the air (`air/index.ts`: the haze and the smoke laid over the world, then the
 * streaks, then a phone's smoke puffs, which cover the streaks in them as smoke does rather than lying under them like a film), then the
 * markers (the probes' pins and the devices' rings), so smoke never veils the marker that says where it comes from, and the
 * handles and outlines over those (`deviceEditor.ts`, `selection.ts`).
 */
export const RENDER_ORDER = { march: 15, streaks: 16, puffs: 17, markers: 18 } as const;
