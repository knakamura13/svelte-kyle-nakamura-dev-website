/**
 * Draw order among the world's transparent things: the air (`air/index.ts`: the haze and the smoke laid over the world, then the puffs,
 * then the streaks), then the markers (the probes' pins and the devices' rings and cones), so smoke never veils the marker that says
 * where it comes from, and the handles and outlines over those (`deviceEditor.ts`, `selection.ts`).
 */
export const RENDER_ORDER = { march: 15, puffs: 16, streaks: 17, markers: 18 } as const;
