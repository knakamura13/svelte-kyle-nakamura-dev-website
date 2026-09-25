<script lang="ts">
	import Arrow from '$lib/components/Arrow.svelte';
	import { page } from '$app/state';

	const missing = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{missing ? 'Page not found' : 'Something went wrong'} — Kyle Nakamura</title>
</svelte:head>

<article class="error-page">
	<header class="page-intro">
		{#if missing}
			<h1>This page<br /><span>doesn’t exist.</span></h1>
			<p class="page-lede">The address may be mistyped, or the page may have moved.</p>
		{:else}
			<h1>Something<br /><span>went wrong.</span></h1>
			<p class="page-lede">This page could not load. Please try again in a moment.</p>
		{/if}
		<div class="page-meta">
			<a class="text-link" href="/">Go to the home page <span aria-hidden="true"><Arrow /></span></a>
		</div>
	</header>
</article>

<style>
	.error-page { min-height:52vh; padding-bottom:60px; }
</style>
