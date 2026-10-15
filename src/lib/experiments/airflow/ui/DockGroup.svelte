<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		title,
		open = false,
		hint,
		children
	}: {
		id: string;
		title: string;
		/** Whether the group starts open. The visitor opens and closes it from then on. */
		open?: boolean;
		/** A few words beside the title that say what is inside, so a closed group still says something. */
		hint?: string;
		children: Snippet;
	} = $props();
</script>

<!-- A native disclosure: the summary is a button that Enter and Space toggle, and a screen reader hears whether it is expanded. -->
<details class="dock-group" {id} {open}>
	<summary>
		<span class="dock-group-title">{title}</span>
		{#if hint}<span class="dock-group-hint">{hint}</span>{/if}
	</summary>
	<div class="dock-group-body">{@render children()}</div>
</details>
