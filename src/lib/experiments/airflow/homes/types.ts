/**
 * A home plan is validated data: rectangles and segments in metres, with no editor. Plans are drawn with north
 * up: x runs east from the west wall, z runs south from the north wall, y runs up from the floor. Everything a plan
 * says is axis-aligned, so the solver's box is the footprint exactly.
 */

/** Plan widths and depths are multiples of this, so the box has a whole number of cells at every grid size the auto-tuner uses (0.05, 0.075, 0.1, 0.15, 0.2, 0.3 m). */
export const PLAN_MODULE = 0.6;
export const CEILING = 2.4;

export type PlanId = 'studio' | 'one-bedroom' | 'two-bedroom' | 'house';

export interface Rect {
	x: number;
	z: number;
	w: number;
	d: number;
}

/** A named part of the plan, for room averages and air changes per hour. The rects may be several for an L-shaped room. Rooms tile the footprint. */
export interface Room {
	id: string;
	name: string;
	rects: Rect[];
}

/**
 * An interior partition, floor to ceiling. It runs east-west (`axis: 'x'`, at constant z) or north-south
 * (`axis: 'z'`, at constant x); `at` is its centre line. The solver sees it as a layer of blocked cell faces
 * on the nearest grid plane, not as cells, so a 10 cm wall costs no resolution.
 */
export interface Wall {
	axis: 'x' | 'z';
	at: number;
	from: number;
	to: number;
}

export type Facade = 'north' | 'east' | 'south' | 'west';

/** A door or window in one of the four outside walls. `center` is along the wall: x for north and south, z for east and west. */
export interface ExteriorPlacement {
	facade: Facade;
	center: number;
}

/** A doorway in an interior wall: the wall's axis and centre line, and the opening's centre along it. */
export interface InteriorPlacement {
	axis: 'x' | 'z';
	at: number;
	center: number;
}

export type Placement = ExteriorPlacement | InteriorPlacement;

export const isExterior = (placement: Placement): placement is ExteriorPlacement => 'facade' in placement;

/** What can be opened. The kind sets how much of the frame can open at most and how the opening grows. */
export type OpeningKind = 'door' | 'sliding-door' | 'double-hung' | 'casement';

/**
 * How much of its frame each kind opens at most. A double-hung window or a sliding glass door opens about half, because two
 * panels share the frame and one of them is fixed. A swinging door opens all of it. A casement window opens 0.8: a single sash
 * passes 78 to 80 % of its frame with the sash perpendicular to the window, the sash and its frame staying in the opening
 * (one vendor bulletin, measured on Australian aluminium windows: docs/research/airflow/openings-and-wind.md, section 3c).
 * The plan validator holds every opening to its kind's limit.
 */
export const OPENING_LIMITS: Record<OpeningKind, { maxOpen: number }> = {
	door: { maxOpen: 1 },
	'sliding-door': { maxOpen: 0.5 },
	'double-hung': { maxOpen: 0.5 },
	casement: { maxOpen: 0.8 }
};

export interface OpeningSpec {
	id: string;
	name: string;
	kind: OpeningKind;
	placement: Placement;
	/** Frame size, m, and the height of its bottom edge above the floor. */
	width: number;
	height: number;
	sill: number;
	/** Largest fraction of the frame's area that can be open. */
	maxOpen: number;
	/** Where the open part starts as the opening opens: the start or end of the frame along the wall (west or north end first, east or south end first), or its bottom or top. */
	anchor: 'start' | 'end' | 'bottom' | 'top';
	/** How far open it starts, 0 to 1 of its travel. */
	open?: number;
}

/** A solid obstacle, an axis-aligned box. `y` is its underside above the floor (0 if it stands on the floor). */
export interface Furniture {
	id: string;
	name: string;
	x: number;
	z: number;
	w: number;
	d: number;
	h: number;
	y?: number;
}

export interface HomePlan {
	id: PlanId;
	name: string;
	/** A line on what the home is, for the plan picker. */
	blurb: string;
	/** Interior size of the footprint, m, and ceiling height. */
	width: number;
	depth: number;
	ceiling: number;
	rooms: Room[];
	walls: Wall[];
	openings: OpeningSpec[];
	furniture: Furniture[];
}

/** Square feet, for the plan picker and the tests. */
export const squareFeet = (plan: Pick<HomePlan, 'width' | 'depth'>) => (plan.width * plan.depth) / 0.09290304;
