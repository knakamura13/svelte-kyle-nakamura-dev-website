<script lang="ts">
	import { onMount } from 'svelte';
	import { formatBeta, formatGamma, formatSpeedKmS } from '../format';
	import { prefersReducedMotion, useExperience } from '../experience.svelte';
	import { gamma } from '../physics';
	import type { LightClockParams, LightClockReadout } from '../scenes/lightClock';
	import Chapter from '../ui/Chapter.svelte';
	import GammaChart from '../ui/GammaChart.svelte';
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
	dockHeight={280}
	aspect="4 / 3"
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
				<dd>{readout.restTicks} <small>{readout.restTicks === 1 ? 'tick' : 'ticks'}</small></dd>
			</div>
			<div data-tone="mover">
				<dt>Moving clock</dt>
				<dd>{readout.movingTicks} <small>{readout.movingTicks === 1 ? 'tick' : 'ticks'}</small></dd>
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
		<p>
			Each half-tick is a right triangle: the clock’s height <i>L</i>, the distance <i>v</i>Δ<i>t</i>/2 it slides, and the
			photon’s path <i>c</i>Δ<i>t</i>/2. Pythagoras gives the rest.
		</p>
		<p
			class="formula"
			role="math"
			aria-label="c delta t over two, all squared, equals L squared plus v delta t over two, all squared"
		>
			(<i>c</i>Δ<i>t</i>/2)² = <i>L</i>² + (<i>v</i>Δ<i>t</i>/2)²
		</p>
		<p>
			Solve for the time between ticks and it is the stationary tick stretched by a factor called the Lorentz factor, γ.
		</p>
		<p
			class="formula"
			role="math"
			aria-label="delta t equals gamma times delta t zero, where gamma equals one over the square root of one minus v squared over c squared"
		>
			Δ<i>t</i> = γ Δ<i>t</i><sub>0</sub>, &nbsp;γ = 1 / √(1 − <i>v</i>²/<i>c</i>²)
		</p>
		<p class="try">
			<strong>Try it.</strong> At 0.8 <i>c</i>, γ is 5/3: the moving clock ticks three times for every five ticks of the
			stationary one. Above 0.95 <i>c</i> the zigzag grows too wide to fit the scene, but the graph carries on.
		</p>
		<GammaChart
			beta={params.beta}
			max={0.95}
			onpick={(beta) => {
				params.beta = beta;
				experience.announce(describe(beta));
			}}
		/>
		<p>
			γ is 1 when nothing moves and grows slowly at first: 1.15 at half the speed of light, 2 at 87%, 7 at 99%, and without
			limit as the speed approaches <i>c</i>.
		</p>
		<p>
			This isn’t a property of mirrors. Every clock and process aboard, from a heartbeat to a decaying particle, has to slow
			by the same factor. Otherwise the crew could tell they were moving, which breaks the principle of relativity from
			chapter 1.
		</p>
		<p>
			Motion is relative, so the crew says the same of you: your clock is the slow one. Both are right, because they
			disagree about which events in different places happen at the same time. Chapter 4 shows what breaks the tie.
		</p>
	{/snippet}
</Chapter>
