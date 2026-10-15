<script lang="ts">
	import RangeField from '$lib/experiments/ui/RangeField.svelte';
	import { useAirflow } from '../experience.svelte';
	import type { RoomOpening } from '../homes/rooms';
	import { describedBy } from './describedBy';
	import { openingAnnouncement, openingCaption, openingLabel, openingReading, openingSpoken } from './openings';

	let { entry }: { entry: RoomOpening } = $props();

	const experience = useAirflow();
	const id = $derived(entry.opening.id);
	const reading = $derived(openingReading(entry.opening, experience.openingAmount(id)));
	// A window fan fills its window while it runs, and the solver and the Stage both take that over the setting here.
	const fanned = $derived(experience.setup.devices.some((device) => device.opening === id && experience.modelOf(device)?.kind === 'window-fan'));
	const notes = $derived(`airflow-opening-note-${id}${fanned ? ` airflow-opening-fan-${id}` : ''}`);
</script>

<div class="opening-row" use:describedBy={notes}>
	<RangeField
		id="airflow-opening-{id}"
		label={openingLabel(entry)}
		value={reading.travel}
		min={0}
		max={100}
		step={1}
		display="{reading.travel}%"
		spoken={openingSpoken(reading)}
		describe={(travel) => openingAnnouncement(entry.opening.name, openingReading(entry.opening, travel / 100))}
		onuser={(travel) => experience.setOpening(id, travel / 100)}
	/>
	<p class="dock-notice" id="airflow-opening-note-{id}">{openingCaption(reading)}</p>
	{#if fanned}
		<p class="dock-notice" id="airflow-opening-fan-{id}">A window fan is in this window, so the fan sets how far it is open. This setting applies once the fan is taken out.</p>
	{/if}
</div>

<style>
	.opening-row {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	.opening-row :global(input[type='range']) {
		height: 44px;
	}
	.opening-row :global(input[type='range']:focus-visible) {
		outline-offset: 3px;
	}
	/* A long name beside the percentage, in the Dock's narrow column, wraps instead of pushing the percentage out of the card; alone on its line the percentage stays at the right. */
	.opening-row :global(.field-head) {
		flex-wrap: wrap;
	}
	.opening-row :global(.field-value) {
		margin-left: auto;
	}
</style>
