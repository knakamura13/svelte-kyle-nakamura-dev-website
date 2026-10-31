<script lang="ts">
	import { useAirflow } from '../../experience.svelte';
	import { carryHint, isClick, turnCarried } from './carry';
	import { useHudUi } from './ui.svelte';
	import { overWorld } from './world';

	/**
	 * Carrying a device into the Home, and the pointer for the whole HUD. While a device is carried, the ghost follows the pointer over
	 * the world, a click there puts it down (or the chip says why it cannot go there), R turns it, and Escape or a right click puts it
	 * back. A drag straight out of a catalog card is the card's to finish (`CatalogDrawer`); a card that was clicked is carried from here.
	 */
	const experience = useAirflow();
	const ui = useHudUi();

	/** A press on the world while carrying: a click (a press that does not wander) puts the device down. */
	let press: { id: number; x: number; y: number } | null = null;
	/** Why the last click could not put it down, until the pointer moves on. */
	let refusal = $state('');
	let refusedAt = { x: 0, y: 0 };

	function follow(x: number, y: number) {
		if (!experience.carry) return;
		const at = overWorld(x, y) ? experience.bridge.pick?.(x, y) : null;
		if (at) experience.carryTo(at.x, at.z);
		else experience.carryAway();
	}

	function move(event: PointerEvent) {
		const over = overWorld(event.clientX, event.clientY);
		ui.pointer = { x: event.clientX, y: event.clientY, over };
		if (!experience.carry || ui.held) return;
		follow(event.clientX, event.clientY);
		if (refusal && !isClick(refusedAt, { x: event.clientX, y: event.clientY }, 24)) refusal = '';
	}

	function down(event: PointerEvent) {
		if (!experience.carry || ui.held) return;
		if (event.button === 2) {
			experience.cancelCarry();
			event.preventDefault();
			return;
		}
		if (event.button !== 0 || !overWorld(event.clientX, event.clientY)) return;
		// A finger has no hover: the ghost goes where it touches first.
		follow(event.clientX, event.clientY);
		press = { id: event.pointerId, x: event.clientX, y: event.clientY };
	}

	function up(event: PointerEvent) {
		const start = press;
		if (!start || start.id !== event.pointerId) return;
		press = null;
		if (!experience.carry || !isClick(start, { x: event.clientX, y: event.clientY })) return;
		refusal = experience.placeCarry() ?? '';
		refusedAt = { x: event.clientX, y: event.clientY };
	}

	function contextmenu(event: MouseEvent) {
		if (!experience.carry) return;
		event.preventDefault();
		experience.cancelCarry();
	}

	function keydown(event: KeyboardEvent) {
		const carry = experience.carry;
		if (!carry || event.altKey || event.ctrlKey || event.metaKey || (event.key !== 'r' && event.key !== 'R')) return;
		if ((event.target as HTMLElement | null)?.closest('input:not([type="range"]), textarea')) return;
		experience.turnCarry(turnCarried(carry.yaw, experience.drag?.yaw, event.shiftKey ? -1 : 1));
		event.preventDefault();
	}

	const hint = $derived(experience.carry ? carryHint(experience.drag, ui.held, !!experience.carry.moving) : null);
	const name = $derived(experience.carry ? (experience.models.find((m) => m.id === experience.carry!.model)?.name ?? '') : '');
	const tone = $derived(refusal ? 'refused' : (hint?.tone ?? 'away'));
	const left = $derived(Math.min(ui.pointer.x + 18, (typeof innerWidth === 'number' ? innerWidth : 1280) - 260));
	const top = $derived(Math.min(ui.pointer.y + 20, (typeof innerHeight === 'number' ? innerHeight : 800) - 90));
</script>

<svelte:window onpointermove={move} onpointerdowncapture={down} onpointerupcapture={up} oncontextmenucapture={contextmenu} onkeydown={keydown} />

{#if experience.carry && hint && ui.pointer.x >= 0}
	<div class="carry" data-tone={tone} style:left="{left}px" style:top="{top}px" aria-hidden="true">
		<span class="mark"></span>
		<span class="lines">
			<span class="name">{name}</span>
			<strong>{refusal ? 'It can’t go there' : hint.title}</strong>
			<span class="detail">{refusal || hint.detail}</span>
		</span>
	</div>
{/if}

<style>
	.carry {
		position: fixed;
		z-index: 30;
		display: flex;
		gap: 10px;
		max-width: 250px;
		padding: 9px 12px 10px 10px;
		border-radius: 14px;
		background: rgb(10 15 13 / 0.9);
		-webkit-backdrop-filter: var(--hud-blur);
		backdrop-filter: var(--hud-blur);
		box-shadow:
			0 12px 28px rgb(0 0 0 / 0.35),
			inset 0 0 0 1px rgb(255 255 255 / 0.1);
		pointer-events: none;
		animation: hud-in 140ms var(--hud-ease);
	}
	.mark {
		flex: none;
		width: 10px;
		height: 10px;
		margin-top: 18px;
		border-radius: 50%;
		background: var(--hud-dim);
		box-shadow: 0 0 0 3px rgb(255 255 255 / 0.08);
	}
	[data-tone='ok'] .mark {
		background: #3fcf86;
		box-shadow: 0 0 0 3px rgb(63 207 134 / 0.25);
	}
	[data-tone='refused'] .mark {
		background: var(--hud-danger-fill);
		box-shadow: 0 0 0 3px rgb(229 72 77 / 0.25);
	}
	.lines {
		display: grid;
		gap: 1px;
		font-size: 12px;
		line-height: 1.35;
	}
	.name {
		color: var(--hud-muted);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	strong {
		font-size: 13px;
		font-weight: 750;
	}
	.detail {
		color: var(--hud-muted);
	}
	[data-tone='refused'] .detail {
		color: var(--hud-danger);
	}
</style>
