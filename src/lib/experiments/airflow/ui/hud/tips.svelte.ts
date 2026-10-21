/**
 * The HUD's tooltips: one shared bubble, shown after a short hover or at once on keyboard focus, beside the control it names. Each
 * control keeps its own accessible name; the bubble repeats it for the eye with a hint and the key that does the same thing, so it is
 * hidden from screen readers. Escape, a press or leaving the control puts it away.
 */

export type TipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TipContent {
	label: string;
	/** A second line: what the control does. */
	hint?: string;
	/** The key that does the same, shown as a key cap. */
	keys?: string;
	/** Which side of the control the bubble goes, where there is room. */
	side?: TipSide;
}

class TipState {
	content: TipContent | null = $state(null);
	rect: { left: number; top: number; right: number; bottom: number; width: number; height: number } | null = $state(null);
	owner: HTMLElement | null = null;
}

export const tip = new TipState();

/** How long the pointer rests on a control before its tooltip shows, ms; focus from the keyboard shows it sooner. */
const HOVER_DELAY = 420;
const FOCUS_DELAY = 150;

export function tooltip(node: HTMLElement, content: TipContent) {
	let current = content;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const show = (delay: number) => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (!node.isConnected) return;
			const box = node.getBoundingClientRect();
			tip.owner = node;
			tip.rect = { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
			tip.content = current;
		}, delay);
	};
	const hide = () => {
		clearTimeout(timer);
		if (tip.owner !== node) return;
		tip.owner = null;
		tip.content = null;
	};
	const enter = (event: PointerEvent) => {
		if (event.pointerType === 'mouse') show(HOVER_DELAY);
	};
	const focus = () => {
		if (node.matches(':focus-visible')) show(FOCUS_DELAY);
	};
	const key = (event: KeyboardEvent) => {
		if (event.key === 'Escape' && tip.owner === node) hide();
	};
	node.addEventListener('pointerenter', enter);
	node.addEventListener('pointerleave', hide);
	node.addEventListener('pointerdown', hide);
	node.addEventListener('focus', focus);
	node.addEventListener('blur', hide);
	node.addEventListener('keydown', key);
	return {
		update(next: TipContent) {
			current = next;
			if (tip.owner === node) tip.content = next;
		},
		destroy() {
			hide();
			node.removeEventListener('pointerenter', enter);
			node.removeEventListener('pointerleave', hide);
			node.removeEventListener('pointerdown', hide);
			node.removeEventListener('focus', focus);
			node.removeEventListener('blur', hide);
			node.removeEventListener('keydown', key);
		}
	};
}
