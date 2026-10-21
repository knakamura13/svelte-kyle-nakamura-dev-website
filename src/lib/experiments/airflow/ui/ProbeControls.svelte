<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import Segmented from '$lib/experiments/ui/Segmented.svelte';
	import { useAirflow } from '../experience.svelte';
	import { describeSpot, probeName, type Spot } from '../probeWords';
	import { MAX_PINS, type PointerMode } from '../state';

	/** Fields that sit between the pointer's readout and the Probe list: the Dock puts the smoke strength there, so the controls come before the list of what was pinned. */
	let { children }: { children?: Snippet } = $props();

	const experience = useAirflow();
	const units = $derived(experience.view.units);
	const mode = $derived(experience.view.mode);

	/**
	 * What each mode does with a finger and with the keys (`scene/input.ts` is the truth), in full for the Dock and in a
	 * breath for the screen reader when it is chosen. A mouse needs no mode.
	 */
	const MODES: Record<PointerMode, { label: string; help: string; announce: string }> = {
		look: {
			label: 'Look',
			help: 'One finger moves the view, and two pinch to zoom and twist to turn it. While the 3D view has focus, the arrow keys or W, A, S and D move it, and Q and E turn it. Choose Probe or Emit to use touch or keys on the air itself.',
			announce: 'Look mode. A finger or the arrow keys move the view, and Q and E turn it.'
		},
		probe: {
			label: 'Probe',
			help: 'Touch the home to read the air under your finger, and lift to pin a probe there. By keyboard, go to the 3D view, move the cursor with the arrow keys (Shift for bigger steps) and press Enter to pin a probe.',
			announce: 'Probe mode. Touch the home to read the air, and lift to pin a probe. Or move the cursor with the arrow keys in the 3D view and press Enter to pin a probe.'
		},
		emit: {
			label: 'Emit',
			help: 'Touch the home to release smoke where your finger is, and lift to stop. By keyboard, go to the 3D view, move the cursor with the arrow keys, press Enter to start smoke, and press Enter again, or Escape, to stop it.',
			announce: 'Emit mode. Touch the home to release smoke where your finger is. Or move the cursor with the arrow keys in the 3D view and press Enter to start or stop smoke.'
		}
	};

	function setMode(next: PointerMode) {
		experience.setView({ mode: next });
		experience.announce(MODES[next].announce);
	}

	/** The arrow keys and Enter act on the air only while the 3D view has focus, so the Dock can take the focus there. */
	function goToStage(event: MouseEvent) {
		(event.currentTarget as HTMLElement).closest('.airflow')?.querySelector<HTMLElement>('.stage-view')?.focus();
	}

	// What is under the pointer or the keyboard cursor, from the scene. It changes with every move, so it is never a live region.
	const hover = $derived(experience.readout.hover);
	const hoverSpot = $derived(hover ? describeSpot('', hover, hover, units) : null);

	// One row for each pinned Probe, by number (a Probe pinned in the place of one that was removed takes its number and its row), whose
	// reading arrives a few times a second. A reading belongs to a Probe only while it is for the same point: a Probe removed and
	// pinned again under the same id elsewhere has no reading until its own arrives.
	const pins = $derived(experience.probes);
	const probes = $derived(
		[...pins]
			.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
			.map((pin) => {
				const reading = experience.readout.probes.find((r) => r.id === pin.id && r.x === pin.x && r.y === pin.y && r.z === pin.z);
				return { id: pin.id, spot: describeSpot(reading?.label ?? probeName(pin.id), pin, reading, units) };
			})
	);
	const full = $derived(pins.length >= MAX_PINS);
	const limit = ['no', 'one', 'two', 'three', 'four', 'five', 'six'][MAX_PINS] ?? String(MAX_PINS);

	let list: HTMLUListElement | undefined = $state();
	let heading: HTMLElement | undefined = $state();

	/** Takes the Probe away, and puts the focus on the next one's Remove button, or on the list's heading when none is left, so a keyboard visitor is not dropped on the page. */
	async function remove(id: string) {
		const at = probes.findIndex((probe) => probe.id === id);
		experience.unpin(id);
		await tick();
		const buttons = list ? [...list.querySelectorAll<HTMLElement>('.probe-remove')] : [];
		(buttons[Math.min(at, buttons.length - 1)] ?? heading)?.focus();
	}
</script>

{#snippet readings(spot: Spot)}
	<!-- The labelled values are for the eye. A screen reader gets the same in one sentence (above), so it is not read a pile of numbers. -->
	{#if spot.rows.length > 0}
		<dl class="spot-facts" aria-hidden="true">
			{#each spot.rows as row (row.key)}
				<div data-key={row.key}>
					<dt>{row.name}</dt>
					<dd data-empty={row.empty ? '' : undefined}>{row.value}</dd>
				</div>
			{/each}
		</dl>
	{:else}
		<p class="spot-note" aria-hidden="true">{spot.message}</p>
	{/if}
{/snippet}

<div class="dock-field probe-mode">
	<Segmented
		legend="What touch and keys do"
		name="airflow-mode"
		value={mode}
		options={(Object.keys(MODES) as PointerMode[]).map((value) => ({ value, label: MODES[value].label }))}
		onchange={setMode}
	/>
	<p class="dock-notice" data-mode={mode}>{MODES[mode].help}</p>
	<p class="dock-notice">A mouse needs no mode: point to read the air, click to pin a probe, press and hold to release smoke, and drag to turn the view.</p>
	<div class="probe-actions">
		<button type="button" class="pill" onclick={goToStage}>Go to the 3D view</button>
	</div>
</div>

<div class="dock-field probe-hover" data-state={hoverSpot ? (hoverSpot.rows.length > 0 ? 'reading' : 'no-air') : 'empty'}>
	<p class="dock-label">Under the pointer</p>
	<div class="spot">
		{#if hoverSpot}
			<p class="sr-only">{hoverSpot.sentence}</p>
			<p class="spot-place" aria-hidden="true">{hoverSpot.place.text}</p>
			{@render readings(hoverSpot)}
		{:else}
			<p class="spot-note">Point at the air, or move the cursor with the arrow keys.</p>
		{/if}
	</div>
</div>

{@render children?.()}

<div class="dock-field probe-field">
	<div class="probe-head">
		<p class="dock-label" id="airflow-probes-label" tabindex="-1" bind:this={heading}>Probes</p>
		<p class="probe-count">{pins.length} of {MAX_PINS} probes</p>
	</div>
	{#if probes.length === 0}
		<p class="dock-notice">No probes yet. Click the air to pin one, or choose Probe mode to pin one by touch or keyboard.</p>
	{:else}
		<!-- A list that loses its bullets loses its list role in Safari, so it is given back. -->
		<!-- svelte-ignore a11y_no_redundant_roles -->
		<ul class="probe-list" role="list" aria-labelledby="airflow-probes-label" bind:this={list}>
			{#each probes as probe (probe.id)}
				<li class="probe spot" data-probe={probe.id}>
					<p class="sr-only">{probe.spot.sentence}</p>
					<div class="probe-top">
						<div class="probe-id" aria-hidden="true">
							<p class="probe-name">{probe.spot.name}</p>
							<p class="spot-place">{probe.spot.place.text}</p>
						</div>
						<button type="button" class="probe-remove" onclick={() => remove(probe.id)}>Remove<span class="sr-only"> {probe.spot.name}</span></button>
					</div>
					{@render readings(probe.spot)}
				</li>
			{/each}
		</ul>
	{/if}
	{#if full}
		<p class="dock-notice" data-full>A home holds at most {limit} probes. Remove one to add another.</p>
	{/if}
</div>

<style>
	/* The three modes are one row of three, which the shared picker's wider minimum would break in two. */
	.probe-mode :global(.segments) {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.probe-actions {
		display: flex;
		margin-top: 4px;
	}
	.probe-field {
		grid-column: 1 / -1;
	}
	.probe-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	/* The heading takes the focus when the last Probe is removed, below a pinned Stage and not behind it. */
	.probe-head .dock-label {
		scroll-margin-top: calc(var(--airflow-pin, 0px) + 12px);
	}
	.probe-head .dock-label:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 3px;
		border-radius: 6px;
	}
	.probe-count {
		margin: 0;
		font-size: 12px;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.probe-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 236px), 1fr));
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.spot {
		display: grid;
		gap: 8px;
		align-content: start;
		min-width: 0;
		padding: 12px 14px 14px;
		border-radius: 14px;
		background: var(--dock);
		box-shadow: inset 0 0 0 1px var(--tile-edge);
	}
	/* The pointer's readout holds its height whether it is reading or not, so the controls under it stay where they are as the pointer comes and goes. */
	.probe-hover .spot {
		min-height: 192px;
	}
	.probe-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.probe-id {
		min-width: 0;
	}
	.probe-name {
		margin: 0;
		font-size: 13px;
		font-weight: 650;
	}
	.probe-remove {
		flex: none;
		min-width: 44px;
		min-height: 44px;
		padding: 0 14px;
		border-radius: 100px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--muted);
		font-size: 12px;
		font-weight: 600;
		transition: background 160ms;
	}
	.probe-remove:hover {
		background: var(--dock-hover);
	}
	.spot-place,
	.spot-note {
		margin: 0;
		font-size: 11px;
		line-height: 1.6;
		color: var(--muted);
	}
	.spot-note {
		font-size: 12px;
		line-height: 1.7;
	}
	.spot-facts {
		display: grid;
		gap: 6px;
		margin: 0;
	}
	.spot-facts > div {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	.spot-facts dt {
		flex: none;
		font-size: 11px;
		color: var(--muted);
	}
	.spot-facts dd {
		margin: 0;
		font-size: 12px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.spot-facts dd[data-empty] {
		color: var(--muted);
	}
	.spot-facts [data-key='speed'] dd {
		font-family: 'Newsreader Variable', Georgia, serif;
		font-size: 22px;
		letter-spacing: -0.03em;
		line-height: 1.1;
	}
	@media (prefers-reduced-motion: reduce) {
		.probe-remove {
			transition: none;
		}
	}
</style>
