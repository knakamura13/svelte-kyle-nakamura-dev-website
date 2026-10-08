import { Grid } from '../solver/grid';
import type { Exterior, FluidProperties } from '../solver/types';
import type { Conditions } from '../state';
import type { Raster } from './rasterize';
import type { Facade } from './types';

/** The compass bearing each facade faces, which is the direction its outward normal points. */
export const FACADE_BEARING: Record<Facade, number> = { north: 0, east: 90, south: 180, west: 270 };

/**
 * Wind pressure coefficient, averaged over a wall of a low-rise rectangular building (Swami and Chandra 1987, as
 * used by ASHRAE Fundamentals and EnergyPlus). `incidence` is the angle between the direction the wind blows from
 * and the wall's outward normal, degrees (0 is square on to the wall). `sideRatio` is the wall's width over the
 * adjacent wall's. Positive pushes on the wall, negative sucks.
 */
export function windPressureCoefficient(incidence: number, sideRatio: number) {
	const alpha = Math.abs(((incidence % 360) + 540) % 360 - 180); // 0 (square on) to 180 (directly behind)
	const a = (alpha * Math.PI) / 180;
	const g = Math.log(sideRatio);
	const inner =
		1.248 - 0.703 * Math.sin(a / 2) - 1.175 * Math.sin(a) ** 2 + 0.131 * Math.sin(2 * g * a) ** 3 + 0.769 * Math.cos(a / 2) + 0.071 * g * g + 0.717 * Math.cos(a / 2) ** 2;
	return 0.6 * Math.log(inner);
}

/**
 * Pressures outside every exterior opening, and the outdoor air's temperature and particulates.
 *
 * Outside pressure at a face is the wind's (½ρU² times the facade's coefficient for this wind direction) plus a
 * hydrostatic term: air at a different temperature from the reference weighs differently, so its pressure changes
 * with height as ρ·g·β·(T_out − T_ref)·y. That term is what drives the stack effect. The reference temperature is
 * the indoor air's starting temperature, so the indoor air has no buoyancy to begin with.
 */
export function exteriorState(raster: Raster, conditions: Conditions, referenceTemperature: number, fluid: FluidProperties): Exterior {
	const grid = new Grid(raster.spec);
	const sides = [0, 1, 2, 3, 4, 5].map((s) => new Float32Array(3 * grid.sideSize(s as 0))) as Exterior['sides'];
	const difference = conditions.outdoorTemp - referenceTemperature;
	const dynamic = 0.5 * fluid.rho * conditions.windSpeed * conditions.windSpeed;
	const { plan } = raster;
	for (const opening of raster.openings) {
		if (opening.side === undefined || opening.facade === undefined) continue;
		const alongNorthSouth = opening.facade === 'north' || opening.facade === 'south';
		const sideRatio = alongNorthSouth ? plan.width / plan.depth : plan.depth / plan.width;
		const incidence = conditions.windFrom - FACADE_BEARING[opening.facade];
		const wind = dynamic * windPressureCoefficient(incidence, sideRatio);
		for (const face of opening.faces) {
			const height = (face.y0 + face.y1) / 2;
			sides[opening.side][3 * face.slot] = wind + fluid.rho * fluid.g * fluid.beta * difference * height;
		}
	}
	return { sides, theta: difference, particulates: conditions.outdoorPm25 / (fluid.rho * 1000) };
}
