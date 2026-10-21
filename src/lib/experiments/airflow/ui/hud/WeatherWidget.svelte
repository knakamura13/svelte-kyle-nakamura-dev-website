<script lang="ts">
	import { onMount } from 'svelte';
	import { useAirflow } from '../../experience.svelte';
	import { describeBearing } from '../../readout';
	import { formatPm25, weatherAnnouncement, weatherField, windFromAnnouncement } from '../weather';
	import { dialRotation, windWords } from './compass';
	import CompassDial from './CompassDial.svelte';
	import Icon from './Icon.svelte';
	import { AIR_PRESETS, WIND_PRESETS, airPreset, canStep, stepValue, windPreset, type StepKey } from './presets';
	import SheetGrip from './SheetGrip.svelte';
	import { tooltip } from './tips.svelte';
	import { useHudUi } from './ui.svelte';

	/**
	 * The weather, top right: the compass dial with the wind's speed beside it, the outdoor temperature and the outdoor air at a glance.
	 * Opened, it has the wind's speeds, steppers for the outdoor and the indoor starting temperature, and the outdoor air presets. On a
	 * phone it is a pill that says the same three things in two lines, and opens them as a sheet over the toolbar: at its peek the dial,
	 * and in full the speeds, the temperatures and the outdoor air.
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
	const calm = $derived(!(conditions.windSpeed > 0));
	/** The phone's pill in words: what its two lines show, for a screen reader. */
	const said = $derived(
		`Weather: ${calm ? 'calm' : `wind from the ${describeBearing(conditions.windFrom).spoken}, ${speed.spoken}`}; ${outdoor.spoken} outside; outdoor air ${(air?.label ?? formatPm25(conditions.outdoorPm25).spoken).toLowerCase()}.`
	);

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
	let sheet: HTMLElement | undefined = $state();
	let toggle: HTMLButtonElement | undefined = $state();
	// A press outside the card (and the phone's sheet) closes it.
	$effect(() => {
		if (!open) return;
		const outside = (event: PointerEvent) => {
			const target = event.target as Node;
			if (!card?.contains(target) && !sheet?.contains(target)) ui.popover = null;
		};
		addEventListener('pointerdown', outside, true);
		return () => removeEventListener('pointerdown', outside, true);
	});

	/** Escape inside the open card closes it, and the focus goes back to the button that opened it. */
	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !open) return;
		ui.popover = null;
		toggle?.focus();
		event.preventDefault();
	}
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

{#snippet details()}
	<div class="wind-row">
		<CompassDial bearing={conditions.windFrom} speed={conditions.windSpeed} {rotation} size={ui.phone ? 88 : 132} onchange={setBearing} oncommit={sayBearing} />
		<div class="wind-words">
			<p class="wind-title">{wind.short}</p>
			<p class="wind-toward">{wind.toward}</p>
			{#if ui.phone}
				<!-- At the sheet's peek the dial and the speed: a tap goes to the next of the wind's speeds, as the desktop's chip does. -->
				<button type="button" class="speed-chip" aria-label="Wind speed {speed.spoken}{gust ? `, ${gust.label.toLowerCase()}` : ''}. Next speed" onclick={nextWind}
					>{gust ? `${gust.id === 'calm' ? 'Calm' : gust.label.replace(' breeze', '')} · ` : ''}{speed.display}<Icon name="chevron-right" size={14} /></button
				>
			{:else}
				<p class="hint">Drag the green handle, or focus the dial and use the arrow keys.</p>
			{/if}
		</div>
	</div>
	<div class="block" class:sheet-more={ui.phone}>
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
	<div class="block steppers sheet-more">
		<p class="eyebrow">Temperature</p>
		{@render stepper('outdoorTemp', 'Outdoor temperature', outdoor, '')}
		{@render stepper('indoorTemp', 'Indoor start', indoor, 'Starts the air over')}
	</div>
	<div class="block sheet-more">
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
{/snippet}

{#if ui.phone}
	<!-- The phone's pill: the wind, the temperature and the outdoor air in two lines, the dial beside them as a picture. It opens the sheet. -->
	<button
		type="button"
		class="weather weather-pill glass"
		class:open
		bind:this={toggle}
		aria-expanded={open}
		aria-controls="hud-weather-details"
		aria-label={said}
		onclick={() => ui.toggle('weather')}
	>
		<CompassDial bearing={conditions.windFrom} speed={conditions.windSpeed} {rotation} size={38} compact interactive={false} onchange={setBearing} />
		<span class="pill-lines" aria-hidden="true">
			<span class="pill-wind">
				<span class="pill-from">{calm ? 'Calm' : describeBearing(conditions.windFrom).compass}</span>
				{#if !calm}<span class="pill-speed">{speed.display}</span>{/if}
			</span>
			<span class="pill-rest" data-air={air?.id ?? 'custom'}>
				<span>{outdoor.display}</span>
				<span class="pill-sep"></span>
				<span class="air-dot"></span>
				<span>{air?.label ?? formatPm25(conditions.outdoorPm25).text}</span>
			</span>
		</span>
	</button>
	{#if open}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="weather-sheet glass deep" id="hud-weather-details" role="dialog" tabindex="-1" aria-label="Weather" data-sheet bind:this={sheet} onkeydown={keydown}>
			<SheetGrip label="the weather" onclose={() => (ui.popover = null)} />
			<div class="details">{@render details()}</div>
		</div>
	{/if}
{:else}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="weather glass" class:open bind:this={card} onkeydown={keydown}>
	<div class="summary">
		{#if !open}
			<CompassDial bearing={conditions.windFrom} speed={conditions.windSpeed} {rotation} size={58} compact onchange={setBearing} oncommit={sayBearing} />
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
			bind:this={toggle}
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
		<div class="details" id="hud-weather-details">{@render details()}</div>
	{/if}
</div>
{/if}

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

	/* ---- the phone: a pill with the three readings, and the details as a sheet over the toolbar ---- */
	.weather.weather-pill {
		display: flex;
		align-items: center;
		gap: 9px;
		width: max-content;
		min-height: 48px;
		padding: 5px 15px 5px 5px;
		border: 0;
		border-radius: 24px;
		text-align: left;
	}
	.weather.weather-pill:active {
		transform: scale(0.97);
	}
	.weather.weather-pill.open {
		box-shadow:
			var(--hud-shadow),
			inset 0 0 0 1.5px var(--hud-accent);
	}
	.pill-lines {
		display: grid;
		gap: 2px;
		line-height: 1.15;
	}
	.pill-wind {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.pill-from {
		font-size: 14.5px;
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	.pill-speed {
		color: var(--hud-accent);
		font-size: 12px;
		font-weight: 750;
	}
	.pill-rest {
		display: flex;
		align-items: center;
		gap: 5px;
		color: var(--hud-muted);
		font-size: 11.5px;
		font-weight: 700;
		white-space: nowrap;
	}
	.pill-sep {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: currentColor;
		opacity: 0.7;
	}
	.pill-rest .air-dot {
		width: 7px;
		height: 7px;
		box-shadow: none;
	}
	.weather-sheet {
		position: fixed;
		left: calc(10px + env(safe-area-inset-left));
		right: calc(10px + env(safe-area-inset-right));
		bottom: calc(86px + env(safe-area-inset-bottom));
		max-height: 72vh;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 24px 14px 16px;
		border-radius: 22px;
		animation: hud-rise 260ms var(--hud-ease);
	}
	.weather-sheet .details {
		gap: 14px;
		margin-top: 0;
		padding: 0 2px;
	}
	.weather-sheet .wind-row {
		gap: 14px;
	}
	.weather-sheet .wind-words {
		justify-items: start;
	}
	.weather-sheet .speed-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 36px;
		margin-top: 4px;
		padding: 0 8px 0 12px;
		border-radius: 12px;
		font-size: 12.5px;
	}
</style>
