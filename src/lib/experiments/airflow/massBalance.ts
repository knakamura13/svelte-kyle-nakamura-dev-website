import type { MassBalance } from './solver/types';
import { UNIT_SPACE } from './units';

/**
 * Does the smoke add up? The solver counts every milligram of PM2.5 that enters the Home (what was in the air when the run began,
 * what the visitor released, what outdoor air carried in) and every milligram that leaves the books (what is in the air now,
 * what went out through Openings, what purifiers removed, what settled or stuck to a surface). At every moment
 * initial + emitted + inflow = inAir + outflow + removed + deposited (`MassBalance` in solver/types.ts). This file is the one
 * place that says how far apart the two sides may be: the Physics panel's verdict and the tests that check each backend read it.
 */

/**
 * How far apart the two sides may be, as a share of the smoke that has come in: 0.1 %.
 *
 * Why this number. Measured through `World` on the page's own Studio run (tests/solver/massBalanceScenario.ts: smoke in the air at the
 * start, smoke carried in by a west wind and out through three Openings, a release at a point, a purifier, deposition, then the Openings
 * shut), the worst the books were out at any of 900 snapshots was 8e-8 on the CPU solver behind the worker (0.2 m cells; 4e-7 in the
 * page's own thread at 0.15 m) and 3.5e-5 and 4.5e-5 on the WebGPU solver (0.15 m and 0.1 m cells). So the tolerance is 20 times what the
 * GPU does, which leaves room for other graphics chips and drivers, and 8 times smaller than the smallest term of the books in that run
 * (deposition, 0.8 % of what came in), so a term that is counted wrong by an eighth is seen. Taking out the tally of deposition, on
 * either backend, fails both tests within 20 simulated seconds.
 *
 * What it is not: rounding-free. Every field is stored in 32 bits, and a deposit that takes 1e-5 of a cell's smoke in one substep is
 * rounded to the nearest 6e-8 of it before it is stored, so the field keeps or loses up to about 1 % of each deposit that the tally
 * counts exactly (probable cause, moderate confidence; tests/gpu/massbalance.gpu.ts says what would falsify it). In a sealed, still Home
 * whose only loss is deposition, the GPU's books reach 0.14 % after 30 simulated minutes at 0.3 m cells, one step a frame, so a run of
 * that kind that is long enough reads as out of balance when nothing is wrong beyond rounding. The tests do not loosen this number to
 * hide that: it is a known gap, recorded as a `test.fixme` there.
 */
export const MASS_BALANCE_TOLERANCE = 1e-3;

/** Mass that has come into the Home since the run began, mg. */
export const massGained = (mass: MassBalance) => mass.initial + mass.emitted + mass.inflow;

/** Mass that is accounted for, mg: in the air, carried out, cleaned or settled. */
export const massAccounted = (mass: MassBalance) => mass.inAir + mass.outflow + mass.removed + mass.deposited;

/**
 * |gained − accounted| / gained: how much of the smoke that came in the books cannot place. Null while nothing has come in, because
 * there is nothing to balance. A total that is not a number is as far from balancing as it can be, so it reads Infinity.
 */
export function massBalanceError(mass: MassBalance): number | null {
	const terms = [mass.initial, mass.emitted, mass.inflow, mass.inAir, mass.outflow, mass.removed, mass.deposited];
	if (!terms.every(Number.isFinite)) return Infinity;
	const gained = massGained(mass);
	if (!(gained > 0)) return null;
	return Math.abs(gained - massAccounted(mass)) / gained;
}

/** `waiting`: no smoke has come in, so there is nothing to balance. `balanced`: the two sides agree to within the tolerance. `off`: they do not. */
export type BalanceState = 'waiting' | 'balanced' | 'off';

export interface BalanceVerdict {
	state: BalanceState;
	/** |gained − accounted| / gained, or null while there is nothing to balance. */
	error: number | null;
	/** One sentence for the panel. */
	text: string;
}

const percentFormat = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2, maximumFractionDigits: 20 });

/** The smallest error the panel prints as a number, a millionth of the smoke: below it the books are as good as the 32-bit fields can keep them. */
const FLOOR = 1e-6;

/** A fraction as a percentage to two significant digits, "0.019 %", and "< 0.0001 %" for what is below `FLOOR`. */
export function formatErrorPercent(error: number): string {
	if (!Number.isFinite(error)) return '—';
	if (error < FLOOR) return `<${UNIT_SPACE}0.0001${UNIT_SPACE}%`;
	return `${percentFormat.format(error * 100)}${UNIT_SPACE}%`;
}

/**
 * What to say to a screen reader when the books change state, or null to say nothing. Only a change that matters is said: going out of
 * balance, and coming back. The panel starting to have something to balance (`waiting` to `balanced`), and starting over (back to
 * `waiting`), are not, and nor is a verdict that stays as it is while its number moves.
 */
export function balanceAnnouncement(before: BalanceState, after: BalanceVerdict): string | null {
	if (after.state === before) return null;
	if (after.state === 'off') {
		return after.error !== null && Number.isFinite(after.error)
			? `The smoke books are out by ${formatErrorPercent(after.error)}, more than the solver is held to. The Physics panel has the numbers.`
			: 'The smoke totals are not numbers any more. The Physics panel has them.';
	}
	return after.state === 'balanced' && before === 'off' ? 'The smoke books balance again.' : null;
}

/**
 * Where the books stand, for the Physics panel. `mass` is what the solver last reported, or null before its first step; `previous` is
 * the state the panel was in, which gives it some memory: once it has gone `off`, it comes back to `balanced` only when the error is
 * under half the tolerance, so a figure that sits on the line does not flip the verdict and its announcement back and forth.
 */
export function balanceVerdict(mass: MassBalance | null, previous: BalanceState = 'waiting', tolerance = MASS_BALANCE_TOLERANCE): BalanceVerdict {
	const error = mass ? massBalanceError(mass) : null;
	if (error === null) return { state: 'waiting', error: null, text: 'No smoke yet, so there is nothing to balance.' };
	if (!Number.isFinite(error)) return { state: 'off', error, text: 'The smoke totals are not numbers any more, so the books cannot balance.' };
	const state: BalanceState = error > tolerance || (previous === 'off' && error > tolerance / 2) ? 'off' : 'balanced';
	if (state === 'balanced') return { state, error, text: error < FLOOR ? `The books balance to better than 0.0001${UNIT_SPACE}%.` : `The books balance to ${formatErrorPercent(error)}.` };
	return { state, error, text: `The books are out by ${formatErrorPercent(error)}, more than the ${formatErrorPercent(tolerance)} the solver is held to.` };
}
