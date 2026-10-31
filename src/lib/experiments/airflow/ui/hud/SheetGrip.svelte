<script lang="ts">
	import { tick } from 'svelte';
	import { useHudUi, type SheetSize } from './ui.svelte';

	/**
	 * The grabber along the top of a bottom sheet on a phone, as a phone's own sheets have. A tap (or Enter) shows all of the sheet or folds
	 * it back to its peek: its title and its first row, with the world above it. A drag does the same, the sheet following the finger: up
	 * to show all of it, down to fold it to its peek, and down again from the peek to close it. A sheet with no peek (`peek` false, a
	 * picker or Advanced) only closes. The sheet is the nearest `[data-sheet]` round the grabber; `label` names it.
	 */
	let { label, peek = true, onclose }: { label: string; peek?: boolean; onclose?: () => void } = $props();

	const ui = useHudUi();
	const full = $derived(!peek || ui.sheetSize === 'full');
	/** A drag this far, px, or a flick this fast, px/ms, is a choice; less springs back. */
	const DRAG = 48;
	const FLICK = 0.45;
	const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

	let press: { id: number; y: number; at: number; sheet: HTMLElement; moved: boolean; offset: number } | null = null;
	/** When the last drag ended, ms: the click a browser may send after it is not a tap. */
	let dragged = -Infinity;

	const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

	/** Folds or unfolds the sheet, and eases its height from what it was to what it is now. */
	async function resize(next: SheetSize, sheet: HTMLElement | null) {
		const before = sheet?.getBoundingClientRect().height ?? 0;
		ui.sheetSize = next;
		await tick();
		if (!sheet || !sheet.isConnected || reduced()) return;
		const after = sheet.getBoundingClientRect().height;
		if (Math.abs(after - before) < 2) return;
		sheet.animate([{ height: `${before}px`, overflow: 'hidden' }, { height: `${after}px`, overflow: 'hidden' }], { duration: 300, easing: EASE });
	}

	/** Slides the sheet down out of sight, then closes it. */
	async function dismiss(sheet: HTMLElement, from: number) {
		if (!reduced()) {
			const away = sheet.getBoundingClientRect().height + 40;
			await sheet.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${away}px)`, opacity: 0.4 }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
		}
		onclose?.();
	}

	function settle(sheet: HTMLElement, from: number) {
		sheet.style.transform = '';
		if (from && !reduced()) sheet.animate([{ transform: `translateY(${from}px)` }, { transform: 'none' }], { duration: 240, easing: EASE });
	}

	function click(event: MouseEvent) {
		if (performance.now() - dragged < 400) return;
		const sheet = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-sheet]');
		if (!peek) onclose?.();
		else void resize(full ? 'peek' : 'full', sheet);
	}

	function down(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const sheet = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-sheet]');
		if (!sheet) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		press = { id: event.pointerId, y: event.clientY, at: performance.now(), sheet, moved: false, offset: 0 };
	}

	function move(event: PointerEvent) {
		if (!press || event.pointerId !== press.id) return;
		const dy = event.clientY - press.y;
		if (!press.moved && Math.abs(dy) < 6) return;
		press.moved = true;
		// Down, the sheet follows the finger behind the toolbar; up, it gives a little, as if pulled.
		press.offset = dy > 0 ? dy : dy * 0.18;
		press.sheet.style.transform = `translateY(${press.offset}px)`;
	}

	function up(event: PointerEvent) {
		if (!press || event.pointerId !== press.id) return;
		const { sheet, y, at, moved, offset } = press;
		press = null;
		if (!moved) return;
		dragged = performance.now();
		const dy = event.clientY - y;
		const speed = dy / Math.max(1, performance.now() - at);
		if (dy > DRAG || speed > FLICK) {
			if (peek && full) {
				settle(sheet, offset);
				void resize('peek', sheet);
			} else void dismiss(sheet, offset);
		} else if ((dy < -DRAG || speed < -FLICK) && peek && !full) {
			settle(sheet, offset);
			void resize('full', sheet);
		} else settle(sheet, offset);
	}

	function cancel(event: PointerEvent) {
		if (!press || event.pointerId !== press.id) return;
		settle(press.sheet, press.offset);
		press = null;
	}
</script>

<button
	type="button"
	class="grip"
	aria-expanded={peek ? full : undefined}
	aria-label={peek ? `Show all of ${label}` : `Close ${label}`}
	onclick={click}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={cancel}
>
	<span class="bar" aria-hidden="true"></span>
</button>

<style>
	/* A wide, short target along the sheet's top edge, the bar in its middle. The sheet keeps room for it with its top padding. */
	.grip {
		position: absolute;
		top: 0;
		left: 50%;
		z-index: 1;
		display: grid;
		place-items: start center;
		width: min(160px, 50%);
		height: 24px;
		padding: 7px 0 0;
		border: 0;
		border-radius: 0 0 12px 12px;
		background: transparent;
		transform: translateX(-50%);
		cursor: grab;
		touch-action: none;
	}
	.grip:active {
		cursor: grabbing;
	}
	.bar {
		width: 38px;
		height: 5px;
		border-radius: 3px;
		background: rgb(255 255 255 / 0.28);
		transition:
			background 160ms var(--hud-ease),
			width 160ms var(--hud-ease);
	}
	.grip:hover .bar,
	.grip:active .bar {
		width: 44px;
		background: rgb(255 255 255 / 0.46);
	}
	.grip:focus-visible {
		outline-offset: -2px;
	}
</style>
