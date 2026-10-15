<script lang="ts">
	import Switch from '$lib/experiments/ui/Switch.svelte';
	import { useAirflow } from '../experience.svelte';
	import { openingsByRoom } from '../homes/rooms';
	import OpeningRow from './OpeningRow.svelte';

	const experience = useAirflow();
	const planId = $derived(experience.plan.id);
	const rooms = $derived(openingsByRoom(experience.plan));
</script>

<div class="dock-field">
	<!-- The Switch changes the state through the experience, which says what happened and builds the air again without the furniture. -->
	<Switch bind:checked={() => experience.setup.furniture, (on) => experience.setFurniture(on)} label="Furniture" />
	<p class="dock-notice">Furniture blocks the air and slows it, and the Stage shows it. Changing it starts the air over.</p>
</div>

<div class="dock-field">
	<p class="dock-notice">
		Each slider moves a door or window from shut (0%) to as far as it goes (100% of its travel). A window opens only part of its frame, and the line under each slider says how much.
	</p>
</div>

<!-- Rooms in the plan's order, each with its own Openings, so the keyboard goes down a Room and then to the next one. -->
<div class="openings-list">
	{#each rooms as group (`${planId}/${group.room.id}`)}
		<div class="openings-room" role="group" aria-labelledby="airflow-room-{group.room.id}">
			<p class="dock-label" id="airflow-room-{group.room.id}">{group.room.name}</p>
			{#each group.openings as entry (entry.opening.id)}
				<OpeningRow {entry} />
			{/each}
		</div>
	{/each}
</div>

<style>
	/*
		Columns, not a grid of cells: the Rooms pack down each column in turn with no gaps between rows of different heights, and
		the order down the first column and then the next is the order in the page, so the keyboard goes the way the eye does.
	*/
	.openings-list {
		grid-column: 1 / -1;
		column-width: 260px;
		column-gap: 32px;
	}
	.openings-room {
		break-inside: avoid;
		margin-bottom: 24px;
	}
	.openings-room .dock-label {
		margin-bottom: 14px;
	}
	.openings-room :global(.opening-row + .opening-row) {
		margin-top: 14px;
	}
</style>
