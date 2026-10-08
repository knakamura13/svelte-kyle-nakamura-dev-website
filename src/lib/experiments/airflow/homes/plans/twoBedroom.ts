import { CEILING, type HomePlan } from '../types';
import { BATHROOM_WINDOW, ENTRY_DOOR, OVER_COUNTER, casement, door, doubleHung, on, through } from './parts';

/**
 * A two-bedroom through-unit, 12.0 × 7.8 m: the living and dining rooms fill the west end, the bedrooms the east
 * end, and a hall runs between them past the kitchen and the bathroom. With the windows at both ends and the
 * bedroom doors open, the wind can cross the whole home.
 */
export const twoBedroom: HomePlan = {
	id: 'two-bedroom',
	name: 'Two-bedroom',
	blurb: 'A through-unit with windows at both ends and a hall between them, so the wind can blow straight through.',
	width: 12.0,
	depth: 7.8,
	ceiling: CEILING,
	rooms: [
		{ id: 'living', name: 'Living room', rects: [{ x: 0, z: 3.0, w: 4.8, d: 4.8 }] },
		{ id: 'dining', name: 'Dining room', rects: [{ x: 0, z: 0, w: 4.8, d: 3.0 }] },
		{ id: 'kitchen', name: 'Kitchen', rects: [{ x: 4.8, z: 0, w: 3.0, d: 3.0 }] },
		{
			id: 'hall',
			name: 'Hall',
			rects: [
				{ x: 4.8, z: 3.0, w: 6.0, d: 1.2 },
				{ x: 4.8, z: 4.2, w: 1.2, d: 3.6 }
			]
		},
		{ id: 'bathroom', name: 'Bathroom', rects: [{ x: 6.0, z: 4.2, w: 1.8, d: 3.6 }] },
		// Bedroom 1's closet is the alcove at the east end of the hall.
		{
			id: 'bedroom-1',
			name: 'Bedroom 1',
			rects: [
				{ x: 7.8, z: 0, w: 4.2, d: 3.0 },
				{ x: 10.8, z: 3.0, w: 1.2, d: 1.2 }
			]
		},
		{ id: 'bedroom-2', name: 'Bedroom 2', rects: [{ x: 7.8, z: 4.2, w: 4.2, d: 3.6 }] }
	],
	// The dining room, kitchen and living room are one open space, and the hall opens into the living room.
	walls: [
		{ axis: 'z', at: 4.8, from: 4.2, to: 7.8 },
		{ axis: 'x', at: 3.0, from: 4.8, to: 10.8 },
		{ axis: 'x', at: 4.2, from: 6.0, to: 12.0 },
		{ axis: 'z', at: 6.0, from: 4.2, to: 7.8 },
		{ axis: 'z', at: 7.8, from: 0, to: 3.0 },
		{ axis: 'z', at: 7.8, from: 4.2, to: 7.8 },
		{ axis: 'z', at: 10.8, from: 3.0, to: 4.2 }
	],
	openings: [
		door('front-door', 'Front door', on('south', 5.4), 'start', ENTRY_DOOR),
		door('bathroom-door', 'Bathroom door', through('x', 4.2, 6.9), 'start'),
		door('bedroom-1-door', 'Bedroom 1 door', through('x', 3.0, 8.4), 'end'),
		door('bedroom-2-door', 'Bedroom 2 door', through('x', 4.2, 8.4), 'end'),
		doubleHung('dining-window', 'Dining room window', on('west', 1.5)),
		doubleHung('living-window-1', 'Living room window 1', on('west', 3.9)),
		doubleHung('living-window-2', 'Living room window 2', on('west', 6.9)),
		casement('kitchen-window', 'Kitchen window', on('north', 6.3), 'start', { sill: OVER_COUNTER }),
		casement('bathroom-window', 'Bathroom window', on('south', 6.9), 'start', BATHROOM_WINDOW),
		doubleHung('bedroom-1-window', 'Bedroom 1 window', on('east', 1.5)),
		doubleHung('bedroom-2-window', 'Bedroom 2 window', on('east', 6.0))
	],
	furniture: [
		{ id: 'dining-table', name: 'Dining table', x: 1.65, z: 1.35, w: 1.5, d: 0.9, h: 0.75 },
		{ id: 'sideboard', name: 'Sideboard', x: 1.65, z: 0.1, w: 1.5, d: 0.45, h: 0.85 },
		{ id: 'counter-north', name: 'Kitchen counter', x: 4.8, z: 0, w: 3.0, d: 0.6, h: 0.9 },
		{ id: 'counter-east', name: 'Kitchen counter', x: 7.2, z: 0.6, w: 0.6, d: 1.5, h: 0.9 },
		{ id: 'fridge', name: 'Refrigerator', x: 7.1, z: 2.3, w: 0.7, d: 0.7, h: 1.8 },
		{ id: 'tv-console', name: 'TV console', x: 0.1, z: 4.65, w: 0.45, d: 1.5, h: 0.5 },
		{ id: 'sofa', name: 'Sofa', x: 3.3, z: 4.4, w: 0.9, d: 2.0, h: 0.8 },
		{ id: 'coffee-table', name: 'Coffee table', x: 1.9, z: 4.9, w: 0.5, d: 1.0, h: 0.45 },
		{ id: 'armchair', name: 'Armchair', x: 1.2, z: 6.8, w: 0.8, d: 0.8, h: 0.8 },
		{ id: 'bookcase', name: 'Bookcase', x: 2.6, z: 7.45, w: 0.9, d: 0.35, h: 1.8 },
		{ id: 'tub', name: 'Bathtub', x: 6.0, z: 7.05, w: 1.5, d: 0.75, h: 0.55 },
		{ id: 'toilet', name: 'Toilet', x: 7.1, z: 5.6, w: 0.7, d: 0.4, h: 0.75 },
		{ id: 'vanity', name: 'Vanity', x: 6.0, z: 5.4, w: 0.5, d: 0.8, h: 0.85 },
		{ id: 'bed-1', name: 'Queen bed', x: 8.85, z: 0, w: 1.5, d: 2.0, h: 0.5 },
		{ id: 'nightstand-1', name: 'Nightstand', x: 10.45, z: 0.1, w: 0.45, d: 0.4, h: 0.6 },
		{ id: 'desk', name: 'Desk', x: 11.3, z: 0.9, w: 0.6, d: 1.2, h: 0.75 },
		{ id: 'wardrobe-1', name: 'Wardrobe', x: 11.4, z: 3.0, w: 0.6, d: 1.2, h: 2.0 },
		{ id: 'bed-2', name: 'Queen bed', x: 9.6, z: 5.8, w: 1.5, d: 2.0, h: 0.5 },
		{ id: 'nightstand-2-west', name: 'Nightstand', x: 9.1, z: 7.4, w: 0.45, d: 0.4, h: 0.6 },
		{ id: 'nightstand-2-east', name: 'Nightstand', x: 11.15, z: 7.4, w: 0.45, d: 0.4, h: 0.6 },
		{ id: 'wardrobe-2', name: 'Wardrobe', x: 7.8, z: 5.1, w: 0.6, d: 1.2, h: 2.0 },
		{ id: 'dresser', name: 'Dresser', x: 7.85, z: 6.5, w: 0.5, d: 1.2, h: 0.85 }
	]
};
