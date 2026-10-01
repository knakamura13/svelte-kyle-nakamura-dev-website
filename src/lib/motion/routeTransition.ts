import type { OnNavigate } from '@sveltejs/kit';

/** Routes that take part with each other. */
const eligible = new Set(['/projects/learning-korean', '/resume', '/send-money']);
const STORY = '/projects/learning-korean';

/**
 * The homepage takes part only with the Learning Korean story: home to the story, and the story back
 * to `/` or `/#work`. Any position on the home page or the story may be the starting point; other
 * home journeys and same-page hash links stay ordinary navigation.
 */
function isHomeStoryPair(from: URL, to: URL): boolean {
	if (from.pathname === '/' && to.pathname === STORY) return !to.hash;
	if (from.pathname === STORY && to.pathname === '/') return to.hash === '' || to.hash === '#work';
	return false;
}

export function isEligible(from: URL | undefined, to: URL | undefined): boolean {
	if (!from || !to || from.origin !== to.origin || from.pathname === to.pathname) return false;
	if (isHomeStoryPair(from, to)) return true;
	if (from.hash || to.hash) return false;
	return eligible.has(from.pathname) && eligible.has(to.pathname);
}

let current = 0;
// The page's own inline scroll-behavior, saved by the first of any overlapping transitions so a
// later one never "restores" the temporary value an earlier one set.
let savedScrollBehavior: string | null = null;
// Lets a newer transition stop an older one from waiting on a navigation that was superseded.
let supersede: (() => void) | null = null;
// If the browser never runs the update callback, the route still renders after this long.
const GATE_TIMEOUT_MS = 500;

/**
 * Progressive same-document View Transition for eligible client-side route changes. The route
 * renders as soon as the browser has captured the old state; the animation never holds input.
 * Every path (unsupported, reduced motion, a thrown or rejected transition, a superseded one)
 * releases the navigation and clears only this navigation's temporary state.
 */
export function routeTransition(navigation: OnNavigate): Promise<void> | void {
	if (typeof document.startViewTransition !== 'function') return;
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	if (navigation.willUnload || !isEligible(navigation.from?.url, navigation.to?.url)) return;
	// Back/forward is never gated. SvelteKit ignores a popstate whose history index matches the one it
	// is still navigating from, so holding a Back for even a frame lets a quick Forward be dropped and
	// leaves the URL and the page out of step (reproduced in WebKit and Chromium).
	if (navigation.type === 'popstate') return;

	const root = document.documentElement;
	const id = ++current;
	savedScrollBehavior ??= root.style.scrollBehavior;

	supersede?.();
	const stopWaiting = new Promise<void>((resolve) => (supersede = resolve));

	return new Promise<void>((release) => {
		const safety = setTimeout(release, GATE_TIMEOUT_MS);
		const cleanup = () => {
			clearTimeout(safety);
			release();
			if (id !== current) return;
			delete root.dataset.routeTransition;
			delete root.dataset.routeIdentity;
			root.style.scrollBehavior = savedScrollBehavior ?? '';
			savedScrollBehavior = null;
		};
		try {
			root.dataset.routeTransition = '';
			// Hold the identity still only if the reader can see it; otherwise it fades with the screen.
			const identity = document.querySelector('.identity')?.getBoundingClientRect();
			if (identity && identity.bottom > 0 && identity.top < innerHeight) root.dataset.routeIdentity = '';
			// Smooth scrolling would animate SvelteKit's scroll reset inside the snapshot.
			root.style.scrollBehavior = 'auto';
			const transition = document.startViewTransition(async () => {
				clearTimeout(safety);
				release();
				// A superseded navigation may never complete; stop waiting so the next transition can run.
				await Promise.race([navigation.complete, stopWaiting]);
			});
			// A skipped transition rejects `ready`; make sure the route still renders.
			transition.ready.catch(release);
			transition.updateCallbackDone.catch(() => {});
			transition.finished.then(cleanup, cleanup);
			const reduce = matchMedia('(prefers-reduced-motion: reduce)');
			const skip = () => transition.skipTransition();
			const unlisten = () => reduce.removeEventListener('change', skip);
			reduce.addEventListener('change', skip, { once: true });
			// `finished` rejects when the navigation fails; handle both outcomes so nothing goes unhandled.
			transition.finished.then(unlisten, unlisten);
		} catch {
			cleanup();
		}
	});
}
