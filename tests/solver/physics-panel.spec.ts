import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { planById, plans } from '../../src/lib/experiments/airflow/homes/plans';
import {
	MASS_BALANCE_TOLERANCE,
	balanceAnnouncement,
	balanceVerdict,
	formatErrorPercent,
	massAccounted,
	massBalanceError,
	massGained,
	type BalanceState
} from '../../src/lib/experiments/airflow/massBalance';
import { DIVERGENCE_WORDS, ROOM_COLUMNS, formatCount, formatDivergence, roomRows, smokeReadings, solverReadings } from '../../src/lib/experiments/airflow/physicsPanel';
import { emptyReadout, type PhysicsReading, type RoomReading } from '../../src/lib/experiments/airflow/readouts';
import type { MassBalance } from '../../src/lib/experiments/airflow/solver/types';
import { UNIT_SPACE } from '../../src/lib/experiments/airflow/units';

/**
 * The Physics panel's words: whether the smoke books balance and what the panel says about it, and every quantity it shows, in both
 * unit systems. The panel itself (ui/PhysicsPanel.svelte) only lays these out, so what it says is decided and tested here.
 */

const sp = UNIT_SPACE;

/** Books that balance exactly: 2 mg at the start, 5 released, 1 let in; 3 in the air, 3 out, 1.5 cleaned, 0.5 settled. */
const even: MassBalance = { initial: 2, emitted: 5, inflow: 1, inAir: 3, outflow: 3, removed: 1.5, deposited: 0.5 };
/** The same books with `gap` mg of the accounted side missing, as a share of the 8 mg that came in. */
const missing = (gap: number): MassBalance => ({ ...even, inAir: even.inAir - gap });

test.describe('whether the smoke books balance', () => {
	test('the error is |gained − accounted| / gained, and null while nothing has come in', () => {
		expect(massGained(even)).toBe(8);
		expect(massAccounted(even)).toBe(8);
		expect(massBalanceError(even)).toBe(0);
		expect(massBalanceError(missing(0.008))).toBeCloseTo(1e-3, 12);
		// Too much accounted for is as wrong as too little.
		expect(massBalanceError({ ...even, inAir: even.inAir + 0.008 })).toBeCloseTo(1e-3, 12);
		expect(massBalanceError({ initial: 0, emitted: 0, inflow: 0, inAir: 0, outflow: 0, removed: 0, deposited: 0 })).toBeNull();
	});

	test('a total that is not a number is as far from balancing as it can be, whatever else it was', () => {
		expect(massBalanceError({ ...even, inAir: NaN })).toBe(Infinity);
		expect(massBalanceError({ ...even, emitted: Infinity })).toBe(Infinity);
		expect(massBalanceError({ initial: NaN, emitted: 0, inflow: 0, inAir: 0, outflow: 0, removed: 0, deposited: 0 })).toBe(Infinity);
	});

	test('the tolerance is a small share of the smoke, and the verdict is balanced up to it and off beyond it', () => {
		expect(MASS_BALANCE_TOLERANCE).toBeGreaterThan(0);
		expect(MASS_BALANCE_TOLERANCE).toBeLessThanOrEqual(1e-2);
		const within = missing(8 * MASS_BALANCE_TOLERANCE * 0.99);
		const beyond = missing(8 * MASS_BALANCE_TOLERANCE * 1.01);
		expect(balanceVerdict(within).state).toBe('balanced');
		expect(balanceVerdict(beyond).state).toBe('off');
	});

	test('with nothing to balance the panel says so, before the first step and when no smoke has come in', () => {
		for (const mass of [null, { initial: 0, emitted: 0, inflow: 0, inAir: 0, outflow: 0, removed: 0, deposited: 0 }]) {
			const verdict = balanceVerdict(mass);
			expect(verdict).toEqual({ state: 'waiting', error: null, text: 'No smoke yet, so there is nothing to balance.' });
		}
		// And after a Restart the panel goes back to waiting, whatever it had said.
		expect(balanceVerdict(null, 'off').state).toBe('waiting');
	});

	test('the verdict sentence gives the error as a percentage to two figures, and the tolerance when it is beyond it', () => {
		expect(balanceVerdict(missing(0.0016))).toMatchObject({ state: 'balanced', text: `The books balance to 0.02${sp}%.` });
		expect(balanceVerdict(missing(0)).text).toBe(`The books balance to better than 0.0001${sp}%.`);
		const off = balanceVerdict(missing(0.072));
		expect(off.state).toBe('off');
		expect(off.text).toBe(`The books are out by 0.9${sp}%, more than the 0.1${sp}% the solver is held to.`);
		expect(balanceVerdict({ ...even, inAir: NaN })).toMatchObject({ state: 'off', text: 'The smoke totals are not numbers any more, so the books cannot balance.' });
	});

	test('once off, the books must come back inside half the tolerance to be balanced again, so a figure on the line does not flip the verdict', () => {
		const t = MASS_BALANCE_TOLERANCE;
		const at = (fraction: number) => missing(8 * t * fraction);
		// Rising: balanced until it passes the line.
		expect(balanceVerdict(at(0.9), 'balanced').state).toBe('balanced');
		expect(balanceVerdict(at(1.1), 'balanced').state).toBe('off');
		// Falling back: it has to get well inside.
		expect(balanceVerdict(at(0.9), 'off').state).toBe('off');
		expect(balanceVerdict(at(0.6), 'off').state).toBe('off');
		expect(balanceVerdict(at(0.4), 'off').state).toBe('balanced');
		// A verdict that was never off has no such memory.
		expect(balanceVerdict(at(0.6), 'waiting').state).toBe('balanced');
	});

	test('a screen reader hears of the books going out of balance and coming back, and of nothing else', () => {
		const say = (before: BalanceState, mass: MassBalance | null) => balanceAnnouncement(before, balanceVerdict(mass, before));
		expect(say('balanced', missing(0.072))).toBe(`The smoke books are out by 0.9${sp}%, more than the solver is held to. The Physics panel has the numbers.`);
		expect(say('waiting', missing(0.072))).toContain('out by 0.9');
		expect(say('balanced', { ...even, inAir: NaN })).toBe('The smoke totals are not numbers any more. The Physics panel has them.');
		expect(say('off', even)).toBe('The smoke books balance again.');
		// Not worth saying: the first time there is something to balance, the number moving, being off and staying off, a restart.
		expect(say('waiting', even)).toBeNull();
		expect(say('balanced', missing(0.004))).toBeNull();
		expect(say('off', missing(0.072))).toBeNull();
		expect(say('balanced', null)).toBeNull();
		expect(say('off', null)).toBeNull();
	});

	test('percentages read as two figures, with a floor, and a dash for what is not a number', () => {
		expect(formatErrorPercent(1.9e-4)).toBe(`0.019${sp}%`);
		expect(formatErrorPercent(0.009)).toBe(`0.9${sp}%`);
		expect(formatErrorPercent(0.1234)).toBe(`12${sp}%`);
		expect(formatErrorPercent(1.5)).toBe(`150${sp}%`);
		expect(formatErrorPercent(1e-3)).toBe(`0.1${sp}%`);
		expect(formatErrorPercent(1e-7)).toBe(`<${sp}0.0001${sp}%`);
		expect(formatErrorPercent(Infinity)).toBe('—');
		expect(formatErrorPercent(NaN)).toBe('—');
	});
});

/** What a running simulation has written, for a Home on the worker at 0.2 m. */
const running: PhysicsReading = { time: 12.4, backend: 'cpu', cellSize: 0.2, cells: 11547, rate: 0.62, maxSpeed: 1.83, divergence: 3.2e-5, mass: even, reducedDetail: true };
const byKey = (readings: ReturnType<typeof solverReadings>) => Object.fromEntries(readings.map((r) => [r.key, r]));

test.describe('the solver part of the panel', () => {
	test('the processor at reduced detail, in metric: the clock, the speed, the grid, the backend, the fastest air and the divergence', () => {
		const r = byKey(solverReadings(running, 'running', 'metric'));
		expect(r.time).toMatchObject({ label: 'Simulated time', value: '0:12' });
		expect(r.speed).toMatchObject({ label: 'Speed', value: `0.62×`, unit: 'real time' });
		expect(r.cells).toMatchObject({ label: 'Grid', value: '11,547', unit: 'cells' });
		expect(r.size).toMatchObject({ label: 'Cell size', value: `0.20${sp}m` });
		expect(r.backend).toMatchObject({ label: 'Backend', value: 'Processor', note: 'reduced detail' });
		expect(r.fastest).toMatchObject({ label: 'Fastest air', value: '1.8', unit: 'm/s' });
		expect(r.divergence).toMatchObject({ label: 'Divergence', value: '0.0032', unit: '%' });
	});

	test('the same in imperial: the cell size in inches and the fastest air in miles an hour', () => {
		const r = byKey(solverReadings(running, 'running', 'imperial'));
		expect(r.size.value).toBe(`8${sp}in`);
		expect(r.fastest).toMatchObject({ value: '4.1', unit: 'mph' });
		// What is the same in both: the clock, the speed, the grid and the divergence.
		const metric = byKey(solverReadings(running, 'running', 'metric'));
		for (const key of ['time', 'speed', 'cells', 'backend', 'divergence']) expect(r[key]).toEqual(metric[key]);
	});

	test('WebGPU has no note, a processor not at reduced detail has none either', () => {
		expect(byKey(solverReadings({ ...running, backend: 'webgpu', reducedDetail: false, cellSize: 0.15, cells: 27295 }, 'running', 'metric')).backend).toEqual({ key: 'backend', label: 'Backend', value: 'WebGPU' });
		expect(byKey(solverReadings({ ...running, reducedDetail: false }, 'running', 'metric')).backend.note).toBeUndefined();
	});

	test('a paused simulation says so in place of a speed, and keeps its numbers', () => {
		const r = byKey(solverReadings({ ...running, rate: 0 }, 'paused', 'metric'));
		expect(r.speed).toEqual({ key: 'speed', label: 'Speed', value: 'Paused' });
		expect(r.time.value).toBe('0:12');
		expect(r.fastest.value).toBe('1.8');
	});

	test('before a backend runs every number is a dash, and before the first step so are the ones that come from stepping', () => {
		for (const r of solverReadings(emptyReadout().physics, 'idle', 'metric')) expect(r.value, r.key).toBe('—');
		// A new world: its clock and its grid are known, its air has not moved yet.
		const fresh = byKey(solverReadings({ ...running, time: 0, maxSpeed: 0, divergence: 0, rate: 5 }, 'running', 'metric'));
		expect(fresh.time.value).toBe('0:00');
		expect(fresh.cells.value).toBe('11,547');
		expect(fresh.size.value).toBe(`0.20${sp}m`);
		expect(fresh.fastest).toEqual({ key: 'fastest', label: 'Fastest air', value: '—' });
		expect(fresh.divergence).toEqual({ key: 'divergence', label: 'Divergence', value: '—' });
		// A backend that was lost: nothing is known again.
		for (const r of solverReadings({ ...running, backend: null, rate: null, cells: 0, cellSize: 0.2 }, 'loading', 'metric').filter((x) => x.key !== 'size')) expect(r.value, r.key).toBe('—');
	});

	test('the divergence is a percentage of the flow, small numbers to two figures, and a floor', () => {
		expect(formatDivergence(3.2e-5)).toEqual({ value: '0.0032', unit: '%' });
		expect(formatDivergence(1e-3)).toEqual({ value: '0.1', unit: '%' });
		expect(formatDivergence(0.045)).toEqual({ value: '4.5', unit: '%' });
		expect(formatDivergence(1e-8)).toEqual({ value: `<${sp}0.0001`, unit: '%' });
		expect(formatDivergence(NaN)).toEqual({ value: '—', unit: '' });
		expect(formatDivergence(-1)).toEqual({ value: '—', unit: '' });
		expect(DIVERGENCE_WORDS).toMatch(/incompressible/);
	});

	test('counts have thousands separators the English way', () => {
		expect(formatCount(1234567)).toBe('1,234,567');
		expect(formatCount(950)).toBe('950');
	});
});

test.describe('the smoke part of the panel', () => {
	test('each term of the books in milligrams to two figures, in the order the books are read', () => {
		const { came, where } = smokeReadings({ initial: 2.2183, emitted: 6.6667, inflow: 1.4136, inAir: 2.635, outflow: 7.0701, removed: 0.5133, deposited: 0.080417 });
		expect(came.map((r) => [r.label, r.value, r.unit])).toEqual([
			['In the air at the start', '2.2', 'mg'],
			['Released', '6.7', 'mg'],
			['Let in from outdoors', '1.4', 'mg']
		]);
		expect(where.map((r) => [r.label, r.value, r.unit])).toEqual([
			['In the air now', '2.6', 'mg'],
			['Left through openings', '7.1', 'mg'],
			['Cleaned by purifiers', '0.51', 'mg'],
			['Settled on surfaces', '0.080', 'mg']
		]);
	});

	test('a term with nothing in it reads 0 mg, and before the first step every term is a dash', () => {
		const zero = smokeReadings({ initial: 0, emitted: 0, inflow: 0, inAir: 0, outflow: 0, removed: 0, deposited: 0 });
		for (const r of [...zero.came, ...zero.where]) expect([r.value, r.unit], r.label).toEqual(['0', 'mg']);
		const none = smokeReadings(null);
		for (const r of [...none.came, ...none.where]) expect([r.value, r.unit], r.label).toEqual(['—', undefined]);
	});
});

const living = [{ id: 'living', name: 'Living room' }];
const room = (overrides: Partial<RoomReading> = {}): RoomReading => ({ id: 'living', name: 'Living room', volume: 43.2, speed: 0.123, temperature: 21.44, particulates: 0.0123, inflow: 0.03, changesPerHour: 2.4, ...overrides });

test.describe('the Room averages', () => {
	test('a row for each Room, with its volume, speed, temperature, smoke in both units and air changes per hour', () => {
		const [row] = roomRows([room()], living, 'metric');
		expect(row).toEqual({
			id: 'living',
			name: 'Living room',
			volume: `43${sp}m³`,
			speed: `0.12${sp}m/s`,
			temperature: `21.4${sp}°C`,
			particulates: `0.012${sp}ppm (15${sp}µg/m³)`,
			changes: `2.4${sp}ACH`
		});
	});

	test('in imperial the volume, speed and temperature change units, and the smoke and the air changes do not', () => {
		const [row] = roomRows([room()], living, 'imperial');
		expect(row.volume).toBe(`1,526${sp}cu ft`);
		expect(row.speed).toBe(`0.28${sp}mph`);
		expect(row.temperature).toBe(`70.6${sp}°F`);
		const [metric] = roomRows([room()], living, 'metric');
		expect(row.particulates).toBe(metric.particulates);
		expect(row.changes).toBe(metric.changes);
	});

	test('clean air reads as under a floor, and a Room nothing flows through reads 0.00 air changes', () => {
		const [row] = roomRows([room({ particulates: 0, changesPerHour: 0, speed: 0 })], living, 'metric');
		expect(row.particulates).toBe(`<${sp}0.001${sp}ppm (<${sp}1.2${sp}µg/m³)`);
		expect(row.changes).toBe(`0.00${sp}ACH`);
		expect(row.speed).toBe(`0.00${sp}m/s`);
	});

	test('a reading that is not a number is a dash and not "NaN"', () => {
		const [row] = roomRows([room({ speed: NaN, temperature: NaN, volume: NaN, changesPerHour: NaN, particulates: NaN })], living, 'metric');
		for (const cell of [row.volume, row.speed, row.temperature, row.particulates, row.changes]) expect(cell).toBe('—');
	});

	test('rooms come in the order the solver measured them, each under its own name', () => {
		const plan = [
			{ id: 'a', name: 'Kitchen' },
			{ id: 'b', name: 'Bathroom' }
		];
		const rows = roomRows([room({ id: 'a', name: 'Kitchen', volume: 10 }), room({ id: 'b', name: 'Bathroom', volume: 20 })], plan, 'metric');
		expect(rows.map((r) => [r.name, r.volume])).toEqual([
			['Kitchen', `10${sp}m³`],
			['Bathroom', `20${sp}m³`]
		]);
	});

	test('averages that are still the last Home’s are not shown as the new Home’s: its Rooms read as dashes until its own are measured', () => {
		const studio = planById('studio')!;
		const twoBedroom = planById('two-bedroom')!;
		// The Studio's Rooms, measured, while the page has moved on to the two-bedroom home.
		const stale = studio.rooms.map((r) => room({ id: r.id, name: r.name }));
		const rows = roomRows(stale, twoBedroom.rooms, 'metric');
		expect(rows.map((r) => r.name)).toEqual(twoBedroom.rooms.map((r) => r.name));
		for (const row of rows) expect(row.volume, row.name).toBe('—');
		// The same Rooms with the same count but another order are not the plan's either.
		const swapped = [...twoBedroom.rooms].reverse().map((r) => room({ id: r.id, name: r.name }));
		expect(roomRows(swapped, twoBedroom.rooms, 'metric')[0].volume).toBe('—');
		// Its own, once measured, are.
		const own = twoBedroom.rooms.map((r) => room({ id: r.id, name: r.name }));
		expect(roomRows(own, twoBedroom.rooms, 'metric')[0].volume).toBe(`43${sp}m³`);
	});

	test('before anything is measured the table still names every Room of every Home, with dashes', () => {
		for (const plan of plans) {
			const rows = roomRows([], plan.rooms, 'metric');
			expect(rows.map((r) => r.name), plan.name).toEqual(plan.rooms.map((r) => r.name));
			for (const row of rows) for (const cell of [row.volume, row.speed, row.temperature, row.particulates, row.changes]) expect(cell).toBe('—');
		}
	});

	test('the table has the columns the page promises, the Room first', () => {
		expect([...ROOM_COLUMNS]).toEqual(['Room', 'Volume', 'Speed', 'Temperature', 'PM2.5', 'Air changes per hour']);
	});
});

test.describe('the explainer and the panel say the same thing', () => {
	test('the explainer gives the tolerance the panel holds the smoke books to, so changing one without the other fails here', () => {
		const explainer = readFileSync(resolve(import.meta.dirname, '../../src/lib/experiments/airflow/ui/Explainer.svelte'), 'utf8');
		const percent = formatErrorPercent(MASS_BALANCE_TOLERANCE).replaceAll(UNIT_SPACE, '&nbsp;');
		expect(explainer).toContain(`The two sides agree to within ${percent}`);
	});
});
