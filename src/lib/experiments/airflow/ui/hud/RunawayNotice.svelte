<script lang="ts">
	import { tick } from 'svelte';
	import { useAirflow } from '../../experience.svelte';
	import Icon from './Icon.svelte';

	/**
	 * What the HUD shows when the simulation ran away (sim/runaway.ts): why it stopped, a primary Reset that puts the home back the way it
	 * began, and a quiet Restart that runs the same setup again from still air. It stands in the middle of the world, whose air is hidden,
	 * and takes the status line's place while it shows (Hud.svelte hides that line), so the reason is on screen once.
	 *
	 * It is not a live region. The session tells a screen reader once, politely, through the HUD's announcement, and a second region saying
	 * the same would be heard twice. Its buttons are in the HUD's Tab order, the first stops after the 3D view, 44 px high as every HUD control.
	 * A button pressed from the keyboard goes away with the notice, so the focus moves to the 3D view, where the run starts again.
	 */
	const experience = useAirflow();
	let notice: HTMLElement | undefined = $state();

	async function act(what: 'reset' | 'restart') {
		const focused = notice?.contains(document.activeElement) ?? false;
		if (what === 'reset') experience.reset();
		else experience.restart();
		if (!focused) return;
		await tick();
		document.querySelector<HTMLElement>('[data-stage-region] [role="application"]')?.focus();
	}
</script>

<div class="runaway-notice glass deep" role="group" aria-labelledby="runaway-title" bind:this={notice}>
	<p class="eyebrow stopped">Stopped</p>
	<h2 id="runaway-title">The simulation ran away</h2>
	<p class="why">{experience.readout.note}</p>
	<div class="actions">
		<button type="button" class="btn primary" onclick={() => act('reset')}><Icon name="reset" size={18} />Reset</button>
		<button type="button" class="btn quiet" onclick={() => act('restart')}><Icon name="restart" size={18} />Restart</button>
	</div>
</div>

<style>
	.runaway-notice {
		position: absolute;
		left: 50%;
		top: 50%;
		z-index: 4;
		width: min(420px, calc(100% - 32px));
		padding: 18px 20px 16px;
		/* `translate`, not `transform`, so the HUD's rise-in animation (a transform) does not undo the centring while it plays. */
		translate: -50% -50%;
		animation: hud-in 360ms var(--hud-ease) backwards;
	}
	/* Heavier than the HUD's own `.eyebrow` rule, which wins over a plain `.runaway-notice .eyebrow`. */
	.runaway-notice .eyebrow.stopped {
		color: var(--hud-danger);
	}
	/* The Inspector's title. */
	h2 {
		margin: 6px 0 0;
		font-family: 'Manrope Variable', system-ui, sans-serif;
		font-size: 17px;
		font-weight: 800;
		letter-spacing: -0.015em;
		line-height: 1.25;
	}
	.why {
		margin: 8px 0 0;
		color: var(--hud-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 16px;
	}
	.actions .primary {
		flex: 1 1 auto;
	}
</style>
