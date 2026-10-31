<script lang="ts">
	import { untrack } from 'svelte';
	import { useAirflow } from '../experience.svelte';
	import { balanceAnnouncement, balanceVerdict, type BalanceVerdict } from '../massBalance';
	import { DIVERGENCE_WORDS, ROOM_COLUMNS, roomRows, smokeReadings, solverReadings } from '../physicsPanel';

	/**
	 * How the simulation is doing, for the Dock's Physics group: the solver's clock, grid, backend and divergence; whether the smoke adds up;
	 * and the averages of each Room, which are what the room labels on the Stage say, as text. The numbers are written by the simulation
	 * about eight times a second while it runs, and once when it is paused. They are plain text, not live regions, so a screen reader is
	 * not told them as they change: the panel says something only when the smoke books go out of balance, or come back.
	 */
	const experience = useAirflow();
	const readout = $derived(experience.readout);
	const units = $derived(experience.view.units);

	const solver = $derived(solverReadings(readout.physics, readout.status, units));
	const smoke = $derived(smokeReadings(readout.physics.mass));
	const rows = $derived(roomRows(readout.rooms, experience.plan.rooms, units));
	const stopped = $derived(readout.status === 'unsupported' || readout.status === 'error');

	// The verdict remembers where it was, so a number on the line does not flip it back and forth, and says so when the books change state.
	let verdict: BalanceVerdict = $state.raw(balanceVerdict(null));
	$effect(() => {
		const before = untrack(() => verdict.state);
		const next = balanceVerdict(readout.physics.mass, before);
		const said = balanceAnnouncement(before, next);
		if (said) experience.announce(said);
		verdict = next;
	});
</script>

<div class="physics">
	<div class="parts">
		<div class="part" role="group" aria-labelledby="physics-solver">
			<p class="dock-label" id="physics-solver">Solver</p>
			<dl class="readouts list">
				{#each solver as item (item.key)}
					<div data-reading={item.key}>
						<dt>{item.label}</dt>
						<dd>{item.value}{#if item.unit}{' '}<small>{item.unit}</small>{/if}{#if item.note}{' '}<small>{item.note}</small>{/if}</dd>
					</div>
				{/each}
			</dl>
			<p class="dock-notice"><strong>Divergence.</strong> {DIVERGENCE_WORDS}</p>
			{#if stopped}<p class="dock-notice">{readout.note}</p>{/if}
		</div>

		<div class="part" role="group" aria-labelledby="physics-smoke">
			<p class="dock-label" id="physics-smoke">Smoke accounting</p>
			<p class="verdict" data-state={verdict.state} data-verdict>
				<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
					{#if verdict.state === 'balanced'}
						<path d="M5 10.5 8.5 14 15 6.5" />
					{:else if verdict.state === 'off'}
						<path d="M10 3.5 17.5 16.5h-15zM10 8.5v3.5M10 14.2v.1" />
					{:else}
						<circle cx="10" cy="10" r="6.5" /><path d="M7 10h6" />
					{/if}
				</svg>
				<span>{verdict.text}</span>
			</p>
			<p class="sub">Smoke that came in</p>
			<dl class="readouts list">
				{#each smoke.came as item (item.key)}
					<div data-reading={item.key}>
						<dt>{item.label}</dt>
						<dd>{item.value}{#if item.unit}{' '}<small>{item.unit}</small>{/if}</dd>
					</div>
				{/each}
			</dl>
			<p class="sub">Where that smoke is</p>
			<dl class="readouts list">
				{#each smoke.where as item (item.key)}
					<div data-reading={item.key}>
						<dt>{item.label}</dt>
						<dd>{item.value}{#if item.unit}{' '}<small>{item.unit}</small>{/if}</dd>
					</div>
				{/each}
			</dl>
		</div>
	</div>

	<!-- The roles are written out because the table is laid out as a stack of cards in a narrow Dock, and a browser that is told a table is not one (display: block) may stop reading it as a table. -->
	<!-- svelte-ignore a11y_no_redundant_roles -->
	<table class="rooms" role="table">
		<caption>Room averages</caption>
		<!-- svelte-ignore a11y_no_redundant_roles -->
		<thead role="rowgroup">
			<!-- svelte-ignore a11y_no_redundant_roles -->
			<tr role="row">
				{#each ROOM_COLUMNS as column (column)}
					<!-- svelte-ignore a11y_no_redundant_roles -->
					<th scope="col" role="columnheader">{column}</th>
				{/each}
			</tr>
		</thead>
		<!-- svelte-ignore a11y_no_redundant_roles -->
		<tbody role="rowgroup">
			{#each rows as row (row.id)}
				<!-- svelte-ignore a11y_no_redundant_roles -->
				<tr role="row" data-room={row.id}>
					<!-- svelte-ignore a11y_no_redundant_roles -->
					<th scope="row" role="rowheader">{row.name}</th>
					<td role="cell" class="volume" data-label={ROOM_COLUMNS[1]}>{row.volume}</td>
					<td role="cell" data-label={ROOM_COLUMNS[2]}>{row.speed}</td>
					<td role="cell" data-label={ROOM_COLUMNS[3]}>{row.temperature}</td>
					<td role="cell" data-label={ROOM_COLUMNS[4]}>{row.particulates}</td>
					<td role="cell" data-label={ROOM_COLUMNS[5]}>{row.changes}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	/* The panel fills the group's body, and lays itself out by its own width: the Dock is a 300 to 400 px column beside the Stage on a wide screen. */
	.physics { grid-column: 1 / -1; container: physics / inline-size; display: grid; gap: 26px; min-width: 0; }
	.parts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 26px 32px; align-items: start; }
	.part { display: grid; gap: 10px; align-content: start; min-width: 0; }
	.sub { margin: 6px 0 0; font-size: 11px; font-weight: 650; color: var(--muted); }

	/* Relativity's readouts, a little smaller: this panel has more of them, in a narrower place. */
	.list { grid-template-columns: repeat(auto-fit, minmax(7.25rem, 1fr)); gap: 14px 12px; margin: 0; padding-top: 12px; }
	.list dd { font-size: 20px; overflow-wrap: anywhere; }
	.list dt { white-space: normal; }

	/* The books. The sentence says whether they balance, and the shape of the mark says it again, so the colour is never the only sign. */
	.verdict { display: flex; gap: 10px; align-items: flex-start; margin: 0; padding: 10px 14px; border-radius: 12px; background: var(--dock); color: var(--ink); font-size: 13px; line-height: 1.55; }
	.verdict[data-state='balanced'] { background: var(--sage); }
	.verdict[data-state='off'] { background: var(--butter); font-weight: 650; }
	.verdict svg { flex: none; width: 18px; height: 18px; margin-top: 2px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

	/* Room averages: a table where there is room for one, and a card for each Room where there is not. */
	.rooms { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 1.5; font-variant-numeric: tabular-nums; }
	.rooms caption { padding: 0 0 8px; text-align: left; font-size: 12px; font-weight: 650; }
	.rooms th, .rooms td { padding: 9px 12px 9px 0; border-top: 1px solid var(--rule); text-align: left; vertical-align: top; }
	.rooms thead th { border-top: 0; padding-top: 0; font-size: 11px; font-weight: 600; color: var(--muted); }
	.rooms tbody th { font-weight: 650; }
	.rooms td:last-child, .rooms thead th:last-child { padding-right: 0; }

	@container physics (max-width: 459px) {
		/* The headers stay in the page for a screen reader, and each cell shows its own label. */
		.rooms thead { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
		.rooms, .rooms tbody { display: block; }
		.rooms caption { display: block; }
		.rooms tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 14px; padding: 12px 0; border-top: 1px solid var(--rule); }
		.rooms th, .rooms td { display: block; padding: 0; border: 0; min-width: 0; }
		.rooms tbody th { font-size: 13px; }
		.rooms td { overflow-wrap: anywhere; }
		.rooms td::before { content: attr(data-label); content: attr(data-label) / ''; display: block; font-size: 11px; font-weight: 500; color: var(--muted); }
		/* A Room's volume sits on the line of its name, since it is not an average. */
		.rooms td.volume { text-align: right; color: var(--muted); }
		.rooms td.volume::before { display: none; }
	}
</style>
