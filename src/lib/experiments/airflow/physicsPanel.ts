import type { PhysicsReading, RoomReading, RunStatus } from './readouts';
import type { MassBalance } from './solver/types';
import type { UnitSystem } from './state';
import { UNIT_SPACE, formatAirChanges, formatDuration, formatLength, formatMass, formatParticulates, formatSpeed, formatTemperature, formatTimeScale, formatVolume, type Formatted } from './units';

/**
 * What the Physics panel says, as text, so the Svelte component has nothing to decide and Node can test every sentence. Every number
 * goes through units.ts, so it follows the visitor's unit system; the smoke totals are milligrams and air changes per hour are the
 * same in both. A quantity that is not known yet reads as a dash.
 */

const NONE = '—';

/** One quantity: its name, the number as shown, the unit that goes small after it, and a few words to go beside it. */
export interface PanelReading {
	key: string;
	label: string;
	value: string;
	unit?: string;
	note?: string;
}

/** A formatted quantity as a value with the unit that goes small after it, and no unit after a dash. */
const withUnit = (f: Formatted): Pick<PanelReading, 'value' | 'unit'> => (f.value === NONE ? { value: NONE } : { value: f.value, unit: f.unit });

/** A count with thousands separators, the English way, as the status line under the Stage writes it. */
export const formatCount = (n: number) => n.toLocaleString('en-US');

const twoSignificant = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2, maximumFractionDigits: 20 });

/** A fraction of the air's own speed as a percentage, to two significant digits; below a millionth of it, it reads as under that. */
export function formatDivergence(divergence: number): { value: string; unit: string } {
	if (!Number.isFinite(divergence) || divergence < 0) return { value: NONE, unit: '' };
	if (divergence < 1e-6) return { value: `<${UNIT_SPACE}0.0001`, unit: '%' };
	return { value: twoSignificant.format(divergence * 100), unit: '%' };
}

/** What divergence is, in words. It is the one number in the panel that means nothing without them. */
export const DIVERGENCE_WORDS = 'How far the air is from being incompressible: the air a cell makes or loses, as a share of the air’s own speed. Smaller is better, and zero would be perfect.';

/** The panel's first part: how the solver is doing. Before the first step the numbers that come from stepping read as dashes. */
export function solverReadings(physics: PhysicsReading, status: RunStatus, units: UnitSystem): PanelReading[] {
	const started = physics.backend !== null && physics.time > 0;
	const divergence = formatDivergence(physics.divergence);
	const speed: Pick<PanelReading, 'value' | 'unit'> =
		status === 'paused' ? { value: 'Paused' } : physics.backend === null || physics.rate === null ? { value: NONE } : { value: formatTimeScale(physics.rate).text, unit: 'real time' };
	const backend: Pick<PanelReading, 'value' | 'note'> =
		physics.backend === 'webgpu' ? { value: 'WebGPU' } : physics.backend === 'cpu' ? { value: 'Processor', note: physics.reducedDetail ? 'reduced detail' : undefined } : { value: NONE };
	return [
		{ key: 'time', label: 'Simulated time', value: physics.backend === null ? NONE : formatDuration(physics.time).value },
		{ key: 'speed', label: 'Speed', ...speed },
		{ key: 'cells', label: 'Grid', value: physics.backend === null ? NONE : formatCount(physics.cells), unit: physics.backend === null ? undefined : 'cells' },
		{ key: 'size', label: 'Cell size', value: physics.cellSize === null ? NONE : formatLength(physics.cellSize, units).text },
		{ key: 'backend', label: 'Backend', ...backend },
		{ key: 'fastest', label: 'Fastest air', ...(started ? withUnit(formatSpeed(physics.maxSpeed, units)) : { value: NONE }) },
		{ key: 'divergence', label: 'Divergence', ...(started ? divergence : { value: NONE }) }
	];
}

/** The smoke accounting's two columns: what came in, and where it is now. With no totals yet, every value is a dash. */
export function smokeReadings(mass: MassBalance | null): { came: PanelReading[]; where: PanelReading[] } {
	const mg = (key: string, label: string, term: keyof MassBalance): PanelReading => ({ key, label, ...(mass ? withUnit(formatMass(mass[term])) : { value: NONE }) });
	return {
		came: [mg('initial', 'In the air at the start', 'initial'), mg('emitted', 'Released', 'emitted'), mg('inflow', 'Let in from outdoors', 'inflow')],
		where: [mg('inAir', 'In the air now', 'inAir'), mg('outflow', 'Left through openings', 'outflow'), mg('removed', 'Cleaned by purifiers', 'removed'), mg('deposited', 'Settled on surfaces', 'deposited')]
	};
}

/** The Room averages table's columns, in order: what the header says. The first is the Room's name, which is the row's own header. */
export const ROOM_COLUMNS = ['Room', 'Volume', 'Speed', 'Temperature', 'PM2.5', 'Air changes per hour'] as const;

export interface RoomRow {
	id: string;
	name: string;
	volume: string;
	speed: string;
	temperature: string;
	particulates: string;
	changes: string;
}

/**
 * One row for each Room of the Home. `readings` are the averages the solver last measured; before it has measured any (a simulation
 * that has not started), or while they are still the last Home's (a new Home has been picked and its world is being built), the rows
 * are the plan's Rooms with dashes, so the table names the right Rooms from the first moment and never shows one Home's air as another's.
 */
export function roomRows(readings: readonly RoomReading[], plan: readonly { id: string; name: string }[], units: UnitSystem): RoomRow[] {
	const current = readings.length === plan.length && readings.every((reading, n) => reading.id === plan[n].id);
	if (!current) return plan.map((room) => ({ id: room.id, name: room.name, volume: NONE, speed: NONE, temperature: NONE, particulates: NONE, changes: NONE }));
	return readings.map((room) => ({
		id: room.id,
		name: room.name,
		volume: formatVolume(room.volume, units).text,
		speed: formatSpeed(room.speed, units).text,
		temperature: formatTemperature(room.temperature, units).text,
		particulates: formatParticulates(room.particulates).text,
		changes: formatAirChanges(room.changesPerHour).text
	}));
}
