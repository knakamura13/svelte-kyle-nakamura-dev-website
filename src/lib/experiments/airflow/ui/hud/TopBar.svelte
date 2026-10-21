<script lang="ts">
	import { tick } from 'svelte';
	import { useAirflow } from '../../experience.svelte';
	import type { PlanId } from '../../homes/types';
	import { homeCard, planThumbnail } from './homes';
	import Icon from './Icon.svelte';
	import { tooltip } from './tips.svelte';
	import { useHudUi } from './ui.svelte';

	/**
	 * The top bar: Exit, the Home picker (a card for each Home with its floor plan) and the Scenario menu. Each picker is a button that
	 * opens its panel under it; a click outside or Escape closes it and gives the focus back to the button.
	 */
	const experience = useAirflow();
	const ui = useHudUi();
	const units = $derived(experience.view.units);
	const active = $derived(experience.scenarios.find((s) => s.id === experience.scenario) ?? null);
	const homes = $derived(experience.plans.map((plan) => ({ plan, card: homeCard(plan, units), thumb: planThumbnail(plan) })));

	let bar: HTMLElement | undefined = $state();
	let homeButton: HTMLButtonElement | undefined = $state();
	let scenarioButton: HTMLButtonElement | undefined = $state();
	let panel: HTMLElement | undefined = $state();

	const open = $derived(ui.popover === 'home' || ui.popover === 'scenario' ? ui.popover : null);

	/** Opens a panel; from the keyboard the focus goes to its pressed choice. */
	async function toggle(which: 'home' | 'scenario', event: MouseEvent) {
		ui.toggle(which);
		if (ui.popover !== which || event.detail !== 0) return;
		await tick();
		(panel?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? panel?.querySelector<HTMLElement>('button'))?.focus();
	}

	function close(focusButton: boolean) {
		const which = open;
		ui.popover = null;
		if (focusButton) (which === 'home' ? homeButton : scenarioButton)?.focus();
	}

	function chooseHome(id: PlanId) {
		experience.selectPlan(id);
		close(true);
	}

	function chooseScenario(id: string) {
		experience.applyScenario(id);
		close(true);
	}

	// A press outside the bar and its panel closes the panel.
	$effect(() => {
		if (!open) return;
		const outside = (event: PointerEvent) => {
			if (!bar?.contains(event.target as Node) && !panel?.contains(event.target as Node)) ui.popover = null;
		};
		addEventListener('pointerdown', outside, true);
		return () => removeEventListener('pointerdown', outside, true);
	});

	/** Escape in an open panel closes it, and the focus goes back to its button. */
	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !open) return;
		close(true);
		event.preventDefault();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="top" onkeydown={keydown}>
	<div class="topbar glass" bind:this={bar}>
		<a class="btn quiet exit" href="/experiments" aria-label="Exit to all experiments" use:tooltip={{ label: 'Exit', hint: 'Back to all experiments.', side: 'bottom' }}>
			<Icon name="exit" size={20} />
			<span class="exit-text" aria-hidden="true">Exit</span>
		</a>
		<span class="divider" aria-hidden="true"></span>
		<button
			type="button"
			class="picker"
			bind:this={homeButton}
			aria-label="Home: {experience.plan.name}"
			aria-expanded={open === 'home'}
			aria-controls="hud-homes"
			use:tooltip={{ label: 'Home', hint: 'Choose one of the four homes.', side: 'bottom' }}
			onclick={(event) => toggle('home', event)}
		>
			<span class="picker-icon"><Icon name="home" size={18} /></span>
			<span class="picker-text"><span class="eyebrow">Home</span><span class="picker-value">{experience.plan.name}</span></span>
			<span class="chevron" class:flipped={open === 'home'}><Icon name="chevron-down" size={16} /></span>
		</button>
		<button
			type="button"
			class="picker scenario-picker"
			bind:this={scenarioButton}
			aria-label="Scenario: {active?.name ?? 'your own setup'}"
			aria-expanded={open === 'scenario'}
			aria-controls="hud-scenarios"
			use:tooltip={{ label: 'Scenario', hint: 'Start from a prepared setup that shows one idea.', side: 'bottom' }}
			onclick={(event) => toggle('scenario', event)}
		>
			<span class="picker-icon"><Icon name="scenario" size={18} /></span>
			<span class="picker-text"><span class="eyebrow">Scenario</span><span class="picker-value">{active?.name ?? 'Your own setup'}</span></span>
			<span class="chevron" class:flipped={open === 'scenario'}><Icon name="chevron-down" size={16} /></span>
		</button>
	</div>

	{#if open === 'home'}
		<div id="hud-homes" class="panel glass deep" role="group" aria-label="Choose a home" bind:this={panel}>
			<p class="eyebrow">Choose a home</p>
			<div class="homes">
				{#each homes as { plan, card, thumb } (plan.id)}
					{@const current = plan.id === experience.setup.plan}
					<button type="button" class="home" aria-pressed={current} aria-describedby="hud-home-{plan.id}" onclick={() => chooseHome(plan.id)}>
						<span class="plan-frame" aria-hidden="true">
							<svg class="plan" viewBox={thumb.viewBox} preserveAspectRatio="xMidYMid meet">
								{#each thumb.rooms as room (room.id)}<path class="room" d={room.d} fill={room.tint} />{/each}
								{#each thumb.walls as wall, i (i)}<line class="wall" x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} />{/each}
								<path class="outline" d={thumb.outline} />
								{#each thumb.openings as gap, i (i)}<line class="gap" class:window={gap.window} x1={gap.x1} y1={gap.y1} x2={gap.x2} y2={gap.y2} />{/each}
							</svg>
						</span>
						<span class="home-head">
							<span class="home-name">{card.name}</span>
							<span class="home-area">{card.area}</span>
						</span>
						<span class="home-facts">{card.facts}</span>
						<span class="sr-only" id="hud-home-{plan.id}">{card.blurb}</span>
						{#if current}<span class="home-check" aria-hidden="true"><Icon name="check" size={14} /></span>{/if}
					</button>
				{/each}
			</div>
			<p class="panel-note">A new home starts closed up and empty, in the weather you have now.</p>
		</div>
	{:else if open === 'scenario'}
		<div id="hud-scenarios" class="panel glass deep scenarios" role="group" aria-label="Scenarios" bind:this={panel}>
			<p class="eyebrow">Scenarios</p>
			<div class="scenario-list">
				{#each experience.scenarios as scenario, i (scenario.id)}
					<button type="button" class="scenario" aria-pressed={experience.scenario === scenario.id} onclick={() => chooseScenario(scenario.id)}>
						<span class="scenario-number" aria-hidden="true">{i + 1}</span>
						<span class="scenario-text">
							<span class="scenario-name">{scenario.name}</span>
							<span class="scenario-blurb">{scenario.blurb}</span>
						</span>
						{#if experience.scenario === scenario.id}<span class="scenario-check" aria-hidden="true"><Icon name="check" size={16} /></span>{/if}
					</button>
				{/each}
			</div>
			<p class="panel-note">{active ? active.notice : 'This is your own setup. Pick a scenario to start from a prepared one.'}</p>
		</div>
	{/if}
</div>

<style>
	.top {
		position: relative;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 5px;
		border-radius: 20px;
		animation: hud-in 280ms var(--hud-ease);
	}
	.exit {
		gap: 6px;
		padding: 0 14px 0 10px;
	}
	.exit-text {
		font-weight: 700;
	}
	.divider {
		align-self: stretch;
		width: 1px;
		margin: 8px 4px;
		background: var(--hud-rule);
	}
	.picker {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 48px;
		padding: 0 10px 0 6px;
		border: 0;
		border-radius: 15px;
		background: transparent;
		text-align: left;
		transition: background 160ms var(--hud-ease);
	}
	.picker:hover,
	.picker[aria-expanded='true'] {
		background: var(--hud-hover);
	}
	.picker-icon {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 11px;
		background: rgb(95 213 154 / 0.14);
		color: var(--hud-accent);
	}
	.picker-text {
		display: grid;
		line-height: 1.2;
	}
	.picker-value {
		font-size: 14px;
		font-weight: 750;
		letter-spacing: -0.01em;
		white-space: nowrap;
	}
	.chevron {
		color: var(--hud-muted);
		transition: transform 200ms var(--hud-ease);
	}
	.chevron.flipped {
		transform: rotate(180deg);
	}
	.panel {
		position: absolute;
		top: calc(100% + 10px);
		left: 0;
		z-index: 5;
		display: grid;
		gap: 12px;
		width: 480px;
		max-width: calc(100vw - 32px);
		padding: 16px;
		border-radius: 22px;
		transform-origin: top left;
		animation: hud-in 200ms var(--hud-ease);
	}
	.panel.scenarios {
		left: 150px;
		width: 380px;
	}
	.homes {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.home {
		position: relative;
		display: grid;
		gap: 4px;
		padding: 8px 8px 12px;
		border: 0;
		border-radius: 16px;
		background: var(--hud-well);
		text-align: left;
		box-shadow: inset 0 0 0 1px var(--hud-edge);
		transition:
			background 180ms var(--hud-ease),
			box-shadow 180ms var(--hud-ease),
			transform 180ms var(--hud-ease);
	}
	.home:hover {
		background: var(--hud-hover);
		transform: translateY(-2px);
	}
	.home[aria-pressed='true'] {
		box-shadow:
			inset 0 0 0 2px var(--hud-accent),
			0 10px 24px rgb(95 213 154 / 0.18);
	}
	/* A floor plan on paper: the Rooms in their wall colours, the walls in ink, the doors as gaps and the windows in sky blue. */
	.plan-frame {
		display: grid;
		place-items: center;
		height: 112px;
		margin-bottom: 6px;
		border-radius: 11px;
		background: linear-gradient(170deg, #f4f7f3, #dde5df);
		overflow: hidden;
	}
	.plan {
		width: 86%;
		height: 86%;
		filter: drop-shadow(0 3px 4px rgb(20 30 25 / 0.18));
	}
	.plan .outline {
		fill: none;
		stroke: #33413a;
		stroke-width: 0.17;
		stroke-linejoin: round;
	}
	.plan .wall {
		stroke: #33413a;
		stroke-width: 0.1;
		stroke-linecap: square;
	}
	.plan .gap {
		stroke: #f4f7f3;
		stroke-width: 0.24;
	}
	.plan .gap.window {
		stroke: #6fb6e6;
		stroke-width: 0.2;
	}
	.home-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		padding: 0 4px;
	}
	.home-name {
		font-size: 14px;
		font-weight: 750;
	}
	.home-area {
		color: var(--hud-muted);
		font-size: 12px;
		font-weight: 650;
	}
	.home-facts {
		padding: 0 4px;
		color: var(--hud-muted);
		font-size: 11.5px;
	}
	.home-check,
	.scenario-check {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--hud-accent);
		color: var(--hud-accent-ink);
	}
	.home-check {
		position: absolute;
		top: 14px;
		right: 14px;
	}
	.panel-note {
		margin: 0;
		color: var(--hud-muted);
		font-size: 12px;
		line-height: 1.55;
	}
	.scenario-list {
		display: grid;
		gap: 6px;
	}
	.scenario {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border: 0;
		border-radius: 14px;
		background: var(--hud-well);
		text-align: left;
		box-shadow: inset 0 0 0 1px var(--hud-edge);
		transition: background 160ms var(--hud-ease);
	}
	.scenario:hover {
		background: var(--hud-hover);
	}
	.scenario[aria-pressed='true'] {
		box-shadow: inset 0 0 0 2px var(--hud-accent);
	}
	.scenario-number {
		display: grid;
		place-items: center;
		flex: none;
		width: 30px;
		height: 30px;
		border-radius: 10px;
		background: rgb(255 255 255 / 0.08);
		font-weight: 800;
	}
	.scenario-text {
		display: grid;
		gap: 2px;
		flex: 1;
	}
	.scenario-name {
		font-size: 13.5px;
		font-weight: 750;
	}
	.scenario-blurb {
		color: var(--hud-muted);
		font-size: 12px;
		line-height: 1.45;
	}

	:global(.hud.phone) .exit-text,
	:global(.hud.phone) .picker .eyebrow,
	:global(.hud.phone) .chevron,
	:global(.hud.phone) .scenario-picker .picker-text {
		display: none;
	}
	:global(.hud.phone) .scenario-picker {
		padding: 0 5px;
	}
	:global(.hud.phone) .exit {
		min-width: 44px;
		padding: 0;
	}
	:global(.hud.phone) .picker {
		gap: 6px;
		min-height: 44px;
		padding: 0 6px 0 4px;
	}
	:global(.hud.phone) .picker-value {
		max-width: 92px;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 12.5px;
	}
	:global(.hud.phone) .panel,
	:global(.hud.phone) .panel.scenarios {
		position: fixed;
		top: auto;
		left: 10px;
		right: 10px;
		bottom: calc(86px + env(safe-area-inset-bottom));
		width: auto;
		max-height: 70vh;
		overflow-y: auto;
		animation-name: hud-rise;
	}
	:global(.hud.phone) .plan-frame {
		height: 84px;
	}
</style>
