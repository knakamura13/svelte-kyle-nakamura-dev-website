<script lang="ts">
	import { useAirflow } from '../../experience.svelte';
	import type { Tool } from '../../state';
	import Icon from './Icon.svelte';
	import { TOOLS } from './tools';
	import { tooltip } from './tips.svelte';
	import { useHudUi } from './ui.svelte';

	/**
	 * The tools, down the left edge (along the bottom on a phone, with Pause and the View sheet beside them): what a click on the world
	 * does. A toolbar, so the arrow keys move between the tools and Tab leaves it; 1 to 4 pick a tool from anywhere.
	 */
	const experience = useAirflow();
	const ui = useHudUi();
	const ICONS = { select: 'select', build: 'build', probe: 'probe', smoke: 'smoke' } as const;
	const counts = $derived<Partial<Record<Tool, number>>>({ build: experience.setup.devices.length, probe: experience.probes.length });

	let rail: HTMLElement | undefined = $state();

	// The first frame's one invitation, beside Build, until the visitor builds something or puts the hint away.
	const hinting = $derived(ui.hint && experience.tool === 'select' && !experience.menu && !ui.popover && experience.setup.devices.length === 0 && !experience.carry);
	$effect(() => {
		if (experience.tool === 'build' || experience.setup.devices.length > 0) ui.hint = false;
	});

	/** Arrow keys move along the toolbar; Home and End go to its ends. */
	function keydown(event: KeyboardEvent) {
		const keys = ui.phone ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
		if (![...keys, 'Home', 'End'].includes(event.key) || !rail) return;
		const buttons = [...rail.querySelectorAll<HTMLButtonElement>('button')];
		const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (at < 0) return;
		const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + (event.key === keys[1] ? 1 : -1) + buttons.length) % buttons.length;
		buttons[next].focus();
		event.preventDefault();
	}
</script>

<div class="rail-wrap">
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="rail glass" role="toolbar" aria-label="Tools" aria-orientation={ui.phone ? 'horizontal' : 'vertical'} tabindex="-1" bind:this={rail} onkeydown={keydown}>
	{#each TOOLS as info, i (info.id)}
		<button
			type="button"
			class="tool"
			aria-pressed={experience.tool === info.id}
			tabindex={experience.tool === info.id ? 0 : -1}
			data-tool={info.id}
			use:tooltip={{ label: info.label, hint: info.hint, keys: String(i + 1), side: ui.phone ? 'top' : 'right' }}
			onclick={() => experience.setTool(info.id)}
		>
			<Icon name={ICONS[info.id]} size={22} />
			<span class="tool-label">{info.label}</span>
			{#if counts[info.id]}<span class="badge" aria-hidden="true">{counts[info.id]}</span>{/if}
		</button>
	{/each}
	{#if ui.phone}
		<span class="divider" aria-hidden="true"></span>
		<button
			type="button"
			class="tool"
			tabindex="-1"
			aria-label={experience.clock.paused ? 'Resume' : 'Pause'}
			onclick={() => experience.togglePause()}
		>
			<Icon name={experience.clock.paused ? 'play' : 'pause'} size={22} />
			<span class="tool-label" aria-hidden="true">{experience.clock.paused ? 'Play' : 'Pause'}</span>
		</button>
		<button type="button" class="tool" tabindex="-1" aria-expanded={ui.popover === 'view'} aria-controls="hud-view-sheet" onclick={() => ui.toggle('view')}>
			<Icon name="more" size={22} />
			<span class="tool-label">View</span>
		</button>
	{/if}
</div>
{#if hinting}
	<div class="hint glass" role="note">
		<span class="hint-dot" aria-hidden="true"></span>
		<p><strong>Drop a fan</strong> and watch the air change.</p>
		<button type="button" class="ibtn hint-close" aria-label="Dismiss the hint" onclick={() => (ui.hint = false)}><Icon name="close" size={14} /></button>
	</div>
{/if}
</div>

<style>
	.rail-wrap {
		position: relative;
	}
	.hint {
		position: absolute;
		top: 76px;
		left: calc(100% + 14px);
		display: flex;
		align-items: center;
		gap: 10px;
		width: max-content;
		max-width: 300px;
		padding: 4px 4px 4px 14px;
		border-radius: 16px;
		animation:
			hud-slide 420ms 900ms var(--hud-ease) backwards,
			hint-bob 2.8s 1.4s ease-in-out infinite;
	}
	/* A small pointer from the bubble to the Build tool. */
	.hint::before {
		content: '';
		position: absolute;
		left: -6px;
		top: 50%;
		width: 12px;
		height: 12px;
		background: var(--hud-glass);
		transform: translateY(-50%) rotate(45deg);
		border-radius: 2px;
	}
	.hint p {
		margin: 0;
		font-size: 13px;
		white-space: nowrap;
	}
	.hint strong {
		color: var(--hud-accent);
		font-weight: 800;
	}
	.hint-dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--hud-accent);
		box-shadow: 0 0 0 4px rgb(95 213 154 / 0.22);
	}
	.hint-close {
		color: var(--hud-muted);
	}
	@keyframes hint-bob {
		50% {
			transform: translateX(4px);
		}
	}
	:global(.hud.phone) .hint {
		top: auto;
		bottom: calc(100% + 12px);
		left: 50%;
		transform: translateX(-50%);
		animation: hud-rise 420ms 900ms var(--hud-ease) backwards;
	}
	:global(.hud.phone) .hint::before {
		left: 50%;
		top: auto;
		bottom: -6px;
		transform: translateX(-50%) rotate(45deg);
	}
	.rail {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px;
		border-radius: 22px;
		animation: hud-slide 260ms var(--hud-ease);
	}
	.tool {
		position: relative;
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 3px;
		width: 60px;
		min-height: 60px;
		padding: 6px 0 5px;
		border: 0;
		border-radius: 16px;
		background: transparent;
		color: var(--hud-text);
		transition:
			background 180ms var(--hud-ease),
			color 180ms var(--hud-ease),
			transform 180ms var(--hud-ease);
	}
	.tool:hover {
		background: var(--hud-hover);
	}
	.tool:active {
		transform: scale(0.95);
	}
	.tool[aria-expanded='true'] {
		background: var(--hud-press);
	}
	.tool[aria-pressed='true'] {
		background: var(--hud-accent);
		color: var(--hud-accent-ink);
		box-shadow:
			0 8px 22px rgb(95 213 154 / 0.3),
			inset 0 1px 0 rgb(255 255 255 / 0.35);
	}
	.tool-label {
		font-size: 10.5px;
		font-weight: 750;
		letter-spacing: 0.02em;
	}
	.badge {
		position: absolute;
		top: 5px;
		right: 7px;
		min-width: 17px;
		height: 17px;
		padding: 0 4px;
		border-radius: 9px;
		background: #fff;
		color: #0d1310;
		font-size: 10px;
		font-weight: 800;
		line-height: 17px;
		text-align: center;
		box-shadow: 0 2px 6px rgb(0 0 0 / 0.3);
	}
	.divider {
		width: 1px;
		margin: 8px 2px;
		background: var(--hud-rule);
	}
	:global(.hud.phone) .rail {
		flex-direction: row;
		justify-content: space-between;
		padding: 5px;
		border-radius: 20px;
		animation-name: hud-rise;
	}
	:global(.hud.phone) .tool {
		flex: 1;
		width: auto;
		min-width: 44px;
		min-height: 54px;
	}
</style>
