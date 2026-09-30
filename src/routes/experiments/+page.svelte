<script lang="ts">
	import Arrow from '$lib/components/Arrow.svelte';
	import { experiments } from '$lib/experiments/catalog';
	import { reveal } from '$lib/motion/reveal';
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
		{#each experiments as experiment (experiment.slug)}
			{@const href = `/experiments/${experiment.slug}`}
			<article class="compact-entry featured-entry" use:reveal>
				<a class="compact-image experiment-thumbnail" {href} aria-label="Open {experiment.title}">
					<img src={experiment.image} alt={experiment.alt} width="240" height="240" loading="lazy" />
				</a>
				<div>
					<h3><a {href}>{experiment.title}</a></h3>
					<p>{experiment.summary}</p>
					<p class="entry-detail">{experiment.detail}</p>
					<div class="entry-bottom">
						<a class="text-link" {href}>Explore the experiment <span aria-hidden="true"><Arrow /></span></a>
						<span class="tech-note">{experiment.tech}</span>
					</div>
				</div>
			</article>
		{/each}
	</section>
</article>
