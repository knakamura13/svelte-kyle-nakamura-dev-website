<script lang="ts">
	import Segmented from '$lib/experiments/ui/Segmented.svelte';
	import { useAirflow } from '../experience.svelte';
	import type { Clock } from '../state';
	import { formatDuration } from '../units';
	import { shortfall } from './clock';

	const experience = useAirflow();
	/** The speeds the clock offers, simulated seconds per real second. A radio group holds text, so the speed goes through `String` and back. */
	const SPEEDS: Clock['speed'][] = [1, 5, 20];
	const paused = $derived(experience.clock.paused);
	const time = $derived(formatDuration(experience.readout.physics.time));
	// The same words the status line under the Stage uses when the processor cannot keep up with the speed asked for.
	const behind = $derived(shortfall(experience.readout.status, experience.readout.physics.rate, experience.clock.speed));
</script>

<!--
	Always on the page, above every group: pause, speed and the simulated time. The clock is not a live region (it changes every
	second), so a screen reader reads it where it stands; Pause and the speeds say what they did, once, through the page's live region.
-->
<div class="transport" role="group" aria-label="Time">
	<button type="button" class="pill primary" onclick={() => experience.togglePause()}>
		<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			{#if paused}
				<path d="M6.5 4.5 15 10l-8.5 5.5z" />
			{:else}
				<path d="M6 4.5v11M14 4.5v11" />
			{/if}
		</svg>
		{paused ? 'Resume' : 'Pause'}
	</button>
	<Segmented
		legend="Speed"
		name="airflow-speed"
		value={String(experience.clock.speed)}
		options={SPEEDS.map((speed) => ({ value: String(speed), label: `${speed}×` }))}
		onchange={(speed) => experience.setSpeed(Number(speed) as Clock['speed'])}
	/>
	<dl class="clock">
		<div>
			<dt>Simulated time</dt>
			<dd>
				<span class="field-value" aria-hidden="true">{time.text}</span>
				<span class="sr-only">{time.spoken}</span>
				{#if behind}<span class="clock-behind" data-behind>{behind}</span>{/if}
			</dd>
		</div>
	</dl>
</div>

<style>
	.transport {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 14px 28px;
		padding: 16px 0 18px;
		border-bottom: 1px solid var(--rule);
	}
	/* The shared controls are 40px tall; a control at the top of the Dock that is used often is worth 44 and more. */
	.transport :global(.segment span) {
		min-height: 44px;
	}
	.transport :global(.pill) {
		min-height: 52px;
	}
	.clock {
		margin: 0 0 0 auto;
		min-width: 0;
	}
	.clock dt {
		margin: 0 0 8px;
		font-size: 12px;
		font-weight: 650;
	}
	.clock dd {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		align-content: center;
		gap: 2px 12px;
		min-height: 52px;
		margin: 0;
	}
	.clock-behind {
		font-size: 12px;
		line-height: 1.5;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 700px) {
		.clock {
			margin-left: 0;
			flex-basis: 100%;
		}
		.clock dd {
			min-height: 0;
		}
	}
</style>
