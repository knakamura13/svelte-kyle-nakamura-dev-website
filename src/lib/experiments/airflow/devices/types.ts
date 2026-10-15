import type { DeviceKind } from '../state';

/**
 * What a model of fan or purifier is, from its published specification. The catalog (catalog.ts) lists real models
 * with their rated flow, so the simulation delivers the flow on the box; everything about how a device pushes on
 * the air is derived in model.ts and solver.ts from these numbers.
 */

/** Cubic feet per minute in m³/s. */
export const CFM = 0.000471947443;

interface ModelBase {
	id: string;
	/** The product name as it appears in the picker. */
	name: string;
	kind: DeviceKind;
	/** Outside dimensions of the body, m: width (across), depth (along the airflow for a fan) and height. */
	body: { width: number; depth: number; height: number };
	/** Where the numbers come from: a URL or document, shown in the Sources. */
	source: string;
}

export interface FanModel extends ModelBase {
	kind: 'box-fan' | 'pedestal-fan' | 'window-fan';
	/** Rated flow in open air at Low, Medium and High, m³/s. */
	flow: { low: number; medium: number; high: number };
	/** Diameter of the blade disk, m. */
	diameter: number;
	/** Pedestal fans: height range of the head above the floor, m; and the widest sweep the oscillation mechanism allows, degrees. */
	heightRange?: [number, number];
	maxSweep?: number;
	/** Window fans: pressure the fan can push against with no flow, Pa. */
	shutoff?: number;
}

export interface PurifierModel extends ModelBase {
	kind: 'air-purifier';
	size: 'small' | 'medium' | 'large';
	/** Clean air delivery rate for smoke at Sleep, Low, Medium and High, m³/s. */
	cadr: { sleep: number; low: number; medium: number; high: number };
	/** Where air goes in, as a band of the body's height, m above the base; and where the clean air comes out, as the diameter of a round outlet on the top, m. */
	inlet: { from: number; to: number };
	outletDiameter: number;
}

export type DeviceModel = FanModel | PurifierModel;
