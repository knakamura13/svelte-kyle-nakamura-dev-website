import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';
import type { Point3 } from './deviceMath';

const raycaster = new Raycaster();
const plane = new Plane(new Vector3(0, 1, 0), 0);
const ndc = new Vector2();
const hit = new Vector3();

/**
 * Where the pointer looks at the horizontal plane `y` metres above the floor, in the solver's axes (metres; x east, y up,
 * z south; the origin at the footprint's north-west floor corner), or null when its ray misses the plane (it points at
 * the sky) or meets it outside the footprint. `at` is in normalized device coordinates: x and y from -1 to 1, y up. The
 * camera's matrices must be current, as they are after a frame has been drawn.
 */
export function pointOnPlane(camera: Camera, at: { x: number; y: number }, y: number, footprint: { width: number; depth: number }): Point3 | null {
	ndc.set(at.x, at.y);
	raycaster.setFromCamera(ndc, camera);
	plane.constant = -y;
	if (!raycaster.ray.intersectPlane(plane, hit)) return null;
	if (hit.x < 0 || hit.z < 0 || hit.x > footprint.width || hit.z > footprint.depth) return null;
	return { x: hit.x, y, z: hit.z };
}
