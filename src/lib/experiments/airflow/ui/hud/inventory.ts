import { powerLabel } from '../../devices/model';
import type { DeviceModel } from '../../devices/types';
import { openingsByRoom, roomAt } from '../../homes/rooms';
import type { HomePlan, OpeningSpec } from '../../homes/types';
import { describeSpot, probeName } from '../../probeWords';
import { describeDirection } from '../../directionWords';
import type { ProbeReading } from '../../readouts';
import { MAX_DEVICES, MAX_PINS, type Pin, type Setup, type Target, type UnitSystem } from '../../state';
import { formatParticulates, formatSpeed, formatTemperature } from '../../units';
import { openingReading } from '../openings';
import { DEVICE_KINDS, deviceMenu, openingMenu, probeMenu, type MenuModel } from './menus';
import { activePreset, openingPresets } from './presets';

/**
 * Everything in the Home that can be chosen, as the Inspector lists it for the keyboard (the fans and purifiers, the Probes, and each
 * Room's doors and windows), the words the hover label says about the thing under the pointer, and the menu of a chosen thing. Plain
 * data, so Node tests it against the real plans.
 */

/** What the HUD needs to know about the Home on screen to name and describe things. */
export interface HomeContext {
	plan: HomePlan;
	setup: Pick<Setup, 'devices'>;
	probes: readonly Pin[];
	models: ReadonlyMap<string, DeviceModel>;
	readings: readonly ProbeReading[];
	units: UnitSystem;
	/** How far an Opening is open, 0 to 1 of its travel. */
	amount: (id: string) => number;
}

export interface InventoryItem {
	target: Target;
	name: string;
	/** Its state in a word or two: "Wide", "Medium", "0.4 m/s". */
	state: string;
	/** Where it is, or what kind of thing it is. */
	detail: string;
}

export interface InventoryGroup {
	id: string;
	title: string;
	/** "2 of 6", for the groups that have a limit. */
	count: string;
	items: InventoryItem[];
	/** What an empty group says. */
	empty: string;
}

/** An Opening's state as its menu's presets name it, or its travel in percent between them. */
export function openingState(opening: OpeningSpec, amount: number): string {
	const travel = openingReading(opening, amount).travel;
	return activePreset(openingPresets(opening.kind), travel / 100)?.label ?? `${travel}%`;
}

/** A device's speed in a word: "Medium", "Off", or "45%" between the marks. */
export function powerState(model: DeviceModel, power: number): string {
	const label = powerLabel(model, power);
	return label.exact ? label.name : `${Math.round(power * 100)}%`;
}

const probeReading = (context: HomeContext, pin: Pin) => context.readings.find((r) => r.id === pin.id && r.x === pin.x && r.y === pin.y && r.z === pin.z);

/** A Probe's speed now, or what it is waiting for. */
function probeState(context: HomeContext, pin: Pin): string {
	const reading = probeReading(context, pin);
	if (!reading) return 'Waiting';
	if (!reading.inAir) return 'No air';
	return formatSpeed(reading.speed, context.units).text;
}

const placeOf = (plan: HomePlan, x: number, z: number) => roomAt(plan, x, z)?.name ?? 'Outside the rooms';

export function inventory(context: HomeContext): InventoryGroup[] {
	const { plan, setup, probes, models } = context;
	const devices: InventoryItem[] = [];
	for (const device of setup.devices) {
		const model = models.get(device.model);
		if (!model) continue;
		devices.push({ target: { kind: 'device', id: device.id }, name: model.name, state: powerState(model, device.power), detail: `${DEVICE_KINDS[model.kind]} · ${device.opening ? 'in a window' : placeOf(plan, device.x, device.z)}` });
	}
	const pins: InventoryItem[] = [...probes]
		.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
		.map((pin) => ({ target: { kind: 'probe', id: pin.id }, name: probeName(pin.id), state: probeState(context, pin), detail: placeOf(plan, pin.x, pin.z) }));
	const groups: InventoryGroup[] = [
		{ id: 'devices', title: 'Fans and purifiers', count: `${devices.length} of ${MAX_DEVICES}`, items: devices, empty: 'None yet. Choose Build to bring one in.' },
		{ id: 'probes', title: 'Probes', count: `${pins.length} of ${MAX_PINS}`, items: pins, empty: 'None yet. Choose Probe and click the air to pin one.' }
	];
	for (const { room, openings } of openingsByRoom(plan)) {
		if (!openings.length) continue;
		groups.push({
			id: `room-${room.id}`,
			title: room.name,
			count: '',
			items: openings.map(({ opening, to }) => ({
				target: { kind: 'opening', id: opening.id },
				name: opening.name,
				state: openingState(opening, context.amount(opening.id)),
				detail: to ? `To the ${to.name.toLowerCase()}` : opening.kind === 'door' || opening.kind === 'sliding-door' ? 'Door' : 'Window'
			})),
			empty: ''
		});
	}
	return groups;
}

export interface TargetWords {
	/** "Living room window 1". */
	title: string;
	/** "Casement window · Wide", "Box fan · Medium", "Probe · 0.4 m/s". */
	detail: string;
}

/** What the hover label says about the thing under the pointer. Null for a thing that is gone. */
export function targetWords(target: Target, context: HomeContext): TargetWords | null {
	if (target.kind === 'opening') {
		const opening = context.plan.openings.find((o) => o.id === target.id);
		if (!opening) return null;
		const kind = opening.kind === 'door' ? 'Door' : opening.kind === 'sliding-door' ? 'Sliding door' : 'Window';
		return { title: opening.name, detail: `${kind} · ${openingState(opening, context.amount(opening.id))}` };
	}
	if (target.kind === 'device') {
		const device = context.setup.devices.find((d) => d.id === target.id);
		const model = device ? context.models.get(device.model) : undefined;
		if (!device || !model) return null;
		return { title: model.name, detail: `${DEVICE_KINDS[model.kind]} · ${powerState(model, device.power)}` };
	}
	const pin = context.probes.find((p) => p.id === target.id);
	if (!pin) return null;
	return { title: probeName(pin.id), detail: `Probe · ${probeState(context, pin)}` };
}

export interface ProbeCard {
	id: string;
	name: string;
	/** The Room it stands in. */
	room: string;
	/** The air's speed, "0.42 m/s", or null before a reading (see `message`). */
	speed: string | null;
	/** The bearing the air moves toward, degrees, for the card's arrow; null when it is still or goes straight up or down. */
	heading: number | null;
	/** "toward NE, rising 12°", "still". */
	direction: string;
	temperature: string;
	/** PM2.5 in µg/m³. */
	pm25: string;
	/** Why there is no reading, or an empty string. */
	message: string;
	/** Everything on the card as sentences, for a screen reader. */
	sentence: string;
}

/** Each Probe's floating card in the HUD: its reading for the eye, in a few large values, and in one sentence for a screen reader. */
export function probeCards(context: HomeContext): ProbeCard[] {
	return [...context.probes]
		.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
		.map((pin) => {
			const reading = probeReading(context, pin);
			const name = reading?.label ?? probeName(pin.id);
			const spot = describeSpot(name, pin, reading ?? null, context.units);
			const room = placeOf(context.plan, pin.x, pin.z);
			if (!reading || !reading.inAir) return { id: pin.id, name, room, speed: null, heading: null, direction: '', temperature: '', pm25: '', message: spot.message, sentence: spot.sentence };
			const direction = describeDirection(reading.u, reading.v, reading.w);
			const moving = direction.text !== 'still' && !direction.text.startsWith('straight');
			return {
				id: pin.id,
				name,
				room,
				speed: formatSpeed(reading.speed, context.units).text,
				heading: moving ? direction.heading : null,
				direction: direction.text,
				temperature: formatTemperature(reading.temperature, context.units).text,
				pm25: formatParticulates(reading.particulates).micrograms.text,
				message: '',
				sentence: spot.sentence
			};
		});
}

/** The context menu (and the Inspector's settings) of a chosen thing, or null when it is gone. */
export function menuFor(target: Target, context: HomeContext): MenuModel | null {
	if (target.kind === 'opening') {
		const opening = context.plan.openings.find((o) => o.id === target.id);
		if (!opening) return null;
		const fanned = context.setup.devices.some((d) => d.opening === opening.id && context.models.get(d.model)?.kind === 'window-fan');
		return openingMenu(context.plan, opening, context.amount(opening.id), fanned);
	}
	if (target.kind === 'device') {
		const device = context.setup.devices.find((d) => d.id === target.id);
		const model = device ? context.models.get(device.model) : undefined;
		return device && model ? deviceMenu(model, device, context.units) : null;
	}
	const pin = context.probes.find((p) => p.id === target.id);
	if (!pin) return null;
	const reading = probeReading(context, pin);
	return probeMenu(context.plan, pin, reading ?? null, context.units, reading?.label);
}
