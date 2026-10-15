import type { EngineLoader } from '$lib/experiments/engine/experience.svelte';

/**
 * Fetches the 3D engine together with this page's scenes, the first time a Stage nears the viewport.
 * Both are dynamic imports and nothing else on the page imports them, so three.js is not part of the
 * page's initial JavaScript.
 */
export const loadEngine: EngineLoader = async () => {
	const [{ StageController }, { sceneFactories }] = await Promise.all([
		import('$lib/experiments/engine/controller'),
		import('./scenes')
	]);
	return () => new StageController(sceneFactories);
};
