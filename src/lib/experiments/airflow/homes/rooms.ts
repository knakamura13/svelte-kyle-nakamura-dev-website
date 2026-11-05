import { isExterior, type HomePlan, type OpeningSpec, type Room } from './types';

/**
 * Which Room each Opening of a Home belongs to, for a list of Openings grouped by Room. Plain data in, plain data out, so a
 * Node test can hold every plan to it.
 *
 * - A door or window in an outside wall belongs to the Room behind it: the one that holds the point just inside its facade.
 * - A doorway in an interior wall has a Room on each side. It is listed under one of them, and says "to" the other. It is
 *   listed under the Room its name starts with (the Bedroom 1 door under Bedroom 1, which is the Room it opens into), and
 *   when the name settles nothing, under whichever of the two comes first in the plan.
 */

/** How far from a wall, m, the point is that says which Room lies behind it: clear of the wall, inside the Room. */
const INSET = 0.05;

/** The Room that holds a point of the plan (x east, z south, m), or undefined for a point outside every Room. */
export function roomAt(plan: Pick<HomePlan, 'rooms'>, x: number, z: number): Room | undefined {
	return plan.rooms.find((room) => room.rects.some((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d));
}

/** Where an Opening is listed, and for a doorway the Room on its other side. */
export interface OpeningRooms {
	room: Room;
	/** The Room a doorway in an interior wall leads to from `room`; null for a door or window to the outside. */
	to: Room | null;
}

/** Whether an Opening's name starts with a Room's name: "Bedroom 1 door" starts with "Bedroom 1". */
const named = (opening: OpeningSpec, room: Room) => opening.name.toLowerCase().startsWith(room.name.toLowerCase());

/** The Rooms an Opening serves, and which one it is listed under. A plan the validator accepts has a Room behind every Opening; the first Room of the plan stands in for a plan that does not. */
export function roomsOfOpening(plan: HomePlan, opening: OpeningSpec): OpeningRooms {
	const fallback = plan.rooms[0];
	const { placement } = opening;
	if (isExterior(placement)) {
		const { facade, center } = placement;
		const [x, z] = facade === 'north' ? [center, INSET] : facade === 'south' ? [center, plan.depth - INSET] : facade === 'west' ? [INSET, center] : [plan.width - INSET, center];
		return { room: roomAt(plan, x, z) ?? fallback, to: null };
	}
	const { axis, at, center } = placement;
	// An east-west wall (axis x) lies at constant z, so its sides are north and south of it; a north-south wall's are west and east.
	const [a, b] = axis === 'x' ? [roomAt(plan, center, at - INSET), roomAt(plan, center, at + INSET)] : [roomAt(plan, at - INSET, center), roomAt(plan, at + INSET, center)];
	if (!a || !b || a === b) return { room: a ?? b ?? fallback, to: null };
	// Both names can match when one Room's name begins the other's ("Bedroom", "Bedroom 1"): the longer is the closer match.
	const claims = [a, b].filter((room) => named(opening, room)).sort((p, q) => q.name.length - p.name.length);
	const first = claims[0] ?? (plan.rooms.indexOf(a) < plan.rooms.indexOf(b) ? a : b);
	return { room: first, to: first === a ? b : a };
}

export interface RoomOpening {
	opening: OpeningSpec;
	/** The Room a doorway leads to, for its label ("Bedroom 1 door, to Hall"); null for a door or window to the outside. */
	to: Room | null;
}

export interface RoomOpenings {
	room: Room;
	openings: RoomOpening[];
}

/**
 * Every Opening of a plan under the Room it is listed under: Rooms in the plan's order, Openings in the order the plan gives
 * them, and no entry for a Room with no Opening of its own. Each Opening is listed exactly once.
 */
export function openingsByRoom(plan: HomePlan): RoomOpenings[] {
	const groups = plan.rooms.map((room): RoomOpenings => ({ room, openings: [] }));
	for (const opening of plan.openings) {
		const { room, to } = roomsOfOpening(plan, opening);
		groups.find((group) => group.room === room)?.openings.push({ opening, to });
	}
	return groups.filter((group) => group.openings.length > 0);
}
