import { OPENING_LIMITS, type ExteriorPlacement, type Facade, type InteriorPlacement, type OpeningSpec, type Placement } from '../types';

/**
 * Doors and windows at the sizes a US builder uses, so every plan draws from the same catalog. Metres:
 * a 2′8″ interior door and a 3′0″ entry door, both 6′8″ tall; a 6′0″ sliding glass door; windows by kind.
 */

export const INTERIOR_DOOR = 0.81;
export const ENTRY_DOOR = 0.91;
const DOOR_HEIGHT = 2.03;

/** Frame size and the height of its bottom edge above the floor. */
interface Frame {
	width: number;
	height: number;
	sill: number;
}

/** A place on an outside wall; `center` runs along it (x on the north and south walls, z on the east and west). */
export const on = (facade: Facade, center: number): ExteriorPlacement => ({ facade, center });

/** A doorway in an interior wall: `axis: 'x'` is an east-west wall at z = `at`, `'z'` a north-south wall at x = `at`. */
export const through = (axis: 'x' | 'z', at: number, center: number): InteriorPlacement => ({ axis, at, center });

/** A swinging door. `anchor` is the latch end, which opens first; the hinge is at the other end. */
export function door(id: string, name: string, placement: Placement, anchor: 'start' | 'end', width = INTERIOR_DOOR): OpeningSpec {
	return { id, name, kind: 'door', placement, width, height: DOOR_HEIGHT, sill: 0, maxOpen: OPENING_LIMITS.door.maxOpen, anchor };
}

/** A 6′0″ sliding glass door: one panel slides behind the other, so half the frame opens, from the `anchor` end. */
export function slidingDoor(id: string, name: string, placement: ExteriorPlacement, anchor: 'start' | 'end'): OpeningSpec {
	return { id, name, kind: 'sliding-door', placement, width: 1.83, height: DOOR_HEIGHT, sill: 0, maxOpen: OPENING_LIMITS['sliding-door'].maxOpen, anchor };
}

/** A double-hung window: the bottom sash slides up behind the top one, so the lower half opens. */
export function doubleHung(id: string, name: string, placement: ExteriorPlacement, frame: Partial<Frame> = {}): OpeningSpec {
	return { id, name, kind: 'double-hung', placement, width: 0.9, height: 1.4, sill: 0.9, ...frame, maxOpen: OPENING_LIMITS['double-hung'].maxOpen, anchor: 'bottom' };
}

/** A casement (or an awning or hopper, anchored at the bottom or top): the sash swings out and passes `OPENING_LIMITS.casement.maxOpen` of its frame. */
export function casement(id: string, name: string, placement: ExteriorPlacement, anchor: OpeningSpec['anchor'], frame: Partial<Frame> = {}): OpeningSpec {
	return { id, name, kind: 'casement', placement, width: 0.6, height: 1.2, sill: 0.9, ...frame, maxOpen: OPENING_LIMITS.casement.maxOpen, anchor };
}

/** A small bathroom window, high enough for privacy. */
export const BATHROOM_WINDOW: Frame = { width: 0.6, height: 0.6, sill: 1.6 };
/** A window over a kitchen counter clears the 0.9 m worktop and its backsplash. */
export const OVER_COUNTER = 1.05;
