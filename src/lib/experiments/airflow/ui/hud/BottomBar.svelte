<script lang="ts">
	import { useAirflow } from '../../experience.svelte';
	import type { Clock, OverlayId, WallMode } from '../../state';
	import { overlayLegend } from '../../scene/air/legend';
	import { formatDuration } from '../../units';
	import { shortfall } from '../clock';
	import Icon from './Icon.svelte';
	import SheetGrip from './SheetGrip.svelte';
	import { OVERLAYS, WALL_MODES } from './tools';
	import { tooltip } from './tips.svelte';
	import { useHudUi } from './ui.svelte';

	/**
	 * The bottom bar: time on the left (pause, 1×, 5×, 20× and the simulated clock), the overlay switcher in the middle with its legend
	 * over it, and on the right the wall modes, About and Advanced. On a phone it is the View sheet that rises over the toolbar: at its
	 * peek the time and the overlays, and in full the walls, the Inspector, About and Advanced too. With the sheet shut, an overlay's
	 * legend stays under the top bar.
	 */
	const experience = useAirflow();
	const ui = useHudUi();
	const SPEEDS: { speed: Clock['speed']; spoken: string }[] = [
		{ speed: 1, spoken: 'real time' },
		{ speed: 5, spoken: 'five times real time' },
		{ speed: 20, spoken: 'twenty times real time' }
	];
	const OVERLAY_ICONS = { off: 'overlay-off', speed: 'overlay-speed', temperature: 'overlay-temperature', smoke: 'overlay-smoke' } as const;
	const WALL_ICONS = { up: 'walls-up', cutaway: 'walls-cutaway', down: 'walls-down' } as const;

	const paused = $derived(experience.clock.paused);
	const time = $derived(formatDuration(experience.readout.physics.time));
	const behind = $derived(shortfall(experience.readout.status, experience.readout.physics.rate, experience.clock.speed));
	const overlay = $derived(experience.view.overlay);
	// The legend is the air's own (`scene/air/legend.ts`), so its colours are the ones the streaks and the haze are drawn in.
	const legend = $derived(overlayLegend(overlay, { sensitivity: experience.view.sensitivity, units: experience.view.units, reference: experience.setup.conditions.indoorTemp, maxTicks: 4 }));
	const sheet = $derived(ui.phone);
	const open = $derived(!ui.phone || ui.popover === 'view');

	function setWalls(walls: WallMode) {
		experience.setView({ walls });
		experience.announce(WALL_MODES.find((mode) => mode.id === walls)?.label ?? '');
	}
	const setOverlay = (id: OverlayId) => experience.setOverlay(id);
</script>

{#snippet legendCard(floating: boolean)}
	{#if legend}
		<div class="legend glass" class:floating role="group" aria-label="Legend: {legend.title}">
			<p class="legend-title"><span>{legend.title}</span><span class="legend-unit">{legend.unit}</span></p>
			<div class="legend-bar" role="img" aria-label={legend.description} style:background={legend.gradient}></div>
			<ol class="legend-ticks" aria-hidden="true">
				{#each legend.ticks as tick (tick.at)}<li style:--at={tick.at}>{tick.label.value}</li>{/each}
			</ol>
		</div>
	{/if}
{/snippet}

<!-- On a phone with the View sheet shut, an overlay's legend stays in sight, under the top bar. -->
{#if sheet && !open}{@render legendCard(true)}{/if}

{#if open}
	<div class="bar" class:sheet id="hud-view-sheet" role={sheet ? 'dialog' : undefined} aria-label={sheet ? 'View' : undefined} data-sheet={sheet ? '' : undefined}>
		{#if sheet}<SheetGrip label="View" onclose={() => (ui.popover = null)} />{/if}
		<div class="cluster time glass" role="group" aria-label="Time">
			<button
				type="button"
				class="ibtn play"
				aria-label={paused ? 'Resume' : 'Pause'}
				use:tooltip={{ label: paused ? 'Resume' : 'Pause', hint: paused ? 'Let the air move again.' : 'Freeze the air where it is.', keys: 'P', side: 'top' }}
				onclick={() => experience.togglePause()}
			>
				<Icon name={paused ? 'play' : 'pause'} size={22} />
			</button>
			<div class="seg" role="group" aria-label="Speed">
				{#each SPEEDS as { speed, spoken } (speed)}
					<button
						type="button"
						aria-pressed={experience.clock.speed === speed}
						aria-label="{speed}×, {spoken}"
						use:tooltip={{ label: `${speed}×`, hint: `Simulate ${spoken}.`, side: 'top' }}
						onclick={() => experience.setSpeed(speed)}>{speed}×</button
					>
				{/each}
			</div>
			<div class="clock" data-paused={paused ? '' : undefined}>
				<span class="eyebrow">Sim time</span>
				<span class="clock-time" aria-hidden="true">{time.text}</span>
				<span class="sr-only">Simulated time {time.spoken}{paused ? ', paused' : ''}.</span>
				{#if behind}<span class="clock-behind" data-behind>{behind}</span>{/if}
			</div>
		</div>

		<div class="overlays">
			{@render legendCard(false)}
			<div class="cluster glass" role="group" aria-label="Overlay">
				<div class="seg">
					{#each OVERLAYS as info (info.id)}
						<button
							type="button"
							aria-pressed={overlay === info.id}
							use:tooltip={{ label: info.id === 'off' ? 'Overlay off' : info.label, hint: info.id === 'off' ? 'The air in its own blue, and the home as it is.' : `Colour the air by ${info.label.toLowerCase()}, with a faint haze of it through the rooms.`, side: 'top' }}
							onclick={() => setOverlay(info.id)}
						>
							<Icon name={OVERLAY_ICONS[info.id]} size={18} />
							<span class="seg-text">{info.label}</span>
						</button>
					{/each}
				</div>
			</div>
		</div>

		<div class="cluster right glass sheet-more">
			<div class="seg walls" role="group" aria-label="Walls">
				{#each WALL_MODES as mode (mode.id)}
					<button type="button" aria-pressed={experience.view.walls === mode.id} aria-label={mode.label} use:tooltip={{ label: mode.label, hint: mode.hint, side: 'top' }} onclick={() => setWalls(mode.id)}>
						<Icon name={WALL_ICONS[mode.id]} size={20} />
					</button>
				{/each}
			</div>
			<span class="divider" aria-hidden="true"></span>
			{#if sheet}
				<button type="button" class="ibtn" aria-label="Inspector" onclick={() => ((ui.inspector = true), (ui.popover = null))}>
					<Icon name="inspector" size={22} />
				</button>
			{/if}
			<button type="button" class="ibtn" aria-label="About this simulation" aria-haspopup="dialog" use:tooltip={{ label: 'About this simulation', hint: 'How it works, and what it is not.', side: 'top' }} onclick={() => ui.open('about')}>
				<Icon name="info" size={22} />
			</button>
			<button type="button" class="ibtn" aria-label="Advanced" aria-haspopup="dialog" aria-expanded={ui.panel === 'advanced'} use:tooltip={{ label: 'Advanced', hint: 'Physics, colour scale, probe and smoke height, units, graphics and the share link.', side: 'top' }} onclick={() => (ui.panel === 'advanced' ? (ui.panel = null) : ui.open('advanced'))}>
				<Icon name="settings" size={22} />
			</button>
		</div>
	</div>
{/if}

<style>
	.bar {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: end;
		gap: 12px;
		pointer-events: none;
	}
	.cluster {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px;
		border-radius: 20px;
		animation: hud-rise 300ms var(--hud-ease);
	}
	.time {
		justify-self: start;
		padding-right: 18px;
	}
	.right {
		justify-self: end;
	}
	.play {
		width: 48px;
		height: 48px;
		border-radius: 15px;
		background: rgb(255 255 255 / 0.1);
	}
	.seg > button {
		min-width: 48px;
	}
	.clock {
		display: grid;
		justify-items: start;
		min-width: 84px;
		padding-left: 6px;
		line-height: 1.15;
	}
	.clock-time {
		font-size: 20px;
		font-weight: 750;
		letter-spacing: -0.02em;
		color: var(--hud-text);
	}
	.clock[data-paused] .clock-time {
		color: var(--hud-muted);
	}
	.clock-behind {
		max-width: 160px;
		margin-top: 2px;
		font-size: 11px;
		color: #f7c97e;
	}
	.overlays {
		position: relative;
		display: grid;
		justify-items: center;
		gap: 8px;
		pointer-events: none;
	}
	.legend {
		width: 300px;
		padding: 10px 14px 8px;
		border-radius: 16px;
		animation: hud-in 220ms var(--hud-ease);
	}
	.legend-title {
		display: flex;
		justify-content: space-between;
		margin: 0 0 7px;
		font-size: 11.5px;
		font-weight: 700;
	}
	.legend-unit {
		color: var(--hud-muted);
		font-weight: 600;
	}
	.legend-bar {
		height: 8px;
		border-radius: 8px;
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.15);
	}
	.legend-ticks {
		position: relative;
		height: 16px;
		margin: 4px 0 0;
		padding: 0;
		list-style: none;
		color: var(--hud-muted);
		font-size: 10.5px;
	}
	.legend-ticks li {
		position: absolute;
		top: 0;
		left: calc(var(--at) * 100%);
		transform: translateX(-50%);
	}
	.legend-ticks li:first-child {
		transform: none;
	}
	.legend-ticks li:last-child {
		transform: translateX(-100%);
	}
	.seg-text {
		font-size: 12.5px;
	}
	.walls > button {
		min-width: 44px;
		padding: 0 10px;
	}
	.divider {
		align-self: stretch;
		width: 1px;
		margin: 6px 2px;
		background: var(--hud-rule);
	}

	/* A narrower desktop keeps the overlay icons and drops their words. */
	@media (max-width: 1180px) {
		.seg-text {
			display: none;
		}
	}

	/* The phone's View sheet: the same controls stacked in one glass sheet over the toolbar. */
	.bar.sheet {
		position: fixed;
		left: calc(10px + env(safe-area-inset-left));
		right: calc(10px + env(safe-area-inset-right));
		bottom: calc(86px + env(safe-area-inset-bottom));
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 6px;
		padding: 20px 8px 8px;
		border-radius: 22px;
		background-color: var(--hud-glass-deep);
		-webkit-backdrop-filter: var(--hud-blur);
		backdrop-filter: var(--hud-blur);
		box-shadow:
			var(--hud-shadow),
			inset 0 0 0 1px var(--hud-edge);
		pointer-events: auto;
		animation: hud-rise 260ms var(--hud-ease);
	}
	.bar.sheet .cluster,
	.bar.sheet .legend {
		justify-self: stretch;
		flex-wrap: wrap;
		background: transparent;
		-webkit-backdrop-filter: none;
		backdrop-filter: none;
		box-shadow: none;
		animation: none;
	}
	.bar.sheet .overlays + .cluster,
	.bar.sheet .cluster + .overlays {
		border-top: 1px solid var(--hud-rule);
		border-radius: 0;
		padding-top: 10px;
	}
	.bar.sheet .overlays {
		justify-items: stretch;
	}
	.bar.sheet .legend {
		width: auto;
	}
	.bar.sheet .seg-text {
		display: inline;
	}
	/* The overlays in one row, each its icon over its name, as the toolbar's tools are. */
	.bar.sheet .overlays .seg {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		width: 100%;
	}
	.bar.sheet .overlays .seg > button {
		flex-direction: column;
		gap: 3px;
		min-width: 0;
		min-height: 54px;
		padding: 6px 2px 5px;
	}
	.bar.sheet .overlays .seg-text {
		font-size: 11px;
		white-space: nowrap;
	}
	.bar.sheet .time .seg {
		flex: 1;
	}
	.bar.sheet .time .seg > button {
		flex: 1;
	}
	.bar.sheet .right {
		justify-content: space-between;
	}
	/* The legend with the sheet shut: a small card under the top bar, out of the way of the sheets. */
	.legend.floating {
		position: fixed;
		top: calc(70px + env(safe-area-inset-top));
		left: calc(10px + env(safe-area-inset-left));
		width: min(232px, calc(100vw - 20px));
		padding: 8px 12px 6px;
		border-radius: 14px;
		pointer-events: none;
	}
	.legend.floating .legend-title {
		margin-bottom: 5px;
		font-size: 11px;
	}
	.legend.floating .legend-bar {
		height: 6px;
	}
</style>
