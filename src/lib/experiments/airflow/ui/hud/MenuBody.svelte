<script lang="ts">
	import { useAirflow } from '../../experience.svelte';
	import type { Target } from '../../state';
	import { openingAnnouncement, openingReading } from '../openings';
	import Icon from './Icon.svelte';
	import type { MenuActionId, MenuChoice, MenuModel } from './menus';
	import { tooltip } from './tips.svelte';
	import { useHudUi } from './ui.svelte';

	/**
	 * What a context menu and the Inspector show for a chosen thing: its presets, the fine control, a line on what the setting does, its
	 * actions, and a Probe's reading. It draws a `MenuModel` (ui/hud/menus.ts) and changes the setup through the page's state.
	 */
	let { target, menu, compact = false }: { target: Target; menu: MenuModel; compact?: boolean } = $props();

	const experience = useAirflow();
	const ui = useHudUi();
	const device = $derived(target.kind === 'device' ? experience.setup.devices.find((d) => d.id === target.id) : undefined);
	const model = $derived(device ? experience.modelOf(device) : undefined);
	const opening = $derived(target.kind === 'opening' ? experience.plan.openings.find((o) => o.id === target.id) : undefined);
	const ACTION_ICONS = { oscillate: 'oscillate', 'turn-left': 'turn-left', 'turn-right': 'turn-right', exhaust: 'exhaust', move: 'move', remove: 'remove' } as const;

	function choose(choice: MenuChoice) {
		if (opening) {
			experience.setOpening(opening.id, choice.value);
			experience.announce(openingAnnouncement(opening.name, openingReading(opening, choice.value)));
		} else if (device && model) {
			experience.updateDevice(device.id, { power: choice.value });
			experience.announce(`${model.name} ${choice.label === 'Off' ? 'off' : `on ${choice.label}`}.`);
		}
	}

	function fine(travel: number) {
		if (!opening) return;
		experience.setOpening(opening.id, travel / 100);
		experience.announce(openingAnnouncement(opening.name, openingReading(opening, travel / 100)));
	}

	function act(id: MenuActionId, event: MouseEvent) {
		if (target.kind === 'probe') {
			if (id === 'remove') experience.unpin(target.id);
			return;
		}
		if (!device || !model) return;
		switch (id) {
			case 'oscillate': {
				const on = !device.oscillation.on;
				experience.updateDevice(device.id, { oscillation: { ...device.oscillation, on } });
				experience.announce(on ? `${model.name} sweeps from side to side.` : `${model.name} holds still.`);
				break;
			}
			case 'turn-left':
				experience.turnDevice(device.id, device.yaw - 45);
				break;
			case 'turn-right':
				experience.turnDevice(device.id, device.yaw + 45);
				break;
			case 'exhaust': {
				const intake = device.intake === false;
				experience.updateDevice(device.id, { intake });
				experience.announce(intake ? `${model.name} draws air in.` : `${model.name} pushes air out.`);
				break;
			}
			case 'move':
				// A pointer picks it up and carries it; the keyboard moves it a step at a time from the Inspector.
				if (event.detail === 0) {
					ui.inspector = true;
					experience.closeMenu();
					experience.announce(`Move the ${model.name} with the Move buttons in the Inspector.`);
				} else experience.startCarry(model.id, device.id);
				break;
			case 'remove':
				experience.removeDevice(device.id);
				break;
		}
	}
</script>

<div class="body" class:compact>
	{#if menu.reading}
		<p class="sr-only">{menu.reading.sentence}</p>
		{#if menu.reading.rows.length}
			<dl class="reading" aria-hidden="true">
				{#each menu.reading.rows as row (row.key)}
					<div data-key={row.key}>
						<dt>{row.name}</dt>
						<dd data-empty={row.empty ? '' : undefined}>{row.value}</dd>
					</div>
				{/each}
			</dl>
		{:else}
			<p class="caption" aria-hidden="true">{menu.reading.message}</p>
		{/if}
	{/if}

	{#if menu.presets.length}
		<div class="presets" role="group" aria-label={menu.presetsLabel}>
			{#if !compact}<p class="eyebrow">{menu.presetsLabel}</p>{/if}
			<div class="seg presets-row">
				{#each menu.presets as choice (choice.id)}
					<button type="button" aria-pressed={choice.pressed} data-preset={choice.id} onclick={() => choose(choice)}>{choice.label}</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if menu.fine}
		{@const control = menu.fine}
		<label class="fine">
			<span class="fine-head"><span class="fine-label">{control.label}</span><span class="fine-value" aria-hidden="true">{control.display}</span></span>
			<input
				class="slider"
				type="range"
				min={control.min}
				max={control.max}
				step={control.step}
				value={control.value}
				aria-valuetext={control.spoken}
				style:--fill="{((control.value - control.min) / (control.max - control.min)) * 100}%"
				oninput={(event) => fine(event.currentTarget.valueAsNumber)}
			/>
		</label>
	{/if}

	{#if menu.caption}<p class="caption">{menu.caption}</p>{/if}
	{#if menu.note}<p class="note">{menu.note}</p>{/if}

	{#if menu.actions.length}
		<div class="actions" role="group" aria-label="Actions">
			{#each menu.actions as action (action.id)}
				<button
					type="button"
					class="action"
					class:danger={action.id === 'remove'}
					aria-pressed={action.pressed ?? undefined}
					data-action={action.id}
					use:tooltip={{ label: action.label, hint: action.hint, side: 'top' }}
					onclick={(event) => act(action.id, event)}
				>
					<Icon name={ACTION_ICONS[action.id]} size={19} />
					<span>{action.label}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.body {
		display: grid;
		gap: 12px;
	}
	.presets {
		display: grid;
		gap: 8px;
	}
	.presets-row {
		display: flex;
		width: 100%;
	}
	.presets-row > button {
		flex: 1;
		min-width: 0;
		padding: 0 8px;
	}
	.fine {
		display: grid;
		gap: 2px;
	}
	.fine-head {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
	}
	.fine-label {
		color: var(--hud-muted);
		font-weight: 650;
	}
	.fine-value {
		font-weight: 750;
	}
	.caption,
	.note {
		margin: 0;
		color: var(--hud-muted);
		font-size: 12px;
		line-height: 1.5;
	}
	.note {
		padding: 8px 10px;
		border-radius: 10px;
		background: rgb(245 197 107 / 0.12);
		color: #f6dba6;
	}
	.actions {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
		gap: 6px;
	}
	.action {
		display: grid;
		justify-items: center;
		gap: 3px;
		min-height: 56px;
		padding: 8px 4px 6px;
		border: 0;
		border-radius: 13px;
		background: var(--hud-well);
		box-shadow: inset 0 0 0 1px var(--hud-edge);
		font-size: 11.5px;
		font-weight: 700;
		transition:
			background 160ms var(--hud-ease),
			color 160ms var(--hud-ease);
	}
	.action:hover {
		background: var(--hud-hover);
	}
	.action[aria-pressed='true'] {
		background: rgb(95 213 154 / 0.18);
		color: var(--hud-accent);
		box-shadow: inset 0 0 0 1.5px var(--hud-accent);
	}
	.action.danger {
		color: var(--hud-danger);
	}
	.action.danger:hover {
		background: rgb(229 72 77 / 0.16);
	}
	.reading {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px 14px;
		margin: 0;
	}
	.reading > div {
		display: grid;
		gap: 1px;
	}
	.reading dt {
		color: var(--hud-muted);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.reading dd {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
	}
	.reading dd[data-empty] {
		color: var(--hud-dim);
		font-weight: 600;
	}
	.reading [data-key='speed'] {
		grid-column: 1 / -1;
		order: -1;
	}
	.reading [data-key='speed'] dd {
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -0.03em;
	}
	.compact .actions {
		grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
	}
</style>
