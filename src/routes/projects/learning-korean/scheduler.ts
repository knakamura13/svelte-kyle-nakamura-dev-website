/**
 * A small, pure port of the Learning Korean review scheduler, for the story's explorable.
 *
 * Source: knakamura13/learning-korean (MIT), app/src/lib/domain/srs.ts at commit e993c60,
 * lines 372-465 (`attemptSpeed`, `gradeFromAttempt`, `nextCard`) plus the constants they use.
 * Only the grading and next-card rules are copied. The deck, persistence, queue and accounts are not.
 * Updating the pinned rules later is an explicit content change: re-read the source, update these
 * constants and the fixtures in tests/scheduler.spec.ts together.
 */

const DAY_MS = 86_400_000;
const RELEARN_MS = 600_000;
const FAST_MS = 3500;
const STEADY_MS = 9000;
const EASE_FLOOR = 1.3;
const EASE_CEILING = 2.8;
const EASE_START = 2.5;
const MAX_INTERVAL_DAYS = 365;

export type Grade = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface CardState {
	ease: number;
	/** Interval in days. The source sets it to 0 after a lapse; the due time still says ten minutes. */
	ivl: number;
	reps: number;
	lapses: number;
	due: number;
}

export type Scenario = 'new' | 'established';

/** The two fixed card histories. Neither is mutated: every evaluation starts from the same baseline. */
export const scenarios: Record<Scenario, { label: string; explanation: string; history: Omit<CardState, 'due'> | undefined }> = {
	new: {
		label: 'New card',
		explanation: 'A card you have never seen: no history yet.',
		history: undefined
	},
	established: {
		label: 'Established review',
		explanation: 'A card you have reviewed three times without a lapse: ease 2.5, last interval 10 days.',
		history: { ease: 2.5, ivl: 10, reps: 3, lapses: 0 }
	}
};

/** A fixed injected clock, so the same inputs always produce the same due time. */
export const FIXED_NOW = 1_700_000_000_000;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function gradeFromAttempt(correct: boolean, ms: number, isNew: boolean): Grade {
	if (!correct) return 'Again';
	if (ms < FAST_MS) return isNew ? 'Good' : 'Easy';
	if (ms < STEADY_MS) return 'Good';
	return 'Hard';
}

function nextCard(prev: CardState | undefined, grade: Grade, now: number): CardState {
	const card: CardState = prev ?? { ease: EASE_START, ivl: 0, reps: 0, lapses: 0, due: 0 };

	if (grade === 'Again') {
		return {
			ease: clamp(card.ease - 0.2, EASE_FLOOR, EASE_CEILING),
			ivl: 0,
			reps: 0,
			lapses: card.lapses + 1,
			due: now + RELEARN_MS
		};
	}

	let ease = card.ease;
	let ivl: number;
	if (grade === 'Hard') {
		ease = clamp(ease - 0.15, EASE_FLOOR, EASE_CEILING);
		ivl = card.reps === 0 ? 1 : Math.max(1, card.ivl * 1.2);
	} else if (grade === 'Good') {
		ivl = card.reps === 0 ? 1 : card.reps === 1 ? 3 : card.ivl * ease;
	} else {
		ease = clamp(ease + 0.15, EASE_FLOOR, EASE_CEILING);
		ivl = card.reps === 0 ? 4 : card.ivl * ease * 1.3;
	}

	ivl = Math.min(MAX_INTERVAL_DAYS, Math.round(ivl * 10) / 10);
	return { ease, ivl, reps: card.reps + 1, lapses: card.lapses, due: now + ivl * DAY_MS };
}

export interface Outcome {
	grade: Grade;
	/** Time until the card is due again, derived from the due time rather than the interval field. */
	delayMs: number;
	/** Plain-language delay: "10 minutes", "1 day", "34.5 days". */
	delay: string;
}

export function describeDelay(delayMs: number): string {
	if (delayMs < DAY_MS) {
		const minutes = Math.round(delayMs / 60_000);
		return `${minutes} minute${minutes === 1 ? '' : 's'}`;
	}
	const days = Math.round((delayMs / DAY_MS) * 10) / 10;
	return `${days} day${days === 1 ? '' : 's'}`;
}

/** One attempt, evaluated from the scenario's baseline history at the fixed clock. */
export function evaluateAttempt(input: { correct: boolean; ms: number; scenario: Scenario; now?: number }): Outcome {
	const now = input.now ?? FIXED_NOW;
	const history = scenarios[input.scenario].history;
	const prev = history ? { ...history, due: now } : undefined;
	const grade = gradeFromAttempt(input.correct, input.ms, prev === undefined);
	const delayMs = nextCard(prev, grade, now).due - now;
	return { grade, delayMs, delay: describeDelay(delayMs) };
}
