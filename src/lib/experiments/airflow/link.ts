import { CEILING, type PlanId } from './homes/types';
import { LIMITS, MAX_DEVICES, type Conditions, type DeviceState, type Setup } from './state';

/**
 * The shareable link: a Setup as `1.` and base64url bytes, no padding. It carries the Setup and nothing else (no pins,
 * smoke, view, clock or units).
 *
 * Every number is kept as whole steps of a fixed precision: positions and heights to the centimetre, angles and
 * bearings to the degree, power and opening amounts to the percent, temperatures to half a degree, wind speed to
 * 0.1 m/s, outdoor PM2.5 to 1 µg/m³, the oscillation period to 0.1 s. `normalizeSetup` applies exactly that rounding
 * and clamping, so a setup survives the link as `normalizeSetup` would leave it.
 *
 * Version 1 bytes. Integers are unsigned LEB128 varints, zigzag-coded where a field can be negative (tilt, outdoor
 * temperature).
 *
 *   strings     count, then each distinct string in sorted order: bytes it shares with the one before, count of new
 *               bytes, the new UTF-8 bytes. Every id below is an index into this list, so an id used twice is
 *               stored once and ids with a common start share it.
 *   plan        string index
 *   flags       bit 0: furniture built in
 *   conditions  mask of the fields that differ from V1_CONDITIONS (below), then those fields in order
 *   devices     count, then each: model (string index), mask, the masked numbers in DEVICE_FIELDS order, and the
 *               opening (string index) when its bit is set
 *   openings    count, then each: opening id (string index), percent open
 *
 * Decoding is a trust boundary and never throws. It reads at most MAX_LINK_LENGTH characters, so its working memory is
 * a few kilobytes: the bytes, one integer per string (each takes at least two bytes) and the setup it returns.
 */

/** The ids a link may name, from the plans and the device catalog. Anything else in a link is dropped. */
export interface LinkCatalog {
	plans: { id: PlanId; openings: string[] }[];
	models: string[];
}

/** The catalog for the page's plans and device models: just their ids. */
export function linkCatalog(plans: readonly { id: PlanId; openings: readonly { id: string }[] }[], models: readonly { id: string }[]): LinkCatalog {
	return { plans: plans.map((plan) => ({ id: plan.id, openings: plan.openings.map((opening) => opening.id) })), models: models.map((model) => model.id) };
}

export const LINK_VERSION = '1.';
/** The longest text `decodeSetup` reads. A setup with six devices and every opening of a large house is under half of it. */
export const MAX_LINK_LENGTH = 4000;
/** Bound on a device's x and z, m: beyond any plan. The page fits a device to its plan's footprint. */
export const MAX_POSITION = 100;

interface Field {
	/** Steps per unit: 100 keeps centimetres or percent, 10 tenths, 2 half degrees. */
	scale: number;
	min: number;
	max: number;
	/** What a missing field, or one that is not a number, becomes. ±Infinity clamps instead. */
	fallback: number;
	/** A bearing: wraps into [0, 360) instead of clamping. */
	wrap?: boolean;
	/** Zigzag-coded on the wire, because the steps can be negative. Stated here and not worked out from `min`, so a change to LIMITS cannot change how a field is read. */
	signed?: boolean;
}

const bearing = (fallback: number): Field => ({ scale: 1, min: 0, max: 360, fallback, wrap: true });
const bounded = ({ min, max }: { min: number; max: number }, scale: number, fallback: number, signed = false): Field => ({ scale, min, max, fallback, signed });

/**
 * What a link means by a condition it leaves out. Frozen with version 1, and deliberately not `DEFAULT_CONDITIONS`: the
 * page can change its own defaults later without changing the meaning of a link already shared. Changing any value here,
 * a `scale`, a `fallback` or a `signed` below, or the order of the fields, needs a new version tag.
 */
const V1_CONDITIONS: Readonly<Conditions> = { windFrom: 270, windSpeed: 0, outdoorTemp: 10, indoorTemp: 21, outdoorPm25: 0 };

const CONDITION_FIELDS: readonly (readonly [keyof Conditions, Field])[] = [
	['windFrom', bearing(V1_CONDITIONS.windFrom)],
	['windSpeed', bounded(LIMITS.windSpeed, 10, V1_CONDITIONS.windSpeed)],
	['outdoorTemp', bounded(LIMITS.outdoorTemp, 2, V1_CONDITIONS.outdoorTemp, true)],
	['indoorTemp', bounded(LIMITS.indoorTemp, 2, V1_CONDITIONS.indoorTemp)],
	['outdoorPm25', bounded(LIMITS.outdoorPm25, 1, V1_CONDITIONS.outdoorPm25)]
];

type DeviceNumber = 'x' | 'z' | 'yaw' | 'power' | 'tilt' | 'y' | 'height' | 'sweep' | 'period';

/** In mask-bit order, commonest first, so a device on the floor needs a one-byte mask. */
const DEVICE_FIELDS: readonly (readonly [DeviceNumber, Field])[] = [
	['x', bounded({ min: 0, max: MAX_POSITION }, 100, 0)],
	['z', bounded({ min: 0, max: MAX_POSITION }, 100, 0)],
	['yaw', bearing(0)],
	['power', bounded({ min: 0, max: 1 }, 100, 1)],
	['tilt', bounded(LIMITS.tilt, 1, 0, true)],
	['y', bounded({ min: 0, max: CEILING }, 100, 0)],
	['height', bounded({ min: 0, max: CEILING }, 100, 0)],
	['sweep', bounded(LIMITS.oscillationSweep, 1, 90)],
	['period', bounded(LIMITS.oscillationPeriod, 10, 8)]
];
const DEVICE_INDEX = Object.fromEntries(DEVICE_FIELDS.map(([key], i) => [key, i])) as Record<DeviceNumber, number>;
const OSCILLATING = 1 << 9;
const HAS_OPENING = 1 << 10;
const HAS_INTAKE = 1 << 11;
const INTAKE = 1 << 12;
const DEVICE_BITS = 13;

const AMOUNT = bounded({ min: 0, max: 1 }, 100, 0);

/** Wraps or clamps whole steps into a field's range, and turns −0 into 0. */
function fit(field: Field, steps: number): number {
	const top = Math.round(field.max * field.scale);
	if (field.wrap) return ((steps % top) + top) % top || 0;
	return Math.min(top, Math.max(Math.round(field.min * field.scale), steps)) || 0;
}

/** A value as whole steps of its field. */
function toSteps(field: Field, value: unknown): number {
	let x = typeof value === 'number' ? value : NaN;
	if (Number.isNaN(x) || (field.wrap && !Number.isFinite(x))) x = field.fallback;
	return fit(field, Math.round(x * field.scale));
}

const defaultSteps = (field: Field) => toSteps(field, field.fallback);

interface PackedDevice {
	model: string;
	/** Whole steps, in DEVICE_FIELDS order. */
	steps: number[];
	oscillating: boolean;
	opening?: string;
	intake?: boolean;
}

/** A setup as the link holds it: whole steps, the openings sorted by id. Encoding writes it, decoding reads it back, and both turn it into a Setup the same way. */
interface Packed {
	plan: string;
	furniture: boolean;
	conditions: number[];
	devices: PackedDevice[];
	openings: [string, number][];
}

function pack(setup: Setup): Packed {
	const devices = (Array.isArray(setup.devices) ? setup.devices : [])
		.filter((device) => typeof device?.model === 'string')
		.slice(0, MAX_DEVICES)
		.map((device): PackedDevice => {
			const values: Record<DeviceNumber, unknown> = {
				x: device.x,
				z: device.z,
				yaw: device.yaw,
				power: device.power,
				tilt: device.tilt,
				y: device.y,
				height: device.height,
				sweep: device.oscillation?.sweep,
				period: device.oscillation?.period
			};
			return {
				model: device.model,
				steps: DEVICE_FIELDS.map(([key, field]) => toSteps(field, values[key])),
				oscillating: device.oscillation?.on === true,
				opening: typeof device.opening === 'string' && device.opening !== '' ? device.opening : undefined,
				intake: typeof device.intake === 'boolean' ? device.intake : undefined
			};
		});
	const record: Record<string, unknown> = setup.openings && typeof setup.openings === 'object' ? setup.openings : {};
	return {
		plan: String(setup.plan),
		furniture: typeof setup.furniture === 'boolean' ? setup.furniture : true,
		conditions: CONDITION_FIELDS.map(([key, field]) => toSteps(field, setup.conditions?.[key])),
		devices,
		openings: Object.keys(record)
			.sort()
			.map((id): [string, number] => [id, toSteps(AMOUNT, record[id])])
	};
}

function unpack(packed: Packed): Setup {
	const conditions = {} as Conditions;
	CONDITION_FIELDS.forEach(([key, field], i) => (conditions[key] = packed.conditions[i] / field.scale));
	const openings: Record<string, number> = {};
	// defineProperty, so an id such as "__proto__" is an ordinary key rather than a prototype.
	for (const [id, steps] of packed.openings) Object.defineProperty(openings, id, { value: steps / AMOUNT.scale, enumerable: true, writable: true, configurable: true });
	const devices = packed.devices.map((device, index): DeviceState => {
		const value = (key: DeviceNumber) => device.steps[DEVICE_INDEX[key]] / DEVICE_FIELDS[DEVICE_INDEX[key]][1].scale;
		const state: DeviceState = {
			id: `d${index + 1}`,
			model: device.model,
			x: value('x'),
			z: value('z'),
			y: value('y'),
			yaw: value('yaw'),
			tilt: value('tilt'),
			power: value('power'),
			height: value('height'),
			oscillation: { on: device.oscillating, sweep: value('sweep'), period: value('period') }
		};
		if (device.opening !== undefined) state.opening = device.opening;
		if (device.intake !== undefined) state.intake = device.intake;
		return state;
	});
	return { plan: packed.plan as PlanId, furniture: packed.furniture, devices, openings, conditions };
}

/**
 * A setup as the link keeps it: every number rounded to the link's precision and clamped to LIMITS (bearings wrapped,
 * anything not a number set to its default), at most MAX_DEVICES devices with ids d1, d2, ..., and the openings in id
 * order. It does not check ids against a catalog; `decodeSetup` does.
 */
export function normalizeSetup(setup: Setup): Setup {
	return unpack(pack(setup));
}

function utf8(text: string): number[] {
	const bytes: number[] = [];
	for (const char of text) {
		let code = char.codePointAt(0)!;
		if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
		if (code < 0x80) bytes.push(code);
		else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
		else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
		else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
	}
	return bytes;
}

const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(bytes: number[]): string {
	let text = '';
	for (let i = 0; i < bytes.length; i += 3) {
		const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
		// One byte needs two digits, two need three.
		const count = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
		for (let c = 0; c < count; c++) text += DIGITS[(chunk >> (18 - 6 * c)) & 63];
	}
	return text;
}

function fromBase64Url(text: string): Uint8Array | null {
	if (text.length % 4 === 1) return null;
	const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
	let buffer = 0;
	let bits = 0;
	let at = 0;
	for (let i = 0; i < text.length; i++) {
		const digit = DIGITS.indexOf(text[i]);
		if (digit < 0) return null;
		buffer = ((buffer << 6) | digit) & 0xfff;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			bytes[at++] = (buffer >> bits) & 0xff;
		}
	}
	return bytes;
}

class Writer {
	readonly bytes: number[] = [];

	byte(value: number) {
		this.bytes.push(value);
	}

	uint(value: number) {
		while (value >= 0x80) {
			this.bytes.push((value % 0x80) | 0x80);
			value = Math.floor(value / 0x80);
		}
		this.bytes.push(value);
	}

	steps(field: Field, steps: number) {
		this.uint(field.signed ? (steps < 0 ? -2 * steps - 1 : 2 * steps) : steps);
	}
}

/** Thrown inside the decoder for any structural problem, and turned into null by `decodeSetup`. One instance, so a bad link costs no stack trace. */
const MALFORMED = new Error('malformed setup link');

class Reader {
	private readonly bytes: Uint8Array;
	private at = 0;

	constructor(bytes: Uint8Array) {
		this.bytes = bytes;
	}

	get remaining() {
		return this.bytes.length - this.at;
	}

	byte(): number {
		if (this.at >= this.bytes.length) throw MALFORMED;
		return this.bytes[this.at++];
	}

	/** At most five bytes, so a value is below 2^35 and exact. */
	uint(): number {
		let value = 0;
		for (let i = 0, scale = 1; i < 5; i++, scale *= 0x80) {
			const byte = this.byte();
			value += (byte & 0x7f) * scale;
			if (byte < 0x80) return value;
		}
		throw MALFORMED;
	}

	/** Whole steps of a field, wrapped or clamped into its range whatever the link says. */
	steps(field: Field): number {
		const n = this.uint();
		const steps = !field.signed ? n : n % 2 ? -(n + 1) / 2 : n / 2;
		return fit(field, steps);
	}

	/** A count of items that each take at least `size` bytes, so a huge count fails here instead of allocating. */
	count(size: number): number {
		const n = this.uint();
		if (n * size > this.remaining) throw MALFORMED;
		return n;
	}
}

function fieldMask(fields: readonly (readonly [string, Field])[], steps: number[]): number {
	return fields.reduce((mask, [, field], bit) => (steps[bit] === defaultSteps(field) ? mask : mask | (1 << bit)), 0);
}

function write(packed: Packed): number[] {
	const out = new Writer();
	const strings = [...new Set([packed.plan, ...packed.devices.flatMap((d) => (d.opening === undefined ? [d.model] : [d.model, d.opening])), ...packed.openings.map(([id]) => id)])].sort();
	const index = new Map(strings.map((text, i) => [text, i]));
	out.uint(strings.length);
	let previous: number[] = [];
	for (const text of strings) {
		const bytes = utf8(text);
		let shared = 0;
		while (shared < bytes.length && shared < previous.length && bytes[shared] === previous[shared]) shared++;
		out.uint(shared);
		out.uint(bytes.length - shared);
		for (let i = shared; i < bytes.length; i++) out.byte(bytes[i]);
		previous = bytes;
	}
	out.uint(index.get(packed.plan)!);
	out.uint(packed.furniture ? 1 : 0);
	const conditionMask = fieldMask(CONDITION_FIELDS, packed.conditions);
	out.uint(conditionMask);
	CONDITION_FIELDS.forEach(([, field], bit) => {
		if (conditionMask & (1 << bit)) out.steps(field, packed.conditions[bit]);
	});
	out.uint(packed.devices.length);
	for (const device of packed.devices) {
		let mask = fieldMask(DEVICE_FIELDS, device.steps);
		if (device.oscillating) mask |= OSCILLATING;
		if (device.opening !== undefined) mask |= HAS_OPENING;
		if (device.intake !== undefined) mask |= HAS_INTAKE | (device.intake ? INTAKE : 0);
		out.uint(index.get(device.model)!);
		out.uint(mask);
		DEVICE_FIELDS.forEach(([, field], bit) => {
			if (mask & (1 << bit)) out.steps(field, device.steps[bit]);
		});
		if (device.opening !== undefined) out.uint(index.get(device.opening)!);
	}
	out.uint(packed.openings.length);
	for (const [id, steps] of packed.openings) {
		out.uint(index.get(id)!);
		out.uint(steps);
	}
	return out.bytes;
}

/** Reads a link's bytes back into packed form, keeping only what the catalog knows. Null for an unknown plan; throws MALFORMED for a broken structure. */
function read(bytes: Uint8Array, catalog: LinkCatalog): Packed | null {
	const input = new Reader(bytes);
	// Strings are matched against the catalog's ids byte by byte, so nothing from the link is turned into a string.
	const known = [...new Set([...catalog.plans.flatMap((plan) => [plan.id, ...plan.openings]), ...catalog.models])];
	const knownBytes = known.map(utf8);
	const longest = knownBytes.reduce((most, b) => Math.max(most, b.length), 0);
	const strings = new Int32Array(input.count(2));
	const scratch = new Uint8Array(longest);
	let previous = 0;
	for (let i = 0; i < strings.length; i++) {
		const shared = input.uint();
		const added = input.count(1);
		if (shared > previous) throw MALFORMED;
		// Only the first `longest` bytes are kept: a longer string matches no id, and neither does one that shares more than that with it.
		for (let j = 0; j < added; j++) {
			const byte = input.byte();
			if (shared + j < longest) scratch[shared + j] = byte;
		}
		previous = shared + added;
		strings[i] = previous > longest ? -1 : knownBytes.findIndex((b) => b.length === previous && b.every((byte, k) => byte === scratch[k]));
	}
	const text = (index: number): string | undefined => {
		if (index >= strings.length) throw MALFORMED;
		return strings[index] < 0 ? undefined : known[strings[index]];
	};

	const planId = text(input.uint());
	const plan = catalog.plans.find((p) => p.id === planId);
	if (!plan) return null;
	const flags = input.uint();
	if (flags > 1) throw MALFORMED;

	const conditionMask = input.uint();
	if (conditionMask >= 1 << CONDITION_FIELDS.length) throw MALFORMED;
	const conditions = CONDITION_FIELDS.map(([, field], bit) => (conditionMask & (1 << bit) ? input.steps(field) : defaultSteps(field)));

	const models = new Set(catalog.models);
	const openingIds = new Set(plan.openings);
	const devices: PackedDevice[] = [];
	// A device that is dropped is still read, to reach what follows, but into this rather than a new array.
	const discard: number[] = [];
	const deviceCount = input.count(2);
	for (let i = 0; i < deviceCount; i++) {
		const model = text(input.uint());
		const mask = input.uint();
		if (mask >= 1 << DEVICE_BITS || (mask & INTAKE && !(mask & HAS_INTAKE))) throw MALFORMED;
		const kept = model !== undefined && models.has(model) && devices.length < MAX_DEVICES ? model : undefined;
		const steps: number[] = kept === undefined ? discard : [];
		DEVICE_FIELDS.forEach(([, field], bit) => (steps[bit] = mask & (1 << bit) ? input.steps(field) : defaultSteps(field)));
		const opening = mask & HAS_OPENING ? text(input.uint()) : undefined;
		if (kept === undefined) continue;
		devices.push({
			model: kept,
			steps,
			oscillating: (mask & OSCILLATING) !== 0,
			opening: opening !== undefined && openingIds.has(opening) ? opening : undefined,
			intake: mask & HAS_INTAKE ? (mask & INTAKE) !== 0 : undefined
		});
	}

	const amounts = new Map<string, number>();
	const openingCount = input.count(2);
	for (let i = 0; i < openingCount; i++) {
		const id = text(input.uint());
		const steps = fit(AMOUNT, input.uint());
		if (id !== undefined && openingIds.has(id)) amounts.set(id, steps);
	}
	if (input.remaining !== 0) throw MALFORMED;
	return { plan: plan.id, furniture: flags === 1, conditions, devices, openings: [...amounts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) };
}

/** The link text for a setup: `1.` and base64url. Equal setups give equal text. */
export function encodeSetup(setup: Setup): string {
	return LINK_VERSION + toBase64Url(write(pack(setup)));
}

/**
 * The setup a link describes, or null when the text is not a version 1 link, its structure is broken, it is longer than
 * MAX_LINK_LENGTH, or its plan is not in the catalog. Otherwise every number is clamped to LIMITS, models and openings
 * the catalog does not know are dropped (the device for a model, the id for an opening), devices beyond MAX_DEVICES are
 * dropped, devices get fresh ids d1, d2, ..., and fields the link leaves out take their defaults. Never throws.
 */
export function decodeSetup(text: string, catalog: LinkCatalog): Setup | null {
	try {
		if (typeof text !== 'string' || text.length > MAX_LINK_LENGTH) return null;
		const code = text.trim();
		if (!code.startsWith(LINK_VERSION)) return null;
		const bytes = fromBase64Url(code.slice(LINK_VERSION.length));
		const packed = bytes && read(bytes, catalog);
		return packed ? unpack(packed) : null;
	} catch {
		// A broken link, or a catalog the page built wrong: either way there is no setup to load.
		return null;
	}
}

const HASH_KEY = 's=';

export function setupToHash(setup: Setup): string {
	return `#${HASH_KEY}${encodeSetup(setup)}`;
}

/** The setup in a location hash such as `#s=1.…`, which may sit among other `&`-separated parameters; null if there is none or it does not decode. */
export function setupFromHash(hash: string, catalog: LinkCatalog): Setup | null {
	// Checked before any scan, so a huge hash costs nothing; the margin leaves room for other parameters.
	if (typeof hash !== 'string' || hash.length > 2 * MAX_LINK_LENGTH) return null;
	let start = hash.startsWith('#') ? 1 : 0;
	for (;;) {
		const end = hash.indexOf('&', start);
		const stop = end < 0 ? hash.length : end;
		if (hash.startsWith(HASH_KEY, start)) return stop - start - HASH_KEY.length > MAX_LINK_LENGTH ? null : decodeSetup(hash.slice(start + HASH_KEY.length, stop), catalog);
		if (end < 0) return null;
		start = end + 1;
	}
}
