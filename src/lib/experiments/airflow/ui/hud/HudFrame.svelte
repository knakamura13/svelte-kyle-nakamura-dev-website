<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { useAirflow } from '../../experience.svelte';
	import Hud from './Hud.svelte';

	/**
	 * The HUD's preview on today's page (`?hud`): the Stage fills the window and the HUD sits over it. The full-screen route that
	 * replaces the page renders its own world and only needs `<Hud {status} />` over it; this frame goes then.
	 */
	let { status, children }: { status: string; children: Snippet } = $props();

	const experience = useAirflow();
	let frame: HTMLElement;

	onMount(() => {
		// The site's header, menu and footer are still on the page under the frame: they leave the tab order and the accessibility tree
		// while the frame covers them, so the keyboard does not walk through things it cannot see.
		const shell = [...document.querySelectorAll<HTMLElement>('.concept-skip, .concept-header, .concept-footer, .floating-nav')].filter((element) => !element.contains(frame) && !element.inert);
		for (const element of shell) element.inert = true;
		document.documentElement.classList.add('airflow-hud-open');
		return () => {
			for (const element of shell) element.inert = false;
			document.documentElement.classList.remove('airflow-hud-open');
		};
	});
</script>

<div
	class="hud-frame experiment airflow"
	bind:this={frame}
	data-stage-region
	data-tool={experience.tool}
	data-hovering={experience.hovered ? '' : undefined}
	data-carrying={experience.carry ? '' : undefined}
>
	{@render children()}
	<Hud {status} />
	<p id="stage-help" class="sr-only">
		The 3D view can be focused. When it is, the arrow keys rotate it, plus and minus zoom, and zero resets it. With the Probe or the
		Smoke tool, the arrow keys move a cursor over the air instead: Enter pins a probe, or starts and stops smoke, at the cursor, Shift
		makes the steps bigger, and Escape puts the cursor away. Everything in the home can also be chosen and changed from the Inspector.
	</p>
</div>

<style>
	.hud-frame {
		position: fixed;
		inset: 0;
		z-index: 200;
		overflow: hidden;
		background: #dde7ee;
		isolation: isolate;
	}
	/* The Stage fills the window: no card, no corner radius, no fixed height. */
	.hud-frame :global(.stage-view) {
		position: absolute;
		inset: 0;
		height: auto;
		aspect-ratio: auto;
		border-radius: 0;
	}
	/* The world's own focus ring: a thin line inside the edge of the window, under the HUD. */
	.hud-frame :global(.stage-view:focus-visible::after) {
		border: 2px solid rgb(95 213 154 / 0.75);
		border-radius: 0;
	}
	/* The cursor says what a click does. */
	.hud-frame[data-hovering] :global(.stage-view canvas) {
		cursor: pointer;
	}
	.hud-frame[data-tool='probe'] :global(.stage-view canvas),
	.hud-frame[data-tool='smoke'] :global(.stage-view canvas) {
		cursor: crosshair;
	}
	.hud-frame[data-carrying] :global(.stage-view canvas) {
		cursor: copy;
	}
	/* The page under the frame does not scroll while the frame covers it. */
	:global(html.airflow-hud-open),
	:global(html.airflow-hud-open body) {
		overflow: hidden;
	}
</style>
