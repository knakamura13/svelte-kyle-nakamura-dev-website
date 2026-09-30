import type { SlotOptions } from '../engine/controller';
import type { Experience } from '../experience.svelte';

/** Registers a chapter's Stage with the engine for as long as the element is on the page. */
export function stage(node: HTMLElement, options: SlotOptions & { experience: Experience }) {
	const { experience, ...slot } = options;
	return { destroy: experience.register(node, slot) };
}

/** Space above a pinned figure (the site's sticky offset) plus a little air below it, px. */
const PIN_CLEARANCE = 108;

/**
 * Marks a figure `data-pin="false"` when it is too tall to stay pinned on this screen. A pinned figure
 * taller than the window would hide its own controls, so it scrolls with the text instead.
 */
export function pinWhenFits(figure: HTMLElement) {
	const check = () => {
		figure.dataset.pin = figure.offsetHeight + PIN_CLEARANCE <= window.innerHeight ? 'true' : 'false';
	};
	const observer = new ResizeObserver(check);
	observer.observe(figure);
	window.addEventListener('resize', check);
	check();
	return {
		destroy() {
			observer.disconnect();
			window.removeEventListener('resize', check);
		}
	};
}
