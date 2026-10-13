import { Plane, Raycaster, Vector2, Vector3, type Camera, type Object3D } from 'three';
import type { Point3 } from './deviceMath';

const raycaster = new Raycaster();
const plane = new Plane(new Vector3(0, 1, 0), 0);
const ndc = new Vector2();
const hit = new Vector3();

/**
 * Where the pointer looks at the horizontal plane `y` metres above the floor, in the solver's axes (metres; x east, y up,
 * z south; the origin at the footprint's north-west floor corner), or null when its ray misses the plane (it points at
 * the sky), meets it outside the footprint, or is stopped short of it by one of `occluders` (the furniture: a wardrobe
 * taller than the plane hides the floor behind it, and the pointer is on the wardrobe). `at` is in normalized device
 * coordinates: x and y from -1 to 1, y up. The camera's matrices must be current, as they are after a frame has been drawn.
 */
export function pointOnPlane(camera: Camera, at: { x: number; y: number }, y: number, footprint: { width: number; depth: number }, occluders: readonly Object3D[] = []): Point3 | null {
	ndc.set(at.x, at.y);
	raycaster.setFromCamera(ndc, camera);
	plane.constant = -y;
	if (!raycaster.ray.intersectPlane(plane, hit)) return null;
	if (hit.x < 0 || hit.z < 0 || hit.x > footprint.width || hit.z > footprint.depth) return null;
	if (occluders.length) {
		const blocker = raycaster.intersectObjects(occluders as Object3D[], false)[0];
		if (blocker && blocker.distance < raycaster.ray.origin.distanceTo(hit) - 1e-3) return null;
	}
	return { x: hit.x, y, z: hit.z };
}
