<script lang="ts">
	import '../app.css';
	import PortfolioShell from '$lib/prototype/PortfolioShell.svelte';

	let { children } = $props();
</script>

<PortfolioShell>
	{@render children()}
</PortfolioShell>
