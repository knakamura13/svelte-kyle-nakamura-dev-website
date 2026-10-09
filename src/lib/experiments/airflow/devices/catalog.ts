import { CFM, type DeviceModel, type FanModel, type PurifierModel } from './types';

/**
 * Real fans with the airflow their makers publish, so a device in the sandbox delivers the flow on its spec sheet.
 * Every rating below was read from the cited manufacturer sheet on the date in its `source`, in the units the sheet
 * uses (CFM and inches), and converted here. Nothing is interpolated: a model whose maker publishes only a top-speed
 * figure is left out. The readings, and what could not be confirmed, are in
 * docs/research/airflow/devices-and-particulates.md under "Device ratings".
 *
 * No air purifier is listed yet. `PurifierModel.cadr` needs a clean air delivery rate at Sleep, Low, Medium and High,
 * and the makers and the AHAM Verifide program publish it for the highest speed only (the research note lists the
 * top-speed figures that were confirmed). Adding one needs a decision on where the lower speeds come from.
 */

/** Inches in metres. */
const IN = 0.0254;

/** Air King 9723, 20" Commercial Grade Box Fan. */
const airKing9723: FanModel = {
	id: 'air-king-9723',
	name: 'Air King 9723 20″ box fan',
	kind: 'box-fan',
	// "21.38"L x 6.38"W x 22.5"H": 21.38 is across the face and 6.38 is the depth along the airflow (the sheet's drawing).
	body: { width: 21.38 * IN, depth: 6.38 * IN, height: 22.5 * IN },
	diameter: 20 * IN,
	flow: { low: 1463 * CFM, medium: 1900 * CFM, high: 2163 * CFM },
	source: 'Air King 9723 20" Commercial Grade Box Fan, spec sheet "Updated 3-23", https://www.airkinglimited.com/wp-content/uploads/2020/09/9723spec1.pdf (read 2026-10-09)'
};

/**
 * Air King 9119, 18" Oscillating Pedestal Fan. The sheet gives the fan's overall height, "Telescoping from 37" to
 * 53.75"". The head's centre is taken as half the head's 20.25" width below that (derived, not published).
 */
const airKing9119: FanModel = {
	id: 'air-king-9119',
	name: 'Air King 9119 18″ pedestal fan',
	kind: 'pedestal-fan',
	body: { width: 20.25 * IN, depth: 20.25 * IN, height: 53.75 * IN },
	diameter: 18 * IN,
	flow: { low: 1380 * CFM, medium: 1680 * CFM, high: 1950 * CFM },
	heightRange: [(37 - 20.25 / 2) * IN, (53.75 - 20.25 / 2) * IN],
	maxSweep: 90,
	source: 'Air King 9119 18" Oscillating Pedestal Fan, spec sheet "Updated 3-23", https://www.airkinglimited.com/wp-content/uploads/2020/09/9119Spec1.pdf (read 2026-10-09)'
};

/** Air King 9126, 16" Oscillating Pedestal Fan: overall height "Telescoping from 36" to 52"", head centre derived as for the 9119. */
const airKing9126: FanModel = {
	id: 'air-king-9126',
	name: 'Air King 9126 16″ pedestal fan',
	kind: 'pedestal-fan',
	body: { width: 18 * IN, depth: 18 * IN, height: 52 * IN },
	diameter: 16 * IN,
	flow: { low: 1220 * CFM, medium: 1420 * CFM, high: 1580 * CFM },
	heightRange: [(36 - 18 / 2) * IN, (52 - 18 / 2) * IN],
	maxSweep: 90,
	source: 'Air King 9126 16" Oscillating Pedestal Fan, spec sheet "Updated 3-23", https://www.airkinglimited.com/wp-content/uploads/2020/09/9126Spec1.pdf (read 2026-10-09)'
};

/**
 * Air King 9155, 16" Window Fan, single blade. Air King states it can be set for intake or exhaust and publishes one
 * CFM per speed for both. "26.5"L x 8.25"W x 22"H": 8.25 is the depth through the window; side panels extend the
 * width to 34.5". No shut-off pressure is published, so `shutoff` is left to the solver's default.
 */
const airKing9155: FanModel = {
	id: 'air-king-9155',
	name: 'Air King 9155 16″ window fan',
	kind: 'window-fan',
	body: { width: 26.5 * IN, depth: 8.25 * IN, height: 22 * IN },
	diameter: 16 * IN,
	flow: { low: 1360 * CFM, medium: 1700 * CFM, high: 2470 * CFM },
	source: 'Air King 9155 16" Window Fan, spec sheet "Updated 3-23", https://www.airkinglimited.com/wp-content/uploads/2020/09/9155Spec1.pdf (read 2026-10-09)'
};

export const FAN_MODELS: readonly FanModel[] = [airKing9723, airKing9119, airKing9126, airKing9155];

/** Empty until a purifier's CADR at every speed has a source: see the note at the top. */
export const PURIFIER_MODELS: readonly PurifierModel[] = [];

/** Every model the sandbox offers, in picker order. */
export const DEVICE_MODELS: readonly DeviceModel[] = [...FAN_MODELS, ...PURIFIER_MODELS];
