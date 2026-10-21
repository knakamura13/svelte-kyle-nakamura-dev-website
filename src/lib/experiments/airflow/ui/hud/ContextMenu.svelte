<script lang="ts">
	import { useAirflow } from '../../experience.svelte';
	import Icon from './Icon.svelte';
	import { menuFor } from './inventory';
	import { placeCard, type CardPlacement } from './layout';
	import MenuBody from './MenuBody.svelte';
	import SheetGrip from './SheetGrip.svelte';
	import { homeContext } from './context';
	import { useHudUi } from './ui.svelte';
	import { focusWorld } from './world';

	/**
	 * The context menu of the thing clicked in the world: a small card that hangs beside it and follows it as the camera moves, with a
	 * pointer to it. On a phone it is a sheet over the toolbar. Escape or the close button closes it; the choice stays for the Inspector.
	 */
	const experience = useAirflow();
	const ui = useHudUi();
	const target = $derived(experience.menu ? experience.selection : null);
	const menu = $derived(target ? menuFor(target, homeContext(experience)) : null);
	const KIND_ICONS = { window: 'window', door: 'door', fan: 'fan', purifier: 'purifier', probe: 'probe' } as const;

	let card: HTMLElement | undefined = $state();
	let width = $state(300);
	let height = $state(200);
	let placement: CardPlacement | null = $state.raw(null);

	// Each frame while it is open: where the thing is on screen now, and where the card goes beside it, inside the free part of the window.
	$effect(() => {
		if (!target || ui.phone) return;
		const current = target;
		let frame = 0;
		const follow = () => {
			const anchor = experience.bridge.anchor?.(current) ?? null;
			const next = placeCard(anchor, { width, height }, { width: innerWidth, height: innerHeight }, ui.insets);
			if (!placement || next.left !== placement.left || next.top !== placement.top || next.side !== placement.side || next.notch?.x !== placement.notch?.x || next.notch?.y !== placement.notch?.y) placement = next;
			frame = requestAnimationFrame(follow);
		};
		follow();
		return () => cancelAnimationFrame(frame);
	});

	// A menu that closes with the focus inside it (Remove, Escape) leaves the focus on the 3D view, not on the page.
	$effect(() => {
		if (!target) return;
		const element = card;
		return () => {
			if (element?.contains(document.activeElement)) focusWorld();
		};
	});
</script>

{#if target && menu}
	<div
		class="menu glass deep"
		class:sheet={ui.phone}
		role="dialog"
		aria-label={menu.title}
		data-kind={menu.kind}
		data-side={placement?.side}
		style:left={ui.phone ? undefined : `${placement?.left ?? -9999}px`}
		style:top={ui.phone ? undefined : `${placement?.top ?? -9999}px`}
		data-sheet={ui.phone ? '' : undefined}
		bind:this={card}
		bind:clientWidth={width}
		bind:clientHeight={height}
	>
		{#if ui.phone}<SheetGrip label={menu.title} onclose={() => experience.closeMenu()} />{/if}
		{#if placement?.notch && !ui.phone}
			<span class="notch" data-side={placement.side} style:left="{placement.notch.x}px" style:top="{placement.notch.y}px" aria-hidden="true"></span>
		{/if}
		<header class="head">
			<span class="kind" data-kind={menu.kind} aria-hidden="true"><Icon name={KIND_ICONS[menu.kind]} size={20} /></span>
			<div class="titles">
				<p class="title">{menu.title}</p>
				<p class="subtitle">{menu.subtitle}</p>
			</div>
			<button type="button" class="ibtn close" aria-label="Close the menu" onclick={() => experience.closeMenu()}><Icon name="close" size={18} /></button>
		</header>
		<MenuBody {target} {menu} compact />
		<button type="button" class="btn quiet details sheet-more" onclick={() => (ui.inspector = true)}>
			<Icon name="details" size={16} />
			<span>All settings</span>
		</button>
	</div>
{/if}

<style>
	.menu {
		position: fixed;
		z-index: 20;
		display: grid;
		gap: 12px;
		width: 300px;
		padding: 12px 14px 8px;
		border-radius: 20px;
		pointer-events: auto;
		animation: hud-in 180ms var(--hud-ease);
	}
	.notch {
		position: absolute;
		width: 14px;
		height: 14px;
		background: var(--hud-glass-deep);
		transform: translate(-50%, -50%) rotate(45deg);
		border-radius: 3px;
	}
	.notch[data-side='right'] {
		box-shadow: inset 1px -1px 0 transparent, -1px 1px 0 var(--hud-edge);
	}
	.notch[data-side='left'] {
		box-shadow: 1px -1px 0 var(--hud-edge);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.kind {
		display: grid;
		place-items: center;
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: 12px;
		background: rgb(95 213 154 / 0.15);
		color: var(--hud-accent);
	}
	.kind[data-kind='probe'] {
		background: rgb(140 200 239 / 0.16);
		color: #9fd3f5;
	}
	.titles {
		flex: 1;
		min-width: 0;
	}
	.title {
		margin: 0;
		font-size: 15px;
		font-weight: 800;
		letter-spacing: -0.01em;
		line-height: 1.25;
	}
	.subtitle {
		margin: 1px 0 0;
		color: var(--hud-muted);
		font-size: 11.5px;
		line-height: 1.35;
	}
	.close {
		align-self: start;
		margin: -8px -10px -4px 0;
		color: var(--hud-muted);
	}
	.details {
		justify-self: end;
		min-height: 40px;
		padding: 0 10px;
		color: var(--hud-muted);
		font-size: 12px;
	}
	.menu.sheet {
		left: calc(10px + env(safe-area-inset-left));
		right: calc(10px + env(safe-area-inset-right));
		bottom: calc(86px + env(safe-area-inset-bottom));
		gap: 10px;
		width: auto;
		max-height: 60vh;
		padding: 22px 14px 10px;
		overflow-y: auto;
		overscroll-behavior: contain;
		animation-name: hud-rise;
	}
	/* At its peek, the title and the presets (or a probe's reading); the fine control, the notes and the actions wait for the grabber. */
	:global(.hud.phone[data-sheet-size='peek']) .menu.sheet :global(:is(.fine, .caption, .note, .actions)) {
		display: none;
	}
	.menu.sheet .close {
		margin: -6px -8px -4px 0;
	}
</style>
