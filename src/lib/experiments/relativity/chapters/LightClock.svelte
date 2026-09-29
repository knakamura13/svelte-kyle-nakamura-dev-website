<script lang="ts">
	import { onMount } from 'svelte';
	import { formatBeta, formatGamma, formatSpeedKmS } from '../format';
	import { prefersReducedMotion, useExperience } from '../experience.svelte';
	import { gamma } from '../physics';
	import type { LightClockParams, LightClockReadout } from '../scenes/lightClock';
	import Chapter from '../ui/Chapter.svelte';
	import PlayControls from '../ui/PlayControls.svelte';
	import RangeField from '../ui/RangeField.svelte';
	import Switch from '../ui/Switch.svelte';

	const experience = useExperience();
	const params: LightClockParams = $state({ beta: 0.8, playing: false, geometry: true, restart: 0 });
	const readout: LightClockReadout = $state({ restTicks: 0, movingTicks: 0 });
	const presets = [0.5, 0.8, 0.9, 0.95];
	const g = $derived(gamma(params.beta));

	const describe = (beta: number) =>
		beta === 0
			? 'At rest, both clocks tick together.'
			: `At ${formatBeta(beta)} times the speed of light, the moving clock ticks ${formatGamma(gamma(beta))} times slower than the stationary one.`;

	onMount(() => {
		params.playing = !prefersReducedMotion();
	});
</script>

<Chapter
	id="light-clock"
	number={3}
	name="The light clock"
	tint="mist"
	scene="lightClock"
	{params}
	{readout}
	label="Two light clocks, each a photon bouncing between two mirrors. The stationary clock’s photon goes straight up and down. The moving clock slides past, and its photon zigzags along a longer path."
	caption="Two light clocks, slowed enormously so you can watch. Blue is stationary, green is moving."
>
	{#snippet heading()}A clock<br />made of light.{/snippet}
	{#snippet lede()}
		<p>
			Build the simplest clock there is: a photon bouncing between two mirrors. One round trip is one tick. Now watch what
			happens when the clock flies past.
		</p>
	{/snippet}
	{#snippet dock()}
		<RangeField
			id="light-clock-speed"
			label="Speed of the moving clock"
			bind:value={params.beta}
			min={0}
			max={0.95}
			step={0.01}
			display="{formatBeta(params.beta)} c"
			spoken="{formatBeta(params.beta)} times the speed of light, {formatSpeedKmS(params.beta)}"
			{describe}
		/>
		<div class="chips" role="group" aria-label="Speed presets">
			{#each presets as preset (preset)}
				<button
					type="button"
					class="chip"
					aria-pressed={params.beta === preset}
					onclick={() => {
						params.beta = preset;
						experience.announce(describe(preset));
					}}>{preset} c</button
				>
			{/each}
		</div>
		<dl class="readouts">
			<div>
				<dt>Slowdown, γ</dt>
				<dd>{formatGamma(g)}</dd>
			</div>
			<div data-tone="rest">
				<dt>Stationary clock</dt>
				<dd>{readout.restTicks} <small>ticks</small></dd>
			</div>
			<div data-tone="mover">
				<dt>Moving clock</dt>
				<dd>{readout.movingTicks} <small>ticks</small></dd>
			</div>
		</dl>
		<div class="dock-actions">
			<Switch bind:checked={params.geometry} label="Show the triangle" />
			<PlayControls bind:playing={params.playing} restart={() => (params.restart += 1)} />
		</div>
	{/snippet}
	{#snippet body()}
		<p>
			Standing still, the clock ticks every 2<i>L</i>/<i>c</i> seconds: the photon climbs straight up, drops straight
			down, and repeats.
		</p>
		<p>
			From the station, the moving clock is different. While the photon crosses from one mirror to the other, the clock has
			slid forward, so the photon’s path is a diagonal: up and forward, then down and forward. That is a longer trip than
			<i>L</i>, and light can’t speed up to make up the difference, because everyone measures the same <i>c</i>. So each tick
			takes longer. To the station, the moving clock runs slow.
		</p>
	{/snippet}
</Chapter>
