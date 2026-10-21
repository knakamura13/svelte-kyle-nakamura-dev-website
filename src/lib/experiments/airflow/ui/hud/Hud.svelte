<script lang="ts">
	import { onMount } from 'svelte';
	import { useAirflow } from '../../experience.svelte';
	import type { Tool } from '../../state';
	import AboutPanel from './AboutPanel.svelte';
	import AdvancedPanel from './AdvancedPanel.svelte';
	import BottomBar from './BottomBar.svelte';
	import Carrier from './Carrier.svelte';
	import CatalogDrawer from './CatalogDrawer.svelte';
	import ContextMenu from './ContextMenu.svelte';
	import HoverLabel from './HoverLabel.svelte';
	import Inspector from './Inspector.svelte';
	import ProbeCards from './ProbeCards.svelte';
	import ProbePanel from './ProbePanel.svelte';
	import SmokePanel from './SmokePanel.svelte';
	import ToolRail from './ToolRail.svelte';
	import Tooltip from './Tooltip.svelte';
	import TopBar from './TopBar.svelte';
	import WeatherWidget from './WeatherWidget.svelte';
	import { provideHudUi } from './ui.svelte';

	/**
	 * The status line, written by the page: where the simulation runs and on what grid, why the grid is what it is (`tuning`), and how far
	 * behind the clock it runs (`behind`). The last two change as it runs, so they are kept out of what a screen reader reads.
	 */
	let { status, tuning = '', behind = '' }: { status: string; tuning?: string; behind?: string } = $props();

	const experience = useAirflow();
	const ui = provideHudUi();
	const tool = $derived(experience.tool);
	/** On a phone one sheet shows over the toolbar at a time: a small menu first, then the context menu, the Inspector, and the tool's panel. */
	const sheet = $derived(ui.popover ? 'popover' : experience.menu && experience.selection ? 'menu' : ui.inspector ? 'inspector' : tool !== 'select' ? 'tool' : undefined);
	const key = (target: { kind: string; id: string } | null) => (target ? `${target.kind}:${target.id}` : '');

	let top: HTMLElement | undefined = $state();
	let weather: HTMLElement | undefined = $state();
	let left: HTMLElement | undefined = $state();
	let right: HTMLElement | undefined = $state();
	let bottom: HTMLElement | undefined = $state();

	/** The free part of the window, for the context menu: inside the bars and the panels at each edge. */
	function measure() {
		const width = innerWidth;
		const height = innerHeight;
		const box = (element: HTMLElement | undefined) => element?.getBoundingClientRect();
		const gap = 12;
		const t = Math.max(box(top)?.bottom ?? 0, box(weather?.querySelector<HTMLElement>('.weather') ?? undefined)?.bottom ?? 0);
		const l = box(left);
		const r = box(right);
		const b = box(bottom);
		ui.insets = {
			left: (l && l.width > 0 ? l.right : 0) + gap,
			right: (r && r.width > 0 ? width - r.left : 0) + gap,
			top: t + gap,
			bottom: (b && b.height > 0 ? height - b.top : 0) + gap
		};
	}

	onMount(() => {
		const phone = matchMedia('(max-width: 699px)');
		const sync = () => (ui.phone = phone.matches);
		sync();
		phone.addEventListener('change', sync);
		const observer = new ResizeObserver(measure);
		for (const element of [top, weather, left, right, bottom]) if (element) observer.observe(element);
		addEventListener('resize', measure);
		measure();
		return () => {
			phone.removeEventListener('change', sync);
			observer.disconnect();
			removeEventListener('resize', measure);
		};
	});

	const TOOL_KEYS: Record<string, Tool> = { '1': 'select', '2': 'build', '3': 'probe', '4': 'smoke' };

	/** Keys for the whole HUD: 1 to 4 pick a tool, and Escape closes what is open, the innermost first. Not while typing, and not with a modifier. */
	function keydown(event: KeyboardEvent) {
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('input:not([type="range"]), textarea, select, [contenteditable="true"]')) return;
		if (event.key === 'Escape') {
			// About is a modal dialog and closes itself; Advanced closes here when the focus is not in it, and gives the focus back.
			if (ui.panel === 'about') return;
			if (ui.panel === 'advanced') ui.panel = null;
			else if (experience.carry) experience.cancelCarry();
			else if (ui.popover) ui.popover = null;
			else if (experience.menu) experience.closeMenu();
			else return;
			event.preventDefault();
			return;
		}
		if (event.repeat || target?.closest('[role="slider"], input[type="range"]')) return;
		const next = TOOL_KEYS[event.key];
		if (next) {
			experience.setTool(next);
			event.preventDefault();
		} else if (event.key === 'p' || event.key === 'P') {
			experience.togglePause();
			event.preventDefault();
		}
	}
</script>

<svelte:window onkeydown={keydown} />

<div
	class="hud"
	class:phone={ui.phone}
	data-tool={tool}
	data-hovered={key(experience.hovered)}
	data-selection={key(experience.selection)}
	data-menu={experience.menu ? '' : undefined}
	data-carrying={experience.carry ? '' : undefined}
	data-sheet={ui.phone ? sheet : undefined}
>
	<div class="hud-top" bind:this={top}><TopBar /></div>
	<div class="hud-weather" bind:this={weather}><WeatherWidget /></div>

	<div class="hud-left" bind:this={left}>
		<ToolRail />
		{#if tool === 'build'}<CatalogDrawer />{/if}
		{#if tool === 'probe'}<ProbePanel />{/if}
		{#if tool === 'smoke'}<SmokePanel />{/if}
	</div>

	<div class="hud-right" bind:this={right}>
		<Inspector />
		<ProbeCards />
	</div>

	<div class="hud-bottom" bind:this={bottom}><BottomBar /></div>

	<ContextMenu />
	<HoverLabel />
	<Carrier />
	<Tooltip />
	{#if ui.panel === 'about'}<AboutPanel />{/if}
	{#if ui.panel === 'advanced'}<AdvancedPanel />{/if}

	<p class="hud-status sim-status" role="status" data-status={experience.readout.status}>
		{status}{#if tuning}<span aria-hidden="true" data-tuning>{' '}{tuning}</span>{/if}{#if behind}<span aria-hidden="true" data-behind>{' '}{behind}</span>{/if}
	</p>
	<p class="sr-only" aria-live="polite">{experience.announcement}</p>
</div>

<style>
	/* The HUD's look, in one place: dark glass over the world, one accent, the site's type. Every part of the HUD draws with these. */
	.hud {
		--hud-accent: #5fd59a;
		--hud-accent-hover: #7fe2b0;
		--hud-accent-ink: #05261a;
		--hud-text: #f3f7f4;
		--hud-muted: #b9c6bf;
		--hud-dim: #aebdb5;
		--hud-danger: #ff9a9d;
		--hud-danger-fill: #e5484d;
		--hud-smoke: #f2a35c;
		--hud-glass: rgb(14 19 17 / 0.86);
		--hud-glass-deep: rgb(14 19 17 / 0.88);
		--hud-hover: rgb(255 255 255 / 0.08);
		--hud-press: rgb(255 255 255 / 0.14);
		--hud-well: rgb(255 255 255 / 0.05);
		--hud-edge: rgb(255 255 255 / 0.1);
		--hud-rule: rgb(255 255 255 / 0.09);
		--hud-shadow: 0 22px 48px rgb(4 9 7 / 0.34), 0 4px 14px rgb(4 9 7 / 0.22);
		--hud-blur: blur(20px) saturate(1.35);
		--hud-radius: 20px;
		--hud-radius-sm: 13px;
		--hud-ease: cubic-bezier(0.22, 1, 0.36, 1);
		/* What the site's own panels read, for the parts of the page the HUD shows inside its glass (the explainer, the Physics panel). */
		--ink: var(--hud-text);
		--muted: var(--hud-muted);
		--rule: var(--hud-rule);
		--accent: var(--hud-accent);
		--focus: var(--hud-accent);
		position: absolute;
		inset: 0;
		z-index: 2;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: 14px;
		padding: 16px;
		pointer-events: none;
		color: var(--hud-text);
		font-family: 'Manrope Variable', system-ui, sans-serif;
		font-size: 13px;
		line-height: 1.45;
		font-variant-numeric: tabular-nums;
		-webkit-font-smoothing: antialiased;
	}
	.hud-top {
		grid-area: 1 / 1 / 2 / 3;
		justify-self: start;
		align-self: start;
		min-width: 0;
	}
	/* The weather card hangs from the top right corner and opens downward over the right column, so opening it moves nothing else. */
	.hud-weather {
		grid-area: 1 / 3 / 2 / 4;
		justify-self: end;
		align-self: start;
		position: relative;
		z-index: 3;
	}
	.hud-left {
		grid-area: 2 / 1 / 3 / 2;
		display: flex;
		align-items: flex-start;
		gap: 12px;
		min-height: 0;
		max-height: 100%;
	}
	.hud-right {
		grid-area: 2 / 3 / 3 / 4;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 12px;
		min-height: 0;
		max-height: 100%;
	}
	.hud-bottom {
		grid-area: 3 / 1 / 4 / 4;
		min-width: 0;
	}
	.hud-status {
		position: absolute;
		left: 50%;
		bottom: 92px;
		transform: translateX(-50%);
		max-width: min(560px, calc(100% - 32px));
		margin: 0;
		padding: 6px 14px;
		border-radius: 100px;
		background: rgb(12 17 15 / 0.62);
		color: var(--hud-muted);
		font-size: 11.5px;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		pointer-events: none;
		opacity: 0;
		transition: opacity 400ms var(--hud-ease);
	}
	.hud-status:not([data-status='running']):not([data-status='paused']) {
		opacity: 1;
	}

	/* ---- the HUD's parts: glass, buttons, chips, segments, labels ---- */

	.hud :global(.glass) {
		pointer-events: auto;
		background-color: var(--hud-glass);
		background-image: linear-gradient(180deg, rgb(255 255 255 / 0.055), rgb(255 255 255 / 0) 46%);
		-webkit-backdrop-filter: var(--hud-blur);
		backdrop-filter: var(--hud-blur);
		border-radius: var(--hud-radius);
		box-shadow:
			var(--hud-shadow),
			inset 0 1px 0 rgb(255 255 255 / 0.07),
			inset 0 0 0 1px var(--hud-edge);
	}
	.hud :global(.glass.deep) {
		background-color: var(--hud-glass-deep);
	}
	.hud :global(button),
	.hud :global(a.ibtn),
	.hud :global(a.btn) {
		-webkit-tap-highlight-color: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.hud :global(:focus-visible) {
		outline: 2px solid var(--hud-accent);
		outline-offset: 2px;
	}
	/* An icon button: 44 px square at least, the icon in the middle; pressed, it fills with the accent. */
	.hud :global(.ibtn) {
		position: relative;
		display: inline-grid;
		place-items: center;
		min-width: 44px;
		min-height: 44px;
		padding: 0;
		border: 0;
		border-radius: var(--hud-radius-sm);
		background: transparent;
		color: var(--hud-text);
		text-decoration: none;
		transition:
			background 160ms var(--hud-ease),
			color 160ms var(--hud-ease),
			transform 160ms var(--hud-ease);
	}
	.hud :global(.ibtn:hover) {
		background: var(--hud-hover);
	}
	.hud :global(.ibtn:active) {
		background: var(--hud-press);
		transform: scale(0.96);
	}
	.hud :global(.ibtn[aria-pressed='true']),
	.hud :global(.ibtn.on) {
		background: var(--hud-accent);
		color: var(--hud-accent-ink);
		box-shadow: 0 6px 18px rgb(95 213 154 / 0.28);
	}
	.hud :global(.ibtn:disabled) {
		opacity: 0.4;
		cursor: default;
	}
	/* A button with words: 44 px tall, an icon before them when it has one. */
	.hud :global(.btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 16px;
		border: 0;
		border-radius: var(--hud-radius-sm);
		background: var(--hud-well);
		color: var(--hud-text);
		font-size: 13px;
		font-weight: 650;
		letter-spacing: -0.005em;
		white-space: nowrap;
		text-decoration: none;
		box-shadow: inset 0 0 0 1px var(--hud-edge);
		transition:
			background 160ms var(--hud-ease),
			color 160ms var(--hud-ease),
			transform 160ms var(--hud-ease);
	}
	.hud :global(.btn:hover) {
		background: var(--hud-hover);
	}
	.hud :global(.btn:active) {
		transform: scale(0.98);
	}
	.hud :global(.btn.primary) {
		background: var(--hud-accent);
		color: var(--hud-accent-ink);
		box-shadow: 0 8px 20px rgb(95 213 154 / 0.25);
	}
	.hud :global(.btn.primary:hover) {
		background: var(--hud-accent-hover);
	}
	.hud :global(.btn.danger) {
		color: var(--hud-danger);
	}
	.hud :global(.btn.quiet) {
		background: transparent;
		box-shadow: none;
	}
	.hud :global(.btn.quiet:hover) {
		background: var(--hud-hover);
	}
	/* Chips: a row of choices, one pressed. */
	.hud :global(.chips) {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.hud :global(.chip) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 14px;
		border: 0;
		border-radius: 100px;
		background: var(--hud-well);
		color: var(--hud-text);
		font-size: 12.5px;
		font-weight: 650;
		white-space: nowrap;
		box-shadow: inset 0 0 0 1px var(--hud-edge);
		transition:
			background 160ms var(--hud-ease),
			color 160ms var(--hud-ease),
			box-shadow 160ms var(--hud-ease);
	}
	.hud :global(.chip:hover) {
		background: var(--hud-hover);
	}
	.hud :global(.chip[aria-pressed='true']) {
		background: var(--hud-accent);
		color: var(--hud-accent-ink);
		box-shadow: none;
	}
	/* A segmented row: buttons in one well, the pressed one lit. */
	.hud :global(.seg) {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		border-radius: 15px;
		background: rgb(0 0 0 / 0.22);
		box-shadow: inset 0 0 0 1px var(--hud-edge);
	}
	.hud :global(.seg > button) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-width: 44px;
		min-height: 40px;
		padding: 0 12px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--hud-muted);
		font-size: 12.5px;
		font-weight: 650;
		white-space: nowrap;
		transition:
			background 160ms var(--hud-ease),
			color 160ms var(--hud-ease);
	}
	.hud :global(.seg > button:hover) {
		background: var(--hud-hover);
		color: var(--hud-text);
	}
	.hud :global(.seg > button[aria-pressed='true']),
	.hud :global(.seg > button[aria-selected='true']) {
		background: var(--hud-accent);
		color: var(--hud-accent-ink);
	}
	/* A small label over a group: capitals, spaced. */
	.hud :global(.eyebrow) {
		margin: 0;
		font-family: 'Manrope Variable', system-ui, sans-serif;
		line-height: 1.3;
		color: var(--hud-muted);
		font-size: 10.5px;
		font-weight: 750;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.hud :global(.key) {
		display: inline-grid;
		place-items: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 5px;
		background: rgb(255 255 255 / 0.1);
		box-shadow: inset 0 -1px 0 rgb(0 0 0 / 0.35), inset 0 0 0 1px rgb(255 255 255 / 0.12);
		color: var(--hud-text);
		font-size: 10.5px;
		font-weight: 750;
	}
	.hud :global(.scroll) {
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
		scrollbar-color: rgb(255 255 255 / 0.22) transparent;
	}
	/* A slider drawn for dark glass: a thin track that fills with the accent, and a round thumb. */
	.hud :global(input[type='range'].slider) {
		-webkit-appearance: none;
		appearance: none;
		display: block;
		width: 100%;
		height: 32px;
		margin: 0;
		background: transparent;
		cursor: pointer;
	}
	.hud :global(input[type='range'].slider::-webkit-slider-runnable-track) {
		height: 4px;
		border-radius: 4px;
		background: linear-gradient(to right, var(--hud-accent) var(--fill, 50%), rgb(255 255 255 / 0.16) var(--fill, 50%));
	}
	.hud :global(input[type='range'].slider::-moz-range-track) {
		height: 4px;
		border-radius: 4px;
		background: rgb(255 255 255 / 0.16);
	}
	.hud :global(input[type='range'].slider::-moz-range-progress) {
		height: 4px;
		border-radius: 4px;
		background: var(--hud-accent);
	}
	.hud :global(input[type='range'].slider::-webkit-slider-thumb) {
		-webkit-appearance: none;
		width: 20px;
		height: 20px;
		margin-top: -8px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.4), 0 0 0 4px rgb(95 213 154 / 0.25);
	}
	.hud :global(input[type='range'].slider::-moz-range-thumb) {
		width: 18px;
		height: 18px;
		border: 0;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.4), 0 0 0 4px rgb(95 213 154 / 0.25);
	}
	@keyframes -global-hud-in {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.985);
		}
	}
	@keyframes -global-hud-slide {
		from {
			opacity: 0;
			transform: translateX(-10px);
		}
	}
	@keyframes -global-hud-rise {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
	}

	/* ---- the phone: the rail is a toolbar along the bottom, and panels rise from it as sheets ---- */
	.hud.phone {
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: 8px;
		padding: 10px 10px calc(10px + env(safe-area-inset-bottom));
	}
	.hud.phone .hud-top {
		grid-area: 1 / 1 / 2 / 2;
	}
	.hud.phone .hud-weather {
		grid-area: 1 / 2 / 2 / 3;
	}
	.hud.phone .hud-left {
		grid-area: 3 / 1 / 4 / 3;
		flex-direction: column-reverse;
		align-items: stretch;
		gap: 8px;
		max-height: none;
	}
	.hud.phone .hud-right {
		grid-area: 2 / 1 / 3 / 3;
		align-self: end;
		align-items: stretch;
	}
	.hud.phone .hud-bottom {
		position: absolute;
		right: 10px;
		bottom: calc(10px + env(safe-area-inset-bottom));
	}
	.hud.phone .hud-status {
		bottom: auto;
		top: 64px;
	}
	/* One sheet at a time on a phone; the others wait under the one in front. */
	.hud.phone[data-sheet='popover'] .hud-left > :global(:not(.rail-wrap)),
	.hud.phone[data-sheet='menu'] .hud-left > :global(:not(.rail-wrap)),
	.hud.phone[data-sheet='inspector'] .hud-left > :global(:not(.rail-wrap)),
	.hud.phone[data-sheet='popover'] .hud-right,
	.hud.phone[data-sheet='menu'] .hud-right,
	.hud.phone[data-sheet='inspector'] .hud-right :global(.cards),
	.hud.phone[data-sheet='tool'] .hud-right :global(.cards),
	.hud.phone[data-sheet='popover'] :global(.menu.sheet) {
		display: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.hud :global(*),
		.hud :global(*::before),
		.hud :global(*::after) {
			animation: none !important;
			transition: none !important;
		}
	}
</style>
