import { isExterior, type HomePlan } from '../../homes/types';
import type { UnitSystem } from '../../state';
import { formatArea } from '../../units';

/**
 * The Home picker's cards: a little floor plan of each Home drawn from its plan (the Rooms tinted, the walls, the doors and windows as
 * gaps of light), and the lines under it. Plain data in plan metres (x east, z south), so Node tests it and the card only draws it.
 */

/** The Rooms' tints, the soft colours the walls are painted in the 3D world, in plan order. */
export const ROOM_TINTS = ['#e1e9d9', '#f4e9d8', '#dde7ee', '#f1dfcd', '#e6ddf0', '#f5e1bb', '#f0e3cf'] as const;

export interface PlanRoom {
	id: string;
	name: string;
	/** An SVG path of the Room's rectangles, in metres. */
	d: string;
	tint: string;
}

export interface PlanLine {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface PlanThumbnail {
	/** "-0.3 -0.3 8.4 6" : the footprint with `pad` metres round it. */
	viewBox: string;
	rooms: PlanRoom[];
	/** The outside walls as one closed outline, and the inside walls, centre lines. */
	outline: string;
	walls: PlanLine[];
	/** Each door and window as a short line along its wall, drawn over the wall in the card's light colour. */
	openings: (PlanLine & { window: boolean })[];
}

const n = (value: number) => Number(value.toFixed(3));

export function planThumbnail(plan: HomePlan, pad = 0.35): PlanThumbnail {
	const rooms = plan.rooms.map((room, i) => ({
		id: room.id,
		name: room.name,
		d: room.rects.map((r) => `M${n(r.x)} ${n(r.z)}h${n(r.w)}v${n(r.d)}h${n(-r.w)}z`).join(''),
		tint: ROOM_TINTS[i % ROOM_TINTS.length]
	}));
	const walls = plan.walls.map((wall) => (wall.axis === 'x' ? { x1: wall.from, y1: wall.at, x2: wall.to, y2: wall.at } : { x1: wall.at, y1: wall.from, x2: wall.at, y2: wall.to }));
	const openings = plan.openings.map((opening) => {
		const { placement } = opening;
		const half = opening.width / 2;
		const window = opening.kind === 'double-hung' || opening.kind === 'casement';
		if (isExterior(placement)) {
			const along = placement.facade === 'north' || placement.facade === 'south';
			const at = placement.facade === 'north' ? 0 : placement.facade === 'south' ? plan.depth : placement.facade === 'west' ? 0 : plan.width;
			return along ? { x1: placement.center - half, y1: at, x2: placement.center + half, y2: at, window } : { x1: at, y1: placement.center - half, x2: at, y2: placement.center + half, window };
		}
		return placement.axis === 'x'
			? { x1: placement.center - half, y1: placement.at, x2: placement.center + half, y2: placement.at, window }
			: { x1: placement.at, y1: placement.center - half, x2: placement.at, y2: placement.center + half, window };
	});
	return {
		viewBox: `${-pad} ${-pad} ${n(plan.width + 2 * pad)} ${n(plan.depth + 2 * pad)}`,
		rooms,
		outline: `M0 0H${n(plan.width)}V${n(plan.depth)}H0Z`,
		walls,
		openings
	};
}

export interface HomeCard {
	name: string;
	blurb: string;
	/** "54 m²" or "581 sq ft", the floor area in the visitor’s units. */
	area: string;
	/** "3 rooms · 9 windows and doors". */
	facts: string;
}

export function homeCard(plan: HomePlan, units: UnitSystem): HomeCard {
	const windows = plan.openings.filter((o) => o.kind === 'double-hung' || o.kind === 'casement').length;
	const doors = plan.openings.length - windows;
	const rooms = plan.rooms.length;
	return {
		name: plan.name,
		blurb: plan.blurb,
		area: formatArea(plan.width * plan.depth, units, { digits: 0 }).text,
		facts: `${rooms} ${rooms === 1 ? 'room' : 'rooms'} · ${windows} ${windows === 1 ? 'window' : 'windows'} · ${doors} ${doors === 1 ? 'door' : 'doors'}`
	};
}
