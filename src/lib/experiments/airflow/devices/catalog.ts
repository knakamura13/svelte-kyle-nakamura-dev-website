import { PURIFIER_MARKS } from './model';
import { CFM, type DeviceModel, type FanModel, type PurifierModel } from './types';

/**
 * Real fans with the airflow their makers publish, so a device in the sandbox delivers the flow on its spec sheet.
 * Every rating below was read from the cited manufacturer sheet on the date in its `source`, in the units the sheet
 * uses (CFM and inches), and converted here. Nothing is interpolated for a fan: a fan whose maker publishes only a
 * top-speed figure is left out. The readings, and what could not be confirmed, are in
 * docs/research/airflow/devices-and-particulates.md under "Device ratings".
 *
 * Three air purifiers are listed, one of each size. Makers and certification listings publish a purifier's clean air delivery
 * rate (CADR) for the highest speed only, so each model's CADR at Sleep, Low and Medium is DERIVED, not published: the top
 * speed's figure times the power mark of that speed (0.25, 0.5 and 0.75: `PURIFIER_MARKS`), which takes CADR as proportional to
 * fan speed. Real units will differ, and each purifier's `source` says what was read, what was derived and what was estimated.
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

/**
 * A purifier's CADR at every speed from the one figure its maker or a certification listing publishes, for the highest speed:
 * Sleep, Low and Medium are that figure times the power mark of the speed. This is an assumption (see the note at the top).
 */
const fromTopSpeed = (high: number): PurifierModel['cadr'] => ({
	sleep: high * PURIFIER_MARKS.sleep,
	low: high * PURIFIER_MARKS.low,
	medium: high * PURIFIER_MARKS.medium,
	high
});

/**
 * Levoit Core 300-P (sold as the Core 300), the small one. Smoke CADR 143 cfm at the highest speed: the owner's manual, p. 2,
 * lists 143 / 153 / 167 cfm for smoke / dust / pollen, and the AHAM record for the Core 300 agrees. "8.7 x 8.7 x 14.2 in" is
 * read as an upright cylinder 8.7 in across (the drawings, manual pp. 5 and 8). Air goes in through the perforated lower band
 * all the way round and out through the ring grille on the top face around the control panel (manual p. 5). The sizes of those
 * openings are not published: the inlet band (about 6 in of the 14.2 in, from just above the base) and the outlet's open area
 * (a ring 7.8 in across round a 3.6 in disc, as an equivalent round outlet 0.176 m across) are read off an undimensioned drawing.
 */
const levoitCore300P: PurifierModel = {
	id: 'levoit-core-300p',
	name: 'Levoit Core 300-P air purifier',
	kind: 'air-purifier',
	size: 'small',
	body: { width: 8.7 * IN, depth: 8.7 * IN, height: 14.2 * IN },
	cadr: fromTopSpeed(143 * CFM),
	inlet: { from: 0.02, to: 0.02 + 6 * IN },
	outletDiameter: 0.176,
	source:
		'Levoit Core 300-P owner\'s manual, https://levoit.com/cdn/shop/files/HEAPAPLVNUS0161Y_Core_300-p_Air_Purifier_manual_US_A2-241204_1.pdf (read 2026-10-14): smoke CADR 143 cfm at the highest speed (p. 2, Specifications), size 8.7 x 8.7 x 14.2 in (p. 2), inlet and outlet positions (p. 5). Derived, not published: CADR at Sleep, Low and Medium is the top figure times 0.25, 0.5 and 0.75. Estimated from an undimensioned drawing: the inlet band\'s height and the outlet\'s open area.'
};

/**
 * Coway Airmega Mighty AP-1512HH, the medium one. Smoke CADR 233 cfm at the highest speed, as the maker's page and the AHAM
 * directory (2016 and 2018 editions) print it. "16.8 x 18.3 x 9.6 in (W x H x D)", manual p. 1. The slotted outlet grille is
 * along the top at the back (manual p. 7); no manual says where the main inlet is, and the filters sit as flat panels behind the
 * front cover, so air is taken to enter at the front. Opening sizes are not published: the inlet is taken as the lower three
 * quarters of the body's height, and the outlet as a slot about 11.5 in by 2 in (an equivalent round outlet 0.14 m across).
 */
const cowayMighty: PurifierModel = {
	id: 'coway-ap-1512hh',
	name: 'Coway Airmega Mighty AP-1512HH air purifier',
	kind: 'air-purifier',
	size: 'medium',
	body: { width: 16.8 * IN, depth: 9.6 * IN, height: 18.3 * IN },
	cadr: fromTopSpeed(233 * CFM),
	inlet: { from: 0.03, to: 0.34 },
	outletDiameter: 0.14,
	source:
		'Coway Airmega Mighty AP-1512HH, https://cowaymega.com/products/mighty-air-purifier-ap-1512hh and owner\'s manual https://cdn.shopify.com/s/files/1/0351/1864/5383/files/9240281_AP-1512HH__Manual_US__25.11.13.pdf (read 2026-10-14): smoke CADR 233 cfm at the highest speed (the AHAM directory prints the same, no unit on the maker\'s page), size 16.8 x 18.3 x 9.6 in W x H x D (manual p. 1), outlet grille on the top at the back (p. 7). Derived, not published: CADR at the lower speeds is the top figure times the speed\'s power mark. Not published and estimated: where the inlet is (taken as the front, over the lower three quarters of the body) and the size of both openings.'
};

/**
 * Coway Airmega 400, the large one. Smoke CADR 376 cfm at the highest speed, from the ENERGY STAR certified-product data
 * (AP-2015F, certified through an EPA-recognized body); Coway's own page prints 328 with no unit and no certified record
 * carries it, and the difference is not explained anywhere. "22.8 x 14.8 x 14.8 in" (manual p. 26). The round louvred outlet
 * grille fills most of the top (manual p. 9); air enters through the perforated side covers over each filter set (pp. 9 and 14).
 * Opening sizes are not published: the outlet is taken as a round grille 12 in across, the inlet as the side faces above the legs.
 */
const cowayAirmega400: PurifierModel = {
	id: 'coway-airmega-400',
	name: 'Coway Airmega 400 air purifier',
	kind: 'air-purifier',
	size: 'large',
	body: { width: 14.8 * IN, depth: 14.8 * IN, height: 22.8 * IN },
	cadr: fromTopSpeed(376 * CFM),
	inlet: { from: 0.08, to: 0.52 },
	outletDiameter: 12 * IN,
	source:
		'Coway Airmega 400 (AP-2015F): smoke CADR 376 cfm at the highest speed, ENERGY STAR certified-product data, https://data.energystar.gov/resource/gaa3-swy6.json?pd_id=4512742 (read 2026-10-14; Coway\'s page https://cowaymega.com/products/airmega-400 prints 328, no unit, with no certified record behind it); size 22.8 x 14.8 x 14.8 in H x W x D (owner\'s manual https://original.accentuate.io/4791712645255/1590201445072/Coway-Airmega-300-400-Series-Manual.pdf p. 26); outlet grille on top and perforated side covers (pp. 9 and 14). Derived, not published: CADR at Sleep, Low and Medium is the top figure times 0.25, 0.5 and 0.75. Not published and estimated: the sizes of the inlet and outlet.'
};

export const PURIFIER_MODELS: readonly PurifierModel[] = [levoitCore300P, cowayMighty, cowayAirmega400];

/** Every model the sandbox offers, in picker order. */
export const DEVICE_MODELS: readonly DeviceModel[] = [...FAN_MODELS, ...PURIFIER_MODELS];
