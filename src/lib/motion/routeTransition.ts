import type { OnNavigate } from '@sveltejs/kit';

/** Routes that take part with each other. The homepage only pairs with the Learning Korean story. */
const eligible = new Set(['/projects/learning-korean', '/resume', '/send-money']);
const STORY = '/projects/learning-korean';

/**
 * Home to the story, and the story back to `/` or `/#work`. Any position on the home page may be the
 * starting point. Other home journeys and same-page hash links stay ordinary navigation.
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

const SHARED = 'korean-project';

function onScreen(el: Element): boolean {
	const box = el.getBoundingClientRect();
	return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
}

/** The compact thumbnail or the story figure, when it is already decoded and in view. Never the Project Stack copy. */
function readyImage(pathname: string): HTMLImageElement | null {
	const selector = pathname === '/' ? '#korean .korean-thumbnail img' : pathname === STORY ? '.case-figure img' : '';
	const img = selector ? document.querySelector(selector) : null;
	if (!(img instanceof HTMLImageElement) || !img.complete || img.naturalWidth <= 0 || !onScreen(img)) return null;
	return img;
}

function clearSharedNames() {
	for (const img of document.images) if (img.style.viewTransitionName === SHARED) img.style.viewTransitionName = '';
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
 * releases the navigation and clears only this navigation's temporary state. A Back or Forward
 * that arrives while the gate is still held does not release it: doing so would paint the page
 * being left. That popstate renders the restored page, and the temporary state is cleared.
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
		// Set when Back/Forward arrives before this link navigation has committed. Releasing the gate
		// after that commits the page being left (SvelteKit updates the DOM before it notices the
		// popstate invalidated the navigation). The popstate navigation renders the restored page.
		let dropped = false;
		let viewTransition: ViewTransition | undefined;
		const safety = setTimeout(() => {
			if (!dropped) release();
		}, GATE_TIMEOUT_MS);
		const restore = () => {
			clearTimeout(safety);
			window.removeEventListener('popstate', onPop, true);
			if (id !== current) return;
			delete root.dataset.routeTransition;
			delete root.dataset.routeIdentity;
			delete root.dataset.sharedImage;
			clearSharedNames();
			root.style.scrollBehavior = savedScrollBehavior ?? '';
			savedScrollBehavior = null;
		};
		const onPop = () => {
			dropped = true;
			viewTransition?.skipTransition();
			restore();
		};
		const cleanup = () => {
			if (!dropped) release();
			restore();
		};
		window.addEventListener('popstate', onPop, true);
		try {
			root.dataset.routeTransition = '';
			// Hold the identity still only if the reader can see it; otherwise it fades with the screen.
			const identity = document.querySelector('.identity')?.getBoundingClientRect();
			if (identity && identity.bottom > 0 && identity.top < innerHeight) root.dataset.routeIdentity = '';
			// Smooth scrolling would animate SvelteKit's scroll reset inside the snapshot.
			root.style.scrollBehavior = 'auto';
			const from = navigation.from?.url;
			const to = navigation.to?.url;
			const pair = !!from && !!to && isHomeStoryPair(from, to);
			// Name the source before the old snapshot. The destination is named only after scroll restoration,
			// and only when that image is also ready; otherwise the crossfade stays a plain one.
			const source = pair ? readyImage(from.pathname) : null;
			if (source) source.style.viewTransitionName = SHARED;
			viewTransition = document.startViewTransition(async () => {
				if (dropped) return;
				clearTimeout(safety);
				release();
				// A superseded navigation may never complete; stop waiting so the next transition can run.
				try {
					await Promise.race([navigation.complete, stopWaiting]);
				} finally {
					if (dropped || id !== current) clearSharedNames();
				}
				if (dropped || id !== current || !source || !to) return;
				const destination = readyImage(to.pathname);
				if (!destination) {
					clearSharedNames();
					return;
				}
				destination.style.viewTransitionName = SHARED;
				root.dataset.sharedImage = '';
			});
			if (dropped) viewTransition.skipTransition();
			// A skipped transition rejects `ready`; make sure the route still renders.
			viewTransition.ready.catch(() => {
				if (!dropped) release();
			});
			viewTransition.updateCallbackDone.catch(() => {});
			viewTransition.finished.then(cleanup, cleanup);
			const reduce = matchMedia('(prefers-reduced-motion: reduce)');
			const skip = () => viewTransition?.skipTransition();
			const unlisten = () => reduce.removeEventListener('change', skip);
			reduce.addEventListener('change', skip, { once: true });
			// `finished` rejects when the navigation fails; handle both outcomes so nothing goes unhandled.
			viewTransition.finished.then(unlisten, unlisten);
		} catch {
			cleanup();
		}
	});
}
