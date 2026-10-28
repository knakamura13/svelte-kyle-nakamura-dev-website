import { freeWindows } from '../devices/placement';
import type { ExteriorPlacement, Facade, HomePlan, OpeningSpec } from '../homes/types';
import { LIMITS, type DeviceState } from '../state';

/**
 * Pure geometry for placing and aiming Devices in the Home, testable in Node. Scene coordinates are the
 * solver's, in metres: x east, y up, z south (north is -z), origin at the plan's north-west floor corner. `yaw` is
 * degrees clockwise from north seen from above; `tilt` is degrees up.
 */

export interface PlanPoint {
	x: number;
	z: number;
}

export interface Point3 {
	x: number;
	y: number;
	z: number;
}

/** A ray as three.js keeps one (`raycaster.ray` fits), so the scene can pass it straight in. */
export interface RayLike {
	origin: Point3;
	direction: Point3;
}

/** Degrees in [0, 360). */
export function wrapDegrees(degrees: number) {
	const d = degrees % 360;
	const wrapped = d < 0 ? d + 360 : d;
	// -1e-15 + 360 rounds to 360.
	return wrapped >= 360 ? wrapped - 360 : wrapped;
}

/** The yaw that faces from `centre` toward `hit` on the horizontal plane, degrees clockwise from north in [0, 360). Coincident points give 0. */
export function yawFromPointer(centre: PlanPoint, hit: PlanPoint) {
	const dx = hit.x - centre.x;
	const dz = hit.z - centre.z;
	if (dx === 0 && dz === 0) return 0;
	// North is -z, so a hit straight north (dz < 0) is 0° and straight east (dx > 0) is 90°.
	return wrapDegrees((Math.atan2(dx, -dz) * 180) / Math.PI);
}

/** Resolution of the tilt search, degrees. */
const TILT_STEP = 0.25;

/**
 * The tilt that puts a fan's tilt handle nearest the pointer's ray, clamped to `LIMITS.tilt`. The handle rides an
 * arc of `radius` around the head centre in the vertical plane of the heading `yaw`; of the tilts the limits allow,
 * the one whose arc point lies closest to the ray wins. That works from any side: seen from the front the arc is
 * edge on and the pointer's height decides, seen from the side the angle around the head does.
 */
export function tiltFromPointer(head: Point3, yaw: number, radius: number, ray: RayLike) {
	const heading = (yaw * Math.PI) / 180;
	const hx = Math.sin(heading);
	const hz = -Math.cos(heading);
	const { origin, direction } = ray;
	const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
	const dx = direction.x / length;
	const dy = direction.y / length;
	const dz = direction.z / length;
	const steps = Math.round((LIMITS.tilt.max - LIMITS.tilt.min) / TILT_STEP);
	let best: number = LIMITS.tilt.min;
	let bestDistance = Infinity;
	for (let n = 0; n <= steps; n++) {
		const tilt = LIMITS.tilt.min + n * TILT_STEP;
		const climb = (tilt * Math.PI) / 180;
		const flat = Math.cos(climb) * radius;
		// The arc point, relative to the ray's origin, and its distance from the ray.
		const px = head.x + hx * flat - origin.x;
		const py = head.y + Math.sin(climb) * radius - origin.y;
		const pz = head.z + hz * flat - origin.z;
		const along = Math.max(0, px * dx + py * dy + pz * dz);
		const ex = px - along * dx;
		const ey = py - along * dy;
		const ez = pz - along * dz;
		const distance = ex * ex + ey * ey + ez * ez;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = tilt;
		}
	}
	return best;
}

/** The bearing from each facade into the home, which a window fan faces. The same as `INWARD` in devices/placement.ts, which is not exported. */
export const INWARD: Record<Facade, number> = { north: 180, east: 270, south: 0, west: 90 };

/** Where a window fan sits and which way it faces. */
export interface WindowSeat {
	opening: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
}

/** The seat a window fan takes in a window: the window's centre on the facade line at its sill, facing into the home (as `newDevice` places one). */
export function windowSeat(plan: HomePlan, window: OpeningSpec): WindowSeat {
	const { facade, center } = window.placement as ExteriorPlacement;
	const alongX = facade === 'north' || facade === 'south';
	const x = alongX ? center : facade === 'west' ? 0 : plan.width;
	const z = alongX ? (facade === 'north' ? 0 : plan.depth) : center;
	return { opening: window.id, x, y: window.sill, z, yaw: INWARD[facade] };
}

/**
 * The window a window fan dragged to plan point (x, z) snaps into, or null. A window qualifies when it can hold a fan,
 * has none in it (`devices`), and its centre is within `maxDistance` of the point projected onto its facade (the
 * distance along the wall). Of those, the one whose centre is nearest the point itself wins, so the wall the pointer
 * is closest to is preferred; ties go to the earlier window in the plan.
 */
export function snapToWindow(plan: HomePlan, x: number, z: number, devices: readonly DeviceState[], maxDistance: number): WindowSeat | null {
	let best: OpeningSpec | null = null;
	let bestDistance = Infinity;
	for (const window of freeWindows(plan, devices)) {
		const { facade, center } = window.placement as ExteriorPlacement;
		const alongX = facade === 'north' || facade === 'south';
		const along = Math.abs((alongX ? x : z) - center);
		if (along > maxDistance) continue;
		const across = facade === 'north' ? z : facade === 'south' ? plan.depth - z : facade === 'west' ? x : plan.width - x;
		const distance = Math.hypot(along, across);
		if (distance < bestDistance) {
			best = window;
			bestDistance = distance;
		}
	}
	return best ? windowSeat(plan, best) : null;
}

/**
 * The part of a window a window fan fills: the window's open region at full travel, which is the area the solver
 * gives the fan (`RasterOpening.coverage(1)`). `u` runs along the wall (x on a north or south wall, z on an east or
 * west one), `y` up from the floor.
 */
export function windowOpening(spec: OpeningSpec) {
	const u0 = spec.placement.center - spec.width / 2;
	const u1 = spec.placement.center + spec.width / 2;
	const y0 = spec.sill;
	const y1 = spec.sill + spec.height;
	const f = Math.max(0, Math.min(1, spec.maxOpen));
	switch (spec.anchor) {
		case 'start':
			return { u0, u1: u0 + f * (u1 - u0), y0, y1 };
		case 'end':
			return { u0: u1 - f * (u1 - u0), u1, y0, y1 };
		case 'bottom':
			return { u0, u1, y0, y1: y0 + f * (y1 - y0) };
		default:
			return { u0, u1, y0: y1 - f * (y1 - y0), y1 };
	}
}

/** Half the thickness of an interior wall, m. Plans give walls as centre lines; devices keep clear of a 10 cm wall. */
export const WALL_HALF = 0.05;

/** How far a footprint reaches from its centre: a radius, or half-sizes along x and z. */
export type Extent = number | { x: number; z: number };

const DEFAULT_EXTENT = 0.2;

const clampRange = (value: number, low: number, high: number) => (low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value)));

/** Pushes an axis-aligned footprint out of an axis-aligned box the shorter way. Returns the moved centre, or null if they do not overlap. */
function pushOut(px: number, pz: number, hx: number, hz: number, x0: number, x1: number, z0: number, z1: number): PlanPoint | null {
	const overlapX = Math.min(px + hx - x0, x1 - (px - hx));
	const overlapZ = Math.min(pz + hz - z0, z1 - (pz - hz));
	if (overlapX <= 1e-9 || overlapZ <= 1e-9) return null;
	// Across a long wall, or round the end of one beside a doorway.
	if (overlapX < overlapZ) return { x: px < (x0 + x1) / 2 ? x0 - hx : x1 + hx, z: pz };
	return { x: px, z: pz < (z0 + z1) / 2 ? z0 - hz : z1 + hz };
}

/**
 * The nearest point to (x, z) where a device whose footprint reaches `extent` from its centre stands inside the
 * home's outside walls (the footprint is the interior, so the walls lie outside it) and clear of every interior
 * wall. Walls are axis-aligned, so the footprint is treated as an axis-aligned box; a radius is a square.
 */
export function clampToHome(plan: HomePlan, x: number, z: number, extent: Extent = DEFAULT_EXTENT): PlanPoint {
	const hx = typeof extent === 'number' ? extent : extent.x;
	const hz = typeof extent === 'number' ? extent : extent.z;
	let px = clampRange(x, hx, plan.width - hx);
	let pz = clampRange(z, hz, plan.depth - hz);
	for (let pass = 0; pass < 4; pass++) {
		let moved = false;
		for (const wall of plan.walls) {
			const box =
				wall.axis === 'x' ? [wall.from, wall.to, wall.at - WALL_HALF, wall.at + WALL_HALF] : [wall.at - WALL_HALF, wall.at + WALL_HALF, wall.from, wall.to];
			const out = pushOut(px, pz, hx, hz, box[0], box[1], box[2], box[3]);
			if (!out) continue;
			px = out.x;
			pz = out.z;
			moved = true;
		}
		px = clampRange(px, hx, plan.width - hx);
		pz = clampRange(pz, hz, plan.depth - hz);
		if (!moved) break;
	}
	return { x: px, z: pz };
}
