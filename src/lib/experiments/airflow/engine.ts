import type { EngineLoader } from '$lib/experiments/engine/experience.svelte';
import type { LoadHooks } from './load';

/** Of the fetch stage of the loading screen, the share that is the code (three.js, the scene and the solver); the rest is the CC0 assets. */
const CODE_SHARE = 0.3;

/**
 * Fetches the 3D world: its host, the airflow scene, the solver and the WebGPU kernels, and the CC0 models, textures and sky, all
 * at once. The code is dynamic imports that nothing else on the page imports, so three.js and the solver are not part of the page's
 * initial JavaScript. If the assets cannot be had, the world is drawn with its procedural stand-ins rather than not at all.
 *
 * `hooks` hears how the fetch goes, file by file, and is handed to the host, which reports the rest of the load (the shaders and the
 * warm-up) and when the world is on screen.
 */
export const engineLoader =
	(hooks?: LoadHooks): EngineLoader =>
	async () => {
		// The load is timed in performance marks (`airflow:*`), so the time to the first frame can be taken apart in a profile or a test.
		performance.mark('airflow:engine');
		let code = 0;
		let files = 0;
		const report = () => hooks?.report('fetch', CODE_SHARE * code + (1 - CODE_SHARE) * files);
		const assets = import('./scene/look/assets').then(({ loadLookAssets }) =>
			loadLookAssets((share) => {
				files = share;
				report();
			})
				.then((loaded) => {
					performance.mark('airflow:assets');
					return loaded;
				})
				.catch((error) => {
					console.warn('The models and textures could not load, so the world is drawn without them.', error);
					return null;
				})
		);
		const modules = Promise.all([import('./scene/look/stage'), import('./scene/airflowScene')]).then((loaded) => {
			performance.mark('airflow:code');
			code = 1;
			report();
			return loaded;
		});
		try {
			const [[{ AirflowStage }, { createAirflowScene }], loaded] = await Promise.all([modules, assets]);
			hooks?.report('fetch', 1);
			return () => new AirflowStage(createAirflowScene, loaded, hooks);
		} catch (error) {
			hooks?.failed();
			throw error;
		}
	};
