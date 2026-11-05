/**
 * Where a context menu's card goes beside the thing it belongs to: to its right if there is room, else to its left, else above or
 * below it, and always inside the part of the window the HUD's bars and panels leave free (`safe`). Pixels, screen y down. Plain
 * numbers, so Node tests every side and every clamp.
 */

export interface Size {
	width: number;
	height: number;
}

/** Space kept free at each edge of the window, px: the rail, the bars and the panels. */
export interface Insets {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

export type CardSide = 'right' | 'left' | 'above' | 'below' | 'free';

export interface CardPlacement {
	left: number;
	top: number;
	side: CardSide;
	/** Where the anchor is on the card's edge, from the card's top-left corner, for the little pointer that joins them; null with no anchor. */
	notch: { x: number; y: number } | null;
}

/** How far the card stands off the anchor, px, and how far the pointer keeps from the card's corners. */
export const GAP = 18;
const CORNER = 18;

const clamp = (value: number, min: number, max: number) => (max < min ? min : Math.min(max, Math.max(min, value)));

/**
 * The card's place for an anchor at screen point `anchor` (null when the thing is off screen or behind the camera: the card then
 * waits at the top right of the free space).
 */
export function placeCard(anchor: { x: number; y: number } | null, card: Size, viewport: Size, safe: Insets, gap = GAP): CardPlacement {
	const minLeft = safe.left;
	const maxLeft = viewport.width - safe.right - card.width;
	const minTop = safe.top;
	const maxTop = viewport.height - safe.bottom - card.height;
	if (!anchor) return { left: clamp(maxLeft, minLeft, maxLeft), top: clamp(minTop, minTop, maxTop), side: 'free', notch: null };

	let side: CardSide;
	let left: number;
	let top: number;
	if (anchor.x + gap + card.width <= viewport.width - safe.right) {
		side = 'right';
		left = Math.max(anchor.x + gap, minLeft);
		top = clamp(anchor.y - card.height / 2, minTop, maxTop);
	} else if (anchor.x - gap - card.width >= safe.left) {
		side = 'left';
		left = Math.min(anchor.x - gap - card.width, maxLeft);
		top = clamp(anchor.y - card.height / 2, minTop, maxTop);
	} else {
		left = clamp(anchor.x - card.width / 2, minLeft, maxLeft);
		if (anchor.y - gap - card.height >= safe.top) {
			side = 'above';
			top = anchor.y - gap - card.height;
		} else {
			side = 'below';
			top = clamp(anchor.y + gap, minTop, maxTop);
		}
	}

	const notch =
		side === 'right'
			? { x: 0, y: clamp(anchor.y - top, CORNER, card.height - CORNER) }
			: side === 'left'
				? { x: card.width, y: clamp(anchor.y - top, CORNER, card.height - CORNER) }
				: side === 'above'
					? { x: clamp(anchor.x - left, CORNER, card.width - CORNER), y: card.height }
					: { x: clamp(anchor.x - left, CORNER, card.width - CORNER), y: 0 };
	return { left, top, side, notch };
}
