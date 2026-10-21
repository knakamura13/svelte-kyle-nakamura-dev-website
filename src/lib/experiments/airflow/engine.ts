import type { EngineLoader } from '$lib/experiments/engine/experience.svelte';

/**
 * Fetches the 3D world: its host, the airflow scene, the solver and the WebGPU kernels, and the CC0 models, textures and sky, all
 * at once. The code is dynamic imports that nothing else on the page imports, so three.js and the solver are not part of the page's
 * initial JavaScript. If the assets cannot be had, the world is drawn with its procedural stand-ins rather than not at all.
 */
export const loadEngine: EngineLoader = async () => {
	// The load is timed in performance marks (`airflow:*`), so the time to the first frame can be taken apart in a profile or a test.
	performance.mark('airflow:engine');
	const assets = import('./scene/look/assets').then(({ loadLookAssets }) =>
		loadLookAssets()
			.then((loaded) => {
				performance.mark('airflow:assets');
				return loaded;
			})
			.catch((error) => {
				console.warn('The models and textures could not load, so the world is drawn without them.', error);
				return null;
			})
	);
	const code = Promise.all([import('./scene/look/stage'), import('./scene/airflowScene')]).then((modules) => {
		performance.mark('airflow:code');
		return modules;
	});
	const [[{ AirflowStage }, { createAirflowScene }], loaded] = await Promise.all([code, assets]);
	return () => new AirflowStage(createAirflowScene, loaded);
};
