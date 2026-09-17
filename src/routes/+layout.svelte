<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let { children } = $props();
</script>

{#if page.url.pathname.startsWith('/prototype')}
	{@render children()}
{:else}
<a class="skip-link" href="#main">Skip to content</a>

<div class="app">
	<Header />

	<main id="main">
		{@render children()}
	</main>

	<Footer />
</div>
{/if}

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
</style>
