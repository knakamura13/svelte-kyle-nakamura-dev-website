import type { EngineLoader } from '$lib/experiments/engine/experience.svelte';

/**
 * Fetches the 3D engine with the airflow scene, the solver and the WebGPU kernels, the first time the Stage nears the
 * viewport. All of it is dynamic imports that nothing else on the page imports, so three.js and the solver are not part of
 * the page's initial JavaScript.
 */
export const loadEngine: EngineLoader = async () => {
	const [{ StageController }, { createAirflowScene }] = await Promise.all([
		import('$lib/experiments/engine/controller'),
		import('./scene/airflowScene')
	]);
	return () => new StageController({ airflow: createAirflowScene });
};
