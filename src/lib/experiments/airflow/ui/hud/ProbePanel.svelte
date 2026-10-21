<script lang="ts">
	import { useAirflow } from '../../experience.svelte';
	import { describeSpot } from '../../probeWords';
	import { MAX_PINS } from '../../state';
	import { formatLength } from '../../units';
	import Icon from './Icon.svelte';
	import SheetGrip from './SheetGrip.svelte';
	import { useHudUi } from './ui.svelte';
	import { focusWorld } from './world';

	/**
	 * The Probe tool's panel, beside the rail: how to pin a Probe, how many are pinned, and what the air does under the pointer or the
	 * keyboard's cursor, which changes with every move, so it is never a live region.
	 */
	const experience = useAirflow();
	const ui = useHudUi();
	const units = $derived(experience.view.units);
	/** The probe and smoke height, which Advanced sets: where a probe is pinned and the marker under the pointer floats. */
	const height = $derived(formatLength(experience.view.sliceHeight, units).text);
	const hover = $derived(experience.readout.hover);
	const spot = $derived(hover ? describeSpot('', hover, hover, units) : null);
	const full = $derived(experience.probes.length >= MAX_PINS);
</script>

<section class="panel glass" aria-labelledby="hud-probe-title" data-sheet={ui.phone ? '' : undefined}>
	{#if ui.phone}<SheetGrip label="the Probe tool" onclose={() => experience.setTool('select')} />{/if}
	<header>
		<h2 id="hud-probe-title" class="title">Probe</h2>
		<p class="sub">{experience.probes.length} of {MAX_PINS} pinned</p>
	</header>
	<p class="how">
		{full
			? `A home holds ${MAX_PINS} probes. Remove one to pin another.`
			: ui.phone
				? `Touch the air, and lift your finger where a probe should read it, ${height} up.`
				: `Click the air to pin a probe ${height} above the floor. It keeps reading the air there.`}
	</p>
	<div class="under sheet-more" data-state={spot ? (spot.rows.length ? 'reading' : 'no-air') : 'empty'}>
		<p class="eyebrow">{ui.phone ? 'Under your finger' : 'Under the pointer'}</p>
		{#if spot}
			<p class="sr-only">{spot.sentence}</p>
			{#if spot.rows.length}
				<dl class="rows" aria-hidden="true">
					{#each spot.rows as row (row.key)}
						<div data-key={row.key}><dt>{row.name}</dt><dd>{row.value}</dd></div>
					{/each}
				</dl>
			{:else}
				<p class="note" aria-hidden="true">{spot.message}</p>
			{/if}
		{:else}
			<p class="note">{ui.phone ? 'Touch the air to read it here.' : 'Point at the air, or move the cursor with the arrow keys in the 3D view.'}</p>
		{/if}
	</div>
	<button type="button" class="btn" onclick={focusWorld}><Icon name="target" size={18} />Pin from the keyboard</button>
	<p class="keys">In the 3D view: arrow keys move the cursor, <span class="key">Enter</span> pins a probe.</p>
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
		align-items: baseline;
	}
	.title {
		margin: 0;
		font-family: 'Manrope Variable', system-ui, sans-serif;
		font-size: 19px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.sub,
	.how,
	.note,
	.keys {
		margin: 0;
		color: var(--hud-muted);
		font-size: 12px;
		line-height: 1.5;
	}
	.under {
		display: grid;
		gap: 8px;
		min-height: 150px;
		padding: 12px;
		border-radius: 14px;
		background: var(--hud-well);
		box-shadow: inset 0 0 0 1px var(--hud-edge);
	}
	.rows {
		display: grid;
		gap: 5px;
		margin: 0;
	}
	.rows > div {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		font-size: 12px;
	}
	.rows dt {
		color: var(--hud-muted);
	}
	.rows dd {
		margin: 0;
		font-weight: 700;
		text-align: right;
	}
	.rows [data-key='speed'] dd {
		font-size: 18px;
		font-weight: 800;
	}
	.btn {
		justify-content: flex-start;
	}
	:global(.hud.phone) .panel {
		gap: 8px;
		width: auto;
		padding: 22px 14px 14px;
		animation-name: hud-rise;
	}
	:global(.hud.phone) .title {
		font-size: 17px;
	}
	:global(.hud.phone) .under {
		min-height: 0;
	}
	:global(.hud.phone) .btn,
	:global(.hud.phone) .keys {
		display: none;
	}
</style>
