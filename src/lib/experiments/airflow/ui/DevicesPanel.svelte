<script lang="ts">
	import RangeField from '$lib/experiments/ui/RangeField.svelte';
	import Segmented from '$lib/experiments/ui/Segmented.svelte';
	import Switch from '$lib/experiments/ui/Switch.svelte';
	import { useAirflow } from '../experience.svelte';
	import { FAN_MARKS, PURIFIER_MARKS, fanFlow, powerLabel, purifierCadr } from '../devices/model';
	import type { DeviceModel } from '../devices/types';
	import { describeBearing } from '../readout';
	import { LIMITS, MAX_DEVICES, type DeviceState } from '../state';
	import { displayRange, formatFlow, formatLength, sliderRange } from '../units';

	const experience = useAirflow();
	const units = $derived(experience.view.units);
	const devices = $derived(experience.setup.devices);
	const chosen = $derived(devices.find((d) => d.id === experience.selected) ?? null);
	const chosenModel = $derived(chosen ? experience.modelOf(chosen) : undefined);
	const full = $derived(devices.length >= MAX_DEVICES);

	/** What the tray and the list last had to say that the visitor should see as well as hear: why a device could not be added or moved. */
	let message = $state('');
	let messageTimer: ReturnType<typeof setTimeout> | undefined;
	function say(reason: string | null) {
		clearTimeout(messageTimer);
		message = reason ?? '';
		// It stays until the next thing the visitor does with a device says otherwise, or half a minute: a reason read late is still the reason.
		if (reason) messageTimer = setTimeout(() => (message = ''), 30_000);
	}

	const KINDS = { 'box-fan': 'Box fan', 'pedestal-fan': 'Pedestal fan', 'window-fan': 'Window fan', 'air-purifier': 'Air purifier' } as const;
	const top = (model: DeviceModel) => (model.kind === 'air-purifier' ? purifierCadr(model, 1) : fanFlow(model, 1));
	const ratedText = (model: DeviceModel) => `${formatFlow(top(model), units).text}${model.kind === 'air-purifier' ? ' clean air' : ''} at its highest speed`;
	const powerText = (device: DeviceState, model: DeviceModel | undefined) => (model ? `${Math.round(device.power * 100)}% power, ${powerLabel(model, device.power).name}` : '');

	// ---- dragging a device in from the tray ----
	let dragging: { model: DeviceModel; x: number; y: number; ok: boolean; text: string } | null = $state(null);

	function startDrag(event: PointerEvent, model: DeviceModel) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		dragging = { model, x: event.clientX, y: event.clientY, ok: false, text: 'Drag it onto the home.' };
		track(event);
	}

	function track(event: PointerEvent) {
		if (!dragging) return;
		const { model } = dragging;
		let ok = false;
		let text = 'Drag it onto the home.';
		if (experience.bridge.over?.(event.clientX, event.clientY)) {
			const at = experience.bridge.pick?.(event.clientX, event.clientY);
			if (at) {
				experience.previewDrag(model.id, at.x, at.z);
				ok = !!experience.drag?.ok;
				text = ok ? 'Let go to put it here.' : (experience.drag?.reason ?? '');
			} else {
				experience.previewDrag(null);
				text = 'Drop it on the home.';
			}
		} else experience.previewDrag(null);
		dragging = { model, x: event.clientX, y: event.clientY, ok, text };
	}

	function endDrag(event: PointerEvent) {
		if (!dragging) return;
		const { model } = dragging;
		dragging = null;
		const at = experience.bridge.over?.(event.clientX, event.clientY) ? experience.bridge.pick?.(event.clientX, event.clientY) : null;
		experience.previewDrag(null);
		if (at) say(experience.addDeviceAt(model.id, at.x, at.z));
		else if (experience.bridge.over?.(event.clientX, event.clientY)) say('Drop it on the home.');
	}

	function cancelDrag() {
		if (!dragging) return;
		dragging = null;
		experience.previewDrag(null);
	}

	// ---- the chosen device ----
	const STEP = 0.25;
	function nudge(event: MouseEvent, dx: number, dz: number) {
		if (!chosen) return;
		const step = event.shiftKey ? 1 : STEP;
		say(experience.nudgeDevice(chosen.id, dx * step, dz * step));
	}

	const marks = $derived(
		chosenModel?.kind === 'air-purifier'
			? ([['Sleep', PURIFIER_MARKS.sleep], ['Low', PURIFIER_MARKS.low], ['Medium', PURIFIER_MARKS.medium], ['High', PURIFIER_MARKS.high]] as const)
			: ([['Low', FAN_MARKS.low], ['Medium', FAN_MARKS.medium], ['High', FAN_MARKS.high]] as const)
	);
	const flowNow = $derived(chosen ? experience.readout.deviceFlow[chosen.id] : undefined);
	const aim = (tilt: number) => (tilt === 0 ? 'level' : `${Math.abs(tilt)}° ${tilt > 0 ? 'up' : 'down'}`);
	const tilts = $derived(sliderRange('tilt', units));
	const sweeps = $derived(sliderRange('oscillationSweep', units));
	const periods = $derived(sliderRange('oscillationPeriod', units));
	const heights = $derived(chosenModel?.kind === 'pedestal-fan' && chosenModel.heightRange ? displayRange('length', { min: chosenModel.heightRange[0], max: chosenModel.heightRange[1], step: 0.01 }, units, 1) : null);
	const turns = $derived(chosenModel?.kind === 'box-fan' || chosenModel?.kind === 'pedestal-fan');
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && cancelDrag()} />

<div class="dock-field tray">
	<p class="dock-label" id="tray-label">Add a fan or purifier</p>
	<p class="dock-notice">Drag one onto the home, or press its Add button. A home holds at most {MAX_DEVICES} fans and purifiers.</p>
	<ul class="tray-list" aria-labelledby="tray-label">
		{#each experience.models as model (model.id)}
			<li class="tray-item" style:touch-action="none">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="tray-grip"
					title="Drag onto the home"
					data-model={model.id}
					onpointerdown={(event) => startDrag(event, model)}
					onpointermove={track}
					onpointerup={endDrag}
					onpointercancel={cancelDrag}
				>
					<span class="tray-name">{model.name}</span>
					<span class="tray-meta">{KINDS[model.kind]}, up to {ratedText(model)}</span>
				</div>
				<button type="button" class="pill tray-add" aria-label="Add {model.name}" onclick={() => say(experience.addDevice(model.id))}>Add</button>
			</li>
		{/each}
	</ul>
	<p class="dock-notice tray-message" role="status" data-full={full}>{message || (full ? `A home holds at most ${MAX_DEVICES} fans and purifiers. Remove one to add another.` : '')}</p>
</div>

<div class="dock-field placed">
	<p class="dock-label" id="placed-label">In this home ({devices.length} of {MAX_DEVICES})</p>
	{#if devices.length}
		<ul class="device-list" aria-labelledby="placed-label">
			{#each devices as device (device.id)}
				{@const model = experience.modelOf(device)}
				<li class="device-row" data-chosen={device.id === experience.selected}>
					<button type="button" class="device-pick" aria-pressed={device.id === experience.selected} onclick={() => experience.selectDevice(device.id === experience.selected ? null : device.id)}>
						<span class="tray-name">{model?.name ?? 'Device'}</span>
						<span class="tray-meta">{powerText(device, model)}{device.opening ? ', in a window' : device.y > 0 ? ', on furniture' : ''}</span>
					</button>
					<button type="button" class="pill device-remove" aria-label="Remove {model?.name ?? 'device'}" onclick={() => experience.removeDevice(device.id)}>Remove</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="dock-notice">None yet. Add one to see how the air answers it.</p>
	{/if}
</div>

{#if chosen && chosenModel}
	<div class="dock-field inspector" role="group" aria-label="Settings for {chosenModel.name}">
		<p class="dock-label">{chosenModel.name}</p>
		<RangeField
			id="device-power"
			label="Power"
			value={Math.round(chosen.power * 100)}
			min={0}
			max={100}
			step={1}
			display="{Math.round(chosen.power * 100)}% {powerLabel(chosenModel, chosen.power).name}"
			spoken="{Math.round(chosen.power * 100)} percent, {powerLabel(chosenModel, chosen.power).name}"
			describe={(value) => `${chosenModel.name} at ${value} percent, ${powerLabel(chosenModel, value / 100).name}.`}
			onuser={(value) => experience.updateDevice(chosen.id, { power: value / 100 })}
		/>
		<div class="chips" role="group" aria-label="Power presets">
			<button type="button" class="chip" aria-pressed={chosen.power <= 0.005} onclick={() => experience.updateDevice(chosen.id, { power: 0 })}>Off</button>
			{#each marks as [name, at] (name)}
				<button type="button" class="chip" aria-pressed={Math.abs(chosen.power - at) < 0.02} onclick={() => experience.updateDevice(chosen.id, { power: at })}>{name}</button>
			{/each}
		</div>
		<p class="dock-notice">
			Rated {ratedText(chosenModel)}.{#if flowNow !== undefined && chosenModel.kind !== 'air-purifier'}
				The solver measures {formatFlow(flowNow, units).text} through its blades now.{/if}
		</p>

		{#if turns}
			<RangeField
				id="device-yaw"
				label="Direction it faces"
				value={Math.round(chosen.yaw / 5) * 5 === 360 ? 0 : Math.round(chosen.yaw / 5) * 5}
				min={0}
				max={355}
				step={5}
				display={describeBearing(chosen.yaw).text}
				spoken={describeBearing(chosen.yaw).spoken}
				onuser={(value) => experience.turnDevice(chosen.id, value)}
			/>
			<RangeField
				id="device-tilt"
				label="Aim"
				value={chosen.tilt}
				min={tilts.min}
				max={tilts.max}
				step={tilts.step}
				display={aim(chosen.tilt)}
				spoken={aim(chosen.tilt)}
				onuser={(value) => experience.aimDevice(chosen.id, value)}
			/>
		{/if}

		{#if chosenModel.kind === 'pedestal-fan'}
			<Switch
				checked={chosen.oscillation.on}
				label="Sweep from side to side"
				onchange={(on) => {
					experience.updateDevice(chosen.id, { oscillation: { ...chosen.oscillation, on } });
					experience.announce(on ? `${chosenModel.name} sweeps.` : `${chosenModel.name} holds still.`);
				}}
			/>
			{#if chosen.oscillation.on}
				<RangeField
					id="device-sweep"
					label="Sweep"
					value={chosen.oscillation.sweep}
					min={sweeps.min}
					max={Math.min(sweeps.max, chosenModel.maxSweep ?? sweeps.max)}
					step={sweeps.step}
					display="{Math.round(chosen.oscillation.sweep)}°"
					describe={(value) => `Sweep ${Math.round(value)} degrees.`}
					onuser={(value) => experience.updateDevice(chosen.id, { oscillation: { ...chosen.oscillation, sweep: value } })}
				/>
				<RangeField
					id="device-period"
					label="Time for one sweep out and back"
					value={chosen.oscillation.period}
					min={periods.min}
					max={periods.max}
					step={periods.step}
					display="{chosen.oscillation.period} s"
					describe={(value) => `One sweep every ${value} seconds.`}
					onuser={(value) => experience.updateDevice(chosen.id, { oscillation: { ...chosen.oscillation, period: value } })}
				/>
			{/if}
			{#if heights}
				<RangeField
					id="device-height"
					label="Height of the head"
					value={Number(heights.toDisplay(chosen.height).toFixed(heights.digits))}
					min={heights.min}
					max={heights.max}
					step={heights.step}
					display={formatLength(chosen.height, units).text}
					describe={() => `Head at ${formatLength(chosen.height, units).spoken}.`}
					onuser={(value) => experience.updateDevice(chosen.id, { height: heights.fromDisplay(value) })}
				/>
			{/if}
		{/if}

		{#if chosenModel.kind === 'window-fan'}
			<Segmented
				legend="Which way it blows"
				name="device-intake"
				value={chosen.intake === false ? 'out' : 'in'}
				options={[
					{ value: 'in', label: 'Draws air in' },
					{ value: 'out', label: 'Pushes air out' }
				]}
				onchange={(value) => {
					experience.updateDevice(chosen.id, { intake: value === 'in' });
					experience.announce(value === 'in' ? `${chosenModel.name} draws air in.` : `${chosenModel.name} pushes air out.`);
				}}
			/>
		{/if}

		<div class="dock-field">
			<p class="dock-label" id="device-move-label">Move it {chosen.opening ? '(a window fan goes to another window)' : ''}</p>
			<div class="dpad" role="group" aria-labelledby="device-move-label">
				<button type="button" class="pill" style:grid-area="n" aria-label="Move north" onclick={(event) => nudge(event, 0, -1)}>North</button>
				<button type="button" class="pill" style:grid-area="w" aria-label="Move west" onclick={(event) => nudge(event, -1, 0)}>West</button>
				<button type="button" class="pill" style:grid-area="e" aria-label="Move east" onclick={(event) => nudge(event, 1, 0)}>East</button>
				<button type="button" class="pill" style:grid-area="s" aria-label="Move south" onclick={(event) => nudge(event, 0, 1)}>South</button>
			</div>
			<p class="dock-notice">A step is {formatLength(STEP, units).text}, or {formatLength(1, units).text} with Shift held. North is up the plan.</p>
		</div>
	</div>
{/if}

{#if dragging}
	<div class="drag-chip" aria-hidden="true" data-ok={dragging.ok} style:left="{dragging.x + 16}px" style:top="{dragging.y + 16}px">
		<strong>{dragging.model.name}</strong>
		<span>{dragging.text}</span>
	</div>
{/if}

<style>
	.tray-list,
	.device-list {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.tray-item,
	.device-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 8px;
		align-items: stretch;
	}
	.tray-grip,
	.device-pick {
		display: grid;
		gap: 2px;
		min-height: 56px;
		padding: 8px 14px;
		border-radius: 14px;
		background: var(--dock);
		text-align: left;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.device-pick {
		cursor: pointer;
		touch-action: auto;
	}
	.tray-grip:active {
		cursor: grabbing;
	}
	.tray-name {
		font-size: 13px;
		font-weight: 650;
	}
	.tray-meta {
		font-size: 11px;
		color: var(--muted);
	}
	.device-pick[aria-pressed='true'] {
		background: var(--ink);
		color: #fff;
	}
	.device-pick[aria-pressed='true'] .tray-meta {
		color: #d9ded6;
	}
	.tray-message {
		min-height: 1.7em;
	}
	.tray-message[data-full='true'] {
		color: var(--ink);
	}
	.inspector {
		gap: 14px;
		padding-top: 4px;
	}
	.dpad {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-template-areas: '. n .' 'w . e' '. s .';
		gap: 6px;
		max-width: 20rem;
	}
	.drag-chip {
		position: fixed;
		z-index: 300;
		display: grid;
		gap: 2px;
		max-width: 16rem;
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--ink);
		color: #fff;
		font-size: 12px;
		line-height: 1.4;
		pointer-events: none;
		box-shadow: 0 6px 20px #20322633;
	}
	.drag-chip[data-ok='false'] span {
		color: #ffd2cc;
	}
</style>
