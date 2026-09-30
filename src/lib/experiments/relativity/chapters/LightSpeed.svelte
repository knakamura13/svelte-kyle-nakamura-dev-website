<script lang="ts">
	import { onMount } from 'svelte';
	import { formatBeta } from '../format';
	import { prefersReducedMotion } from '../experience.svelte';
	import type { LightSpeedParams, LightSpeedReadout } from '../scenes/lightSpeed';
	import Chapter from '../ui/Chapter.svelte';
	import PlayControls from '../ui/PlayControls.svelte';
	import RangeField from '../ui/RangeField.svelte';
	import Switch from '../ui/Switch.svelte';

	const params: LightSpeedParams = $state({ beta: 0.8, ghost: true, playing: false, restart: 0 });
	const readout: LightSpeedReadout = $state({});

	const describe = (beta: number) =>
		beta === 0
			? 'The ship is standing still, so the pulse leaves at the speed of light.'
			: `The ship moves at ${formatBeta(beta)} times the speed of light. Newton’s arithmetic would give the pulse ${(1 + beta).toFixed(2)} times the speed of light. Measured, it is still exactly one.`;

	onMount(() => {
		params.playing = !prefersReducedMotion();
	});
</script>

<Chapter
	id="light-speed"
	number={2}
	name="Light"
	tint="cream"
	scene="lightSpeed"
	{params}
	{readout}
	dockHeight={250}
	aspect="4 / 3"
	label="A ship flies along a road past a station and fires a pulse of light forward at the same moment. The light pulse races to a finish line at exactly the speed of light. A red ghost shows where Newton’s arithmetic would put it: farther ahead."
	caption="A ship fires a light pulse forward. The solid amber pulse is what happens. The red ghost is what adding speeds would predict."
>
	{#snippet heading()}Light breaks<br />the rule.{/snippet}
	{#snippet lede()}
		<p>
			Fire a bullet forward from a moving ship and it flies faster than the ship by the bullet’s own speed. Speeds add. Light
			doesn’t.
		</p>
	{/snippet}
	{#snippet dock()}
		<RangeField
			id="light-speed-ship"
			label="Speed of the ship"
			bind:value={params.beta}
			min={0}
			max={0.9}
			step={0.05}
			display="{formatBeta(params.beta)} c"
			spoken="{formatBeta(params.beta)} times the speed of light"
			{describe}
		/>
		<dl class="readouts">
			<div data-tone="light">
				<dt>Pulse, station’s view</dt>
				<dd>1.00 <small>c</small></dd>
			</div>
			<div data-tone="light">
				<dt>Pulse, ship’s view</dt>
				<dd>1.00 <small>c</small></dd>
			</div>
			<div data-tone="ghost">
				<dt>Newton’s guess</dt>
				<dd>{(1 + params.beta).toFixed(2)} <small>c</small></dd>
			</div>
		</dl>
		<div class="dock-actions">
			<Switch bind:checked={params.ghost} label="Show Newton’s guess" />
			<PlayControls bind:playing={params.playing} restart={() => (params.restart += 1)} restartLabel="Fire again" />
		</div>
	{/snippet}
	{#snippet body()}
		<p>
			Adding speeds says a pulse fired forward from a ship moving at 0.8 <i>c</i> should travel at 1.8 <i>c</i>. That is the
			red ghost. Nature disagrees: the pulse always travels at exactly <i>c</i>, however fast the ship goes.
		</p>
		<p>
			This has been tested directly. In 1964 a team at CERN measured light from particles that were themselves moving at
			99.975% of the speed of light. The light still travelled at <i>c</i>, to within about one part in ten thousand.
		</p>
		<p>
			In 1905 Einstein built special relativity on two statements. The laws of physics are the same in every steady frame,
			which is chapter 1. And light travels at the same speed for everyone, which is this chapter.
		</p>
		<p class="try">
			<strong>The catch.</strong> The station sees the pulse pull away from the ship at only (1 − <i>v</i>/<i>c</i>) times
			<i>c</i>. The ship’s crew sees it leave at exactly <i>c</i>. Both measure honestly, so their clocks and rulers must
			disagree. Next: how.
		</p>
	{/snippet}
</Chapter>
