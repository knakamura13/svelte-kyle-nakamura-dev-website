<script lang="ts">
	import { onMount } from 'svelte';
	import Arrow from '$lib/components/Arrow.svelte';
	import { reveal } from '$lib/motion/reveal';
	import { chapters } from '$lib/experiments/relativity/chapters';
	import { provideExperience } from '$lib/experiments/relativity/experience.svelte';
	import Frames from '$lib/experiments/relativity/chapters/Frames.svelte';
	import Gravity from '$lib/experiments/relativity/chapters/Gravity.svelte';
	import LightSpeed from '$lib/experiments/relativity/chapters/LightSpeed.svelte';
	import LightClock from '$lib/experiments/relativity/chapters/LightClock.svelte';
	import Muons from '$lib/experiments/relativity/chapters/Muons.svelte';
	import Twins from '$lib/experiments/relativity/chapters/Twins.svelte';

	const experience = provideExperience();
	onMount(() => experience.start());
</script>

<svelte:head>
	<title>Relativity, in three dimensions — Kyle Nakamura</title>
	<meta
		name="description"
		content="An interactive 3D explanation of special relativity, time dilation, and gravity: light clocks, twins, muons, and bent spacetime."
	/>
	<!-- The controls only work with JavaScript, so without it the text and captions stand alone. -->
	<noscript><style>.chapter-figure .dock { display: none !important; }</style></noscript>
</svelte:head>

<article class="experiment relativity">
	<header class="page-intro">
		<a class="text-link page-back" href="/experiments"><span aria-hidden="true"><Arrow direction="left" /></span> All experiments</a>
		<h1>Relativity,<br /><span>in three dimensions.</span></h1>
		<p class="page-lede">
			Time doesn’t tick at one rate for everyone. Two clocks that start together can disagree after a journey, and neither is
			broken. This page builds that idea from a single thought experiment. Everything on it is live: change a number, drag to
			rotate, and watch what changes.
		</p>
		<div class="page-meta">
			<span>Three.js · SvelteKit · TypeScript</span>
		</div>
	</header>

	<nav aria-label="Chapters">
		<ol class="chapter-index">
			{#each chapters as chapter, index (chapter.id)}
				<li><a href="#{chapter.id}"><span>{index + 1}</span>{' '}{chapter.name}</a></li>
			{/each}
		</ol>
	</nav>

	<Frames />
	<LightSpeed />
	<LightClock />
	<Twins />
	<Muons />
	<Gravity />

	<section class="portfolio-background experiment-close" aria-labelledby="close-heading" use:reveal>
		<div><h2 id="close-heading">What to take<br />with you.</h2></div>
		<div class="background-copy">
			<ol class="takeaways">
				<li><strong>Light has one speed for everyone.</strong> Speeds don’t simply add, and nothing outruns light.</li>
				<li><strong>Moving clocks run slow, by γ.</strong> A photon’s longer zigzag is the whole argument.</li>
				<li>
					<strong>Time and distance are two views of one thing.</strong> The traveling twin ages less, and the muon crosses a
					squeezed atmosphere.
				</li>
				<li><strong>Gravity slows clocks too.</strong> GPS has to correct for both effects.</li>
			</ol>
			<h3>Sources</h3>
			<ul class="sources">
				<li>Einstein, “Zur Elektrodynamik bewegter Körper,” <i>Annalen der Physik</i> 17, 891 (1905).</li>
				<li>Alväger, Farley, Kjellman and Wallin, <i>Physics Letters</i> 12, 260 (1964): the speed of light from fast-moving sources.</li>
				<li>Frisch and Smith, <i>American Journal of Physics</i> 31, 342 (1963): muon decay at two altitudes.</li>
				<li>Hafele and Keating, <i>Science</i> 177, 166–170 (1972): atomic clocks flown around the world.</li>
				<li>
					Chou, Hume, Rosenband and Wineland, <i>Science</i> 329, 1630 (2010), as
					<a href="https://www.nist.gov/news-events/news/2010/09/nist-pair-aluminum-atomic-clocks-reveal-einsteins-relativity-personal-scale" target="_blank" rel="noopener noreferrer">reported by NIST</a>.
				</li>
				<li>
					Ashby, <a href="https://doi.org/10.12942/lrr-2003-1" target="_blank" rel="noopener noreferrer">Relativity in the Global Positioning System</a>, <i>Living Reviews in Relativity</i> 6 (2003).
				</li>
				<li>The muon lifetime and production height come from the <a href="https://pdg.lbl.gov/" target="_blank" rel="noopener noreferrer">Particle Data Group</a>.</li>
				<li>
					To go deeper, read <a href="https://www.feynmanlectures.caltech.edu/I_15.html" target="_blank" rel="noopener noreferrer">Feynman’s lectures on special relativity</a>, free online.
				</li>
			</ul>
			<p class="scale-note">The scenes are simplified: light is slowed to be watchable and distances are not to scale.</p>
		</div>
	</section>

	<div class="case-end">
		<a class="text-link" href="/experiments"><span aria-hidden="true"><Arrow direction="left" /></span> All experiments</a>
		<a class="text-link" href="/resume">Résumé <span aria-hidden="true"><Arrow /></span></a>
	</div>

	<p id="stage-help" class="sr-only">
		Each chapter has a 3D view. When it is focused, the arrow keys rotate it, plus and minus zoom, and zero resets it. Everything
		the view shows is also available as text and controls next to it.
	</p>
	<p class="sr-only" aria-live="polite">{experience.announcement}</p>
</article>
