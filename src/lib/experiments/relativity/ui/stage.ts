import type { SlotOptions } from '../engine/controller';
import type { Experience } from '../experience.svelte';

/** Registers a chapter's Stage with the engine for as long as the element is on the page. */
export function stage(node: HTMLElement, options: SlotOptions & { experience: Experience }) {
	const { experience, ...slot } = options;
	return { destroy: experience.register(node, slot) };
}
