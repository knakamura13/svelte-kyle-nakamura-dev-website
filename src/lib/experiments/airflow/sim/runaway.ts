import type { Diagnostics } from '../solver/types';

/**
 * Air faster than this, m/s, has run away. No room's air comes near it: a fan's jet is a few metres a second and the fastest outlet in the
 * catalog 7, and the stress sweeps' worst case (random setups down to 5 cm cells) reached 15. The robustness specs stop a case here too.
 */
export const RUNAWAY_SPEED = 40;

/** What went wrong with a run, in words for the status line and for a screen reader. */
export interface Runaway {
	/** `non-finite`: a number in the solver stopped being a number. `too-fast`: the air passed `RUNAWAY_SPEED`. */
	kind: 'non-finite' | 'too-fast';
	/** The fastest air the read found, m/s (NaN or infinite for `non-finite`). */
	speed: number;
}

/**
 * Whether a snapshot's diagnostics show a runaway, checked as each snapshot is read: a handful of comparisons on numbers the backend has
 * already summed over the whole grid. Every number is checked, not only the fastest air, because a GPU's `max` may pass over a NaN (IEEE's
 * maxNum returns the other operand) while the sums beside it (the divergence, the smoke's books) carry it.
 */
export function runawayOf(diagnostics: Diagnostics): Runaway | null {
	const { maxSpeed, divergence, cfl, mass } = diagnostics;
	const numbers = [maxSpeed, divergence, cfl, mass.initial, mass.emitted, mass.inflow, mass.outflow, mass.removed, mass.deposited, mass.inAir];
	if (numbers.some((value) => !Number.isFinite(value))) return { kind: 'non-finite', speed: maxSpeed };
	if (maxSpeed > RUNAWAY_SPEED) return { kind: 'too-fast', speed: maxSpeed };
	return null;
}

/** The status line's sentence for a runaway. */
export function runawayNote(runaway: Runaway): string {
	const what =
		runaway.kind === 'too-fast'
			? `The simulation ran away: its air reached ${Math.round(runaway.speed)} m/s, far faster than any room’s air`
			: 'The simulation broke down: its numbers stopped being numbers';
	return `${what}, so it has stopped and the air is hidden. Reset puts the home back the way it began.`;
}

/** What a screen reader is told, politely, once. */
export const RUNAWAY_ANNOUNCEMENT = 'The simulation ran away and has stopped. Reset puts the home back the way it began.';
