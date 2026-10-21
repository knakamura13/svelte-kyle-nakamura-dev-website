<script lang="ts">
	import { tick } from 'svelte';
	import { useAirflow } from '../../experience.svelte';
	import { powerLabel } from '../../devices/model';
	import { describeBearing } from '../../readout';
	import type { Target } from '../../state';
	import { displayRange, formatLength, sliderRange } from '../../units';
	import { homeContext } from './context';
	import HudRange from './HudRange.svelte';
	import Icon from './Icon.svelte';
	import { inventory, menuFor } from './inventory';
	import MenuBody from './MenuBody.svelte';
	import { tooltip } from './tips.svelte';
	import { useHudUi } from './ui.svelte';

	/**
	 * The Inspector, on the right: everything in the Home that can be chosen (fans and purifiers, Probes, each Room's doors and windows),
	 * and every setting of the chosen one. It is how a keyboard reaches what a click in the world reaches, and it says the readings as text.
	 */
	const experience = useAirflow();
	const ui = useHudUi();
	const context = $derived(homeContext(experience));
	const selection = $derived(experience.selection);
	const menu = $derived(selection ? menuFor(selection, context) : null);
	const groups = $derived(ui.inspector && !menu ? inventory(context) : []);
	const units = $derived(experience.view.units);
	const device = $derived(selection?.kind === 'device' ? experience.setup.devices.find((d) => d.id === selection.id) : undefined);
	const model = $derived(device ? experience.modelOf(device) : undefined);
	const turns = $derived(model?.kind === 'box-fan' || model?.kind === 'pedestal-fan');
	const tilts = $derived(sliderRange('tilt', units));
	const sweeps = $derived(sliderRange('oscillationSweep', units));
	const periods = $derived(sliderRange('oscillationPeriod', units));
	const heights = $derived(model?.kind === 'pedestal-fan' && model.heightRange ? displayRange('length', { min: model.heightRange[0], max: model.heightRange[1], step: 0.01 }, units, 1) : null);
	const aim = (tilt: number) => (tilt === 0 ? 'level' : `${Math.abs(tilt)}° ${tilt > 0 ? 'up' : 'down'}`);

	let panel: HTMLElement | undefined = $state();
	let opener: HTMLButtonElement | undefined = $state();

	async function choose(target: Target) {
		experience.select(target);
		await tick();
		panel?.querySelector<HTMLElement>('.back')?.focus();
	}

	async function back() {
		const was = selection;
		experience.select(null);
		await tick();
		const row = was ? panel?.querySelector<HTMLElement>(`[data-target="${was.kind}:${was.id}"]`) : null;
		(row ?? panel?.querySelector<HTMLElement>('.row'))?.focus();
	}

	/** Opens the panel in place of its button, and the focus goes into it. */
	async function open() {
		ui.inspector = true;
		await tick();
		panel?.querySelector<HTMLElement>('button')?.focus();
	}

	async function close() {
		ui.inspector = false;
		await tick();
		opener?.focus();
	}

	const STEP = 0.25;
	function nudge(event: MouseEvent, dx: number, dz: number) {
		if (!device) return;
		const step = event.shiftKey ? 1 : STEP;
		const refused = experience.nudgeDevice(device.id, dx * step, dz * step);
		if (refused) experience.announce(refused);
	}
</script>

{#if !ui.inspector}
	<button
		type="button"
		class="opener glass"
		bind:this={opener}
		aria-expanded="false"
		aria-controls="hud-inspector"
		use:tooltip={{ label: 'Inspector', hint: 'Everything in the home, and every setting, by keyboard too.', side: 'left' }}
		onclick={open}
	>
		<Icon name="inspector" size={19} />
		<span>Inspector</span>
	</button>
{:else}
	<section id="hud-inspector" class="inspector glass" aria-labelledby="hud-inspector-title" bind:this={panel}>
		<header class="head">
			{#if menu}
				<button type="button" class="ibtn back" aria-label="Back to everything in the home" onclick={back}><Icon name="chevron-left" size={20} /></button>
			{/if}
			<div class="titles">
				<p class="eyebrow">{menu ? 'Inspector' : 'In this home'}</p>
				<h2 id="hud-inspector-title" class="title">{menu ? menu.title : experience.plan.name}</h2>
			</div>
			<button type="button" class="ibtn" aria-label="Close the Inspector" onclick={close}><Icon name="close" size={18} /></button>
		</header>

		<div class="body scroll">
			{#if menu && selection}
				<p class="subtitle">{menu.subtitle}</p>
				<MenuBody target={selection} {menu} />
				{#if device && model}
					<div class="settings">
						<HudRange
							label="Power"
							value={Math.round(device.power * 100)}
							min={0}
							max={100}
							step={1}
							display="{Math.round(device.power * 100)}% · {powerLabel(model, device.power).name}"
							spoken="{Math.round(device.power * 100)} percent, {powerLabel(model, device.power).name}"
							oninput={(value) => experience.updateDevice(device.id, { power: value / 100 })}
						/>
						{#if turns}
							<HudRange
								label="Faces"
								value={Math.round(device.yaw / 5) * 5 === 360 ? 0 : Math.round(device.yaw / 5) * 5}
								min={0}
								max={355}
								step={5}
								display={describeBearing(device.yaw).text}
								spoken={describeBearing(device.yaw).spoken}
								oninput={(value) => experience.turnDevice(device.id, value)}
							/>
							<HudRange label="Aim" value={device.tilt} min={tilts.min} max={tilts.max} step={tilts.step} display={aim(device.tilt)} oninput={(value) => experience.aimDevice(device.id, value)} />
						{/if}
						{#if model.kind === 'pedestal-fan'}
							{#if device.oscillation.on}
								<HudRange
									label="Sweep"
									value={device.oscillation.sweep}
									min={sweeps.min}
									max={Math.min(sweeps.max, model.maxSweep ?? sweeps.max)}
									step={sweeps.step}
									display="{Math.round(device.oscillation.sweep)}°"
									spoken="{Math.round(device.oscillation.sweep)} degrees"
									oninput={(value) => experience.updateDevice(device.id, { oscillation: { ...device.oscillation, sweep: value } })}
								/>
								<HudRange
									label="One sweep, out and back"
									value={device.oscillation.period}
									min={periods.min}
									max={periods.max}
									step={periods.step}
									display="{device.oscillation.period} s"
									spoken="{device.oscillation.period} seconds"
									oninput={(value) => experience.updateDevice(device.id, { oscillation: { ...device.oscillation, period: value } })}
								/>
							{/if}
							{#if heights}
								<HudRange
									label="Head height"
									value={Number(heights.toDisplay(device.height).toFixed(heights.digits))}
									min={heights.min}
									max={heights.max}
									step={heights.step}
									display={formatLength(device.height, units).text}
									spoken={formatLength(device.height, units).spoken}
									oninput={(value) => experience.updateDevice(device.id, { height: heights.fromDisplay(value) })}
								/>
							{/if}
						{/if}
						<div class="move" role="group" aria-labelledby="hud-move-label">
							<p class="eyebrow" id="hud-move-label">Move {device.opening ? '(to another window)' : ''}</p>
							<div class="pad">
								<button type="button" class="ibtn" style:grid-area="n" aria-label="Move north" onclick={(event) => nudge(event, 0, -1)}><Icon name="arrow-up" size={18} /></button>
								<button type="button" class="ibtn" style:grid-area="w" aria-label="Move west" onclick={(event) => nudge(event, -1, 0)}><span class="turned" style:--turn="-90deg"><Icon name="arrow-up" size={18} /></span></button>
								<button type="button" class="ibtn" style:grid-area="e" aria-label="Move east" onclick={(event) => nudge(event, 1, 0)}><span class="turned" style:--turn="90deg"><Icon name="arrow-up" size={18} /></span></button>
								<button type="button" class="ibtn" style:grid-area="s" aria-label="Move south" onclick={(event) => nudge(event, 0, 1)}><span class="turned" style:--turn="180deg"><Icon name="arrow-up" size={18} /></span></button>
								<span class="pad-n" style:grid-area="c" aria-hidden="true">N</span>
							</div>
							<p class="hint">A step is {formatLength(STEP, units).text}, or {formatLength(1, units).text} with Shift. North is up the plan.</p>
						</div>
					</div>
				{/if}
			{:else}
				{#each groups as group (group.id)}
					<div class="group" role="group" aria-labelledby="hud-group-{group.id}">
						<p class="group-head" id="hud-group-{group.id}"><span class="eyebrow">{group.title}</span>{#if group.count}<span class="count">{group.count}</span>{/if}</p>
						{#if group.items.length}
							<!-- svelte-ignore a11y_no_redundant_roles -->
							<ul class="rows" role="list">
								{#each group.items as item (`${item.target.kind}:${item.target.id}`)}
									<li>
										<button type="button" class="row" data-target="{item.target.kind}:{item.target.id}" onclick={() => choose(item.target)}>
											<span class="row-text"><span class="row-name">{item.name}</span><span class="row-detail">{item.detail}</span></span>
											<span class="row-state">{item.state}</span>
											<Icon name="chevron-right" size={16} />
										</button>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="empty">{group.empty}</p>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	</section>
{/if}

<style>
	.opener {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 16px 0 13px;
		border: 0;
		border-radius: 16px;
		font-size: 13px;
		font-weight: 700;
		animation: hud-in 260ms var(--hud-ease);
	}
	.opener:hover {
		background: rgb(30 40 35 / 0.85);
	}
	.inspector {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		width: 340px;
		max-height: 100%;
		min-height: 0;
		padding: 12px 6px 6px 14px;
		border-radius: 22px;
		animation: hud-in 220ms var(--hud-ease);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 6px;
		padding-right: 6px;
		padding-bottom: 8px;
	}
	.back {
		margin-left: -8px;
	}
	.titles {
		flex: 1;
		min-width: 0;
	}
	.title {
		margin: 0;
		font-family: 'Manrope Variable', system-ui, sans-serif;
		font-size: 17px;
		font-weight: 800;
		letter-spacing: -0.015em;
		line-height: 1.25;
	}
	.body {
		display: grid;
		align-content: start;
		gap: 16px;
		min-height: 0;
		padding: 2px 8px 10px 0;
	}
	.subtitle {
		margin: 0;
		color: var(--hud-muted);
		font-size: 12px;
	}
	.settings {
		display: grid;
		gap: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--hud-rule);
	}
	.move {
		display: grid;
		gap: 8px;
	}
	.pad {
		display: grid;
		grid-template-columns: repeat(3, 44px);
		grid-template-areas: '. n .' 'w c e' '. s .';
		gap: 4px;
		justify-content: start;
	}
	.pad .ibtn {
		background: var(--hud-well);
		box-shadow: inset 0 0 0 1px var(--hud-edge);
	}
	.pad-n {
		display: grid;
		place-items: center;
		color: var(--hud-dim);
		font-size: 11px;
		font-weight: 800;
	}
	.turned {
		display: grid;
		transform: rotate(var(--turn));
	}
	.hint {
		margin: 0;
		color: var(--hud-dim);
		font-size: 11.5px;
	}
	.group {
		display: grid;
		gap: 6px;
	}
	.group-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin: 0;
	}
	.count {
		color: var(--hud-muted);
		font-size: 11.5px;
		font-weight: 650;
	}
	.rows {
		display: grid;
		gap: 4px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 48px;
		padding: 6px 8px 6px 12px;
		border: 0;
		border-radius: 13px;
		background: var(--hud-well);
		text-align: left;
		color: var(--hud-text);
		transition: background 160ms var(--hud-ease);
	}
	.row:hover {
		background: var(--hud-hover);
	}
	.row :global(.icon) {
		color: var(--hud-dim);
	}
	.row-text {
		display: grid;
		flex: 1;
		min-width: 0;
		line-height: 1.3;
	}
	.row-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		font-weight: 700;
	}
	.row-detail {
		color: var(--hud-muted);
		font-size: 11.5px;
	}
	.row-state {
		padding: 2px 8px;
		border-radius: 8px;
		background: rgb(255 255 255 / 0.08);
		font-size: 11.5px;
		font-weight: 700;
		white-space: nowrap;
	}
	.empty {
		margin: 0;
		color: var(--hud-muted);
		font-size: 12px;
		line-height: 1.5;
	}

	:global(.hud.phone) .opener {
		display: none;
	}
	:global(.hud.phone) .inspector {
		position: fixed;
		left: 10px;
		right: 10px;
		bottom: calc(86px + env(safe-area-inset-bottom));
		width: auto;
		max-height: 62vh;
		animation-name: hud-rise;
	}
</style>
