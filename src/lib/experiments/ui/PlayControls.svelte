<script lang="ts">
	let {
		playing = $bindable(),
		restart,
		restartLabel = 'Restart'
	}: { playing: boolean; restart: () => void; restartLabel?: string } = $props();
</script>

<div class="play">
	<button
		type="button"
		class="pill primary"
		aria-label={playing ? 'Pause animation' : 'Play animation'}
		onclick={() => (playing = !playing)}
	>
		<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			{#if playing}
				<path d="M6 4.5v11M14 4.5v11" />
			{:else}
				<path d="M6.5 4.5 15 10l-8.5 5.5z" />
			{/if}
		</svg>
		{playing ? 'Pause' : 'Play'}
	</button>
	<button type="button" class="pill" onclick={restart}>
		<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			<path d="M4.5 10a5.5 5.5 0 1 0 1.9-4.2M4.5 3.5v3.3h3.3" />
		</svg>
		{restartLabel}
	</button>
</div>
