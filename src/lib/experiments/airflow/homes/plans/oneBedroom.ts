import { CEILING, type HomePlan } from '../types';
import { BATHROOM_WINDOW, ENTRY_DOOR, OVER_COUNTER, casement, door, doubleHung, on, through } from './parts';

/**
 * A one-bedroom corner apartment, 8.4 × 7.8 m. The front door opens into a hall with the bedroom on one side and
 * the bathroom on the other; the hall ends in the living room, which is open to a kitchen with an eating area.
 */
export const oneBedroom: HomePlan = {
	id: 'one-bedroom',
	name: 'One-bedroom',
	blurb: 'A hall from the front door to the bedroom and bathroom, and a living room open to the kitchen.',
	width: 8.4,
	depth: 7.8,
	ceiling: CEILING,
	rooms: [
		{ id: 'living', name: 'Living room', rects: [{ x: 0, z: 3.6, w: 6.0, d: 4.2 }] },
		{ id: 'kitchen', name: 'Kitchen', rects: [{ x: 6.0, z: 2.4, w: 2.4, d: 5.4 }] },
		{ id: 'bedroom', name: 'Bedroom', rects: [{ x: 0, z: 0, w: 4.8, d: 3.6 }] },
		{ id: 'bathroom', name: 'Bathroom', rects: [{ x: 6.0, z: 0, w: 2.4, d: 2.4 }] },
		{ id: 'hall', name: 'Hall', rects: [{ x: 4.8, z: 0, w: 1.2, d: 3.6 }] }
	],
	// The hall opens into the living room, and the living room into the kitchen.
	walls: [
		{ axis: 'z', at: 4.8, from: 0, to: 3.6 },
		{ axis: 'x', at: 3.6, from: 0, to: 4.8 },
		{ axis: 'z', at: 6.0, from: 0, to: 3.6 },
		{ axis: 'x', at: 2.4, from: 6.0, to: 8.4 }
	],
	openings: [
		door('front-door', 'Front door', on('north', 5.4), 'start', ENTRY_DOOR),
		door('bedroom-door', 'Bedroom door', through('z', 4.8, 2.7), 'start'),
		door('bathroom-door', 'Bathroom door', through('z', 6.0, 1.5), 'start'),
		doubleHung('bedroom-north-window', 'Bedroom north window', on('north', 2.4)),
		casement('bedroom-west-window', 'Bedroom west window', on('west', 1.2), 'start'),
		doubleHung('living-south-window-1', 'Living room south window 1', on('south', 1.5)),
		doubleHung('living-south-window-2', 'Living room south window 2', on('south', 4.2)),
		casement('living-west-window', 'Living room west window', on('west', 7.0), 'end'),
		casement('kitchen-window', 'Kitchen window', on('east', 4.2), 'start', { sill: OVER_COUNTER }),
		casement('bathroom-window', 'Bathroom window', on('east', 1.2), 'start', BATHROOM_WINDOW)
	],
	furniture: [
		{ id: 'bed', name: 'Queen bed', x: 1.65, z: 1.83, w: 1.5, d: 1.77, h: 0.5 },
		{ id: 'nightstand-west', name: 'Nightstand', x: 1.1, z: 3.23, w: 0.45, d: 0.37, h: 0.6 },
		{ id: 'nightstand-east', name: 'Nightstand', x: 3.25, z: 3.23, w: 0.45, d: 0.37, h: 0.6 },
		{ id: 'wardrobe', name: 'Wardrobe', x: 4.2, z: 0.3, w: 0.6, d: 1.2, h: 2.0 },
		{ id: 'dresser', name: 'Dresser', x: 3.0, z: 0.1, w: 1.0, d: 0.5, h: 0.85 },
		{ id: 'desk', name: 'Desk', x: 0.1, z: 0.67, w: 0.44, d: 1.06, h: 0.75 },
		{ id: 'tub', name: 'Bathtub', x: 7.69, z: 0, w: 0.71, d: 1.5, h: 0.53 },
		{ id: 'toilet', name: 'Toilet', x: 6.9, z: 0, w: 0.4, d: 0.61, h: 0.58 },
		{ id: 'vanity', name: 'Vanity', x: 6.9, z: 1.95, w: 0.6, d: 0.45, h: 0.66 },
		{ id: 'fridge', name: 'Refrigerator', x: 7.85, z: 2.4, w: 0.55, d: 0.7, h: 1.8 },
		{ id: 'counter-north', name: 'Kitchen counter', x: 6.0, z: 2.4, w: 1.6, d: 0.6, h: 0.9 },
		{ id: 'counter-east', name: 'Kitchen counter', x: 7.8, z: 3.1, w: 0.6, d: 2.3, h: 0.9 },
		{ id: 'dining-table', name: 'Dining table', x: 6.8, z: 5.9, w: 0.8, d: 1.2, h: 0.75 },
		{ id: 'sofa', name: 'Sofa', x: 3.39, z: 4.74, w: 0.72, d: 1.72, h: 0.8 },
		{ id: 'coffee-table', name: 'Coffee table', x: 1.9, z: 5.13, w: 0.5, d: 0.95, h: 0.37 },
		{ id: 'tv-console', name: 'TV console', x: 0.1, z: 4.95, w: 0.41, d: 1.3, h: 0.5 },
		{ id: 'armchair', name: 'Armchair', x: 1.4, z: 6.83, w: 0.8, d: 0.67, h: 0.76 }
	]
};
