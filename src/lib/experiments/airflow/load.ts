/**
 * The first few seconds of a visit, the part the engine and the page share: the loading screen's stages, how the engine reports on
 * them, how the world opens, and what the visit remembers. Plain TypeScript, so the engine (which knows nothing of Svelte) and Node
 * tests can use it; `loading.svelte.ts` is the page's reactive side.
 */

/** What the loading screen waits for, in order: the code and the CC0 assets, the shaders, and the warm-up that measures the device and picks the grid. */
export type LoadStage = 'fetch' | 'compile' | 'warm-up';

/** Each stage's words on the loading screen and the share of the bar it fills, from what each takes on a first visit (shaders take most of it). */
export const LOAD_STAGES: readonly { id: LoadStage; label: string; weight: number }[] = [
	{ id: 'fetch', label: 'Fetching the home', weight: 0.35 },
	{ id: 'compile', label: 'Compiling shaders', weight: 0.4 },
	{ id: 'warm-up', label: 'Measuring this device', weight: 0.25 }
];

/**
 * How the world opens once it is on screen. `play`: the camera drifts from the default view toward the living room (the first time in a
 * visit). `end`: the camera is where the drift ends, with no drift (a reload in the same visit, or a visitor who prefers reduced
 * motion). `none`: the default view, as for a share link, which opens straight onto its setup.
 */
export type OpeningMode = 'play' | 'end' | 'none';

/** What the engine tells the page as it loads, and asks of it. The loader reports the fetch; the Stage reports the rest. */
export interface LoadHooks {
	/** How far `stage` has got, 0 to 1. A stage's report also finishes every stage before it. */
	report(stage: LoadStage, share: number): void;
	/** The world is on screen and can be used: the loading screen goes. */
	revealed(): void;
	/** The world could not load (the engine failed, or the browser has no WebGL): the loading screen goes, and the Stage's note shows. */
	failed(): void;
	/** How the world should open, asked as the warm-up begins. */
	opening(): OpeningMode;
}

/** The bar's fill, 0 to 1: every stage's share times its weight. */
export function loadProgress(shares: Readonly<Record<LoadStage, number>>): number {
	let filled = 0;
	for (const stage of LOAD_STAGES) filled += stage.weight * Math.min(1, Math.max(0, shares[stage.id]));
	return Math.min(1, filled);
}

/** Shares with `stage` at `share` and every stage before it full; never less than they were, so the bar does not go back. */
export function advance(shares: Readonly<Record<LoadStage, number>>, stage: LoadStage, share: number): Record<LoadStage, number> {
	const next = { ...shares };
	const at = LOAD_STAGES.findIndex((s) => s.id === stage);
	LOAD_STAGES.forEach((s, n) => {
		if (n < at) next[s.id] = 1;
		else if (n === at) next[s.id] = Math.max(next[s.id], Math.min(1, Math.max(0, share)));
	});
	return next;
}

/**
 * What the visit remembers, in the browser's session storage (one tab's visit, which a reload keeps): whether the opening has played,
 * and whether the hint has gone. Storage that is switched off or full is no visit memory at all, so the page works without it: the
 * opening plays and the hint shows, as on a first visit.
 */
export interface VisitMemory {
	openingPlayed(): boolean;
	rememberOpening(): void;
	hintGone(): boolean;
	rememberHintGone(): void;
}

const KEYS = { opening: 'airflow:opening-played', hint: 'airflow:hint-gone' } as const;

export function visitMemory(storage: () => Storage | null | undefined = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage)): VisitMemory {
	const read = (key: string) => {
		try {
			return storage()?.getItem(key) === '1';
		} catch {
			return false;
		}
	};
	const write = (key: string) => {
		try {
			storage()?.setItem(key, '1');
		} catch {
			// No storage, or none to spare: the visit just remembers nothing.
		}
	};
	return {
		openingPlayed: () => read(KEYS.opening),
		rememberOpening: () => write(KEYS.opening),
		hintGone: () => read(KEYS.hint),
		rememberHintGone: () => write(KEYS.hint)
	};
}

/** How a visit that arrives at the page opens: a share link opens on its setup, a reload of a visit that has seen the opening at its end, anything else with the drift. */
export function openingMode(options: { shared: boolean; played: boolean; reducedMotion: boolean }): OpeningMode {
	if (options.shared) return 'none';
	if (options.played || options.reducedMotion) return 'end';
	return 'play';
}
