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
	Always on the Dock, above every group: pause, speed and the simulated time. The clock is not a live region (it changes every
	second), so a screen reader reads it where it stands; Pause and the speeds say what they did, once, through the page's live region.
	The frame is what the layout asks its width of: in the Dock's column beside the Stage it is narrow, and under the Stage it is wide.
-->
<div class="transport-frame">
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
				</dd>
				{#if behind}<dd class="clock-behind" data-behind>{behind}</dd>{/if}
			</div>
		</dl>
	</div>
</div>

<style>
	.transport-frame {
		container-type: inline-size;
		border-bottom: 1px solid var(--rule);
	}
	/* Narrow, as in the Dock's column: Pause and the clock on one line and the speeds across the width under them. */
	.transport {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-areas:
			'pause clock'
			'speed speed';
		align-items: end;
		gap: 14px 16px;
		padding: 16px 0 18px;
	}
	/* One button for Resume and for Pause: the label changes and the button must not, or the speeds beside it would shift. As tall as the speeds' capsule beside it. */
	.transport :global(.pill) {
		grid-area: pause;
		justify-content: center;
		min-width: 8.5rem;
		min-height: 52px;
	}
	.transport :global(.segmented) {
		grid-area: speed;
	}
	/* The shared Dock rule lets the speeds wrap onto lines of two; three speeds are one row of equal parts. */
	.transport :global(.segments) {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.clock {
		grid-area: clock;
		justify-self: end;
		min-width: 0;
		margin: 0;
		text-align: right;
	}
	.clock dt {
		font-size: 12px;
		font-weight: 650;
	}
	.clock dd {
		margin: 0;
	}
	.clock .field-value {
		display: block;
		line-height: 1.2;
	}
	.clock dd.clock-behind {
		font-size: 12px;
		line-height: 1.5;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	/* Wide, under the Stage: Pause, the speeds and the clock in one line. */
	@container (min-width: 30rem) {
		.transport {
			grid-template-columns: auto auto minmax(0, 1fr);
			grid-template-areas: 'pause speed clock';
			gap: 14px 28px;
		}
		.transport :global(.segments) {
			width: auto;
			grid-template-columns: repeat(3, minmax(3.5rem, 1fr));
		}
	}
</style>
