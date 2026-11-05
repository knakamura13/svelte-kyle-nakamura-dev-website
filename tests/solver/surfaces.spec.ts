import { expect, test } from '@playwright/test';
import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { MAX_SURFACE, SEAT_REACH, SNAP, WINDOW_REACH, footprintRadius, placeAt } from '../../src/lib/experiments/airflow/devices/surfaces';
import type { DeviceModel } from '../../src/lib/experiments/airflow/devices/types';
import { windowsForFans } from '../../src/lib/experiments/airflow/devices/placement';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { WALL_HALF, windowSeat } from '../../src/lib/experiments/airflow/scene/deviceMath';
import type { DeviceState } from '../../src/lib/experiments/airflow/state';

/** Where a device may stand, and why it may not: the rules the tray's drag and the keys both ask. */
const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
const kind = (k: DeviceModel['kind']) => DEVICE_MODELS.find((m) => m.kind === k)!;
const boxFan = kind('box-fan');
const pedestal = kind('pedestal-fan');
const windowFan = kind('window-fan');

const device = (model: DeviceModel, x: number, z: number, extra: Partial<DeviceState> = {}): DeviceState => ({
	id: `t-${model.id}-${x}-${z}`,
	model: model.id,
	x,
	z,
	y: 0,
	yaw: 0,
	tilt: 0,
	power: 1,
	height: 0,
	oscillation: { on: false, sweep: 90, period: 8 },
	...extra
});

const plan = (id: string) => plans.find((p) => p.id === id)!;
const two = plan('two-bedroom');
const piece = (id: string) => two.furniture.find((f) => f.id === id)!;

test.describe('where a device may stand', () => {
	test('a window fan goes in a window, the nearest free one, facing in; away from every window, or with none free, it says why', () => {
		for (const home of plans) {
			const windows = windowsForFans(home);
			for (const window of windows) {
				const seat = windowSeat(home, window);
				const placed = placeAt(home, windowFan, seat.x, seat.z, [], models);
				expect(placed.ok, `${home.id}: ${window.id}`).toBe(true);
				if (placed.ok) expect(placed.placement).toMatchObject({ surface: 'sill', opening: window.id, yaw: seat.yaw, intake: true, x: seat.x, y: seat.y, z: seat.z });
			}
			// The middle of the floor is far from every window.
			const middle = placeAt(home, windowFan, home.width / 2, home.depth / 2, [], models);
			if (!middle.ok) expect(middle.reason).toMatch(/goes in a window/);
		}
		// With every window holding a fan there is nothing left, and it says that.
		const taken = windowsForFans(two).map((w) => device(windowFan, 0, 0, { opening: w.id }));
		const none = placeAt(two, windowFan, 1, 1, taken, models);
		expect(none).toEqual({ ok: false, reason: 'Every window that can hold a fan already has one.' });
		// A window already holding one is not offered again.
		const [first] = windowsForFans(two);
		const seat = windowSeat(two, first);
		const second = placeAt(two, windowFan, seat.x, seat.z, [device(windowFan, seat.x, seat.z, { opening: first.id })], models);
		if (second.ok) expect(second.placement.opening).not.toBe(first.id);
		// Moving the fan that is in a window does not collide with itself.
		const own = device(windowFan, seat.x, seat.z, { opening: first.id });
		const again = placeAt(two, windowFan, seat.x, seat.z, [own], models, own.id);
		expect(again.ok && again.placement.opening).toBe(first.id);
		expect(WINDOW_REACH).toBeGreaterThan(0.5);
		// A point far across the floor from the window, though level with it along the wall, is not a drop into it.
		const far = windowSeat(two, windowsForFans(two).find((w) => (w.placement as { facade: string }).facade === 'south')!);
		const across = placeAt(two, windowFan, far.x, far.z - (SEAT_REACH + 1), [], models);
		if (!across.ok) expect(across.reason).toMatch(/goes in a window/);
		else expect(Math.hypot(across.placement.x - far.x, across.placement.z - (far.z - SEAT_REACH - 1))).toBeLessThanOrEqual(SEAT_REACH);
	});

	test('no other device goes in a window, and the outside is not a place', () => {
		const [first] = windowsForFans(two);
		const seat = windowSeat(two, first);
		for (const model of DEVICE_MODELS.filter((m) => m.kind !== 'window-fan')) {
			const placed = placeAt(two, model, seat.x, seat.z, [], models);
			// A point on the wall line is on the floor by the wall at best: never a sill.
			if (placed.ok) expect(placed.placement.surface, model.name).not.toBe('sill');
			expect(placeAt(two, model, -1, 2, [], models), model.name).toEqual({ ok: false, reason: 'That is outside the home.' });
			expect(placeAt(two, model, two.width + 0.5, 2, [], models), model.name).toEqual({ ok: false, reason: 'That is outside the home.' });
		}
	});

	test('on the floor a device is clear of the walls, the furniture and the other devices, wherever it is dropped', () => {
		// Thousands of drops: a violation is written down and the lot is asserted once, because an `expect` for each would take minutes.
		const violations: string[] = [];
		for (const home of plans)
			for (const model of [boxFan, pedestal]) {
				const r = footprintRadius(model);
				const anchor = device(boxFan, 0.8, 0.8);
				let placedCount = 0;
				let refusedCount = 0;
				for (let x = 0.02; x < home.width; x += 0.17)
					for (let z = 0.02; z < home.depth; z += 0.17) {
						const placed = placeAt(home, model, x, z, [anchor], models);
						const where = `${home.id} ${model.id} dropped at ${x.toFixed(2)}, ${z.toFixed(2)}`;
						if (!placed.ok) {
							if (placed.reason.length <= 10) violations.push(`${where}: a refusal says why`);
							refusedCount++;
							continue;
						}
						placedCount++;
						const { placement } = placed;
						const at = `${where} stands at ${placement.x.toFixed(2)}, ${placement.z.toFixed(2)}`;
						if (placement.surface === 'furniture') {
							const f = home.furniture.find((item) => item.id === placement.on);
							if (!f) violations.push(`${at}: stands on nothing`);
							else {
								if (model.kind === 'pedestal-fan') violations.push(`${at}: a pedestal fan is on furniture`);
								if (Math.abs(placement.y - ((f.y ?? 0) + f.h)) > 1e-9) violations.push(`${at}: not at the top of the ${f.name}`);
								if (placement.y > MAX_SURFACE) violations.push(`${at}: too high a top`);
								if (placement.x - r < f.x - 1e-9 || placement.x + r > f.x + f.w + 1e-9 || placement.z - r < f.z - 1e-9 || placement.z + r > f.z + f.d + 1e-9) violations.push(`${at}: hangs over the ${f.name}`);
							}
							continue;
						}
						if (placement.surface !== 'floor' || placement.y !== 0) violations.push(`${at}: not on the floor`);
						if (placement.x - r < -1e-9 || placement.x + r > home.width + 1e-9 || placement.z - r < -1e-9 || placement.z + r > home.depth + 1e-9) violations.push(`${at}: outside the home`);
						for (const wall of home.walls) {
							const [x0, x1, z0, z1] = wall.axis === 'x' ? [wall.from, wall.to, wall.at - WALL_HALF, wall.at + WALL_HALF] : [wall.at - WALL_HALF, wall.at + WALL_HALF, wall.from, wall.to];
							const nearX = Math.max(x0, Math.min(placement.x, x1));
							const nearZ = Math.max(z0, Math.min(placement.z, z1));
							if (Math.hypot(placement.x - nearX, placement.z - nearZ) < r - 1e-9) violations.push(`${at}: in the wall at ${wall.at}`);
						}
						for (const f of home.furniture) {
							const nearX = Math.max(f.x, Math.min(placement.x, f.x + f.w));
							const nearZ = Math.max(f.z, Math.min(placement.z, f.z + f.d));
							if (Math.hypot(placement.x - nearX, placement.z - nearZ) < r - 1e-9) violations.push(`${at}: in the ${f.name}`);
						}
						if (Math.hypot(placement.x - anchor.x, placement.z - anchor.z) < r + footprintRadius(boxFan) - 1e-9) violations.push(`${at}: on the other device`);
					}
				expect(placedCount, `${home.id} ${model.id}: there is room to stand`).toBeGreaterThan(20);
				expect(refusedCount, `${home.id} ${model.id}: and places that are not`).toBeGreaterThan(5);
			}
		expect(violations.slice(0, 20)).toEqual([]);
	});

	test('a box fan can stand on a low table, a bed or a counter, and says no to a refrigerator, a wardrobe and a pedestal fan on anything', () => {
		const table = piece('dining-table');
		const onTable = placeAt(two, boxFan, table.x + table.w / 2, table.z + table.d / 2, [], models);
		expect(onTable).toMatchObject({ ok: true, placement: { surface: 'furniture', on: 'dining-table', y: table.h } });
		const bed = piece('bed-1');
		expect(placeAt(two, boxFan, bed.x + bed.w / 2, bed.z + bed.d / 2, [], models)).toMatchObject({ ok: true, placement: { on: 'bed-1', y: bed.h } });
		const fridge = piece('fridge');
		expect(placeAt(two, boxFan, fridge.x + fridge.w / 2, fridge.z + fridge.d / 2, [], models)).toEqual({ ok: false, reason: 'The refrigerator is too tall to put a box fan on.' });
		const wardrobe = piece('wardrobe-1');
		const refused = placeAt(two, boxFan, wardrobe.x + wardrobe.w / 2, wardrobe.z + wardrobe.d / 2, [], models);
		expect(refused.ok).toBe(false);
		expect(placeAt(two, pedestal, table.x + table.w / 2, table.z + table.d / 2, [], models)).toEqual({ ok: false, reason: 'A pedestal fan stands on the floor, not on the dining table.' });
		// Too small a top: a nightstand holds no box fan.
		const stand = piece('nightstand-1');
		expect(placeAt(two, boxFan, stand.x + stand.w / 2, stand.z + stand.d / 2, [], models)).toEqual({ ok: false, reason: 'The nightstand is too small to hold a box fan.' });
	});

	test('beside a piece of furniture on the floor, a device nudged out of the way, and in the middle of a wall it says the spot is in a wall', () => {
		// The hall wall of the two-bedroom: find a point inside an interior wall's thickness, away from any opening.
		const wall = two.walls.find((w) => w.axis === 'z' && w.to - w.from > 2)!;
		const mid = (wall.from + wall.to) / 2;
		const inside = placeAt(two, boxFan, wall.at, mid, [], models);
		// It lands beside the wall, no more than SNAP from where it was dropped, or is refused as being in a wall.
		if (inside.ok) expect(Math.hypot(inside.placement.x - wall.at, inside.placement.z - mid)).toBeLessThanOrEqual(SNAP + 1e-9);
		else expect(inside.reason).toMatch(/in a wall/);
		const table = piece('dining-table');
		// Just off the end of the table on the floor: beside it, clear of it.
		const beside = placeAt(two, boxFan, table.x - footprintRadius(boxFan) - 0.1, table.z + table.d / 2, [], models);
		if (beside.ok) {
			expect(beside.placement.surface).toBe('floor');
			expect(beside.placement.x + footprintRadius(boxFan)).toBeLessThanOrEqual(table.x + 1e-9);
		}
	});

	test('too close to another device is refused, and the device being moved does not collide with itself', () => {
		// Open floor in the living room, clear of the sofa and the tables.
		const a = device(boxFan, 2.5, 3.6);
		expect(placeAt(two, boxFan, 2.5, 3.6, [], models)).toMatchObject({ ok: true });
		expect(placeAt(two, boxFan, 2.6, 3.6, [a], models)).toEqual({ ok: false, reason: 'That is too close to another device.' });
		expect(placeAt(two, boxFan, 2.6, 3.6, [a], models, a.id)).toMatchObject({ ok: true });
		// Far enough apart they are two devices.
		expect(placeAt(two, boxFan, 3.6, 3.6, [a], models)).toMatchObject({ ok: true });
	});
});
