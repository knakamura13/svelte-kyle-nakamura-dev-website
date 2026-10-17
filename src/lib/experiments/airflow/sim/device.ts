import { CELL_SIZES } from './tuner';

/**
 * What the page knows about the device that the auto-tuner does not measure its way to: whether it is a phone or a small tablet,
 * which is never measured, and a cell size that the address asks for. Both are plain functions of what the browser reports, so a
 * test can hand them made-up facts.
 */

/** The shortest side, in CSS px, up to which a touch device is a phone or a small tablet. iPads up to the tenth generation are 820 wide. */
export const SMALL_SIDE = 820;

export interface ScreenFacts {
	/** The primary pointer is a finger (`(pointer: coarse)`), not a mouse or a trackpad. */
	coarsePointer: boolean;
	/** The screen's size, CSS px. */
	width: number;
	height: number;
}

/**
 * A phone or a small tablet: a touch screen whose short side is at most `SMALL_SIDE`. The short side, so a phone held sideways counts.
 * A laptop with a touch screen has a mouse or a trackpad as its primary pointer, and a narrow window on a desktop is not a small screen.
 */
export const isSmallDevice = ({ coarsePointer, width, height }: ScreenFacts) => coarsePointer && Math.min(width, height) <= SMALL_SIDE;

/** This browser's device, asked once. False where there is no browser to ask (the server's render). */
export function detectSmallDevice(): boolean {
	if (typeof matchMedia !== 'function' || typeof screen === 'undefined') return false;
	return isSmallDevice({ coarsePointer: matchMedia('(pointer: coarse)').matches, width: screen.width, height: screen.height });
}

/**
 * The cell size that `?cell=0.15` in the address asks for, or undefined when there is none or it is not one of the sizes the
 * simulation runs at. It is for QA, for tests and for looking at a grid: the tuner is bypassed and every Home runs at exactly that.
 */
export function cellFromSearch(search: string): number | undefined {
	const asked = Number(new URLSearchParams(search).get('cell'));
	return CELL_SIZES.find((h) => Math.abs(h - asked) < 1e-9);
}
