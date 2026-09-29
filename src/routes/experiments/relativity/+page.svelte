<script lang="ts">
	import { onMount } from 'svelte';
	import Arrow from '$lib/components/Arrow.svelte';
	import { provideExperience } from '$lib/experiments/relativity/experience.svelte';
	import Frames from '$lib/experiments/relativity/chapters/Frames.svelte';
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

	<Frames />
	<LightSpeed />
	<LightClock />
	<Twins />
	<Muons />

	<p id="stage-help" class="sr-only">
		Each chapter has a 3D view. When it is focused, the arrow keys rotate it, plus and minus zoom, and zero resets it. Everything
		the view shows is also available as text and controls next to it.
	</p>
	<p class="sr-only" aria-live="polite">{experience.announcement}</p>
</article>
