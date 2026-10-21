<script lang="ts">
	import { tip, type TipSide } from './tips.svelte';

	/** The bubble's size, measured once it is drawn, so it can be kept inside the window. */
	let width = $state(0);
	let height = $state(0);
	const GAP = 10;
	const MARGIN = 8;

	const place = $derived.by(() => {
		const rect = tip.rect;
		const content = tip.content;
		if (!rect || !content) return null;
		const vw = typeof innerWidth === 'number' ? innerWidth : 1280;
		const vh = typeof innerHeight === 'number' ? innerHeight : 800;
		const fits: Record<TipSide, boolean> = {
			top: rect.top - GAP - height >= MARGIN,
			bottom: rect.bottom + GAP + height <= vh - MARGIN,
			right: rect.right + GAP + width <= vw - MARGIN,
			left: rect.left - GAP - width >= MARGIN
		};
		const order: TipSide[] = [content.side ?? 'top', 'top', 'bottom', 'right', 'left'];
		const side = order.find((s) => fits[s]) ?? content.side ?? 'top';
		let left = side === 'right' ? rect.right + GAP : side === 'left' ? rect.left - GAP - width : rect.left + rect.width / 2 - width / 2;
		let top = side === 'bottom' ? rect.bottom + GAP : side === 'top' ? rect.top - GAP - height : rect.top + rect.height / 2 - height / 2;
		left = Math.min(vw - MARGIN - width, Math.max(MARGIN, left));
		top = Math.min(vh - MARGIN - height, Math.max(MARGIN, top));
		return { left, top, side };
	});
</script>

{#if tip.content && place}
	<div class="tip" aria-hidden="true" data-side={place.side} style:left="{place.left}px" style:top="{place.top}px" bind:clientWidth={width} bind:clientHeight={height}>
		<p class="tip-label">
			<span>{tip.content.label}</span>
			{#if tip.content.keys}<span class="key">{tip.content.keys}</span>{/if}
		</p>
		{#if tip.content.hint}<p class="tip-hint">{tip.content.hint}</p>{/if}
	</div>
{/if}

<style>
	.tip {
		position: fixed;
		z-index: 40;
		max-width: 260px;
		padding: 8px 11px 9px;
		border-radius: 11px;
		background: rgb(8 12 10 / 0.94);
		box-shadow:
			0 10px 26px rgb(0 0 0 / 0.35),
			inset 0 0 0 1px rgb(255 255 255 / 0.1);
		pointer-events: none;
		animation: hud-in 140ms var(--hud-ease);
	}
	.tip-label {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 12.5px;
		font-weight: 700;
		color: var(--hud-text);
	}
	.tip-hint {
		margin: 3px 0 0;
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--hud-muted);
	}
</style>
