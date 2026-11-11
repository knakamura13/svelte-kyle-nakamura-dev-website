import { Grid } from '../solver/grid';
import type { Exterior, FluidProperties } from '../solver/types';
import type { Conditions } from '../state';
import { gustAt, type GustSeries } from './gust';
import type { Raster } from './rasterize';
import type { Facade } from './types';

/** The compass bearing each facade faces, which is the direction its outward normal points. */
export const FACADE_BEARING: Record<Facade, number> = { north: 0, east: 90, south: 180, west: 270 };

/**
 * The wind speed at the eaves of a house as a fraction of the weather report's (10 m, open ground), for a suburban
 * lot: the ASHRAE 2005 power law with exponent 0.22 and boundary-layer depth 370 m, at 3.0 m, against a station at 0.14
 * and 270 m, gives 0.550 (EnergyPlus Engineering Reference, "Local Wind Speed Calculation"). Pressure coefficients are
 * referenced to the speed at building height, so the weather report's speed must not be used in them directly.
 */
export const WIND_AT_EAVES = 0.55;

/**
 * Wind pressure coefficient, averaged over a wall of a low-rise rectangular building (Swami and Chandra 1987, as
 * documented in the EnergyPlus Engineering Reference). `incidence` is the angle between the direction the wind
 * blows from and the wall's outward normal, degrees (0 is square on to the wall). `sideRatio` is the wall's width
 * over the adjacent wall's. Positive pushes on the wall, negative sucks. The fit is for isolated buildings and
 * wall openings away from corners; docs/research/airflow/openings-and-wind.md gives its range and limits.
 */
export function windPressureCoefficient(incidence: number, sideRatio: number) {
	let degrees = Math.abs(incidence) % 360;
	if (degrees > 180) degrees = 360 - degrees;
	const alpha = (degrees * Math.PI) / 180;
	const half = alpha / 2;
	const g = Math.log(sideRatio);
	const inner =
		1.248 -
		0.703 * Math.sin(half) -
		1.175 * Math.sin(alpha) ** 2 +
		0.131 * Math.sin(2 * alpha * g) ** 3 +
		0.769 * Math.cos(half) +
		0.07 * g * g * Math.sin(half) ** 2 +
		0.717 * Math.cos(half) ** 2;
	return 0.6 * Math.log(inner);
}

/**
 * The wind's pressure on a facade, ½ρU²Cp, Pa, for a wind of `speed` m/s at the eaves blowing from the bearing `from`. The steady wind
 * and the gusts both come through here: a gust's departure is this at the gust's speed and direction (homes/gust.ts) less this at the mean.
 */
export function facadeWindPressure(plan: { width: number; depth: number }, facade: Facade, from: number, speed: number, rho: number) {
	const alongNorthSouth = facade === 'north' || facade === 'south';
	const sideRatio = alongNorthSouth ? plan.width / plan.depth : plan.depth / plan.width;
	return 0.5 * rho * speed * speed * windPressureCoefficient(from - FACADE_BEARING[facade], sideRatio);
}

/**
 * Pressures outside every exterior opening, and the outdoor air's temperature and particulates.
 *
 * Outside pressure at a face is the wind's (½ρU² times the facade's coefficient for this wind direction) plus a
 * hydrostatic term: air at a different temperature from the reference weighs differently, so its pressure changes
 * with height as ρ·g·β·(T_out − T_ref)·y. That term is what drives the stack effect. The reference temperature is
 * the indoor air's starting temperature, so the indoor air has no buoyancy to begin with. The wind here is the mean wind;
 * a gusty wind adds its departure from the mean on each side of the box, each step (`gustPressures`, `BackendUpdate.gust`).
 */
export function exteriorState(raster: Raster, conditions: Conditions, referenceTemperature: number, fluid: FluidProperties): Exterior {
	const grid = new Grid(raster.spec);
	const sides = [0, 1, 2, 3, 4, 5].map((s) => new Float32Array(3 * grid.sideSize(s as 0))) as Exterior['sides'];
	const difference = conditions.outdoorTemp - referenceTemperature;
	const eaves = conditions.windSpeed * WIND_AT_EAVES;
	for (const opening of raster.openings) {
		if (opening.side === undefined || opening.facade === undefined) continue;
		const wind = facadeWindPressure(raster.plan, opening.facade, conditions.windFrom, eaves, fluid.rho);
		for (const face of opening.faces) {
			const height = (face.y0 + face.y1) / 2;
			sides[opening.side][3 * face.slot] = wind + fluid.rho * fluid.g * fluid.beta * difference * height;
		}
	}
	return { sides, theta: difference, particulates: conditions.outdoorPm25 / (fluid.rho * 1000) };
}

/**
 * A gusty wind's departure from the mean wind's pressure on each side of the box, Pa, six numbers in box-side order (sides without an
 * opening, the floor and the ceiling stay 0): ½ρU(t)²Cp(θ(t)) less ½ρŪ²Cp(θ̄) for the facade on that side, with U(t) and θ(t) the
 * gust at `time` simulated seconds. All zeros when the wind is steady or calm. The solver adds it to the outside pressure of every
 * opening on the side, so the steady wind and the gusts take one path into the pressure solve.
 */
export function gustPressures(raster: Raster, conditions: Conditions, series: GustSeries, time: number, rho: number, into = new Float32Array(6)) {
	into.fill(0);
	const mean = conditions.windSpeed * WIND_AT_EAVES;
	if (conditions.gusty !== true || !(mean > 0)) return into;
	const gust = gustAt(series, time, mean);
	for (const opening of raster.openings) {
		if (opening.side === undefined || opening.facade === undefined) continue;
		into[opening.side] =
			facadeWindPressure(raster.plan, opening.facade, conditions.windFrom + gust.veer, gust.speed, rho) - facadeWindPressure(raster.plan, opening.facade, conditions.windFrom, mean, rho);
	}
	return into;
}
