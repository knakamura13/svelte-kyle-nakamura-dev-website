import { getContext, setContext } from 'svelte';
import { LOAD_STAGES, advance, loadProgress, visitMemory, type LoadHooks, type LoadStage, type OpeningMode, type VisitMemory } from './load';

/**
 * The page's side of the first few seconds (load.ts has the rest): where the load has got, for the loading screen, and whether the
 * world is on screen yet, for the HUD and the hint. The engine reports into it through `LoadHooks`.
 */
export class AirflowLoading implements LoadHooks {
	shares: Record<LoadStage, number> = $state({ fetch: 0, compile: 0, 'warm-up': 0 });
	/** The stage under way. */
	stage: LoadStage = $state('fetch');
	/** `loading` until the world is on screen; `revealed` from then; `failed` when it could not load (the Stage then says why). */
	phase: 'loading' | 'revealed' | 'failed' = $state('loading');
	/** How the world opened, once it has. */
	mode: OpeningMode | null = $state(null);
	readonly visit: VisitMemory;

	/** `decide` says how the world should open; it is asked once, as the warm-up begins. */
	constructor(
		private readonly decide: () => OpeningMode,
		visit: VisitMemory = visitMemory()
	) {
		this.visit = visit;
	}

	/** The bar's fill, 0 to 1. */
	get progress() {
		return loadProgress(this.shares);
	}

	/** The words for the stage under way. */
	get label() {
		return LOAD_STAGES.find((s) => s.id === this.stage)?.label ?? '';
	}

	report(stage: LoadStage, share: number) {
		if (this.phase !== 'loading') return;
		const next = advance(this.shares, stage, share);
		if (LOAD_STAGES.some((s) => next[s.id] !== this.shares[s.id])) this.shares = next;
		if (stage !== this.stage) this.stage = stage;
	}

	revealed() {
		if (this.phase !== 'loading') return;
		this.shares = { fetch: 1, compile: 1, 'warm-up': 1 };
		this.phase = 'revealed';
		// The opening plays once a visit: a reload from here on opens where it ends.
		if (this.mode === 'play') this.visit.rememberOpening();
	}

	failed() {
		if (this.phase === 'loading') this.phase = 'failed';
	}

	opening() {
		this.mode ??= this.decide();
		return this.mode;
	}
}

const key = Symbol('airflow-loading');
export const provideAirflowLoading = (loading: AirflowLoading) => setContext(key, loading);
export const useAirflowLoading = () => getContext<AirflowLoading | undefined>(key);
