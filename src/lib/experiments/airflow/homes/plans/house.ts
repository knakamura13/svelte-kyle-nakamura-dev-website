import { CEILING, type HomePlan } from '../types';
import { BATHROOM_WINDOW, ENTRY_DOOR, OVER_COUNTER, casement, door, doubleHung, on, slidingDoor, through } from './parts';

/**
 * A single-story house, 14.4 × 9.6 m. The front door opens into the living room; the dining room and kitchen
 * behind it face the back yard, with a sliding glass door to the patio. A hall leads west to three bedrooms, two
 * bathrooms and the laundry. The living room has low windows and a high clerestory, for the stack effect.
 */
export const house: HomePlan = {
	id: 'house',
	name: 'House',
	blurb: 'Three bedrooms on one floor, a sliding glass door to the patio and a high clerestory window in the living room.',
	width: 14.4,
	depth: 9.6,
	ceiling: CEILING,
	rooms: [
		{ id: 'living', name: 'Living room', rects: [{ x: 7.2, z: 0, w: 7.2, d: 4.8 }] },
		{ id: 'dining', name: 'Dining room', rects: [{ x: 7.2, z: 4.8, w: 3.6, d: 4.8 }] },
		{ id: 'kitchen', name: 'Kitchen', rects: [{ x: 10.8, z: 4.8, w: 3.6, d: 4.8 }] },
		{ id: 'hall', name: 'Hall', rects: [{ x: 2.4, z: 4.2, w: 4.8, d: 1.2 }] },
		{ id: 'laundry', name: 'Laundry', rects: [{ x: 0, z: 4.2, w: 2.4, d: 1.2 }] },
		{ id: 'bedroom-2', name: 'Bedroom 2', rects: [{ x: 0, z: 0, w: 3.6, d: 4.2 }] },
		{ id: 'bedroom-3', name: 'Bedroom 3', rects: [{ x: 3.6, z: 0, w: 3.6, d: 4.2 }] },
		{ id: 'primary-bedroom', name: 'Primary bedroom', rects: [{ x: 0, z: 5.4, w: 4.2, d: 4.2 }] },
		{ id: 'bathroom', name: 'Bathroom', rects: [{ x: 4.2, z: 5.4, w: 3.0, d: 1.8 }] },
		{ id: 'primary-bathroom', name: 'Primary bathroom', rects: [{ x: 4.2, z: 7.2, w: 3.0, d: 2.4 }] }
	],
	// The living room, dining room and the end of the hall are one open space; the kitchen opens off the dining room.
	walls: [
		{ axis: 'z', at: 7.2, from: 0, to: 4.2 },
		{ axis: 'z', at: 3.6, from: 0, to: 4.2 },
		{ axis: 'x', at: 4.2, from: 0, to: 7.2 },
		{ axis: 'z', at: 2.4, from: 4.2, to: 5.4 },
		{ axis: 'x', at: 5.4, from: 0, to: 7.2 },
		{ axis: 'z', at: 4.2, from: 5.4, to: 9.6 },
		{ axis: 'x', at: 7.2, from: 4.2, to: 7.2 },
		{ axis: 'z', at: 7.2, from: 5.4, to: 9.6 },
		{ axis: 'x', at: 4.8, from: 10.8, to: 14.4 }
	],
	openings: [
		door('front-door', 'Front door', on('north', 8.1), 'end', ENTRY_DOOR),
		slidingDoor('patio-door', 'Patio door', on('south', 9.0), 'start'),
		door('bedroom-2-door', 'Bedroom 2 door', through('x', 4.2, 3.0), 'start'),
		door('bedroom-3-door', 'Bedroom 3 door', through('x', 4.2, 4.2), 'end'),
		door('laundry-door', 'Laundry door', through('z', 2.4, 4.8), 'start'),
		door('primary-bedroom-door', 'Primary bedroom door', through('x', 5.4, 3.3), 'start'),
		door('bathroom-door', 'Bathroom door', through('x', 5.4, 5.7), 'start'),
		door('primary-bathroom-door', 'Primary bathroom door', through('z', 4.2, 8.4), 'start'),
		doubleHung('living-north-window-1', 'Living room north window 1', on('north', 9.9)),
		doubleHung('living-north-window-2', 'Living room north window 2', on('north', 13.2)),
		casement('living-east-window', 'Living room east window', on('east', 1.2), 'start'),
		casement('clerestory-window', 'Clerestory window', on('east', 3.3), 'top', { width: 1.2, height: 0.45, sill: 1.8 }),
		doubleHung('kitchen-window', 'Kitchen window', on('south', 12.6), { height: 1.2, sill: OVER_COUNTER }),
		casement('kitchen-east-window', 'Kitchen east window', on('east', 7.2), 'start', { sill: OVER_COUNTER }),
		doubleHung('bedroom-2-north-window', 'Bedroom 2 north window', on('north', 1.8)),
		casement('bedroom-2-west-window', 'Bedroom 2 west window', on('west', 2.1), 'start'),
		doubleHung('bedroom-3-window', 'Bedroom 3 window', on('north', 5.4)),
		doubleHung('primary-bedroom-south-window', 'Primary bedroom south window', on('south', 2.1)),
		casement('primary-bedroom-west-window', 'Primary bedroom west window', on('west', 7.5), 'start'),
		casement('primary-bathroom-window', 'Primary bathroom window', on('south', 5.7), 'start', BATHROOM_WINDOW)
	],
	furniture: [
		{ id: 'sofa', name: 'Sofa', x: 10.69, z: 3.39, w: 1.72, d: 0.72, h: 0.8 },
		{ id: 'tv-console', name: 'TV console', x: 10.9, z: 0.1, w: 1.3, d: 0.41, h: 0.5 },
		{ id: 'coffee-table', name: 'Coffee table', x: 11.03, z: 2.1, w: 1.14, d: 0.6, h: 0.44 },
		{ id: 'armchair-west', name: 'Armchair', x: 9.7, z: 2.06, w: 0.8, d: 0.68, h: 0.76 },
		{ id: 'armchair-east', name: 'Armchair', x: 12.76, z: 2.0, w: 0.68, d: 0.8, h: 0.76 },
		{ id: 'bookcase', name: 'Bookcase', x: 7.2, z: 1.5, w: 0.35, d: 0.9, h: 1.8 },
		{ id: 'dining-table', name: 'Dining table', x: 8.1, z: 6.3, w: 1.8, d: 0.9, h: 0.75 },
		{ id: 'sideboard', name: 'Sideboard', x: 7.25, z: 6.05, w: 0.45, d: 1.4, h: 0.85 },
		{ id: 'fridge', name: 'Refrigerator', x: 13.85, z: 4.8, w: 0.55, d: 0.7, h: 1.8 },
		{ id: 'counter-east', name: 'Kitchen counter', x: 13.8, z: 5.7, w: 0.6, d: 3.3, h: 0.9 },
		{ id: 'counter-south', name: 'Kitchen counter', x: 11.4, z: 9.0, w: 3.0, d: 0.6, h: 0.9 },
		{ id: 'island', name: 'Kitchen island', x: 11.7, z: 6.3, w: 0.9, d: 1.8, h: 0.9 },
		{ id: 'primary-bed', name: 'Queen bed', x: 0.9, z: 5.4, w: 1.5, d: 1.77, h: 0.5 },
		{ id: 'primary-nightstand-west', name: 'Nightstand', x: 0.4, z: 5.5, w: 0.45, d: 0.37, h: 0.6 },
		{ id: 'primary-nightstand-east', name: 'Nightstand', x: 2.45, z: 5.5, w: 0.4, d: 0.33, h: 0.6 },
		{ id: 'primary-dresser', name: 'Dresser', x: 2.8, z: 9.05, w: 1.2, d: 0.5, h: 0.85 },
		{ id: 'primary-wardrobe', name: 'Wardrobe', x: 3.6, z: 6.4, w: 0.6, d: 1.2, h: 2.0 },
		{ id: 'bed-2', name: 'Queen bed', x: 1.05, z: 0, w: 1.5, d: 1.77, h: 0.5 },
		{ id: 'desk-2', name: 'Desk', x: 0.37, z: 3.66, w: 1.06, d: 0.44, h: 0.75 },
		{ id: 'wardrobe-2', name: 'Wardrobe', x: 3.0, z: 0.3, w: 0.6, d: 1.2, h: 2.0 },
		{ id: 'bed-3', name: 'Queen bed', x: 5.43, z: 0.9, w: 1.77, d: 1.5, h: 0.5 },
		{ id: 'nightstand-3', name: 'Nightstand', x: 6.87, z: 0.4, w: 0.33, d: 0.4, h: 0.6 },
		{ id: 'dresser-3', name: 'Dresser', x: 3.7, z: 0.6, w: 0.5, d: 1.2, h: 0.85 },
		{ id: 'tub', name: 'Bathtub', x: 4.2, z: 6.49, w: 1.5, d: 0.71, h: 0.53 },
		{ id: 'toilet', name: 'Toilet', x: 6.59, z: 6.6, w: 0.61, d: 0.4, h: 0.58 },
		{ id: 'vanity', name: 'Vanity', x: 4.2, z: 5.56, w: 0.5, d: 0.68, h: 0.74 },
		{ id: 'primary-vanity', name: 'Double vanity', x: 5.2, z: 7.2, w: 1.2, d: 0.45, h: 0.66 },
		{ id: 'primary-tub', name: 'Bathtub', x: 5.4, z: 8.89, w: 1.5, d: 0.71, h: 0.53 },
		{ id: 'primary-toilet', name: 'Toilet', x: 6.59, z: 7.9, w: 0.61, d: 0.4, h: 0.58 },
		{ id: 'washer', name: 'Washer', x: 0.1, z: 4.2, w: 0.7, d: 0.7, h: 0.85 },
		{ id: 'dryer', name: 'Dryer', x: 0.85, z: 4.2, w: 0.7, d: 0.69, h: 0.85 }
	]
};
