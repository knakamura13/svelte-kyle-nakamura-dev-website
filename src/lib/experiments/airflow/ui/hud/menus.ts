import { fanFlow, powerLabel, purifierCadr } from '../../devices/model';
import type { DeviceModel } from '../../devices/types';
import { roomAt, roomsOfOpening } from '../../homes/rooms';
import type { HomePlan, OpeningKind, OpeningSpec } from '../../homes/types';
import type { AirReading } from '../../readouts';
import { describeSpot, probeName, type ReadingRow } from '../../probeWords';
import type { DeviceState, Pin, UnitSystem } from '../../state';
import { formatFlow, formatLength } from '../../units';
import { openingCaption, openingReading, openingSpoken } from '../openings';
import { activePreset, isSwingDoor, openingPresets, powerPresets } from './presets';

/**
 * What a context menu and the Inspector show for the thing the visitor chose, as data: a title and a line under it, the presets
 * with the one that is on, the fine control, a caption and the actions. The components only draw this, so Node tests every
 * menu against the real plans and the real catalog.
 */

export type MenuKind = 'window' | 'door' | 'fan' | 'purifier' | 'probe';

export interface MenuChoice {
	id: string;
	label: string;
	value: number;
	pressed: boolean;
}

export type MenuActionId = 'oscillate' | 'turn-left' | 'turn-right' | 'exhaust' | 'move' | 'remove';

export interface MenuAction {
	id: MenuActionId;
	label: string;
	/** What the action does, for its tooltip and its accessible description. */
	hint: string;
	/** For a toggle (oscillate, exhaust): whether it is on. */
	pressed?: boolean;
}

export interface FineControl {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	/** The value as shown beside it, and as a screen reader says it. */
	display: string;
	spoken: string;
}

export interface MenuModel {
	kind: MenuKind;
	title: string;
	/** "Casement window · Living room", "Box fan · 1,900 CFM on Medium". */
	subtitle: string;
	/** What the presets set, as the name of their group: "How far it opens", "Speed". Empty for a menu with none. */
	presetsLabel: string;
	presets: MenuChoice[];
	fine: FineControl | null;
	/** A line under the controls: what the setting does now. */
	caption: string;
	/** Something the visitor should know before using the controls (a window fan holds this window), or empty. */
	note: string;
	actions: MenuAction[];
	/** A Probe's reading, for the eye (rows) and in one sentence. */
	reading: { rows: ReadingRow[]; message: string; sentence: string } | null;
}

const OPENING_KINDS: Record<OpeningKind, string> = {
	door: 'Door',
	'sliding-door': 'Sliding door',
	'double-hung': 'Double-hung window',
	casement: 'Casement window'
};

export const DEVICE_KINDS: Record<DeviceModel['kind'], string> = {
	'box-fan': 'Box fan',
	'pedestal-fan': 'Pedestal fan',
	'window-fan': 'Window fan',
	'air-purifier': 'Air purifier'
};

/** The Room an Opening is in, and for a doorway the Room it leads to: "Living room", "Bedroom 1 to Hall". */
export function openingPlace(plan: HomePlan, opening: OpeningSpec): string {
	const { room, to } = roomsOfOpening(plan, opening);
	return to ? `${room.name} to ${to.name}` : room.name;
}

/** The menu of a door or window opened `amount` of its travel. `fanned` when a window fan sits in it and sets how far it opens while it runs. */
export function openingMenu(plan: HomePlan, opening: OpeningSpec, amount: number, fanned = false): MenuModel {
	const reading = openingReading(opening, amount);
	const door = isSwingDoor(opening.kind);
	const presets = openingPresets(opening.kind);
	const on = activePreset(presets, reading.travel / 100);
	return {
		kind: door ? 'door' : 'window',
		title: opening.name,
		subtitle: `${OPENING_KINDS[opening.kind]} · ${openingPlace(plan, opening)}`,
		presetsLabel: door ? 'Door' : 'How far it opens',
		presets: presets.map((preset) => ({ id: preset.id, label: preset.label, value: preset.value, pressed: preset.id === on?.id })),
		fine: door
			? null
			: { label: 'Open', value: reading.travel, min: 0, max: 100, step: 1, display: `${reading.travel}%`, spoken: openingSpoken(reading) },
		caption: door ? (reading.travel === 0 ? 'Shut.' : reading.travel >= 100 ? 'Wide open.' : `${reading.travel}% open.`) : openingCaption(reading),
		note: fanned ? 'A window fan holds this window: it sets how far it opens while the fan runs.' : '',
		actions: [],
		reading: null
	};
}

/** A device's highest rated flow: a fan's air at High, a purifier's clean air at High. */
export const ratedFlow = (model: DeviceModel) => (model.kind === 'air-purifier' ? purifierCadr(model, 1) : fanFlow(model, 1));

/** "1,900 CFM on Medium", "Off", "cleans 110 CFM on Medium". */
export function flowNow(model: DeviceModel, power: number, units: UnitSystem): string {
	const label = powerLabel(model, power);
	if (label.name === 'Off') return 'Off';
	if (model.kind === 'air-purifier') return `cleans ${formatFlow(purifierCadr(model, power), units).text} on ${label.exact ? label.name : `${Math.round(power * 100)}%`}`;
	return `${formatFlow(fanFlow(model, power), units).text} on ${label.exact ? label.name : `${Math.round(power * 100)}%`}`;
}

/** The menu of a fan or purifier. */
export function deviceMenu(model: DeviceModel, device: DeviceState, units: UnitSystem): MenuModel {
	const presets = powerPresets(model);
	const on = activePreset(presets, device.power);
	const actions: MenuAction[] = [];
	if (model.kind === 'pedestal-fan') actions.push({ id: 'oscillate', label: 'Oscillate', hint: 'Sweep from side to side.', pressed: device.oscillation.on });
	if (model.kind === 'box-fan' || model.kind === 'pedestal-fan') {
		actions.push({ id: 'turn-left', label: 'Turn left', hint: 'Turn it 45° anticlockwise.' }, { id: 'turn-right', label: 'Turn right', hint: 'Turn it 45° clockwise.' });
	}
	if (model.kind === 'window-fan') actions.push({ id: 'exhaust', label: 'Exhaust', hint: 'Push air out of the home instead of drawing it in.', pressed: device.intake === false });
	actions.push({ id: 'move', label: 'Move', hint: model.kind === 'window-fan' ? 'Pick it up and put it in another window.' : 'Pick it up and put it somewhere else.' }, { id: 'remove', label: 'Remove', hint: 'Take it out of the home.' });
	const where = device.opening ? 'in a window' : device.y > 0 ? 'on furniture' : '';
	return {
		kind: model.kind === 'air-purifier' ? 'purifier' : 'fan',
		title: model.name,
		subtitle: [DEVICE_KINDS[model.kind], flowNow(model, device.power, units), where].filter(Boolean).join(' · '),
		presetsLabel: 'Speed',
		presets: presets.map((preset) => ({ id: preset.id, label: preset.label, value: preset.value, pressed: preset.id === on?.id })),
		fine: null,
		caption: model.kind === 'air-purifier' ? `Rated to clean ${formatFlow(ratedFlow(model), units).text} of air on High.` : `Rated ${formatFlow(ratedFlow(model), units).text} on High.`,
		note: '',
		actions,
		reading: null
	};
}

/** The menu of a Probe: where it is, what it reads, and Remove. */
export function probeMenu(plan: HomePlan, pin: Pin, reading: AirReading | null | undefined, units: UnitSystem, label?: string): MenuModel {
	const name = label ?? probeName(pin.id);
	const spot = describeSpot(name, pin, reading, units);
	const room = roomAt(plan, pin.x, pin.z);
	return {
		kind: 'probe',
		title: name,
		subtitle: `${room ? `${room.name} · ` : ''}${formatLength(pin.y, units).text} up`,
		presetsLabel: '',
		presets: [],
		fine: null,
		caption: '',
		note: '',
		actions: [{ id: 'remove', label: 'Remove', hint: 'Take this probe away.' }],
		reading: { rows: spot.rows, message: spot.message, sentence: spot.sentence }
	};
}
