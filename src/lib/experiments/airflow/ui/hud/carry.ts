import type { DragPreview } from '../../scene/selection';
import { TURN_STEP } from './catalog';

/**
 * Carrying a device into the Home, as The Sims' Build mode does: a card dragged out of the catalog, or one clicked and then carried by
 * the pointer until a click puts it down. R turns it, Escape or a right click puts it back. The decisions are plain numbers here, so Node
 * tests them; the HUD's window listeners call them with the pointer's position, and the store says where the device would land.
 */

/** A press that moves less than this, px, is a click: on a card it picks the device up, in the world it puts it down. The scene's slop. */
export const CLICK_SLOP = 7;

export const isClick = (from: { x: number; y: number }, to: { x: number; y: number }, slop = CLICK_SLOP) => Math.hypot(to.x - from.x, to.y - from.y) <= slop;

/** Into [0, 360), whole degrees. */
const wrap = (degrees: number) => ((Math.round(degrees) % 360) + 360) % 360;

/**
 * The bearing a carried device faces after one press of R (clockwise) or Shift+R (anticlockwise). `set` is the bearing the visitor
 * already turned it to, or null while it still faces the middle of the home, in which case the turn starts from where the ghost faces
 * now (`shown`), so the first press turns what the visitor sees by one step and does not jump.
 */
export function turnCarried(set: number | null, shown: number | null | undefined, direction: 1 | -1, step = TURN_STEP): number {
	const from = set ?? shown ?? 0;
	return wrap(from + direction * step);
}

export type CarryTone = 'ok' | 'refused' | 'away';

export interface CarryHint {
	tone: CarryTone;
	/** The first line: what happens on a click or a release. */
	title: string;
	/** The second line: the reason it cannot go there, or the keys. */
	detail: string;
}

/**
 * What the chip by the pointer says while a device is carried: that a click (or letting go, for a drag) puts it down, why it cannot go
 * where it is, or that it has to come into a room first.
 */
export function carryHint(drag: Pick<DragPreview, 'ok' | 'reason'> | null, held: boolean, moving: boolean): CarryHint {
	if (!drag) return { tone: 'away', title: moving ? 'Move it into a room' : 'Bring it into a room', detail: held ? 'Let go over the home to put it down.' : 'Escape or a right click puts it back.' };
	if (!drag.ok) return { tone: 'refused', title: 'It can’t go here', detail: drag.reason ?? '' };
	return { tone: 'ok', title: held ? 'Let go to put it here' : 'Click to put it here', detail: 'R turns it · Esc puts it back' };
}
