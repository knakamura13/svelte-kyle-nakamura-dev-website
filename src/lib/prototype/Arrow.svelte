<script lang="ts">
	let { direction = 'up-right' }: { direction?: 'up-right' | 'down-right' | 'up' | 'down' | 'left' | 'right' } = $props();
</script>

<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
	{#if direction === 'up-right'}
		<path d="M4.5 15.5 15.5 4.5M5.5 4.5h10v10" />
	{:else if direction === 'down-right'}
		<path d="M4.5 4.5 15.5 15.5M5.5 15.5h10v-10" />
	{:else if direction === 'up'}
		<path d="M10 16.5v-13M4.5 9l5.5-5.5L15.5 9" />
	{:else if direction === 'down'}
		<path d="M10 3.5v13M4.5 11l5.5 5.5 5.5-5.5" />
	{:else if direction === 'left'}
		<path d="M16.5 10h-13M9 4.5 3.5 10 9 15.5" />
	{:else}
		<path d="M3.5 10h13M11 4.5l5.5 5.5-5.5 5.5" />
	{/if}
</svg>

<style>
	svg { display:inline-block; width:1em; height:1em; vertical-align:-.12em; flex:none; }
</style>
