import type { Furniture, HomePlan } from '../homes/types';
import { clampToHome, snapToWindow } from '../scene/deviceMath';
import { deviceDefaults, freeWindows, nextId } from './placement';
import { MAX_DEVICES, type DeviceState } from '../state';
import type { DeviceModel } from './types';

/**
 * Where a device may stand, and why it may not. Dragging a device from the tray or along the floor, and moving it with the keys, ask
 * `placeAt`, which answers with a place or a reason in words. Plain geometry in the solver's metres (x east, z south, y up), so it runs
 * in Node and the scene only draws what it says.
 *
 * A fan or purifier stands on the floor or on a low piece of furniture (a table, a counter, a bed), clear of the walls, of the furniture
 * beside it and of the other devices; a pedestal fan stands on the floor only; a window fan goes in a window and nowhere else.
 */

/** The highest furniture top a freestanding device may stand on, m: a counter or a table, not a wardrobe or a refrigerator. */
export const MAX_SURFACE = 1.0;
/** How far from a window, along its wall, a window fan being dragged still looks for it, m, and how far from the window itself the pointer may be for the fan to snap into it. */
export const WINDOW_REACH = 1.2;
export const SEAT_REACH = 1.7;
/** How far the pointer's point may be from the nearest legal spot on the floor and still take it, m: beyond that the point is inside a wall. */
export const SNAP = 0.45;
/** The gap kept between two devices, between a device and furniture, m. */
const GAP = 0.04;

export interface Placement {
	/** Where its base stands: x east and z south, and y the height of what it stands on (0 for the floor). */
	x: number;
	z: number;
	y: number;
	surface: 'floor' | 'furniture' | 'sill';
	/** The furniture it stands on. */
	on?: string;
	/** A window fan: the window it sits in, which way it faces, and that it draws air in (as a new one does). */
	opening?: string;
	yaw?: number;
	intake?: boolean;
}

export type Placed = { ok: true; placement: Placement } | { ok: false; reason: string };

/** The radius of the circle a device's base takes on the floor, m: a pedestal's base, or half the longer side of a box. */
export function footprintRadius(model: DeviceModel): number {
	if (model.kind === 'pedestal-fan') return 0.22;
	return Math.max(model.body.width, model.body.depth) / 2;
}

const label = (model: DeviceModel) => (model.kind === 'air-purifier' ? 'purifier' : model.kind === 'pedestal-fan' ? 'pedestal fan' : model.kind === 'window-fan' ? 'window fan' : 'box fan');

/** Whether a circle at (x, z) of radius r overlaps a furniture footprint, which is an axis-aligned box. */
function overlaps(f: Furniture, x: number, z: number, r: number) {
	const nearX = Math.max(f.x, Math.min(x, f.x + f.w));
	const nearZ = Math.max(f.z, Math.min(z, f.z + f.d));
	return Math.hypot(x - nearX, z - nearZ) < r + GAP;
}

/** The furniture whose footprint holds the point, taller than nothing: the nearest to the point when two meet. */
function furnitureAt(plan: HomePlan, x: number, z: number): Furniture | null {
	let found: Furniture | null = null;
	for (const f of plan.furniture) if (x >= f.x && x <= f.x + f.w && z >= f.z && z <= f.z + f.d && (!found || f.h < found.h)) found = f;
	return found;
}

/**
 * Where a device of `model` dragged to the plan point (x, z) ends up, or why it cannot go there. `devices` are the ones in the
 * home, and `models` says what each is; pass the device being moved in `ignore` so it does not collide with itself.
 */
export function placeAt(plan: HomePlan, model: DeviceModel, x: number, z: number, devices: readonly DeviceState[], models: ReadonlyMap<string, DeviceModel>, ignore?: string): Placed {
	const others = devices.filter((d) => d.id !== ignore);
	const outside = (px: number, pz: number) => px < 0 || pz < 0 || px > plan.width || pz > plan.depth;
	const radiusOf = (d: DeviceState) => {
		const other = models.get(d.model);
		return other ? footprintRadius(other) : 0.25;
	};

	if (model.kind === 'window-fan') {
		const seat = snapToWindow(plan, x, z, others, WINDOW_REACH);
		// Near the window itself: a point far from the wall that happens to be level with a window is not a drop into it.
		if (seat && Math.hypot(seat.x - x, seat.z - z) <= SEAT_REACH) return { ok: true, placement: { x: seat.x, z: seat.z, y: seat.y, surface: 'sill', opening: seat.opening, yaw: seat.yaw, intake: true } };
		if (!freeWindows(plan, others).length) return { ok: false, reason: 'Every window that can hold a fan already has one.' };
		return { ok: false, reason: 'A window fan goes in a window. Drag it close to a window that has no fan.' };
	}

	if (outside(x, z)) return { ok: false, reason: 'That is outside the home.' };
	const r = footprintRadius(model);

	// On a piece of furniture: a low top the device fits on. A pedestal fan stands on the floor only.
	const piece = furnitureAt(plan, x, z);
	if (piece) {
		if (model.kind === 'pedestal-fan') return { ok: false, reason: `A pedestal fan stands on the floor, not on the ${piece.name.toLowerCase()}.` };
		const top = (piece.y ?? 0) + piece.h;
		if (top > MAX_SURFACE) return { ok: false, reason: `The ${piece.name.toLowerCase()} is too tall to put a ${label(model)} on.` };
		if (Math.min(piece.w, piece.d) < 2 * r - 1e-9) return { ok: false, reason: `The ${piece.name.toLowerCase()} is too small to hold a ${label(model)}.` };
		const px = Math.max(piece.x + r, Math.min(piece.x + piece.w - r, x));
		const pz = Math.max(piece.z + r, Math.min(piece.z + piece.d - r, z));
		const crowded = others.find((d) => d.y > 0 && Math.hypot(d.x - px, d.z - pz) < r + radiusOf(d) + GAP);
		if (crowded) return { ok: false, reason: 'That is too close to another device.' };
		return { ok: true, placement: { x: px, z: pz, y: top, surface: 'furniture', on: piece.id } };
	}

	// On the floor: the nearest spot clear of the outside and inside walls, if it is near enough to where the pointer is.
	const spot = clampToHome(plan, x, z, r);
	if (Math.hypot(spot.x - x, spot.z - z) > SNAP) return { ok: false, reason: 'That spot is in a wall.' };
	const taken = plan.furniture.find((f) => (f.y ?? 0) < 1.2 && overlaps(f, spot.x, spot.z, r));
	if (taken) return { ok: false, reason: `That spot is taken by the ${taken.name.toLowerCase()}.` };
	const near = others.find((d) => d.y === 0 && !d.opening && Math.hypot(d.x - spot.x, d.z - spot.z) < r + radiusOf(d) + GAP);
	if (near) return { ok: false, reason: 'That is too close to another device.' };
	return { ok: true, placement: { x: spot.x, z: spot.z, y: 0, surface: 'floor' } };
}

/**
 * A new device of `model` at a place `placeAt` allowed, or the reason it cannot be added: the home holds at most `MAX_DEVICES`. It
 * starts facing the middle of the home, so what it blows goes into the rooms; a window fan faces into the home from its window.
 */
export function deviceAt(plan: HomePlan, model: DeviceModel, placement: Placement, devices: readonly DeviceState[]): { device: DeviceState } | { reason: string } {
	if (devices.length >= MAX_DEVICES) return { reason: `A home holds at most ${MAX_DEVICES} fans and purifiers. Remove one to add another.` };
	const towardMiddle = (((Math.atan2(plan.width / 2 - placement.x, -(plan.depth / 2 - placement.z)) * 180) / Math.PI) + 360) % 360;
	return {
		device: {
			...deviceDefaults(model),
			id: nextId(devices),
			x: placement.x,
			z: placement.z,
			y: placement.y,
			yaw: placement.yaw ?? towardMiddle,
			...(placement.opening ? { opening: placement.opening, intake: placement.intake ?? true } : {})
		}
	};
}
