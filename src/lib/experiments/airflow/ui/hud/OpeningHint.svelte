<script lang="ts">
	import { onMount } from 'svelte';
	import { useAirflow } from '../../experience.svelte';
	import { visitMemory } from '../../load';
	import { useAirflowLoading } from '../../loading.svelte';
	import Icon from './Icon.svelte';
	import { useHudUi } from './ui.svelte';

	/**
	 * The first frame's one invitation: a bubble that points at the Build tool, "Drop a fan and watch the air change." It comes up a
	 * moment after the world is on show, while the opening's camera is still drifting, and waits while the visitor does something else
	 * (another tool, a menu, a panel, a device being carried). It goes for the rest of the visit once a device is placed or it is
	 * dismissed, and the visit remembers that, so a reload does not bring it back. It finds the Build tool wherever the HUD's layout
	 * puts it: beside the rail on a desktop, in the toolbar along the bottom on a phone.
	 */
	const experience = useAirflow();
	const ui = useHudUi();
	const loading = useAirflowLoading();
	const visit = loading?.visit ?? visitMemory();

	/** How long after the world is on show the bubble comes up, ms: the world first, then the invitation. */
	const DELAY = { play: 1800, other: 900 } as const;
	/** The least room kept between the bubble and the window's edge, px. */
	const EDGE = 12;

	const revealed = $derived(!loading || loading.phase !== 'loading');
	let due = $state(false);
	let anchor = $state<{ x: number; y: number; width: number; height: number } | null>(null);
	let width = $state(0);
	let viewport = $state(0);

	const shown = $derived(
		due &&
			ui.hint &&
			anchor !== null &&
			experience.tool === 'select' &&
			!experience.menu &&
			!ui.popover &&
			!ui.panel &&
			!experience.carry &&
			experience.setup.devices.length === 0
	);

	/** Where the Build tool is now, px from the window's corner. */
	function measure() {
		const button = document.querySelector<HTMLElement>('.hud [data-tool="build"]');
		const box = button?.getBoundingClientRect();
		anchor = box && box.width > 0 ? { x: box.left, y: box.top, width: box.width, height: box.height } : null;
		viewport = innerWidth;
	}

	function dismiss() {
		ui.hint = false;
		visit.rememberHintGone();
	}

	onMount(() => {
		if (visit.hintGone()) ui.hint = false;
		measure();
		addEventListener('resize', measure);
		return () => removeEventListener('resize', measure);
	});

	// Due a moment after the world is on show (at once where there is no loading screen to wait for).
	$effect(() => {
		if (!revealed || due) return;
		const timer = setTimeout(
			() => {
				measure();
				due = true;
			},
			loading?.mode === 'play' ? DELAY.play : DELAY.other
		);
		return () => clearTimeout(timer);
	});

	// The layout may move the rail (a phone turned, a panel opened): find the Build tool again when the bubble may show.
	$effect(() => {
		void ui.phone;
		void ui.insets;
		void experience.tool;
		if (due) requestAnimationFrame(measure);
	});

	// A device the visitor places once the world is on show ends the invitation for the visit. One that comes with a Scenario does not.
	let placed = experience.setup.devices.length;
	$effect(() => {
		const count = experience.setup.devices.length;
		if (count > placed && experience.scenario === null && revealed && ui.hint) dismiss();
		placed = count;
	});

	const phone = $derived(ui.phone);
	/** The bubble's corner and where its pointer meets it: beside the Build tool on a desktop, over it on a phone, inside the window either way. */
	const place = $derived.by(() => {
		if (!anchor) return null;
		if (!phone) return { left: anchor.x + anchor.width + 16, top: anchor.y + anchor.height / 2, arrow: 0 };
		const middle = anchor.x + anchor.width / 2;
		const left = Math.max(EDGE, Math.min(middle - width / 2, viewport - EDGE - width));
		return { left, top: anchor.y - 12, arrow: middle - left };
	});
</script>

{#if shown && place}
	<div class="opening-hint glass" class:phone role="note" style:left="{place.left}px" style:top="{place.top}px" style:--arrow="{place.arrow}px" bind:offsetWidth={width}>
		<span class="dot" aria-hidden="true"></span>
		<p><strong>Drop a fan</strong> and watch the air change.</p>
		<button type="button" class="ibtn close" aria-label="Dismiss the hint" onclick={dismiss}><Icon name="close" size={14} /></button>
	</div>
{/if}

<style>
	.opening-hint {
		position: fixed;
		z-index: 4;
		display: flex;
		align-items: center;
		gap: 10px;
		width: max-content;
		max-width: calc(100vw - 24px);
		padding: 4px 4px 4px 14px;
		border-radius: 16px;
		transform: translateY(-50%);
		/* It nudges toward the Build tool three times as it comes up, then rests, so it asks once and is then easy to read and to dismiss. */
		animation:
			hint-in 520ms var(--hud-ease) backwards,
			hint-bob 1.3s 0.7s ease-in-out 3;
	}
	.opening-hint:hover {
		animation-play-state: paused;
	}
	/* A small pointer from the bubble to the Build tool. */
	.opening-hint::before {
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
	.opening-hint p {
		margin: 0;
		font-size: 13px;
		white-space: nowrap;
	}
	.opening-hint strong {
		color: var(--hud-accent);
		font-weight: 800;
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--hud-accent);
		box-shadow: 0 0 0 4px rgb(95 213 154 / 0.22);
		animation: dot-glow 2.2s ease-in-out infinite;
	}
	.close {
		color: var(--hud-muted);
	}
	@keyframes hint-in {
		from {
			opacity: 0;
			translate: -10px 0;
		}
	}
	@keyframes hint-bob {
		50% {
			translate: 4px 0;
		}
	}
	@keyframes dot-glow {
		50% {
			box-shadow: 0 0 0 7px rgb(95 213 154 / 0.08);
		}
	}
	/* On a phone the Build tool is in the toolbar along the bottom: the bubble stands over it, its pointer down at the tool. */
	.opening-hint.phone {
		transform: translateY(-100%);
		animation:
			hint-rise 520ms var(--hud-ease) backwards,
			hint-float 1.3s 0.7s ease-in-out 3;
	}
	.opening-hint.phone::before {
		left: calc(var(--arrow) - 6px);
		top: auto;
		bottom: -6px;
		transform: rotate(45deg);
	}
	@keyframes hint-rise {
		from {
			opacity: 0;
			translate: 0 10px;
		}
	}
	@keyframes hint-float {
		50% {
			translate: 0 -4px;
		}
	}
</style>
