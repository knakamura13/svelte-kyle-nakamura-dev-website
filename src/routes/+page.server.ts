import { loadHomeProjects } from '$lib/server/github';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	return {
		// Stream so the LCP heading can paint while GitHub responds.
		projects: loadHomeProjects()
	};
};
