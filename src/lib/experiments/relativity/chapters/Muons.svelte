<script lang="ts">
	import { onMount } from 'svelte';
	import { formatBeta, formatChance, formatGamma, formatMicroseconds } from '../format';
	import { prefersReducedMotion, useExperience } from '../experience.svelte';
	import { betaFromNines, muonSurvival, muonTrip, ninesFromBeta } from '../physics';
	import { MUON_COUNT, type MuonsParams, type MuonsReadout } from '../scenes/muons';
	import Chapter from '../ui/Chapter.svelte';
	import PlayControls from '../ui/PlayControls.svelte';
	import RangeField from '../ui/RangeField.svelte';
	import Segmented from '../ui/Segmented.svelte';

	const experience = useExperience();
	const start = 0.995;
	const params: MuonsParams = $state({ beta: start, relativity: true, playing: false, restart: 0 });
	const readout: MuonsReadout = $state({ landed: 0 });
	let position = $state(ninesFromBeta(start));
	let mode = $state<'on' | 'off'>('on');
	const presets = [0.95, 0.99, 0.999, 0.9999];

	$effect(() => {
		params.relativity = mode === 'on';
	});

	const trip = $derived(muonTrip(params.beta));
	const chance = $derived(muonSurvival(params.beta, params.relativity));

	const summary = () =>
		params.relativity
			? `Muons at ${formatBeta(params.beta)} times the speed of light: ${formatChance(chance)} reach the ground.`
			: `Ignoring relativity, muons at ${formatBeta(params.beta)} times the speed of light: ${formatChance(chance)} reach the ground.`;

	function setSpeed(beta: number) {
		params.beta = beta;
		position = ninesFromBeta(beta);
		experience.announce(summary());
	}

	onMount(() => {
		params.playing = !prefersReducedMotion();
	});
</script>

<Chapter
	id="muons"
	number={5}
	name="Muons"
	tint="peach"
	scene="muons"
	{params}
	{readout}
	label="Two columns of atmosphere. On the left, the ground’s view: a shower of 300 muons falls 15 kilometres and most decay on the way. On the right, the muon’s own view: the same atmosphere squashed to a fraction of its height."
	caption="A shower of {MUON_COUNT} muons falling through 15 km of atmosphere. Purple dots are muons, red puffs are decays, green puffs are arrivals."
	dockHeight={310}
>
	{#snippet heading()}Muons arrive<br />because time slows.{/snippet}
	{#snippet lede()}
		<p>
			When cosmic rays strike the top of the atmosphere they make particles called muons, about 15 kilometres up. A muon
			lives 2.2 microseconds on average. Even at nearly the speed of light, that isn’t long enough to reach the ground. Yet
			they do.
		</p>
	{/snippet}
	{#snippet dock()}
		<div class="dock-pair">
			<Segmented
				legend="In this world"
				name="muon-relativity"
				bind:value={mode}
				options={[
					{ value: 'on', label: 'Relativity is real' },
					{ value: 'off', label: 'Ignore it' }
				]}
			/>
			<PlayControls bind:playing={params.playing} restart={() => (params.restart += 1)} restartLabel="Replay" />
		</div>
		<RangeField
			id="muon-speed"
			label="Muon speed"
			bind:value={position}
			min={0}
			max={1}
			step={0.005}
			display="{formatBeta(params.beta)} c"
			spoken="{formatBeta(params.beta)} times the speed of light, slowdown factor {formatGamma(trip.gamma)}"
			describe={summary}
			onuser={(next) => (params.beta = betaFromNines(next))}
		/>
		<div class="chips" role="group" aria-label="Speed presets">
			{#each presets as preset (preset)}
				<button type="button" class="chip" aria-pressed={params.beta === preset} onclick={() => setSpeed(preset)}>{preset} c</button>
			{/each}
		</div>
		<dl class="readouts" data-cols="4">
			<div data-tone="mover">
				<dt>Chance one arrives</dt>
				<dd>{formatChance(chance)}</dd>
			</div>
			<div data-tone="muon">
				<dt>In this shower</dt>
				<dd>{readout.landed} <small>of {MUON_COUNT}</small></dd>
			</div>
			<div data-tone="muon">
				<dt>Muon’s clock</dt>
				<dd>{formatMicroseconds(params.relativity ? trip.muonSeconds : trip.groundSeconds)}</dd>
			</div>
			<div data-tone="rest">
				<dt>Ground clock</dt>
				<dd>{formatMicroseconds(trip.groundSeconds)}</dd>
			</div>
		</dl>
	{/snippet}
	{#snippet body()}
		<p>
			Light covers about 660 metres in 2.2 microseconds, so a muon that moves almost that fast should typically decay after
			roughly 660 metres. Surviving all 15 kilometres would be a one-in-ten-billion chance. Choose <em>Ignore relativity</em>
			and see: none of the {MUON_COUNT} muons reaches the ground.
		</p>
		<p>
			Switch it back on. From the ground, a muon’s clock runs slow by γ, so its life is stretched by the same factor and
			about one in ten arrive at 0.995 <i>c</i>. That is what detectors measure. In 1963 Frisch and Smith counted muons on a
			mountaintop and at sea level and found that their decay had slowed by a factor of about 9, close to the 10 predicted
			for their speed.
		</p>
		<p>
			The muon’s own view is different and just as valid. Its clock ticks normally, but the atmosphere rushes toward it,
			squeezed to 1/γ of its height: about 1.5 kilometres instead of 15. That is the small column on the right. There is
			time to cross it.
		</p>
		<p class="try">
			<strong>Try it.</strong> Drag the speed toward 0.9999 <i>c</i> and watch the right-hand column shrink while more muons
			arrive. Two explanations, one outcome: everyone agrees the muon arrives.
		</p>
	{/snippet}
</Chapter>
