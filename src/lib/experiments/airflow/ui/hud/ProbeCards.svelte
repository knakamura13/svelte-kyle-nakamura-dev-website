<script lang="ts">
	import { tick } from 'svelte';
	import { useAirflow } from '../../experience.svelte';
	import { homeContext } from './context';
	import Icon from './Icon.svelte';
	import { probeCards } from './inventory';
	import { useHudUi } from './ui.svelte';

	/**
	 * A card for each pinned Probe, on the right: the air's speed large, the way it moves as an arrow, its temperature and PM2.5. The
	 * readings arrive a few times a second, so the cards are plain text, not a live region; each has one sentence for a screen reader.
	 */
	const experience = useAirflow();
	const ui = useHudUi();
	const cards = $derived(probeCards(homeContext(experience)));
	let list: HTMLElement | undefined = $state();

	async function remove(id: string, at: number) {
		experience.unpin(id);
		await tick();
		const buttons = [...(list?.querySelectorAll<HTMLElement>('.remove') ?? [])];
		buttons[Math.min(at, buttons.length - 1)]?.focus();
	}
</script>

{#if cards.length}
	<!-- svelte-ignore a11y_no_redundant_roles -->
	<ul class="cards" role="list" aria-label="Probes" bind:this={list} class:sheet={ui.phone}>
		{#each cards as card, i (card.id)}
			<li class="card glass" data-probe={card.id} data-chosen={experience.selection?.kind === 'probe' && experience.selection.id === card.id ? '' : undefined}>
				<p class="sr-only">{card.sentence}</p>
				<div class="top">
					<button type="button" class="name" aria-label="{card.name}: open its menu" onclick={() => experience.select({ kind: 'probe', id: card.id }, true)}>
						<span class="pin" aria-hidden="true"><Icon name="probe" size={15} /></span>
						<span class="name-text" aria-hidden="true">{card.name}</span>
						<span class="room" aria-hidden="true">{card.room}</span>
					</button>
					<button type="button" class="ibtn remove" aria-label="Remove {card.name}" onclick={() => remove(card.id, i)}><Icon name="close" size={16} /></button>
				</div>
				{#if card.speed}
					<div class="reading" aria-hidden="true">
						<span class="speed">{card.speed}</span>
						{#if card.heading !== null}<span class="arrow" style:--heading="{card.heading}deg"><Icon name="arrow-up" size={18} /></span>{/if}
						<span class="direction">{card.direction}</span>
					</div>
					<div class="facts" aria-hidden="true">
						<span><span class="fact-name">Temp</span> {card.temperature}</span>
						<span><span class="fact-name">PM2.5</span> {card.pm25}</span>
					</div>
				{:else}
					<p class="waiting" aria-hidden="true">{card.message}</p>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.cards {
		display: grid;
		gap: 8px;
		width: 260px;
		margin: auto 0 0;
		padding: 0;
		list-style: none;
		pointer-events: none;
	}
	.card {
		display: grid;
		gap: 6px;
		min-width: 0;
		padding: 8px 8px 10px 12px;
		border-radius: 18px;
		animation: hud-in 220ms var(--hud-ease);
	}
	.card[data-chosen] {
		box-shadow:
			var(--hud-shadow),
			inset 0 0 0 1.5px var(--hud-accent);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
		min-height: 36px;
		padding: 0 6px 0 0;
		border: 0;
		border-radius: 10px;
		background: transparent;
		text-align: left;
	}
	.pin {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 9px;
		background: rgb(140 200 239 / 0.18);
		color: #9fd3f5;
	}
	.name-text {
		font-size: 13px;
		font-weight: 800;
	}
	.room {
		overflow: hidden;
		color: var(--hud-muted);
		font-size: 11.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.remove {
		margin: -4px -2px -4px 0;
		color: var(--hud-muted);
	}
	.reading {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.speed {
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
	}
	.arrow {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.1);
		color: var(--hud-accent);
		transform: rotate(var(--heading));
		transition: transform 400ms var(--hud-ease);
	}
	.direction {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		color: var(--hud-muted);
		font-size: 11.5px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.facts {
		display: flex;
		gap: 14px;
		font-size: 12.5px;
		font-weight: 700;
	}
	.fact-name {
		color: var(--hud-muted);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.waiting {
		margin: 0;
		color: var(--hud-muted);
		font-size: 12px;
	}
	.cards.sheet {
		width: auto;
		grid-auto-flow: column;
		grid-auto-columns: minmax(200px, 1fr);
		overflow-x: auto;
	}
</style>
