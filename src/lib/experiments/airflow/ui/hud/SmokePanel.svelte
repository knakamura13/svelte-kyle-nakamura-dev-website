<script lang="ts">
	import { useAirflow } from '../../experience.svelte';
	import { describeStrength, smokeMarks, type SmokeMark } from '../../smokeWords';
	import Icon from './Icon.svelte';
	import { focusWorld } from './world';

	/**
	 * The Smoke tool's panel, beside the rail: how strong the source is, as a chip for each real source from a candle to a cooking burst,
	 * and whether smoke is being released now.
	 */
	const experience = useAirflow();
	const marks = smokeMarks();
	const strength = $derived(experience.emission.strength);
	const words = $derived(describeStrength(strength));
	const releasing = $derived(experience.emission.active);
	/** Half a step of the old slider: the mark the strength is at is the one pressed. */
	const HALF_STEP = 0.005;

	function choose(mark: SmokeMark) {
		experience.emission.strength = mark.position;
		experience.wake();
		experience.announce(describeStrength(mark.position).announcement);
	}
</script>

<section class="panel glass" aria-labelledby="hud-smoke-title">
	<header>
		<h2 id="hud-smoke-title" class="title">Smoke</h2>
		<p class="status" role="status" data-releasing={releasing ? '' : undefined}><span class="dot" aria-hidden="true"></span>{releasing ? 'Releasing' : 'Not releasing'}</p>
	</header>
	<p class="how">Press and hold on the air to release smoke. It drifts where the air takes it.</p>
	<div class="marks" role="group" aria-label="Smoke strength">
		{#each marks as mark (mark.id)}
			<button type="button" class="mark" aria-pressed={Math.abs(strength - mark.position) < HALF_STEP} data-mark={mark.id} onclick={() => choose(mark)}>
				<span class="mark-name">{mark.label}</span>
				<span class="mark-rate" aria-hidden="true">{mark.rate.text}</span>
				<span class="sr-only">{mark.rate.spoken}</span>
			</button>
		{/each}
	</div>
	<p class="now">Now: <strong>{words.rate.text}</strong>, {words.near}.</p>
	<button type="button" class="btn" onclick={focusWorld}><Icon name="target" size={18} />Release from the keyboard</button>
	<p class="keys">In the 3D view: arrow keys move the cursor, <span class="key">Enter</span> starts and stops smoke.</p>
</section>

<style>
	.panel {
		display: grid;
		gap: 12px;
		width: 280px;
		padding: 14px;
		border-radius: 22px;
		animation: hud-slide 260ms var(--hud-ease);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.title {
		margin: 0;
		font-family: 'Manrope Variable', system-ui, sans-serif;
		font-size: 19px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.status {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		margin: 0;
		color: var(--hud-muted);
		font-size: 12px;
		font-weight: 700;
	}
	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 2px solid var(--hud-muted);
	}
	.status[data-releasing] {
		color: var(--hud-smoke);
	}
	.status[data-releasing] .dot {
		border-color: var(--hud-smoke);
		background: var(--hud-smoke);
		box-shadow: 0 0 0 4px rgb(242 163 92 / 0.25);
	}
	.how,
	.now,
	.keys {
		margin: 0;
		color: var(--hud-muted);
		font-size: 12px;
		line-height: 1.5;
	}
	.now strong {
		color: var(--hud-text);
	}
	.marks {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
	}
	.mark {
		display: grid;
		gap: 1px;
		min-height: 52px;
		padding: 8px 10px;
		border: 0;
		border-radius: 13px;
		background: var(--hud-well);
		text-align: left;
		box-shadow: inset 0 0 0 1px var(--hud-edge);
		transition: background 160ms var(--hud-ease);
	}
	.mark:hover {
		background: var(--hud-hover);
	}
	.mark[aria-pressed='true'] {
		background: var(--hud-accent);
		color: var(--hud-accent-ink);
		box-shadow: 0 8px 18px rgb(95 213 154 / 0.25);
	}
	.mark-name {
		font-size: 12.5px;
		font-weight: 750;
	}
	.mark-rate {
		color: var(--hud-muted);
		font-size: 11px;
	}
	.mark[aria-pressed='true'] .mark-rate {
		color: #14402b;
	}
	.btn {
		justify-content: flex-start;
	}
	:global(.hud.phone) .panel {
		width: auto;
		animation-name: hud-rise;
	}
	:global(.hud.phone) .marks {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	:global(.hud.phone) .btn,
	:global(.hud.phone) .keys,
	:global(.hud.phone) .how {
		display: none;
	}
</style>
