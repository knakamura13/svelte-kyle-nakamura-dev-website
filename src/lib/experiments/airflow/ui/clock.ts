import type { RunStatus } from '../readouts';

/** A backend that gets this share of the speed the clock asks for, or more, is keeping up: the rate it measures wobbles a little. */
export const KEEPING_UP = 0.85;

/**
 * "Running at 0.6× real time." when the simulation runs slower than the clock asks (the processor cannot keep up with 20×), and
 * nothing when it keeps up, is paused or is not running at all. The page's status line and the Dock's clock both say it, in these
 * words. `rate` is the simulated seconds that go by per real second right now; `speed` is what the clock asks for.
 */
export function shortfall(status: RunStatus, rate: number | null, speed: number): string {
	if (status !== 'running' || rate === null || rate >= KEEPING_UP * speed) return '';
	return rate < 0.1 ? 'Running at under 0.1× real time.' : `Running at ${rate.toFixed(1)}× real time.`;
}
