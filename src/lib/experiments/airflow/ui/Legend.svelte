<script lang="ts">
	import { useAirflow } from '../experience.svelte';
	import { dockLegend, type DockTick } from '../viz/dockLegend';

	const experience = useAirflow();
	// The Stage's own scale: the same sensitivity and a baseline of 0. The temperature scale is centered on where the indoor air started.
	const legend = $derived(
		dockLegend({
			layer: experience.view.layer,
			sensitivity: experience.view.sensitivity,
			units: experience.view.units,
			reference: experience.setup.conditions.indoorTemp
		})
	);
	/** The ticks in order along the bar, with the temperature scale's neutral middle among them. */
	const marks = $derived<DockTick[]>([...legend.ticks, ...(legend.midpoint ? [legend.midpoint] : [])].sort((a, b) => a.at - b.at));
	/** How many characters a tick's label is wide, for keeping it on the bar: the longer of its two rows. */
	const chars = (tick: DockTick) => Math.max(tick.label.value.length, tick.second?.value.length ?? 0);
</script>

<!--
	The legend of the Layer on the Slice: the Stage's scale in the units the visitor reads. The bar is a picture, so its name says the scale
	in words; the tick labels stay text outside it, with their units for a screen reader (the unit is said once, beside the title, so that the
	ticks are bare numbers). Direction has no bar: a wheel of headings with the compass letters around it and a ring at each speed, so that a
	heading can be read from where it sits and not only from its color. Its layout follows its own width, not the window's, because the Dock
	is a narrow column beside the Stage on a wide screen and the whole width of the card under it on a narrow one.
-->
<div class="dock-legend" role="group" aria-labelledby="airflow-legend-title" data-layer={legend.layer}>
	<div class="legend-grid" data-layer={legend.layer}>
		<div class="legend-head">
			<p class="legend-title" id="airflow-legend-title">{legend.title}</p>
			<p class="legend-unit">{legend.unit}</p>
		</div>

		{#if legend.wheel}
			{@const wheel = legend.wheel}
			<div class="legend-wheel">
				<div class="wheel-face" role="img" aria-label={legend.description}>
					<span class="wheel-disc" style:background={wheel.background}></span>
					<svg class="wheel-rings" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
						{#each wheel.rings as ring (ring.at)}<circle r={ring.at * 50} />{/each}
					</svg>
				</div>
				{#each wheel.headings as heading (heading.label)}
					<span class="wheel-letter" data-heading={heading.label}><span aria-hidden="true">{heading.label}</span><span class="sr-only">{heading.spoken}</span></span>
				{/each}
			</div>
		{:else}
			<div class="legend-scale">
				<div class="legend-bar" role="img" aria-label={legend.description} style:background={legend.gradient}></div>
				<div class="legend-marks" aria-hidden="true">
					{#each marks as tick (tick.at)}<span class="tick-mark" style:--at={tick.at} data-neutral={tick === legend.midpoint ? '' : undefined}></span>{/each}
				</div>
				<ol class="legend-ticks" data-rows={legend.ticks.some((tick) => tick.second) ? 2 : 1}>
					{#each marks as tick (tick.at)}
						<li style:--at={tick.at} style:--chars={chars(tick)} data-neutral={tick === legend.midpoint ? '' : undefined}>
							<span class="tick-number">{tick.label.value}</span><span class="sr-only">{' '}{tick.label.unit}</span>
							{#if tick.second}<span class="tick-second">{tick.second.value}</span><span class="sr-only">{' '}{tick.second.unit}</span>{/if}
						</li>
					{/each}
				</ol>
			</div>
		{/if}

		<div class="legend-caption">
			<p>{legend.caption}</p>
			{#if legend.wheel}
				<p class="legend-rings">
					Rings, from the centre out:
					{#each legend.wheel.rings as ring, n (ring.at)}<span class="ring-label">{ring.label.text}</span>{n < legend.wheel.rings.length - 1 ? ', ' : '.'}{/each}
				</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.dock-legend {
		container-type: inline-size;
		padding: 16px 0 18px;
		border-bottom: 1px solid var(--rule);
	}
	.legend-grid {
		display: grid;
		grid-template-areas: 'head' 'scale' 'caption';
		gap: 12px 32px;
	}
	.legend-head {
		grid-area: head;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 10px;
	}
	.legend-title {
		margin: 0;
		font-size: 12px;
		font-weight: 650;
	}
	.legend-unit {
		margin: 0;
		font-size: 11px;
		color: var(--muted);
	}
	.legend-caption {
		grid-area: caption;
		display: grid;
		gap: 4px;
		align-content: start;
		min-width: 0;
	}
	.legend-caption p {
		margin: 0;
		font-size: 12px;
		line-height: 1.7;
		color: var(--muted);
	}
	.ring-label {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	/* A bar with ticks under it: a mark at each value, and its label under it. */
	.legend-scale {
		grid-area: scale;
		position: relative;
		min-width: 0;
		max-width: 560px;
	}
	.legend-bar {
		height: 12px;
		border-radius: 6px;
		/* The palest end of a scale is close to the page's white, so the bar carries a faint outline. */
		box-shadow: inset 0 0 0 1px #20322626;
	}
	.legend-marks {
		position: absolute;
		left: 0;
		right: 0;
		top: 12px;
		height: 0;
	}
	.tick-mark {
		position: absolute;
		top: 1px;
		left: calc(var(--at) * 100%);
		width: 1px;
		height: 5px;
		margin-left: -0.5px;
		background: var(--ink);
		opacity: 0.55;
	}
	/* Where the diverging scale is neutral: its mark is taller, running up through the bar, and its label bolder, so that it reads without the color. */
	.tick-mark[data-neutral] {
		top: -12px;
		height: 18px;
		opacity: 0.8;
	}
	.legend-ticks {
		position: relative;
		margin: 0;
		padding: 0;
		list-style: none;
		height: 26px;
	}
	.legend-ticks[data-rows='2'] {
		height: 42px;
	}
	/* A label is centered under its mark, but never nearer an end of the bar than half its width (a digit is a ch wide), so that it stays on the bar. */
	.legend-ticks li {
		position: absolute;
		top: 0;
		left: clamp(calc(var(--chars) * 0.5ch), calc(var(--at) * 100%), calc(100% - var(--chars) * 0.5ch));
		padding-top: 8px;
		font-size: 11px;
		line-height: 1.35;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		text-align: center;
		transform: translateX(-50%);
	}
	.legend-ticks li[data-neutral] {
		font-weight: 650;
	}
	.tick-second {
		display: block;
		color: var(--muted);
	}

	/* The wheel: a disc of headings with a compass letter on each side and a ring at each speed. */
	.legend-wheel {
		grid-area: scale;
		position: relative;
		width: 152px;
		height: 152px;
		justify-self: start;
	}
	.wheel-face {
		position: absolute;
		inset: 26px;
	}
	.wheel-disc {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1px #20322633;
	}
	.wheel-rings {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.wheel-rings circle {
		fill: none;
		stroke: var(--ink);
		stroke-opacity: 0.5;
		stroke-width: 1;
		stroke-dasharray: 2 3;
		vector-effect: non-scaling-stroke;
	}
	.wheel-letter {
		position: absolute;
		font-size: 12px;
		font-weight: 650;
		line-height: 1;
	}
	.wheel-letter[data-heading='N'] {
		top: 6px;
		left: 50%;
		transform: translateX(-50%);
	}
	.wheel-letter[data-heading='S'] {
		bottom: 6px;
		left: 50%;
		transform: translateX(-50%);
	}
	.wheel-letter[data-heading='E'] {
		right: 7px;
		top: 50%;
		transform: translateY(-50%);
	}
	.wheel-letter[data-heading='W'] {
		left: 6px;
		top: 50%;
		transform: translateY(-50%);
	}

	/* Room for a wheel and its words side by side, in a column about as wide as the Dock is beside the Stage. */
	@container (min-width: 340px) and (max-width: 619px) {
		.legend-grid[data-layer='direction'] {
			grid-template-columns: auto minmax(0, 1fr);
			grid-template-areas: 'head head' 'scale caption';
			align-items: center;
		}
	}
	/* The whole width of a card under the Stage: the title and what the colors mean to the left, the scale to the right. */
	@container (min-width: 620px) {
		.legend-grid {
			grid-template-columns: minmax(200px, 260px) minmax(0, 560px);
			grid-template-areas: 'head scale' 'caption scale';
			grid-template-rows: auto 1fr;
			align-items: start;
		}
	}
</style>
