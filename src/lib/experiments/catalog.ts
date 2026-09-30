/**
 * Every experiment, newest first. The /experiments page shows exactly these, and tests/experiments.spec.ts
 * checks that each one has a page and that no page is missing from here.
 *
 * To add an experiment: create src/routes/experiments/<slug>/+page.svelte, put a square thumbnail in
 * static/images/experiments/, and add an entry below.
 */
export interface Experiment {
	/** The route segment. The experiment lives at /experiments/<slug>. */
	slug: string;
	title: string;
	/** One or two sentences on the idea it explains. */
	summary: string;
	/** One line on how it is laid out, such as its chapters or controls. */
	detail: string;
	/** Square thumbnail, as a path under static/. */
	image: string;
	/** What the thumbnail shows, for anyone who cannot see it. */
	alt: string;
	/** The main technologies, shown small beside the link. */
	tech: string;
}

export const experiments: Experiment[] = [
	{
		slug: 'relativity',
		title: 'Relativity, in three dimensions',
		summary:
			'Time doesn’t tick at one rate for everyone. Start from a photon bouncing between two mirrors, then follow twins, muons, and the clocks in GPS satellites.',
		detail: 'Six short chapters, each with a 3D scene you can rotate and controls that change the physics.',
		image: '/images/experiments/relativity.svg',
		alt: 'Two light clocks. In one, a photon bounces straight up and down between two mirrors. In the other, which is moving, the photon takes a longer zigzag path.',
		tech: 'Three.js · SvelteKit · TypeScript'
	}
];
