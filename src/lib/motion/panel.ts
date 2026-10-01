import { quintOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

const IN_MS = 200;
const OUT_MS = 140;
const TRAVEL_PX = 6;

/**
 * Enter/leave for the nav disclosures. Svelte reverses a running transition from its current
 * progress, so rapid toggles stay smooth. Reduced motion is read on every call, which keeps a
 * mid-interaction preference change honest. `quintOut` approximates the shared `--ease` curve.
 */
export function panel(_node: Element, _params: unknown, options?: { direction: 'in' | 'out' | 'both' }): TransitionConfig {
	const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
	return {
		duration: reduced ? 0 : options?.direction === 'out' ? OUT_MS : IN_MS,
		easing: quintOut,
		css: (t, u) => `opacity:${t};transform:translateY(${-TRAVEL_PX * u}px)`
	};
}
