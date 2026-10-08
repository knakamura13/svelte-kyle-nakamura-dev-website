import type { EngineLoader } from '$lib/experiments/engine/experience.svelte';

/**
 * Fetches the 3D engine together with this page's scene, the first time the Stage nears the viewport. Both are
 * dynamic imports and nothing else on the page imports them, so three.js, the solver and the WGSL are not part of
 * the page's initial JavaScript.
 */
export const loadEngine: EngineLoader = async () => {
	const [{ StageController }, { airflowScenes }] = await Promise.all([import('$lib/experiments/engine/controller'), import('./scene/registry')]);
	return () => new StageController(airflowScenes);
};
