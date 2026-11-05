import { expect, test } from '@playwright/test';
import { LOAD_STAGES, advance, loadProgress, openingMode, visitMemory } from '../../src/lib/experiments/airflow/load';

/**
 * The first few seconds of a visit, the part the engine and the page share (load.ts): the loading screen's one bar, how the world
 * opens, and what the visit remembers, with storage that works, that is switched off, and that refuses to be written.
 */

const none = { fetch: 0, compile: 0, 'warm-up': 0 } as const;

/** A session storage that keeps what it is given, as the browser's does. */
function memoryStorage(): Storage {
	const items = new Map<string, string>();
	return {
		get length() {
			return items.size;
		},
		clear: () => items.clear(),
		getItem: (key) => items.get(key) ?? null,
		key: (n) => [...items.keys()][n] ?? null,
		removeItem: (key) => void items.delete(key),
		setItem: (key, value) => void items.set(key, String(value))
	};
}

test.describe('the loading screen and the first seconds', () => {
	test('the stages fill one bar between them, in order: fetching, compiling, measuring', () => {
		expect(LOAD_STAGES.map((stage) => stage.id)).toEqual(['fetch', 'compile', 'warm-up']);
		expect(LOAD_STAGES.reduce((sum, stage) => sum + stage.weight, 0)).toBeCloseTo(1, 12);
		expect(loadProgress(none)).toBe(0);
		expect(loadProgress({ fetch: 1, compile: 1, 'warm-up': 1 })).toBe(1);
		expect(loadProgress({ fetch: 1, compile: 0.5, 'warm-up': 0 })).toBeCloseTo(LOAD_STAGES[0].weight + 0.5 * LOAD_STAGES[1].weight, 12);
		for (const stage of LOAD_STAGES) expect(stage.label.length, stage.id).toBeGreaterThan(0);
	});

	test('a stage’s report finishes the stages before it, and the bar never goes back', () => {
		const warming = advance(none, 'warm-up', 0.25);
		expect(warming).toEqual({ fetch: 1, compile: 1, 'warm-up': 0.25 });
		expect(advance(warming, 'warm-up', 0.1)['warm-up'], 'a smaller share later is not a step back').toBe(0.25);
		expect(advance(warming, 'compile', 0.2).compile, 'nor is an earlier stage reported again').toBe(1);
		expect(advance(none, 'fetch', 7).fetch, 'a share is at most all of a stage').toBe(1);
		expect(advance(none, 'fetch', -1).fetch).toBe(0);
	});

	test('a share link opens on its setup, a reload of a visit that saw the opening opens where it ended, and anything else plays it', () => {
		expect(openingMode({ shared: false, played: false, reducedMotion: false })).toBe('play');
		expect(openingMode({ shared: false, played: true, reducedMotion: false })).toBe('end');
		expect(openingMode({ shared: false, played: false, reducedMotion: true }), 'no drift for a visitor who prefers less motion').toBe('end');
		expect(openingMode({ shared: true, played: false, reducedMotion: false })).toBe('none');
		expect(openingMode({ shared: true, played: true, reducedMotion: true })).toBe('none');
	});

	test('the visit remembers the opening and the hint in session storage, so a reload keeps them and a new visit does not', () => {
		const storage = memoryStorage();
		const visit = visitMemory(() => storage);
		expect(visit.openingPlayed()).toBe(false);
		expect(visit.hintGone()).toBe(false);
		visit.rememberOpening();
		expect(visit.openingPlayed()).toBe(true);
		expect(visit.hintGone(), 'one does not stand for the other').toBe(false);
		visit.rememberHintGone();
		const reloaded = visitMemory(() => storage);
		expect(reloaded.openingPlayed()).toBe(true);
		expect(reloaded.hintGone()).toBe(true);
		const another = visitMemory(() => memoryStorage());
		expect(another.openingPlayed()).toBe(false);
		expect(another.hintGone()).toBe(false);
	});

	test('a browser with no storage, or one that throws when it is touched, is a visit that remembers nothing, and nothing breaks', () => {
		for (const storage of [
			() => null,
			() => undefined,
			() => {
				throw new DOMException('The operation is insecure.', 'SecurityError');
			},
			() => ({
				...memoryStorage(),
				getItem: () => {
					throw new DOMException('denied', 'SecurityError');
				},
				setItem: () => {
					throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
				}
			})
		]) {
			const visit = visitMemory(storage as () => Storage | null);
			expect(() => visit.rememberOpening()).not.toThrow();
			expect(() => visit.rememberHintGone()).not.toThrow();
			expect(visit.openingPlayed(), 'so the opening plays').toBe(false);
			expect(visit.hintGone(), 'and the hint shows').toBe(false);
		}
	});
});
