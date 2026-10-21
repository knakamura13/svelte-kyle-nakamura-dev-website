<script lang="ts">
	import { useAirflow } from '../../experience.svelte';
	import { homeContext } from './context';
	import { targetWords } from './inventory';
	import { useHudUi } from './ui.svelte';

	/**
	 * The name of the thing under the pointer, beside it, and what a click does: "Living room window 1 · Window · Wide". For the eye only;
	 * the same things are named in the Inspector for the keyboard and a screen reader.
	 */
	const experience = useAirflow();
	const ui = useHudUi();
	const hovered = $derived(experience.hovered);
	const showing = $derived(!!hovered && ui.pointer.over && !experience.carry && !(experience.menu && experience.selection?.kind === hovered.kind && experience.selection.id === hovered.id));
	const words = $derived(showing && hovered ? targetWords(hovered, homeContext(experience)) : null);
	const action = $derived(hovered?.kind === 'probe' ? 'Click to read it' : hovered?.kind === 'device' ? 'Click for its menu · drag to move' : 'Click to open or close it');
</script>

{#if words}
	<div class="label" style:left="{ui.pointer.x + 16}px" style:top="{ui.pointer.y + 18}px" aria-hidden="true">
		<span class="title">{words.title}</span>
		<span class="detail">{words.detail}</span>
		<span class="action">{action}</span>
	</div>
{/if}

<style>
	.label {
		position: fixed;
		z-index: 25;
		display: grid;
		gap: 1px;
		max-width: 260px;
		padding: 8px 12px 9px;
		border-radius: 13px;
		background: rgb(10 15 13 / 0.88);
		-webkit-backdrop-filter: var(--hud-blur);
		backdrop-filter: var(--hud-blur);
		box-shadow:
			0 10px 24px rgb(0 0 0 / 0.3),
			inset 0 0 0 1px rgb(255 255 255 / 0.1);
		pointer-events: none;
		animation: hud-in 120ms var(--hud-ease);
	}
	.title {
		font-size: 13px;
		font-weight: 750;
	}
	.detail {
		color: var(--hud-muted);
		font-size: 11.5px;
	}
	.action {
		margin-top: 3px;
		color: var(--hud-accent);
		font-size: 11px;
		font-weight: 700;
	}
</style>
