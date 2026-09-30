<script lang="ts">
	import Arrow from '$lib/components/Arrow.svelte';
	import { reveal } from '$lib/motion/reveal';
	const href = '/experiments/relativity';
</script>

<svelte:head>
	<title>Experiments — Kyle Nakamura</title>
	<meta name="description" content="Small interactive pages that explain one idea by letting you change it." />
</svelte:head>

<article class="experiments">
	<header class="page-intro">
		<h1>Experiments,<br /><span>to play with.</span></h1>
		<p class="page-lede">Small interactive pages that explain one idea by letting you change it. Drag, slide, and watch what happens.</p>
	</header>

	<section class="portfolio-work" aria-labelledby="experiments-heading">
		<div class="work-label"><h2 id="experiments-heading">All experiments</h2></div>
		<article class="compact-entry featured-entry" use:reveal>
			<a class="compact-image experiment-thumbnail" {href} aria-label="Open the relativity experiment">
				<img
					src="/images/experiments/relativity.svg"
					alt="Two light clocks. In one, a photon bounces straight up and down between two mirrors. In the other, which is moving, the photon takes a longer zigzag path."
					width="240"
					height="240"
					loading="lazy"
				/>
			</a>
			<div>
				<h3><a {href}>Relativity, in three dimensions</a></h3>
				<p>Time doesn’t tick at one rate for everyone. Start from a photon bouncing between two mirrors, then follow twins, muons, and the clocks in GPS satellites.</p>
				<p class="entry-detail">Six short chapters, each with a 3D scene you can rotate and controls that change the physics.</p>
				<div class="entry-bottom">
					<a class="text-link" {href}>Explore the experiment <span aria-hidden="true"><Arrow /></span></a>
					<span class="tech-note">Three.js · SvelteKit · TypeScript</span>
				</div>
			</div>
		</article>
	</section>
</article>
