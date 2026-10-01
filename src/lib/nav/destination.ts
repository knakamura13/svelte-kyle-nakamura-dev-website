export type Destination = 'work' | 'about' | 'resume';

const workHashes = new Set(['#work', '#korean', '#mlrose', '#oc-foods']);

/**
 * Which capsule link the current location rests on. The story page counts as Work (its parent
 * category); bare `/`, utility pages, unknown routes and unknown hashes rest on nothing.
 */
export function destinationFor(url: { pathname: string; hash: string }): Destination | null {
	if (url.pathname === '/resume') return 'resume';
	if (url.pathname === '/projects/learning-korean') return 'work';
	if (url.pathname !== '/') return null;
	if (url.hash === '#about') return 'about';
	return workHashes.has(url.hash) ? 'work' : null;
}
