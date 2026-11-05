<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import PortfolioShell from '$lib/components/PortfolioShell.svelte';

	let { children } = $props();
</script>

<!-- A full-screen page (the airflow world) says `immersive` from its load, and stands outside the site's shell: a nested layout cannot leave this one, so this one steps aside. -->
{#if page.data.immersive}
	{@render children()}
{:else}
	<PortfolioShell>
		{@render children()}
	</PortfolioShell>
{/if}
