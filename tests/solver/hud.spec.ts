import { expect, test } from '@playwright/test';
import { DEVICE_MODELS } from '../../src/lib/experiments/airflow/devices/catalog';
import { deviceDefaults } from '../../src/lib/experiments/airflow/devices/placement';
import { newDevice } from '../../src/lib/experiments/airflow/devices/placement';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { isExterior, type HomePlan, type OpeningSpec } from '../../src/lib/experiments/airflow/homes/types';
import { Home } from '../../src/lib/experiments/airflow/scene/look/home';
import { Materials } from '../../src/lib/experiments/airflow/scene/look/materials';
import { anchorOf, cutSill, deviceBox, openingBox, pickTarget, rayBox, wallDistance, type PickScene, type Vec3 } from '../../src/lib/experiments/airflow/scene/selection';
import { CUT_HEIGHT, DOWN_HEIGHT, type WallMode } from '../../src/lib/experiments/airflow/scene/walls/cutaway';
import { LIMITS, type DeviceState } from '../../src/lib/experiments/airflow/state';
import { formatSpeed } from '../../src/lib/experiments/airflow/units';
import { vectorToBearing } from '../../src/lib/experiments/airflow/directionWords';
import { carryHint, isClick, turnCarried } from '../../src/lib/experiments/airflow/ui/hud/carry';
import { cardLines, inTab, towardMiddle } from '../../src/lib/experiments/airflow/ui/hud/catalog';
import { bearingFromPointer, dialPoint, dialRotation, snapBearing, stepBearing, windWords } from '../../src/lib/experiments/airflow/ui/hud/compass';
import { ROOM_TINTS, homeCard, planThumbnail } from '../../src/lib/experiments/airflow/ui/hud/homes';
import { inventory, menuFor, openingState, powerState, probeCards, targetWords, type HomeContext } from '../../src/lib/experiments/airflow/ui/hud/inventory';
import { placeCard } from '../../src/lib/experiments/airflow/ui/hud/layout';
import { deviceMenu, openingMenu } from '../../src/lib/experiments/airflow/ui/hud/menus';
import { AIR_PRESETS, BEAUFORT, KNOT, PM25_AQI, WIND_PRESETS, activePreset, airPreset, aqiCategory, beaufortForce, stepValue, WINDOW_PRESETS } from '../../src/lib/experiments/airflow/ui/hud/presets';
import { OVERLAYS, overlayOfLayer } from '../../src/lib/experiments/airflow/ui/hud/tools';

/** The HUD's pure parts (milestone 3 of the immersive redesign): the compass dial, the presets, the card placement, the menu models and picking. */

const models = new Map(DEVICE_MODELS.map((m) => [m.id, m]));
const close = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits);

test.describe('compass dial', () => {
	test('a pointer up the dial is north, then clockwise, and a turned dial turns with it', () => {
		close(bearingFromPointer(0, -10)!, 0);
		close(bearingFromPointer(10, 0)!, 90);
		close(bearingFromPointer(0, 10)!, 180);
		close(bearingFromPointer(-10, 0)!, 270);
		expect(bearingFromPointer(0, 0)).toBeNull();
		// North drawn 90° round: the top of the dial is then west.
		close(bearingFromPointer(0, -10, 90)!, 270);
	});

	test('dialPoint is the inverse of bearingFromPointer at any rotation', () => {
		for (const rotation of [0, 37, 180, 300])
			for (let bearing = 0; bearing < 360; bearing += 15) {
				const p = dialPoint(bearing, 40, rotation);
				close(bearingFromPointer(p.x, p.y, rotation)!, bearing, 6);
			}
	});

	test('keys step and wrap like a slider, and snapping never gives 360', () => {
		expect(stepBearing(270, 'ArrowRight')).toBe(275);
		expect(stepBearing(0, 'ArrowLeft')).toBe(355);
		expect(stepBearing(355, 'ArrowUp')).toBe(0);
		expect(stepBearing(10, 'ArrowDown', true)).toBe(0);
		expect(stepBearing(270, 'PageUp')).toBe(315);
		expect(stepBearing(10, 'PageDown')).toBe(315);
		expect(stepBearing(123, 'Home')).toBe(0);
		expect(stepBearing(123, 'Tab')).toBeNull();
		expect(snapBearing(358)).toBe(0);
		expect(windWords(270, 4).short).toBe('from W 270°');
		expect(windWords(270, 0).short).toMatch(/^Calm/);
	});
});

test.describe('presets', () => {
	test('outdoor air and wind presets are values the state allows, on the controls’ steps', () => {
		for (const preset of AIR_PRESETS) {
			expect(preset.value).toBeGreaterThanOrEqual(LIMITS.outdoorPm25.min);
			expect(preset.value).toBeLessThanOrEqual(LIMITS.outdoorPm25.max);
			close(preset.value / LIMITS.outdoorPm25.step, Math.round(preset.value / LIMITS.outdoorPm25.step));
			expect(airPreset(preset.value)?.id).toBe(preset.id);
		}
		for (const preset of WIND_PRESETS) {
			expect(preset.value).toBeGreaterThanOrEqual(LIMITS.windSpeed.min);
			expect(preset.value).toBeLessThanOrEqual(LIMITS.windSpeed.max);
			close(preset.value / LIMITS.windSpeed.step, Math.round(preset.value / LIMITS.windSpeed.step));
		}
		expect(activePreset(WINDOW_PRESETS, 0.5)?.id).toBe('half');
		expect(activePreset(WINDOW_PRESETS, 0.3)).toBeNull();
	});

	test('each outdoor air preset is in the AQI category it names, by the EPA’s PM2.5 breakpoints (May 2026 TAD, Table 6)', () => {
		// The published table, transcribed: the top of each category, µg/m³, 24-hour mean.
		expect(PM25_AQI.map((band) => [band.category, band.upTo])).toEqual([
			['Good', 9.0],
			['Moderate', 35.4],
			['Unhealthy for Sensitive Groups', 55.4],
			['Unhealthy', 125.4],
			['Very Unhealthy', 225.4],
			['Hazardous', Infinity]
		]);
		expect(PM25_AQI.map((band) => band.aqi)).toEqual([
			[0, 50],
			[51, 100],
			[101, 150],
			[151, 200],
			[201, 300],
			[301, 500]
		]);
		// The edges: a concentration is truncated to one decimal, and Hazardous goes on past the AQI's 500 (325.4 µg/m³).
		expect([9.0, 9.05, 9.1, 35.4, 35.49, 35.5, 125.5, 225.4, 225.5, 325.4, 500].map(aqiCategory)).toEqual([
			'Good',
			'Good',
			'Moderate',
			'Moderate',
			'Moderate',
			'Unhealthy for Sensitive Groups',
			'Very Unhealthy',
			'Very Unhealthy',
			'Hazardous',
			'Hazardous',
			'Hazardous'
		]);
		for (const preset of AIR_PRESETS) expect(aqiCategory(preset.value), preset.id).toBe(preset.category);
		expect(AIR_PRESETS.map((preset) => preset.category)).toEqual(['Good', 'Moderate', 'Very Unhealthy', 'Hazardous']);
	});

	test('each wind preset is its Beaufort force’s mean on the control’s step, and inside that force’s limits', () => {
		// The published scale in knots (NWS Storm Prediction Center; the Met Office gives the same limits and the means).
		expect(Object.values(BEAUFORT).map((band) => [band.force, band.knots[0], band.knots[1], band.mean])).toEqual([
			[0, 0, 0.99, 0],
			[1, 1, 3, 2],
			[2, 4, 6, 5],
			[3, 7, 10, 9],
			[4, 11, 16, 13],
			[5, 17, 21, 19],
			[6, 22, 27, 24],
			[7, 28, 33, 30]
		]);
		close(KNOT, 0.514444, 6);
		expect(WIND_PRESETS.map((preset) => [preset.id, preset.label, preset.value])).toEqual([
			['calm', 'Calm', 0],
			['light', 'Light breeze', 2.5],
			['gentle', 'Gentle breeze', 4.5],
			['fresh', 'Fresh breeze', 10],
			['strong', 'Strong breeze', 12.5]
		]);
		for (const preset of WIND_PRESETS) {
			expect(beaufortForce(preset.value), preset.id).toBe(preset.force);
			const band = Object.values(BEAUFORT).find((b) => b.force === preset.force)!;
			// The mean, in m/s, is within half a step of the preset.
			expect(Math.abs(band.mean * KNOT - preset.value), preset.id).toBeLessThanOrEqual(0.25);
		}
		// A speed is rounded to whole knots first, so a force begins half a knot below its lowest whole knot.
		expect([0, 0.25, 0.6, 1.5, 3.4, 5.6, 8.6, 11.5, 14.5, 20].map(beaufortForce)).toEqual([0, 0, 1, 1, 3, 4, 5, 6, 7, 8]);
	});

	test('a stepper moves one step of the visitor’s units and stops at the limits', () => {
		close(stepValue('outdoorTemp', 18, 'metric', 1), 19);
		close(stepValue('indoorTemp', 21, 'metric', -1), 20.5);
		// 18 °C is 64.4 °F: the first press up lands on 65 °F, the next on 66 °F.
		const once = stepValue('outdoorTemp', 18, 'imperial', 1);
		close(once * 1.8 + 32, 65, 6);
		close(stepValue('outdoorTemp', once, 'imperial', 1) * 1.8 + 32, 66, 6);
		expect(stepValue('outdoorTemp', LIMITS.outdoorTemp.max, 'metric', 1)).toBe(LIMITS.outdoorTemp.max);
		expect(stepValue('windSpeed', 0, 'metric', -1)).toBe(0);
	});
});

test.describe('context menu card placement', () => {
	const viewport = { width: 1440, height: 900 };
	const safe = { left: 100, right: 360, top: 80, bottom: 100 };
	const card = { width: 300, height: 200 };

	test('right of the anchor when there is room, else left, else above or below, inside the free space', () => {
		const right = placeCard({ x: 500, y: 400 }, card, viewport, safe);
		expect(right.side).toBe('right');
		expect(right.left).toBe(518);
		expect(right.notch).toEqual({ x: 0, y: 100 });
		const left = placeCard({ x: 1000, y: 400 }, card, viewport, safe);
		expect(left.side).toBe('left');
		expect(left.left + card.width).toBe(982);
		const narrow = { width: 500, height: 900 };
		const above = placeCard({ x: 250, y: 600 }, card, narrow, { left: 10, right: 10, top: 10, bottom: 10 });
		expect(above.side).toBe('above');
		const below = placeCard({ x: 250, y: 100 }, card, narrow, { left: 10, right: 10, top: 10, bottom: 10 });
		expect(below.side).toBe('below');
		// Near the top, the card is held below the top bar.
		expect(placeCard({ x: 500, y: 20 }, card, viewport, safe).top).toBe(safe.top);
		expect(placeCard(null, card, viewport, safe).side).toBe('free');
	});
});

test.describe('menu models', () => {
	test('every door gets Closed and Open, every window four presets and a fine control to its limit', () => {
		for (const plan of plans)
			for (const opening of plan.openings) {
				const menu = openingMenu(plan, opening, 0.5);
				expect(menu.title).toBe(opening.name);
				if (opening.kind === 'door') {
					expect(menu.kind).toBe('door');
					expect(menu.presets.map((p) => p.label)).toEqual(['Closed', 'Open']);
					expect(menu.fine).toBeNull();
				} else {
					expect(menu.kind).toBe('window');
					expect(menu.presets.map((p) => p.label)).toEqual(['Closed', 'Cracked', 'Half', 'Wide']);
					expect(menu.presets.find((p) => p.pressed)?.id).toBe('half');
					expect(menu.fine).toMatchObject({ min: 0, max: 100, value: 50 });
					expect(menu.caption).toContain(`${Math.round(50 * opening.maxOpen)}% of the frame`);
				}
			}
	});

	test('fans offer speeds and the actions their kind has; purifiers Sleep to High, Move and Remove', () => {
		for (const model of DEVICE_MODELS) {
			const device: DeviceState = { ...deviceDefaults(model), id: 'd1', x: 3, z: 3, yaw: 90, power: 2 / 3 };
			const menu = deviceMenu(model, device, 'metric');
			const actions = menu.actions.map((a) => a.id);
			expect(actions.slice(-2)).toEqual(['move', 'remove']);
			if (model.kind === 'air-purifier') {
				expect(menu.presets.map((p) => p.label)).toEqual(['Off', 'Sleep', 'Low', 'Medium', 'High']);
				expect(actions).toEqual(['move', 'remove']);
			} else {
				expect(menu.presets.map((p) => p.label)).toEqual(['Off', 'Low', 'Medium', 'High']);
				expect(menu.presets.find((p) => p.pressed)?.id).toBe('medium');
				expect(actions.includes('oscillate')).toBe(model.kind === 'pedestal-fan');
				expect(actions.includes('turn-right')).toBe(model.kind !== 'window-fan');
				expect(actions.includes('exhaust')).toBe(model.kind === 'window-fan');
			}
		}
	});
});

test.describe('the Build catalog', () => {
	test('tabs split fans from purifiers, cards name what each is, and a carried device faces the middle', () => {
		expect(DEVICE_MODELS.filter((m) => inTab(m, 'fans')).every((m) => m.kind !== 'air-purifier')).toBe(true);
		expect(DEVICE_MODELS.filter((m) => inTab(m, 'purifiers')).length).toBe(3);
		expect(cardLines(DEVICE_MODELS.find((m) => m.id === 'air-king-9723')!)).toEqual({ title: '20″ box fan', maker: 'Air King 9723' });
		expect(cardLines(DEVICE_MODELS.find((m) => m.id === 'levoit-core-300p')!)).toEqual({ title: 'Small air purifier', maker: 'Levoit Core 300-P' });
		const plan = { width: 10, depth: 6 };
		close(towardMiddle(plan, 5, 5), 0);
		close(towardMiddle(plan, 1, 3), 90);
	});
});

/** A point just inside the room in front of an Opening, and the way to it: a ray that must take that Opening. */
function rayAt(plan: HomePlan, opening: OpeningSpec): { origin: Vec3; direction: Vec3 } {
	const y = opening.sill + opening.height / 2;
	const p = opening.placement;
	if (isExterior(p)) {
		if (p.facade === 'north') return { origin: [p.center, y, 0.3], direction: [0, 0, -1] };
		if (p.facade === 'south') return { origin: [p.center, y, plan.depth - 0.3], direction: [0, 0, 1] };
		if (p.facade === 'west') return { origin: [0.3, y, p.center], direction: [-1, 0, 0] };
		return { origin: [plan.width - 0.3, y, p.center], direction: [1, 0, 0] };
	}
	return p.axis === 'x' ? { origin: [p.center, y, p.at + 0.3], direction: [0, 0, -1] } : { origin: [p.at + 0.3, y, p.center], direction: [-1, 0, 0] };
}

test.describe('picking in the 3D world', () => {
	test('a ray at every door and window of every plan takes that Opening, and its anchor is on its wall', () => {
		for (const plan of plans)
			for (const opening of plan.openings) {
				const { origin, direction } = rayAt(plan, opening);
				const picked = pickTarget(origin, direction, { plan, devices: [], models, probes: [], furniture: false }, ['opening']);
				expect(picked?.id, `${plan.id} ${opening.id}`).toBe(opening.id);
				const anchor = anchorOf({ kind: 'opening', id: opening.id }, { plan, devices: [], models, probes: [] })!;
				expect(rayBox(anchor, [0, 1, 0], openingBox(plan, opening))).toBe(0);
			}
	});

	test('a window fan wins over the window it sits in, a Probe over the air behind it, and furniture hides what is behind it', () => {
		const plan = plans.find((p) => p.id === 'two-bedroom')!;
		const windowFan = DEVICE_MODELS.find((m) => m.kind === 'window-fan')!;
		const made = newDevice(plan, windowFan, []);
		if (!('device' in made)) throw new Error(made.reason);
		const fan = made.device;
		const window = plan.openings.find((o) => o.id === fan.opening)!;
		// Level with the fan's body, which fills only the bottom of a tall window.
		const { origin: atWindow, direction } = rayAt(plan, window);
		const origin: Vec3 = [atWindow[0], fan.y + windowFan.body.height / 2, atWindow[2]];
		const scene = { plan, devices: [fan], models, probes: [], furniture: false };
		expect(pickTarget(origin, direction, scene)?.kind).toBe('device');
		expect(rayBox(origin, direction, deviceBox(windowFan, fan))).not.toBeNull();

		const pin = { id: 'p1', x: origin[0] + direction[0] * 0.15, y: origin[1], z: origin[2] + direction[2] * 0.15 };
		expect(pickTarget(origin, direction, { ...scene, devices: [], probes: [pin] })?.kind).toBe('probe');

		// A wardrobe-sized box between the eye and the window hides it, and only while the furniture stands.
		const piece = { id: 'f', name: 'Wardrobe', x: Math.min(origin[0], origin[0] + direction[0] * 0.2) - 0.05, z: Math.min(origin[2], origin[2] + direction[2] * 0.2) - 0.05, w: 0.1 + Math.abs(direction[0]) * 0.2 + 0.4 * Math.abs(direction[2]), d: 0.1 + Math.abs(direction[2]) * 0.2 + 0.4 * Math.abs(direction[0]), h: 2 };
		const blocked: HomePlan = { ...plan, furniture: [piece] };
		const back: Vec3 = [origin[0] - direction[0] * 0.4, origin[1], origin[2] - direction[2] * 0.4];
		const behind = { plan: blocked, devices: [], models, probes: [] };
		expect(pickTarget(back, direction, { ...behind, furniture: true }, ['opening'])).toBeNull();
		expect(pickTarget(back, direction, { ...behind, furniture: false }, ['opening'])?.id).toBe(window.id);
	});

	/** The Home's walls in a mode, settled at once, as the scene hands them to picking. */
	function wallsIn(home: Home, mode: WallMode, look = { camera: { x: 1, z: 1 }, focus: { x: 2, z: 2 }, zoom: 0.2 }) {
		home.update(look, mode, 0, true);
		const { walls } = home;
		return { walls: walls.standingBoxes(), cutAt: (opening: string) => walls.openingCut(opening) };
	}

	/** A ray from above the room's side of an Opening, down at the middle of its wall's cap when the wall stands `height` m high. */
	function rayAtCap(plan: HomePlan, opening: OpeningSpec, height: number): { origin: Vec3; direction: Vec3 } {
		const [x, , z] = anchorOf({ kind: 'opening', id: opening.id }, { plan, devices: [], models, probes: [] })!;
		const { placement } = opening;
		// Half a wall's thickness to the outside of an outside wall's line, since outside walls stand outside the footprint.
		const out = isExterior(placement) ? { north: [0, -0.1], south: [0, 0.1], west: [-0.1, 0], east: [0.1, 0] }[placement.facade] : [0, 0];
		const target: Vec3 = [x + out[0], height, z + out[1]];
		// From 1.2 m up and 1 m into the room, which is south of a north wall, and so on; an inside wall's room is either side.
		const into = isExterior(placement) ? { north: [0, 1], south: [0, -1], west: [1, 0], east: [-1, 0] }[placement.facade] : placement.axis === 'x' ? [0, 1] : [1, 0];
		const origin: Vec3 = [target[0] + into[0], height + 1.2, target[2] + into[1]];
		const d: Vec3 = [target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]];
		const length = Math.hypot(...d);
		return { origin, direction: [d[0] / length, d[1] / length, d[2] / length] };
	}

	test('a click stops at a wall that stands and passes over one that is cut down, and a door or window in a cut wall is chosen by its cut', () => {
		const plan = plans.find((p) => p.id === 'two-bedroom')!;
		const home = new Home(plan, new Materials(1, null), null, { furniture: false });
		// From the bathroom, at eye height, toward a Probe in Bedroom 2 behind the wall between them (no door in it there).
		const origin: Vec3 = [6.9, 1.6, 6.5];
		const pin = { id: 'p1', x: 9.9, y: 1.1, z: 6.5 };
		const length = Math.hypot(pin.x - origin[0], pin.y - origin[1], pin.z - origin[2]);
		const direction: Vec3 = [(pin.x - origin[0]) / length, (pin.y - origin[1]) / length, (pin.z - origin[2]) / length];
		const scene = (mode: WallMode): PickScene => ({ plan, devices: [], models, probes: [pin], furniture: false, ...wallsIn(home, mode) });
		expect(pickTarget(origin, direction, scene('up')), 'walls up: the wall hides the Probe').toBeNull();
		expect(wallDistance(origin, direction, wallsIn(home, 'up').walls)).toBeLessThan(length);
		expect(pickTarget(origin, direction, scene('down'))?.id, 'walls down: the ray passes over the wall').toBe('p1');
		// Without the walls (as before they were handed over) the Probe was taken through the wall.
		expect(pickTarget(origin, direction, { plan, devices: [], models, probes: [pin], furniture: false })?.id).toBe('p1');

		// Walls up, every door and window is whole and can be chosen from its room. Walls down, a ray at its middle passes over the low
		// wall, but one at the wall's cap where it was (a window's sill strip, or a door's stub) still chooses it.
		for (const opening of plan.openings) {
			const { origin: at, direction: toward } = rayAt(plan, opening);
			expect(pickTarget(at, toward, scene('up'), ['opening'])?.id, `${opening.id}, walls up`).toBe(opening.id);
			expect(home.walls.openingCut(opening.id), `${opening.id}, walls up`).toBeNull();
			expect(pickTarget(at, toward, scene('down'), ['opening'])?.id ?? null, `${opening.id}, walls down, at the frame's middle`).not.toBe(opening.id);
			expect(home.walls.openingCut(opening.id), `${opening.id}, walls down`).toBeCloseTo(DOWN_HEIGHT, 6);
			const cap = rayAtCap(plan, opening, DOWN_HEIGHT);
			expect(pickTarget(cap.origin, cap.direction, scene('down'), ['opening'])?.id, `${opening.id}, walls down, at its cap`).toBe(opening.id);
			// A window's place on the cap is marked; a door shows its own stub.
			const sill = cutSill(plan, opening, DOWN_HEIGHT);
			if (opening.kind === 'door' || opening.kind === 'sliding-door') expect(sill, opening.id).toBeNull();
			else {
				expect(sill!.min[1]).toBeCloseTo(DOWN_HEIGHT, 6);
				expect(sill!.max[1] - sill!.min[1]).toBeLessThan(0.02);
				expect(Math.max(sill!.max[0] - sill!.min[0], sill!.max[2] - sill!.min[2])).toBeCloseTo(opening.width, 6);
			}
			expect(cutSill(plan, opening, plan.ceiling), `${opening.id}: no strip once the wall stands above the sill`).toBeNull();
		}
		home.dispose();
	});

	test('in cutaway, the wall between the camera and the room drops and its windows are chosen from the world by their place on its cap', () => {
		const plan = plans.find((p) => p.id === 'two-bedroom')!;
		const home = new Home(plan, new Materials(1, null), null, { furniture: false });
		// At eye level outside the west wall, looking east into the living room: the west wall is cut, the walls beyond stand.
		const look = { camera: { x: -2, z: 5.4 }, focus: { x: 2.4, z: 5.4 }, zoom: 0.1 };
		const { walls, cutAt } = wallsIn(home, 'cutaway', look);
		const west = plan.openings.filter((o) => 'facade' in o.placement && o.placement.facade === 'west');
		expect(west.length).toBeGreaterThan(0);
		for (const opening of west) expect(cutAt(opening.id), `${opening.id} is in the cut wall`).toBeCloseTo(CUT_HEIGHT, 6);
		const east = plan.openings.filter((o) => 'facade' in o.placement && o.placement.facade === 'east');
		for (const opening of east) expect(cutAt(opening.id), `${opening.id} stands`).toBeNull();
		// The camera looks over the cut wall into the room: nothing stops the ray before the room, and it chooses no window on the way.
		const origin: Vec3 = [-2, 1.6, 5.4];
		expect(wallDistance(origin, [1, 0, 0], walls)).toBeGreaterThan(2.2);
		const scene: PickScene = { plan, devices: [], models, probes: [], furniture: false, walls, cutAt };
		for (const opening of west) {
			const { placement } = opening as { placement: { center: number } };
			expect(pickTarget([-2, 1.6, placement.center], [1, 0, 0], scene, ['opening']), `${opening.id}: over its cut wall`).toBeNull();
			// From the camera, down at the cap where the window was: the window, whose menu then opens beside it.
			const target: Vec3 = [-0.1, CUT_HEIGHT, placement.center];
			const d: Vec3 = [target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]];
			const length = Math.hypot(...d);
			expect(pickTarget(origin, [d[0] / length, d[1] / length, d[2] / length], scene, ['opening'])?.id, `${opening.id}: at its place on the cap`).toBe(opening.id);
			// What is drawn there: a strip the window's width on the cap, the depth of the wall.
			const sill = cutSill(plan, opening, CUT_HEIGHT)!;
			expect(sill.min).toEqual([-0.2, CUT_HEIGHT, expect.closeTo(placement.center - opening.width / 2, 9)]);
			expect(sill.max).toEqual([0, expect.closeTo(CUT_HEIGHT + 0.012, 9), expect.closeTo(placement.center + opening.width / 2, 9)]);
		}
		home.dispose();
	});
});

test('overlays map to today’s slice layers, and back', () => {
	expect(OVERLAYS.map((o) => o.label)).toEqual(['Off', 'Air speed', 'Temperature', 'Smoke']);
	for (const overlay of OVERLAYS) if (overlay.layer) expect(overlayOfLayer(overlay.layer)).toBe(overlay.id);
	expect(overlayOfLayer('direction')).toBe('speed');
});

test.describe('carrying a device in from the catalog', () => {
	test('a press that stays put is a click, R turns a step from where the ghost faces, and the chip says what a click does', () => {
		expect(isClick({ x: 0, y: 0 }, { x: 5, y: 4 })).toBe(true);
		expect(isClick({ x: 0, y: 0 }, { x: 6, y: 6 })).toBe(false);
		// Unturned, the first press turns what the ghost shows (it faces the middle of the home) by one step.
		expect(turnCarried(null, 100, 1)).toBe(145);
		expect(turnCarried(null, 100, -1)).toBe(55);
		// Once turned, from where the visitor turned it, round past north.
		expect(turnCarried(350, 10, 1)).toBe(35);
		expect(turnCarried(null, null, -1)).toBe(315);
		expect(carryHint(null, false, false).tone).toBe('away');
		expect(carryHint(null, true, true).title).toBe('Move it into a room');
		expect(carryHint({ ok: false, reason: 'That spot is in a wall.' }, false, false)).toMatchObject({ tone: 'refused', detail: 'That spot is in a wall.' });
		expect(carryHint({ ok: true, reason: null }, true, false).title).toBe('Let go to put it here');
		expect(carryHint({ ok: true, reason: null }, false, false).title).toBe('Click to put it here');
	});
});

test.describe('the Home picker', () => {
	test('each card draws its plan: a tinted path for each Room, every wall, and every door and window on its wall', () => {
		for (const plan of plans) {
			const thumb = planThumbnail(plan);
			const [x, y, w, h] = thumb.viewBox.split(' ').map(Number);
			expect(x).toBeLessThan(0);
			expect(y).toBeLessThan(0);
			expect(x + w).toBeGreaterThan(plan.width);
			expect(y + h).toBeGreaterThan(plan.depth);
			expect(thumb.rooms.map((room) => room.id)).toEqual(plan.rooms.map((room) => room.id));
			expect(new Set(thumb.rooms.map((room) => room.tint)).size).toBe(Math.min(plan.rooms.length, ROOM_TINTS.length));
			for (const room of thumb.rooms) for (const n of room.d.match(/-?[\d.]+/g)!.map(Number)) expect(Math.abs(n)).toBeLessThanOrEqual(Math.max(plan.width, plan.depth) + 1e-9);
			expect(thumb.walls).toHaveLength(plan.walls.length);
			expect(thumb.openings).toHaveLength(plan.openings.length);
			thumb.openings.forEach((gap, i) => {
				const opening = plan.openings[i];
				close(Math.hypot(gap.x2 - gap.x1, gap.y2 - gap.y1), opening.width);
				expect(gap.window).toBe(opening.kind === 'double-hung' || opening.kind === 'casement');
				// On the footprint's edge or on an inside wall's line, so it reads as a gap in that wall.
				const onEdge = [gap.x1, gap.x2].every((v) => v >= -1e-9 && v <= plan.width + 1e-9) && [gap.y1, gap.y2].every((v) => v >= -1e-9 && v <= plan.depth + 1e-9);
				expect(onEdge, `${plan.id} ${opening.id}`).toBe(true);
			});
		}
	});

	test('a card gives the floor area in the visitor’s units and counts the rooms, windows and doors', () => {
		const studio = plans.find((p) => p.id === 'studio')!;
		const metric = homeCard(studio, 'metric');
		expect(metric.name).toBe('Studio');
		expect(metric.area).toMatch(/^42\s?m²$/u);
		expect(homeCard(studio, 'imperial').area).toMatch(/^453\s?sq ft$/u);
		const windows = studio.openings.filter((o) => o.kind === 'double-hung' || o.kind === 'casement').length;
		expect(metric.facts).toBe(`${studio.rooms.length} rooms · ${windows} windows · ${studio.openings.length - windows} ${studio.openings.length - windows === 1 ? 'door' : 'doors'}`);
	});
});

test.describe('the Inspector, the hover label and the probe cards', () => {
	const plan = plans.find((p) => p.id === 'two-bedroom')!;
	const context = (over: Partial<HomeContext> = {}): HomeContext => ({
		plan,
		setup: { devices: [] },
		probes: [],
		models,
		readings: [],
		units: 'metric',
		amount: (id) => plan.openings.find((o) => o.id === id)?.open ?? 0,
		...over
	});
	const boxFan = DEVICE_MODELS.find((m) => m.kind === 'box-fan')!;
	const placed = () => {
		const made = newDevice(plan, boxFan, []);
		if (!('device' in made)) throw new Error(made.reason);
		return made.device;
	};

	test('lists the fans and purifiers and the Probes with their limits, then each Room’s doors and windows, every one once', () => {
		const groups = inventory(context());
		expect(groups[0]).toMatchObject({ id: 'devices', title: 'Fans and purifiers', count: '0 of 6', items: [] });
		expect(groups[1]).toMatchObject({ id: 'probes', count: '0 of 4', items: [] });
		const listed = groups.slice(2).flatMap((group) => group.items.map((item) => item.target.id));
		expect([...listed].sort()).toEqual(plan.openings.map((o) => o.id).sort());
		const device = placed();
		const withOne = inventory(context({ setup: { devices: [device] }, probes: [{ id: 'p1', x: 2, y: 1.1, z: 2 }] }));
		expect(withOne[0].items).toEqual([expect.objectContaining({ target: { kind: 'device', id: device.id }, name: boxFan.name, state: 'Medium' })]);
		expect(withOne[1].items[0]).toMatchObject({ name: 'Probe 1', state: 'Waiting' });
	});

	test('says each thing’s state in the words its menu uses', () => {
		const window = plan.openings.find((o) => o.kind === 'double-hung' || o.kind === 'casement')!;
		expect(openingState(window, 0.5)).toBe('Half');
		expect(openingState(window, 0.37)).toBe('37%');
		const door = plan.openings.find((o) => o.kind === 'door')!;
		expect(openingState(door, 1)).toBe('Open');
		expect(openingState(door, 0)).toBe('Closed');
		expect(powerState(boxFan, 2 / 3)).toBe('Medium');
		expect(powerState(boxFan, 0)).toBe('Off');
		expect(powerState(boxFan, 0.45)).toBe('45%');
	});

	test('names the thing under the pointer and builds the menu of a chosen one, and neither for one that is gone', () => {
		const device = placed();
		const ctx = context({ setup: { devices: [device] }, probes: [{ id: 'p1', x: 2, y: 1.1, z: 2 }] });
		expect(targetWords({ kind: 'device', id: device.id }, ctx)).toEqual({ title: boxFan.name, detail: 'Box fan · Medium' });
		expect(targetWords({ kind: 'probe', id: 'p1' }, ctx)).toEqual({ title: 'Probe 1', detail: 'Probe · Waiting' });
		const window = plan.openings.find((o) => o.kind === 'double-hung' || o.kind === 'casement')!;
		expect(targetWords({ kind: 'opening', id: window.id }, ctx)?.title).toBe(window.name);
		expect(menuFor({ kind: 'opening', id: window.id }, ctx)?.kind).toBe('window');
		expect(menuFor({ kind: 'device', id: device.id }, ctx)?.kind).toBe('fan');
		expect(menuFor({ kind: 'probe', id: 'p1' }, ctx)?.reading?.message).toBe('Waiting for the first reading.');
		expect(menuFor({ kind: 'device', id: 'gone' }, ctx)).toBeNull();
		expect(targetWords({ kind: 'opening', id: 'nowhere' }, ctx)).toBeNull();
	});

	test('a probe card reads the air in large values once a reading of its own point arrives', () => {
		const pin = { id: 'p2', x: 2, y: 1.1, z: 2 };
		expect(probeCards(context({ probes: [pin] }))[0]).toMatchObject({ name: 'Probe 2', speed: null, message: 'Waiting for the first reading.' });
		const reading = { ...pin, label: 'Probe 2', u: 0.3, v: 0, w: -0.4, speed: 0.5, averageSpeed: null, temperature: 21, particulates: 0.01, inAir: true };
		const card = probeCards(context({ probes: [pin], readings: [reading] }))[0];
		expect(card.speed).toBe(formatSpeed(0.5, 'metric').text);
		close(card.heading!, vectorToBearing(0.3, -0.4));
		expect(card.temperature).toMatch(/^21/);
		expect(card.sentence).toContain('Probe 2');
		// A reading of another point (a Probe pinned again elsewhere under the same id) is not this card's.
		expect(probeCards(context({ probes: [{ ...pin, x: 3 }], readings: [reading] }))[0].speed).toBeNull();
	});
});

test('the dial turns with the camera: north up the screen when the camera looks north, to the right when it looks west', () => {
	expect(dialRotation(0)).toBe(0);
	// The world's `data-yaw` is the bearing the camera looks toward: 270 is looking west, where north is to the right.
	expect(dialRotation(270)).toBe(90);
	expect(dialRotation(30)).toBe(330);
	expect(dialRotation(Number.NaN)).toBe(0);
	const north = dialPoint(0, 10, dialRotation(270));
	close(north.x, 10);
	close(north.y, 0);
});
