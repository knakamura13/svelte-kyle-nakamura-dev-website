import { isExterior, type ExteriorPlacement, type HomePlan, type OpeningSpec } from '../homes/types';
import { MAX_DEVICES, type DeviceState } from '../state';
import type { DeviceModel } from './types';

/** Distance a freestanding device keeps from walls, furniture and other devices when it is first placed, m. */
const CLEARANCE = 0.35;
const APART = 0.9;

/** The compass bearing that points from a facade into the room: a north window faces out to the north, so air coming in travels south. */
const INWARD: Record<ExteriorPlacement['facade'], number> = { north: 180, east: 270, south: 0, west: 90 };

const distanceToSegment = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
	const dx = bx - ax;
	const dz = bz - az;
	const t = dx === 0 && dz === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
	return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};

/** Whether a floor point is clear of walls, furniture and the outside wall by `clearance`. */
export function isFree(plan: HomePlan, x: number, z: number, clearance = CLEARANCE) {
	if (x < clearance || z < clearance || x > plan.width - clearance || z > plan.depth - clearance) return false;
	for (const wall of plan.walls) {
		const [ax, az, bx, bz] = wall.axis === 'x' ? [wall.from, wall.at, wall.to, wall.at] : [wall.at, wall.from, wall.at, wall.to];
		if (distanceToSegment(x, z, ax, az, bx, bz) < clearance) return false;
	}
	return !plan.furniture.some((f) => x > f.x - clearance && x < f.x + f.w + clearance && z > f.z - clearance && z < f.z + f.d + clearance);
}

/** Exterior windows a window fan can sit in (a swing door or sliding door cannot hold one), in plan order. */
export function windowsForFans(plan: HomePlan): OpeningSpec[] {
	return plan.openings.filter((o) => isExterior(o.placement) && (o.kind === 'double-hung' || o.kind === 'casement'));
}

/** The windows with no fan in them yet. */
export function freeWindows(plan: HomePlan, devices: readonly DeviceState[]) {
	const taken = new Set(devices.map((d) => d.opening).filter(Boolean));
	return windowsForFans(plan).filter((o) => !taken.has(o.id));
}

let counter = 0;
const nextId = (devices: readonly DeviceState[]) => {
	const used = new Set(devices.map((d) => d.id));
	let id: string;
	do id = `d${++counter}`;
	while (used.has(id));
	return id;
};

/**
 * A new device with sensible defaults, or a reason it cannot be added. Freestanding ones go to the free floor spot
 * nearest the middle of the largest room, aimed down that room's long axis; a window fan goes into the first window
 * without one and draws air in.
 */
export function newDevice(plan: HomePlan, model: DeviceModel, devices: readonly DeviceState[]): { device: DeviceState } | { reason: string } {
	if (devices.length >= MAX_DEVICES) return { reason: `A home holds at most ${MAX_DEVICES} fans and purifiers.` };
	const base: Omit<DeviceState, 'id' | 'x' | 'z' | 'yaw'> = {
		model: model.id,
		y: 0,
		tilt: 0,
		power: 2 / 3,
		height: model.kind === 'pedestal-fan' && model.heightRange ? (model.heightRange[0] + model.heightRange[1]) / 2 : 0,
		oscillation: { on: false, sweep: Math.min(90, model.kind === 'pedestal-fan' ? (model.maxSweep ?? 90) : 90), period: 8 }
	};

	if (model.kind === 'window-fan') {
		const window = freeWindows(plan, devices)[0];
		if (!window) return { reason: 'Every window that can hold a fan already has one.' };
		const placement = window.placement as ExteriorPlacement;
		const alongX = placement.facade === 'north' || placement.facade === 'south';
		const x = alongX ? placement.center : placement.facade === 'west' ? 0 : plan.width;
		const z = alongX ? (placement.facade === 'north' ? 0 : plan.depth) : placement.center;
		return { device: { ...base, id: nextId(devices), x, z, y: window.sill, yaw: INWARD[placement.facade], opening: window.id, intake: true } };
	}

	const rooms = [...plan.rooms].sort((a, b) => b.rects.reduce((s, r) => s + r.w * r.d, 0) - a.rects.reduce((s, r) => s + r.w * r.d, 0));
	const widest = rooms[0].rects.reduce((best, r) => (r.w * r.d > best.w * best.d ? r : best));
	const centre = { x: widest.x + widest.w / 2, z: widest.z + widest.d / 2 };
	const candidates: { x: number; z: number; score: number }[] = [];
	for (let x = 0.5; x < plan.width; x += 0.25)
		for (let z = 0.5; z < plan.depth; z += 0.25) {
			if (!isFree(plan, x, z)) continue;
			if (devices.some((d) => Math.hypot(d.x - x, d.z - z) < APART)) continue;
			candidates.push({ x, z, score: Math.hypot(x - centre.x, z - centre.z) });
		}
	if (!candidates.length) return { reason: 'There is no free floor left to put it on.' };
	const best = candidates.reduce((a, b) => (b.score < a.score ? b : a));
	// Aim down the long axis of the room, toward the farther end.
	const alongX = widest.w >= widest.d;
	const yaw = alongX ? (best.x < centre.x ? 90 : 270) : best.z < centre.z ? 180 : 0;
	return { device: { ...base, id: nextId(devices), x: best.x, z: best.z, yaw } };
}
