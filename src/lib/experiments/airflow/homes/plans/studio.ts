import { CEILING, type HomePlan } from '../types';
import { ENTRY_DOOR, OVER_COUNTER, casement, door, doubleHung, on, through } from './parts';

/**
 * A corner studio, 7.8 × 5.4 m. The front door, on the west wall, opens into a galley kitchen with the bathroom
 * beside it; the main room holds the bed, a sofa and a table for two, with windows east and south.
 */
export const studio: HomePlan = {
	id: 'studio',
	name: 'Studio',
	blurb: 'One main room with windows on two sides, a kitchen by the front door and a bathroom.',
	width: 7.8,
	depth: 5.4,
	ceiling: CEILING,
	rooms: [
		{ id: 'main', name: 'Main room', rects: [{ x: 2.4, z: 0, w: 5.4, d: 5.4 }] },
		{ id: 'kitchen', name: 'Kitchen', rects: [{ x: 0, z: 1.8, w: 2.4, d: 3.6 }] },
		{ id: 'bathroom', name: 'Bathroom', rects: [{ x: 0, z: 0, w: 2.4, d: 1.8 }] }
	],
	// The kitchen is open to the main room; only the bathroom is walled off.
	walls: [
		{ axis: 'x', at: 1.8, from: 0, to: 2.4 },
		{ axis: 'z', at: 2.4, from: 0, to: 1.8 }
	],
	openings: [
		door('front-door', 'Front door', on('west', 2.7), 'end', ENTRY_DOOR),
		door('bathroom-door', 'Bathroom door', through('z', 2.4, 0.9), 'start'),
		casement('kitchen-window', 'Kitchen window', on('south', 1.2), 'start', { sill: OVER_COUNTER }),
		doubleHung('main-east-window-1', 'Main room east window 1', on('east', 1.5)),
		doubleHung('main-east-window-2', 'Main room east window 2', on('east', 3.9)),
		doubleHung('main-south-window', 'Main room south window', on('south', 3.6))
	],
	furniture: [
		{ id: 'bed', name: 'Queen bed', x: 5.6, z: 0, w: 1.5, d: 1.77, h: 0.5 },
		{ id: 'nightstand', name: 'Nightstand', x: 7.15, z: 0.1, w: 0.45, d: 0.37, h: 0.6 },
		{ id: 'wardrobe', name: 'Wardrobe', x: 3.6, z: 0, w: 1.2, d: 0.6, h: 2.0 },
		{ id: 'sofa', name: 'Sofa', x: 4.74, z: 2.79, w: 1.72, d: 0.72, h: 0.8 },
		{ id: 'coffee-table', name: 'Coffee table', x: 5.13, z: 3.95, w: 0.95, d: 0.5, h: 0.37 },
		{ id: 'tv-console', name: 'TV console', x: 4.95, z: 4.89, w: 1.3, d: 0.41, h: 0.5 },
		{ id: 'dining-table', name: 'Dining table', x: 3.0, z: 3.9, w: 0.8, d: 0.8, h: 0.75 },
		{ id: 'counter-south', name: 'Kitchen counter', x: 0, z: 4.8, w: 2.4, d: 0.6, h: 0.9 },
		{ id: 'counter-west', name: 'Kitchen counter', x: 0, z: 3.6, w: 0.6, d: 1.2, h: 0.9 },
		{ id: 'fridge', name: 'Refrigerator', x: 1.6, z: 1.8, w: 0.7, d: 0.55, h: 1.8 },
		{ id: 'tub', name: 'Bathtub', x: 0, z: 0, w: 0.71, d: 1.5, h: 0.53 },
		{ id: 'toilet', name: 'Toilet', x: 1.0, z: 0, w: 0.4, d: 0.61, h: 0.58 },
		{ id: 'vanity', name: 'Vanity', x: 0.95, z: 1.35, w: 0.6, d: 0.45, h: 0.66 }
	]
};
