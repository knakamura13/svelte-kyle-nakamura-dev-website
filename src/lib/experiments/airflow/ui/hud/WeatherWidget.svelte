<script lang="ts">
	import { onMount } from 'svelte';
	import { useAirflow } from '../../experience.svelte';
	import { describeBearing } from '../../readout';
	import { formatPm25, weatherAnnouncement, weatherField, windFromAnnouncement } from '../weather';
	import { dialRotation, windWords } from './compass';
	import CompassDial from './CompassDial.svelte';
	import Icon from './Icon.svelte';
	import { AIR_PRESETS, WIND_PRESETS, airPreset, canStep, stepValue, windPreset, type StepKey } from './presets';
	import { tooltip } from './tips.svelte';
	import { useHudUi } from './ui.svelte';

	/**
	 * The weather, top right: the compass dial with the wind's speed beside it, the outdoor temperature and the outdoor air at a glance.
	 * Opened, it has the wind's speeds, steppers for the outdoor and the indoor starting temperature, and the outdoor air presets.
	 */
	const experience = useAirflow();
	const ui = useHudUi();
	const conditions = $derived(experience.setup.conditions);
	const units = $derived(experience.view.units);
	const open = $derived(ui.popover === 'weather');
	const wind = $derived(windWords(conditions.windFrom, conditions.windSpeed));
	const speed = $derived(weatherField('windSpeed', conditions.windSpeed, units));
	const outdoor = $derived(weatherField('outdoorTemp', conditions.outdoorTemp, units));
	const indoor = $derived(weatherField('indoorTemp', conditions.indoorTemp, units));
	const air = $derived(airPreset(conditions.outdoorPm25));
	const gust = $derived(windPreset(conditions.windSpeed));

	/** The camera's turn, so north on the dial is north on screen. */
	let rotation = $state(0);
	onMount(() => {
		const view = document.querySelector<HTMLElement>('.stage-view');
		if (!view) return;
		const read = () => (rotation = dialRotation(Number(view.dataset.yaw ?? 0)));
		read();
		const observer = new MutationObserver(read);
		observer.observe(view, { attributes: true, attributeFilter: ['data-yaw'] });
		return () => observer.disconnect();
	});

	const setBearing = (bearing: number) => experience.setCondition('windFrom', bearing);
	const sayBearing = (bearing: number) => experience.announce(windFromAnnouncement(bearing, conditions.windSpeed));

	function setWind(value: number, label: string) {
		experience.setCondition('windSpeed', value);
		experience.announce(`Wind ${label.toLowerCase()}, ${weatherField('windSpeed', value, units).spoken}.`);
	}

	/** The speed chip goes to the next of the wind's presets, round to calm after the strongest. */
	function nextWind() {
		const at = WIND_PRESETS.findIndex((preset) => preset.value > conditions.windSpeed + 0.01);
		const next = WIND_PRESETS[at < 0 ? 0 : at];
		setWind(next.value, next.label);
	}

	function step(key: StepKey, direction: 1 | -1) {
		const next = stepValue(key, conditions[key], units, direction);
		experience.setCondition(key, next);
		experience.announce(weatherAnnouncement(key, next, units));
	}

	function setAir(value: number, label: string) {
		experience.setCondition('outdoorPm25', value);
		experience.announce(`Outdoor air ${label.toLowerCase()}, ${formatPm25(value).spoken} of PM2.5.`);
	}

	let card: HTMLElement | undefined = $state();
	$effect(() => {
		if (!open) return;
		const outside = (event: PointerEvent) => {
			if (!card?.contains(event.target as Node)) ui.popover = null;
		};
		addEventListener('pointerdown', outside, true);
		return () => removeEventListener('pointerdown', outside, true);
	});
</script>

{#snippet stepper(key: StepKey, name: string, field: { display: string; spoken: string }, note: string)}
	<div class="stepper" role="group" aria-label={name}>
		<span class="stepper-name">{name}</span>
		<button type="button" class="ibtn small" aria-label="Lower the {name.toLowerCase()}" disabled={!canStep(key, conditions[key], units, -1)} onclick={() => step(key, -1)}><Icon name="minus" size={18} /></button>
		<output class="stepper-value" aria-live="off"><span aria-hidden="true">{field.display}</span><span class="sr-only">{field.spoken}</span></output>
		<button type="button" class="ibtn small" aria-label="Raise the {name.toLowerCase()}" disabled={!canStep(key, conditions[key], units, 1)} onclick={() => step(key, 1)}><Icon name="plus" size={18} /></button>
		{#if note}<span class="stepper-note">{note}</span>{/if}
	</div>
{/snippet}

<div class="weather glass" class:open bind:this={card}>
	<div class="summary">
		{#if !open}
			<CompassDial bearing={conditions.windFrom} speed={conditions.windSpeed} {rotation} size={ui.phone ? 44 : 58} onchange={setBearing} oncommit={sayBearing} />
		{/if}
		<div class="fact wind">
			<span class="eyebrow">Wind</span>
			<span class="fact-value">{conditions.windSpeed > 0 ? describeBearing(conditions.windFrom).compass : 'Calm'}</span>
			<button
				type="button"
				class="speed-chip"
				aria-label="Wind speed {speed.spoken}{gust ? `, ${gust.label.toLowerCase()}` : ''}. Next speed"
				use:tooltip={{ label: gust ? gust.label : 'Wind speed', hint: 'Click for the next wind speed.', side: 'bottom' }}
				onclick={nextWind}>{speed.display}</button
			>
		</div>
		<div class="fact temp">
			<span class="eyebrow">Outside</span>
			<span class="fact-value">{outdoor.display}</span>
			<span class="fact-sub">inside {indoor.display}</span>
		</div>
		<div class="fact air" data-air={air?.id ?? 'custom'}>
			<span class="eyebrow">Air</span>
			<span class="fact-value"><span class="air-dot" aria-hidden="true"></span>{air?.label ?? formatPm25(conditions.outdoorPm25).text}</span>
			<span class="fact-sub">{formatPm25(conditions.outdoorPm25).text}</span>
		</div>
		<button
			type="button"
			class="ibtn more"
			aria-expanded={open}
			aria-controls="hud-weather-details"
			aria-label="Weather details"
			use:tooltip={{ label: open ? 'Close the weather' : 'Weather', hint: 'Wind, temperatures and the outdoor air.', side: 'bottom' }}
			onclick={() => ui.toggle('weather')}
		>
			<span class="chev" class:flipped={open}><Icon name="chevron-down" size={18} /></span>
		</button>
	</div>

	{#if open}
		<div class="details" id="hud-weather-details">
			<div class="wind-row">
				<CompassDial bearing={conditions.windFrom} speed={conditions.windSpeed} {rotation} size={ui.phone ? 112 : 132} onchange={setBearing} oncommit={sayBearing} />
				<div class="wind-words">
					<p class="wind-title">{wind.short}</p>
					<p class="wind-toward">{wind.toward}</p>
					<p class="hint">Drag the green handle, or focus the dial and use the arrow keys.</p>
				</div>
			</div>
			<div class="block">
				<p class="eyebrow">Wind speed</p>
				<div class="chips" role="group" aria-label="Wind speed">
					{#each WIND_PRESETS as preset (preset.id)}
						<button
							type="button"
							class="chip"
							aria-pressed={gust?.id === preset.id}
							use:tooltip={{ label: preset.label, hint: weatherField('windSpeed', preset.value, units).display, side: 'bottom' }}
							onclick={() => setWind(preset.value, preset.label)}>{preset.id === 'calm' ? 'Calm' : preset.label.replace(' breeze', '')}</button
						>
					{/each}
				</div>
			</div>
			<div class="block steppers">
				<p class="eyebrow">Temperature</p>
				{@render stepper('outdoorTemp', 'Outdoor temperature', outdoor, '')}
				{@render stepper('indoorTemp', 'Indoor start', indoor, 'Starts the air over')}
			</div>
			<div class="block">
				<p class="eyebrow">Outdoor air · PM2.5</p>
				<div class="chips air-chips" role="group" aria-label="Outdoor air">
					{#each AIR_PRESETS as preset (preset.id)}
						{@const pm = formatPm25(preset.value)}
						<button type="button" class="chip" data-air={preset.id} aria-pressed={air?.id === preset.id} aria-label="{preset.label}, {pm.spoken}" use:tooltip={{ label: preset.label, hint: `${pm.text} of PM2.5 outdoors`, side: 'bottom' }} onclick={() => setAir(preset.value, preset.label)}>
							<span class="air-dot" aria-hidden="true"></span>{preset.label}
						</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.weather {
		position: absolute;
		top: 0;
		right: 0;
		width: max-content;
		max-width: calc(100vw - 32px);
		padding: 6px 6px 6px 8px;
		border-radius: 22px;
		animation: hud-in 280ms var(--hud-ease);
	}
	.weather.open {
		width: 384px;
		padding: 8px 8px 14px;
	}
	.summary {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.fact {
		display: grid;
		align-content: center;
		min-width: 64px;
		padding: 0 12px;
		line-height: 1.2;
		border-left: 1px solid var(--hud-rule);
	}
	.wind {
		border-left: 0;
	}
	.fact-value {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 15px;
		font-weight: 750;
		letter-spacing: -0.01em;
		white-space: nowrap;
	}
	.fact-sub {
		color: var(--hud-muted);
		font-size: 11px;
		white-space: nowrap;
	}
	.speed-chip {
		justify-self: start;
		min-height: 24px;
		margin-top: 2px;
		padding: 0 8px;
		border: 0;
		border-radius: 8px;
		background: rgb(95 213 154 / 0.16);
		color: var(--hud-accent);
		font-size: 11.5px;
		font-weight: 750;
		white-space: nowrap;
		transition: background 160ms var(--hud-ease);
	}
	.speed-chip:hover {
		background: rgb(95 213 154 / 0.26);
	}
	.air-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #7fd6a4;
		box-shadow: 0 0 0 2px rgb(255 255 255 / 0.12);
	}
	[data-air='hazy'] .air-dot {
		background: #e2cf6d;
	}
	[data-air='smoky'] .air-dot {
		background: #f09a52;
	}
	[data-air='wildfire'] .air-dot {
		background: #e5484d;
	}
	[data-air='custom'] .air-dot {
		background: #b9c6bf;
	}
	.more {
		margin-left: 2px;
	}
	.chev {
		display: grid;
		transition: transform 200ms var(--hud-ease);
	}
	.chev.flipped {
		transform: rotate(180deg);
	}
	.details {
		display: grid;
		gap: 16px;
		margin-top: 10px;
		padding: 0 8px;
		animation: hud-in 220ms var(--hud-ease);
	}
	.wind-row {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.wind-words {
		display: grid;
		gap: 4px;
	}
	.wind-title {
		margin: 0;
		font-size: 17px;
		font-weight: 750;
	}
	.wind-toward,
	.hint {
		margin: 0;
		color: var(--hud-muted);
		font-size: 12px;
		line-height: 1.45;
	}
	.hint {
		font-size: 11.5px;
		color: var(--hud-dim);
	}
	.block {
		display: grid;
		gap: 8px;
	}
	.stepper {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 44px 80px 44px;
		align-items: center;
		gap: 4px;
		padding: 2px 2px 2px 12px;
		border-radius: 14px;
		background: var(--hud-well);
		box-shadow: inset 0 0 0 1px var(--hud-edge);
	}
	.stepper-name {
		font-size: 12.5px;
		font-weight: 650;
	}
	.stepper-value {
		font-size: 15px;
		font-weight: 750;
		text-align: center;
	}
	.stepper-note {
		grid-column: 1 / -1;
		margin: -4px 0 6px;
		color: var(--hud-dim);
		font-size: 11px;
	}
	.air-chips .chip {
		flex: 1;
		padding: 0 10px;
	}
	.air-chips .chip[aria-pressed='true'] .air-dot {
		box-shadow: 0 0 0 2px rgb(5 38 26 / 0.35);
	}

	:global(.hud.phone) .weather {
		padding: 4px;
	}
	:global(.hud.phone) .weather:not(.open) .fact {
		display: none;
	}
	:global(.hud.phone) .weather.open {
		position: fixed;
		left: 10px;
		right: 10px;
		top: auto;
		bottom: calc(86px + env(safe-area-inset-bottom));
		width: auto;
		max-height: 72vh;
		overflow-y: auto;
		animation-name: hud-rise;
	}
</style>
