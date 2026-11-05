<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { useAirflow } from '../../experience.svelte';
	import type { Quality, UnitSystem } from '../../state';
	import { OVERLAY_LAYER, overlayLegend, type OverlayKind } from '../../scene/air/legend';
	import { formatLength, sliderRange } from '../../units';
	import {
		SENSITIVITY_SLIDER,
		UNIT_OPTIONS,
		describeSensitivity,
		describeSliceHeight,
		describeUnits,
		formatSensitivity,
		sensitivityFromSlider,
		sensitivityHint,
		sliceHeightFromSlider,
		sliderFromSensitivity,
		sliderFromSliceHeight,
		spokenSensitivity
	} from '../../viz/viewControls';
	import PhysicsPanel from '../PhysicsPanel.svelte';
	import HudRange from './HudRange.svelte';
	import Icon from './Icon.svelte';
	import SheetGrip from './SheetGrip.svelte';
	import { QUALITIES } from './tools';
	import { useHudUi } from './ui.svelte';

	/**
	 * Advanced: what most visitors never need, one click from the bottom bar. The share link, Restart and Reset; the overlay's colour
	 * sensitivity and the height a Probe is pinned and smoke is released at; units; graphics quality; and the Physics panel (the solver's
	 * numbers and the smoke's books). A panel beside the world rather than over it, so a change shows while it is open. Escape closes it
	 * and gives the focus back.
	 */
	const experience = useAirflow();
	const ui = useHudUi();
	const view = $derived(experience.view);
	const height = $derived(sliderRange('sliceHeight', view.units));
	const heightText = $derived(formatLength(view.sliceHeight, view.units));
	/** The overlay the sensitivity scales: the one on, or Air speed while the overlays are off (the next one turned on takes it). */
	const shown: OverlayKind = $derived(view.overlay === 'off' ? 'speed' : view.overlay);
	const legendAt = (sensitivity: number) => overlayLegend(shown, { sensitivity, units: view.units, reference: experience.setup.conditions.indoorTemp })!;
	const scale = $derived(legendAt(view.sensitivity));

	let panel: HTMLElement | undefined = $state();
	let opener: HTMLElement | null = null;

	onMount(() => {
		opener = document.activeElement as HTMLElement | null;
		void tick().then(() => panel?.querySelector<HTMLElement>('.close')?.focus());
		return () => opener?.focus();
	});

	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		ui.panel = null;
	}

	function setSensitivity(position: number) {
		const sensitivity = sensitivityFromSlider(position);
		experience.setView({ sensitivity });
		experience.announce(describeSensitivity(OVERLAY_LAYER[shown], sensitivity, legendAt(sensitivity).description));
	}

	function setSlice(position: number) {
		const sliceHeight = sliceHeightFromSlider(position, view.units);
		experience.setView({ sliceHeight });
		experience.announce(describeSliceHeight(sliceHeight, view.units));
	}

	function setUnits(units: UnitSystem) {
		experience.setView({ units });
		experience.announce(describeUnits(units));
	}

	function setQuality(quality: Quality) {
		experience.setView({ quality });
		experience.announce(`Graphics quality: ${QUALITIES.find((q) => q.id === quality)?.label ?? quality}.`);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="advanced glass deep" role="dialog" tabindex="-1" aria-modal="false" aria-labelledby="hud-advanced-title" data-sheet={ui.phone ? '' : undefined} bind:this={panel} onkeydown={keydown}>
	{#if ui.phone}<SheetGrip label="Advanced" peek={false} onclose={() => (ui.panel = null)} />{/if}
	<header class="head">
		<div>
			<p class="eyebrow">Settings</p>
			<h2 id="hud-advanced-title" class="title">Advanced</h2>
		</div>
		<button type="button" class="ibtn close" aria-label="Close Advanced" onclick={() => (ui.panel = null)}><Icon name="close" size={20} /></button>
	</header>

	<div class="body scroll">
		<section class="block" aria-labelledby="hud-share-title">
			<h3 class="eyebrow" id="hud-share-title">This setup</h3>
			<div class="actions">
				<button type="button" class="btn primary" onclick={() => experience.copyLink()}>
					<Icon name={experience.copied ? 'check' : 'link'} size={18} />{experience.copied ? 'Link copied' : 'Copy link'}
				</button>
				<button type="button" class="btn" onclick={() => experience.restart()}>
					<Icon name="restart" size={18} />{experience.acknowledged === 'restart' ? 'Restarted' : 'Restart'}
				</button>
				<button type="button" class="btn" onclick={() => experience.reset()}>
					<Icon name="reset" size={18} />{experience.acknowledged === 'reset' ? 'Reset done' : 'Reset'}
				</button>
			</div>
			<p class="note">Restart clears the air and keeps the setup. Reset puts this home or scenario back the way it began. The link carries the setup, not the air.</p>
			{#if experience.linkShown}
				<label class="link">
					<span class="note">The browser would not copy it. Copy the link by hand:</span>
					<input type="text" readonly value={experience.shareUrl()} onfocus={(event) => event.currentTarget.select()} />
				</label>
			{/if}
		</section>

		<section class="block" aria-labelledby="hud-view-title">
			<h3 class="eyebrow" id="hud-view-title">Overlay and probes</h3>
			<HudRange
				label="Colour sensitivity"
				value={sliderFromSensitivity(view.sensitivity)}
				min={SENSITIVITY_SLIDER.min}
				max={SENSITIVITY_SLIDER.max}
				step={SENSITIVITY_SLIDER.step}
				display={formatSensitivity(view.sensitivity)}
				spoken={spokenSensitivity(view.sensitivity)}
				note="{scale.title}: {scale.range}. {sensitivityHint(OVERLAY_LAYER[shown])}"
				oninput={setSensitivity}
			/>
			<HudRange
				label="Probe and smoke height"
				value={sliderFromSliceHeight(view.sliceHeight, view.units)}
				min={height.min}
				max={height.max}
				step={height.step}
				display={heightText.text}
				spoken={heightText.spoken}
				note="The height above the floor where a Probe is pinned and smoke is released. The marker under the pointer floats there."
				oninput={setSlice}
			/>
		</section>

		<section class="block" aria-labelledby="hud-units-title">
			<h3 class="eyebrow" id="hud-units-title">Units and graphics</h3>
			<div class="row">
				<span class="row-name" id="hud-units-label">Units</span>
				<div class="seg" role="group" aria-labelledby="hud-units-label">
					{#each UNIT_OPTIONS as option (option.value)}
						<button type="button" aria-pressed={view.units === option.value} onclick={() => setUnits(option.value)}>{option.label}</button>
					{/each}
				</div>
			</div>
			<div class="row">
				<span class="row-name" id="hud-quality-label">Graphics</span>
				<div class="seg" role="group" aria-labelledby="hud-quality-label">
					{#each QUALITIES as option (option.id)}
						<button type="button" aria-pressed={view.quality === option.id} onclick={() => setQuality(option.id)}>{option.label}</button>
					{/each}
				</div>
			</div>
		</section>

		<section class="block physics-block" aria-labelledby="hud-physics-title">
			<h3 class="eyebrow" id="hud-physics-title">Physics</h3>
			<PhysicsPanel />
		</section>
	</div>
</div>

<style>
	.advanced {
		--dock: rgb(255 255 255 / 0.05);
		--sage: rgb(95 213 154 / 0.16);
		--butter: rgb(245 197 107 / 0.18);
		position: fixed;
		top: 16px;
		right: 16px;
		bottom: 96px;
		z-index: 22;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		width: 400px;
		padding: 0;
		border-radius: 22px;
		pointer-events: auto;
		animation: hud-in 220ms var(--hud-ease);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 16px 14px 12px 20px;
		border-bottom: 1px solid var(--hud-rule);
	}
	.title {
		margin: 2px 0 0;
		font-family: 'Manrope Variable', system-ui, sans-serif;
		font-size: 19px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.body {
		display: grid;
		align-content: start;
		gap: 22px;
		padding: 16px 20px 24px;
	}
	.block {
		display: grid;
		gap: 12px;
	}
	.block h3 {
		margin: 0;
	}
	.actions {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.actions .btn {
		padding: 0 10px;
	}
	.note {
		margin: 0;
		color: var(--hud-muted);
		font-size: 12px;
		line-height: 1.55;
	}
	.link {
		display: grid;
		gap: 6px;
	}
	.link input {
		width: 100%;
		min-height: 44px;
		padding: 0 12px;
		border: 0;
		border-radius: 12px;
		background: rgb(0 0 0 / 0.3);
		box-shadow: inset 0 0 0 1px var(--hud-edge);
		color: var(--hud-text);
		font: inherit;
		font-size: 12px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.row-name {
		color: var(--hud-muted);
		font-size: 12.5px;
		font-weight: 650;
	}
	.physics-block :global(.dock-label) {
		color: var(--hud-muted);
	}
	.physics-block :global(.readouts dd) {
		font-family: 'Manrope Variable', system-ui, sans-serif;
		font-size: 17px;
		font-weight: 750;
		letter-spacing: -0.01em;
	}
	.physics-block :global(.readouts) {
		border-top-color: var(--hud-rule);
	}
	.physics-block :global(.dock-notice strong),
	.physics-block :global(.verdict) {
		color: var(--hud-text);
	}

	:global(.hud.phone) .advanced {
		top: auto;
		left: calc(10px + env(safe-area-inset-left));
		right: calc(10px + env(safe-area-inset-right));
		bottom: calc(86px + env(safe-area-inset-bottom));
		width: auto;
		max-height: 74vh;
		padding-top: 12px;
		animation-name: hud-rise;
	}
</style>
