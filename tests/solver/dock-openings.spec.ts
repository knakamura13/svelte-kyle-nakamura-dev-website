import { expect, test } from '@playwright/test';
import { plans } from '../../src/lib/experiments/airflow/homes/plans';
import { openingsByRoom, roomAt, roomsOfOpening } from '../../src/lib/experiments/airflow/homes/rooms';
import { OPENING_LIMITS, isExterior, type ExteriorPlacement, type Facade, type HomePlan, type InteriorPlacement, type OpeningSpec } from '../../src/lib/experiments/airflow/homes/types';
import { openingAnnouncement, openingCaption, openingLabel, openingReading, openingSpoken, openingsHint } from '../../src/lib/experiments/airflow/ui/openings';

/**
 * The Openings list of the Dock: which Room each Opening is listed under, and what the Dock says about how far it is open. The
 * grouping is checked against the plans a second way, from the geometry in the test itself, so a plan that changes cannot leave an
 * Opening listed under a Room it is not in.
 */

/** The Room index at a point, found here and not by the code under test. */
const roomIndex = (plan: HomePlan, x: number, z: number) => plan.rooms.findIndex((room) => room.rects.some((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d));

/** A point `depth` metres inside the Home from an exterior wall, `along` metres along it. */
function inside(plan: HomePlan, facade: Facade, along: number, depth: number): [number, number] {
	if (facade === 'north') return [along, depth];
	if (facade === 'south') return [along, plan.depth - depth];
	return facade === 'west' ? [depth, along] : [plan.width - depth, along];
}

/** The Rooms an exterior opening opens into, sampled at both ends of its frame and its middle: more than one Room would mean the frame straddles a partition. */
function behind(plan: HomePlan, opening: OpeningSpec) {
	const { facade, center } = opening.placement as ExteriorPlacement;
	return new Set([center - opening.width / 2 + 0.05, center, center + opening.width / 2 - 0.05].map((u) => roomIndex(plan, ...inside(plan, facade, u, 0.05))));
}

/** The Rooms either side of a doorway in an interior wall. */
function eitherSide(plan: HomePlan, opening: OpeningSpec) {
	const { axis, at, center } = opening.placement as InteriorPlacement;
	return [-0.05, 0.05].map((d) => (axis === 'x' ? roomIndex(plan, center, at + d) : roomIndex(plan, at + d, center)));
}

test.describe('the Openings list: which Room each Opening is listed under', () => {
	for (const plan of plans) {
		test(`${plan.name}: every Opening is listed exactly once, under a Room that is behind it`, () => {
			const groups = openingsByRoom(plan);
			const listed = groups.flatMap((group) => group.openings.map((entry) => entry.opening.id));
			expect(listed.slice().sort(), 'each Opening once, none missing, none twice').toEqual(plan.openings.map((o) => o.id).sort());
			expect(groups.every((group) => group.openings.length > 0), 'no Room is listed with nothing under it').toBe(true);
			// Rooms come in the plan's order, and each Room once.
			const order = groups.map((group) => plan.rooms.indexOf(group.room));
			expect(order.every((index) => index >= 0)).toBe(true);
			expect(order, 'in the plan order').toEqual(order.slice().sort((a, b) => a - b));
			expect(new Set(order).size).toBe(order.length);

			const problems: string[] = [];
			for (const group of groups) {
				const index = plan.rooms.indexOf(group.room);
				for (const { opening, to } of group.openings) {
					if (isExterior(opening.placement)) {
						const rooms = behind(plan, opening);
						if (rooms.size !== 1 || !rooms.has(index)) problems.push(`${opening.id} is listed under ${group.room.name} but opens into rooms ${[...rooms].map((i) => plan.rooms[i]?.name)}`);
						if (to !== null) problems.push(`${opening.id} is to the outside and has no other Room, but says "to ${to.name}"`);
					} else {
						const sides = eitherSide(plan, opening);
						if (!sides.includes(index)) problems.push(`${opening.id} is listed under ${group.room.name}, which is on neither side of it`);
						const other = sides.find((side) => side !== index);
						if (other === undefined || to !== plan.rooms[other]) problems.push(`${opening.id} should lead to ${plan.rooms[other ?? -1]?.name} and says ${to?.name}`);
						if (sides[0] === sides[1]) problems.push(`${opening.id} has the same Room on both sides`);
					}
				}
			}
			expect(problems).toEqual([]);
		});
	}

	test('a doorway is listed under the Room it opens into, and says which Room it leads to', () => {
		const listing = (planId: string, openingId: string) => {
			const plan = plans.find((p) => p.id === planId)!;
			const group = openingsByRoom(plan).find((g) => g.openings.some((entry) => entry.opening.id === openingId))!;
			const entry = group.openings.find((e) => e.opening.id === openingId)!;
			return [group.room.name, openingLabel(entry)];
		};
		expect(listing('house', 'bedroom-2-door')).toEqual(['Bedroom 2', 'Bedroom 2 door, to Hall']);
		expect(listing('house', 'primary-bathroom-door')).toEqual(['Primary bathroom', 'Primary bathroom door, to Primary bedroom']);
		expect(listing('house', 'bathroom-door')).toEqual(['Bathroom', 'Bathroom door, to Hall']);
		expect(listing('two-bedroom', 'bedroom-1-door')).toEqual(['Bedroom 1', 'Bedroom 1 door, to Hall']);
		expect(listing('one-bedroom', 'bedroom-door')).toEqual(['Bedroom', 'Bedroom door, to Hall']);
		expect(listing('studio', 'bathroom-door')).toEqual(['Bathroom', 'Bathroom door, to Main room']);
		// A door or window to the outside belongs to the Room behind it and names no other.
		expect(listing('studio', 'front-door')).toEqual(['Kitchen', 'Front door']);
		expect(listing('house', 'clerestory-window')).toEqual(['Living room', 'Clerestory window']);
	});

	test('a Room with no Opening of its own is left out, and the Hall of the house is that Room', () => {
		const house = plans.find((p) => p.id === 'house')!;
		expect(openingsByRoom(house).map((g) => g.room.name)).not.toContain('Hall');
		expect(openingsByRoom(house).reduce((sum, g) => sum + g.openings.length, 0)).toBe(house.openings.length);
	});

	test('the Room a doorway is listed under: the one its name starts with, the longer name if both do, else the first in the plan', () => {
		const plan = (rooms: [string, string], name: string, order: 'ab' | 'ba' = 'ab'): [HomePlan, OpeningSpec] => {
			// Two 3 m rooms side by side with a doorway in the wall between them.
			const [first, second] = rooms;
			const a = { id: 'a', name: first, rects: [{ x: 0, z: 0, w: 3, d: 3 }] };
			const b = { id: 'b', name: second, rects: [{ x: 3, z: 0, w: 3, d: 3 }] };
			const opening: OpeningSpec = { id: 'door', name, kind: 'door', placement: { axis: 'z', at: 3, center: 1.5 }, width: 0.8, height: 2, sill: 0, maxOpen: 1, anchor: 'start' };
			return [{ id: 'studio', name: 'Test', blurb: '', width: 6, depth: 3, ceiling: 2.4, rooms: order === 'ab' ? [a, b] : [b, a], walls: [], openings: [opening], furniture: [] }, opening];
		};
		const listedUnder = (rooms: [string, string], name: string, order?: 'ab' | 'ba') => {
			const [home, opening] = plan(rooms, name, order);
			const { room, to } = roomsOfOpening(home, opening);
			return `${room.name} / ${to?.name}`;
		};
		// The name names the east room, which is second in the plan: the name wins over the order.
		expect(listedUnder(['Hall', 'Pantry'], 'Pantry door')).toBe('Pantry / Hall');
		expect(listedUnder(['Pantry', 'Hall'], 'Pantry door')).toBe('Pantry / Hall');
		// Both names match, so the longer, closer one does.
		expect(listedUnder(['Bedroom', 'Bedroom 2'], 'Bedroom 2 door')).toBe('Bedroom 2 / Bedroom');
		expect(listedUnder(['Bedroom 2', 'Bedroom'], 'Bedroom 2 door')).toBe('Bedroom 2 / Bedroom');
		// Neither name matches: the first of the two in the plan's order, whichever side of the wall it is on.
		expect(listedUnder(['Hall', 'Pantry'], 'Door to the garden')).toBe('Hall / Pantry');
		expect(listedUnder(['Hall', 'Pantry'], 'Door to the garden', 'ba')).toBe('Pantry / Hall');
		// Case does not matter.
		expect(listedUnder(['Hall', 'Pantry'], 'PANTRY DOOR')).toBe('Pantry / Hall');
	});

	test('a plan that does not tile its footprint still lists every Opening, under the first Room', () => {
		const home: HomePlan = { ...plans[0], rooms: [{ id: 'only', name: 'Only', rects: [{ x: 0, z: 0, w: 1, d: 1 }] }] };
		const groups = openingsByRoom(home);
		expect(groups).toHaveLength(1);
		expect(groups[0].openings).toHaveLength(home.openings.length);
		expect(roomAt(home, 50, 50)).toBeUndefined();
		expect(roomAt(home, 0.5, 0.5)?.id).toBe('only');
	});
});

test.describe('the Openings list: what the Dock says about an Opening', () => {
	test('travel is a whole percent, the frame follows from it and the limit is the plan kind’s own', () => {
		const door = { maxOpen: OPENING_LIMITS.door.maxOpen };
		const window = { maxOpen: OPENING_LIMITS['double-hung'].maxOpen };
		const casement = { maxOpen: OPENING_LIMITS.casement.maxOpen };
		expect(openingReading(door, 0)).toEqual({ travel: 0, frame: 0, limit: 100 });
		expect(openingReading(door, 0.6)).toEqual({ travel: 60, frame: 60, limit: 100 });
		expect(openingReading(window, 0.6)).toEqual({ travel: 60, frame: 30, limit: 50 });
		expect(openingReading(window, 1)).toEqual({ travel: 100, frame: 50, limit: 50 });
		expect(openingReading(casement, 0.6)).toEqual({ travel: 60, frame: 48, limit: 80 });
		expect(openingReading(casement, 1)).toEqual({ travel: 100, frame: 80, limit: 80 });
		// A step of the slider is a whole percent, and the sum is not spoiled by floating point (0.07 × 100 is 7.000000000000001).
		expect(openingReading(window, 0.07).travel).toBe(7);
		expect(openingReading(window, 0.29)).toEqual({ travel: 29, frame: 15, limit: 50 });
		// Out of range or not a number reads as the nearest end, and nothing as shut.
		expect(openingReading(window, 3).travel).toBe(100);
		expect(openingReading(window, -1).travel).toBe(0);
		expect(openingReading(window, NaN)).toEqual({ travel: 0, frame: 0, limit: 50 });
	});

	test('every Opening of every plan reads its limit from its kind, and its frame never passes it', () => {
		const problems: string[] = [];
		for (const plan of plans)
			for (const opening of plan.openings)
				for (let travel = 0; travel <= 100; travel++) {
					const reading = openingReading(opening, travel / 100);
					if (reading.limit !== Math.round(OPENING_LIMITS[opening.kind].maxOpen * 100)) problems.push(`${plan.id}/${opening.id} limit ${reading.limit}`);
					if (reading.travel !== travel) problems.push(`${plan.id}/${opening.id} travel ${travel} reads ${reading.travel}`);
					if (reading.frame > reading.limit || reading.frame < 0) problems.push(`${plan.id}/${opening.id} at ${travel} has ${reading.frame}% of its frame open`);
				}
		expect(problems.slice(0, 5)).toEqual([]);
	});

	test('the caption under a slider says what the travel leaves open and how much the Opening opens at most', () => {
		const window = { maxOpen: 0.5 };
		const casement = { maxOpen: 0.8 };
		const door = { maxOpen: 1 };
		expect(openingCaption(openingReading(window, 0.6))).toBe('60% of travel opens 30% of the frame. It opens at most 50% of its frame.');
		expect(openingCaption(openingReading(casement, 1))).toBe('100% of travel opens 80% of the frame. It opens at most 80% of its frame.');
		expect(openingCaption(openingReading(window, 0))).toBe('Shut. It opens at most 50% of its frame.');
		expect(openingCaption(openingReading(door, 0.25))).toBe('25% of travel opens 25% of the frame. It opens its whole frame.');
		expect(openingCaption(openingReading(door, 0))).toBe('Shut. It opens its whole frame.');
	});

	test('a screen reader hears the value after the name, and one sentence once the slider stops', () => {
		const window = { maxOpen: 0.5 };
		expect(openingSpoken(openingReading(window, 0.6))).toBe('60 percent of travel, 30 percent of the frame open');
		expect(openingSpoken(openingReading(window, 0))).toBe('shut');
		expect(openingAnnouncement('Kitchen window', openingReading(window, 0.6))).toBe('Kitchen window, 60 percent of travel, 30 percent of the frame open. It opens at most 50 percent of its frame.');
		expect(openingAnnouncement('Kitchen window', openingReading(window, 0))).toBe('Kitchen window, shut. It opens at most 50 percent of its frame.');
		expect(openingAnnouncement('Front door', openingReading({ maxOpen: 1 }, 1))).toBe('Front door, 100 percent of travel, 100 percent of the frame open. It opens its whole frame.');
		// No digit-and-symbol shorthand is left for the voice to guess at.
		expect(openingAnnouncement('Kitchen window', openingReading(window, 0.6))).not.toContain('%');
		expect(openingSpoken(openingReading(window, 0.6))).not.toContain('%');
	});

	test('the closed group says how many Openings are open and whether the furniture is in', () => {
		expect(openingsHint(3, 11, true)).toBe('3 of 11 open, furniture on');
		expect(openingsHint(0, 6, false)).toBe('0 of 6 open, furniture off');
	});
});
