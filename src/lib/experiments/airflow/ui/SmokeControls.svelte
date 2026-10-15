<script lang="ts">
	import RangeField from '$lib/experiments/ui/RangeField.svelte';
	import { useAirflow } from '../experience.svelte';
	import { describeStrength, smokeMarks, type SmokeMark } from '../smokeWords';

	const experience = useAirflow();
	const marks = smokeMarks();
	const how = ['no', 'one', 'two', 'three', 'four', 'five', 'six'][marks.length] ?? String(marks.length);
	const strength = $derived(experience.emission.strength);
	const words = $derived(describeStrength(strength));
	const releasing = $derived(experience.emission.active);

	/** Half a step of the slider: the mark whose position the slider is at is the one pressed. */
	const HALF_STEP = 0.005;

	/** A mark takes the slider to exactly the rate it names, which no step of the slider need land on. */
	function choose(mark: SmokeMark) {
		experience.emission.strength = mark.position;
		experience.wake();
		experience.announce(describeStrength(mark.position).announcement);
	}
</script>

<div class="dock-field smoke">
	<div class="scale">
		<RangeField
			id="airflow-smoke"
			label="Smoke strength"
			bind:value={experience.emission.strength}
			min={0}
			max={1}
			step={0.01}
			display={words.rate.text}
			spoken={words.spoken}
			describe={(next) => describeStrength(next).announcement}
			onuser={() => experience.wake()}
		/>
		<!-- The marks are buttons along the track, each where its rate falls on the log scale. A list that loses its bullets loses its list role in Safari, so it is given back. -->
		<!-- svelte-ignore a11y_no_redundant_roles -->
		<ul class="marks" role="list" aria-label="Set the strength to a real source">
			{#each marks as mark (mark.id)}
				<li style:--at={mark.position} data-mark={mark.id} data-position={mark.position}>
					<button type="button" aria-pressed={Math.abs(strength - mark.position) < HALF_STEP} onclick={() => choose(mark)}>
						<span class="mark-name">{mark.label}</span>
						<span class="mark-rate" aria-hidden="true">{mark.rate.value}</span>
						<span class="sr-only"> {mark.rate.spoken}</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
	<p class="dock-notice smoke-about">
		Strength is how much PM2.5 the source releases each minute, in milligrams, with {how} real sources marked. Press and hold on the air with a mouse to release smoke. With a finger or the keyboard, choose Emit mode above.
	</p>
	<p class="smoke-status" role="status" data-releasing={releasing ? '' : undefined}>{releasing ? 'Releasing smoke' : 'Not releasing smoke'}</p>
</div>

<style>
	.scale {
		container-type: inline-size;
	}
	/* The thumb's centre runs from half its width in from each end, so a mark sits there and not at the end of the track. */
	.marks {
		--thumb: 22px;
		position: relative;
		height: 62px;
		margin: -12px 0 0;
		padding: 0;
		list-style: none;
		pointer-events: none;
	}
	.marks li {
		position: absolute;
		top: 0;
		left: calc(var(--thumb) / 2 + var(--at) * (100% - var(--thumb)));
		width: 0;
		--shift: -50%;
	}
	.marks li:first-child {
		--shift: calc(var(--thumb) / -2);
	}
	.marks li:last-child {
		--shift: calc(-100% + var(--thumb) / 2);
	}
	.marks li::before {
		content: '';
		position: absolute;
		top: 0;
		left: -1px;
		width: 2px;
		height: 10px;
		border-radius: 1px;
		background: var(--muted);
	}
	.marks button {
		pointer-events: auto;
		position: absolute;
		top: 10px;
		left: 0;
		transform: translateX(var(--shift));
		/* Its box is placed in a zero-width item, which would wrap every word, so it sizes to its text up to a limit. */
		width: max-content;
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 1px;
		min-width: 44px;
		min-height: 44px;
		padding: 4px 6px;
		border-radius: 10px;
		font-size: 11px;
		line-height: 1.25;
		font-weight: 600;
		text-align: center;
		transition: background 160ms, color 160ms;
	}
	.marks li:first-child button {
		justify-items: start;
		text-align: left;
	}
	.marks li:last-child button {
		justify-items: end;
		text-align: right;
	}
	/* "A cooking burst" takes two lines, so the last mark leaves room for the one before it. */
	.mark-name {
		max-width: 5.2em;
	}
	.mark-rate {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		font-weight: 500;
	}
	/* Where the track is too short for four labels in a row, every second one drops to a row of its own, on a longer stem. */
	@container (max-width: 380px) {
		.marks {
			height: 108px;
		}
		.marks li:nth-child(even)::before {
			left: -0.5px;
			width: 1px;
			height: 56px;
		}
		.marks li:nth-child(even) button {
			top: 56px;
		}
	}
	.marks button:hover {
		background: var(--dock-hover);
	}
	.marks button[aria-pressed='true'] {
		background: var(--ink);
		color: #fff;
	}
	.marks button[aria-pressed='true'] .mark-rate {
		color: #fff;
	}
	.smoke-about {
		margin-top: 2px;
	}
	.smoke-status {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 12px;
		font-weight: 650;
	}
	/* A hollow ring while no smoke is released and a solid dot while it is, so the state never rests on color alone: the words say it too. */
	.smoke-status::before {
		content: '';
		flex: none;
		width: 10px;
		height: 10px;
		box-sizing: border-box;
		border-radius: 50%;
		border: 2px solid var(--muted);
	}
	.smoke-status[data-releasing]::before {
		border-color: #d9822b;
		background: #d9822b;
	}
	@media (prefers-reduced-motion: reduce) {
		.marks button {
			transition: none;
		}
	}
</style>
