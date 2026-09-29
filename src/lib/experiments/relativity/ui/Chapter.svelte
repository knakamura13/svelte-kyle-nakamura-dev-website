<script lang="ts">
	import type { Snippet } from 'svelte';
	import { reveal } from '$lib/motion/reveal';
	import type { SceneId } from '../scenes';
	import { useExperience } from '../experience.svelte';
	import type { Tint } from '../palette';
	import { stage } from './stage';

	let {
		id,
		number,
		name,
		tint,
		scene,
		params,
		readout,
		label,
		caption,
		dockHeight = 300,
		heading,
		lede,
		dock,
		body
	}: {
		id: string;
		number: number;
		/** Short name, used in the chapter index and the kicker. */
		name: string;
		tint: Tint;
		scene: SceneId;
		/** Written by the Dock, read by the scene. */
		params: object;
		/** Written by the scene, read by the Dock. */
		readout: object;
		/** What the 3D view shows, for people who can't see it. */
		label: string;
		caption: string;
		/** Rough height of the Dock in px, so the Stage can leave room for it on short screens. */
		dockHeight?: number;
		heading: Snippet;
		lede: Snippet;
		dock: Snippet;
		body: Snippet;
	} = $props();

	const experience = useExperience();

	// Any change the Dock makes to the scene's params is drawn on the next frame.
	$effect(() => {
		$state.snapshot(params);
		experience.wake();
	});
</script>

<section {id} class="chapter" aria-labelledby="{id}-title" style:--tint="var(--{tint})" style:--dock="{dockHeight}px">
	<header class="chapter-head" use:reveal>
		<p class="chapter-kicker"><span>{number}</span>{name}</p>
		<h2 id="{id}-title">{@render heading()}</h2>
		<div class="chapter-lede">{@render lede()}</div>
	</header>

	<figure class="chapter-figure" data-stage-region>
		<!-- The view is operated with the arrow keys (see the controller). `application` tells screen readers to pass keys through; Svelte only counts widget roles as interactive. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="stage-view"
			role="application"
			aria-roledescription="3D view"
			tabindex="0"
			aria-label={label}
			aria-describedby="stage-help"
			data-state="pending"
			use:stage={{ experience, scene, params, readout }}
		>
			<div class="stage-labels" aria-hidden="true"></div>
			<p class="stage-note" data-when="loading">Loading the 3D view…</p>
			<p class="stage-note" data-when="unsupported">
				This browser can’t show 3D graphics, so the scene is switched off. The controls and numbers below still work.
			</p>
			<p class="stage-note" data-when="error">The 3D view couldn’t load. The controls and numbers below still work.</p>
			<noscript><p class="stage-note stage-note-static">The 3D view needs JavaScript.</p></noscript>
		</div>
		<div class="dock">{@render dock()}</div>
		<figcaption>{caption}</figcaption>
	</figure>

	<div class="chapter-body" use:reveal>{@render body()}</div>
</section>
