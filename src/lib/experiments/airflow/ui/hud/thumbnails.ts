import { Box3, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Mesh } from 'three';
import { deviceDefaults } from '../../devices/placement';
import type { DeviceModel } from '../../devices/types';
import type { DeviceState } from '../../state';
import { DeviceMeshes } from '../../scene/deviceMeshes';

/**
 * The Build catalog's pictures, rendered once from the Stage's own device meshes (`scene/deviceMeshes.ts`) with a throwaway renderer:
 * each model at three-quarters from the front and a little above, lit like a product shot, on a clear background. Browser only; the
 * catalog imports this when it first opens, so three.js stays out of the page's first script.
 */

let cache: Map<string, string> | null = null;

/** Where the camera looks from, as a direction from the device: in front of it (a device faces north, -z), to its left and above. */
const VIEW = new Vector3(-0.62, 0.48, -1).normalize();

export function renderThumbnails(models: readonly DeviceModel[], size = 224): Map<string, string> {
	if (cache && models.every((model) => cache!.has(model.id))) return cache;
	const canvas = document.createElement('canvas');
	const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
	const out = new Map<string, string>();
	const meshes = new DeviceMeshes(new Map(models.map((model) => [model.id, model])));
	try {
		renderer.setPixelRatio(1);
		renderer.setSize(size, size, false);
		renderer.setClearColor(0x000000, 0);
		const scene = new Scene();
		scene.add(new HemisphereLight(0xffffff, 0x4b5a52, 2.1));
		const key = new DirectionalLight(0xffffff, 2.8);
		key.position.set(-2, 3.5, -2.5);
		const rim = new DirectionalLight(0xc8f2dd, 1.6);
		rim.position.set(2.5, 1.2, 2);
		scene.add(key, rim, meshes.group);
		const camera = new PerspectiveCamera(24, 1, 0.01, 100);
		const box = new Box3();
		const part = new Box3();
		const centre = new Vector3();
		for (const model of models) {
			const device: DeviceState = { ...deviceDefaults(model), id: 'thumbnail', x: 0, z: 0, y: 0, yaw: 0, power: 2 / 3 };
			meshes.update([device], 0, -40, null);
			// The device only, not its symbol on the slice.
			meshes.group.traverse((object) => {
				if (object.userData.symbol) object.visible = false;
			});
			meshes.group.updateMatrixWorld(true);
			box.makeEmpty();
			meshes.group.traverseVisible((object) => {
				const mesh = object as Mesh;
				if (!mesh.isMesh) return;
				mesh.geometry.computeBoundingBox();
				part.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
				box.union(part);
			});
			box.getCenter(centre);
			const radius = box.getSize(new Vector3()).length() / 2;
			const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.02;
			camera.position.copy(centre).addScaledVector(VIEW, distance);
			camera.lookAt(centre);
			renderer.render(scene, camera);
			out.set(model.id, canvas.toDataURL('image/png'));
		}
	} catch (error) {
		console.warn('The catalog pictures could not be drawn.', error);
	} finally {
		meshes.dispose();
		renderer.dispose();
		renderer.forceContextLoss();
	}
	if (out.size === models.length) cache = out;
	return out;
}
