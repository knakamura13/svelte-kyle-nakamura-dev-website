/**
 * Published benchmark solutions the solver is held to. Sources are in docs/research/airflow/benchmarks.md.
 */

/**
 * Ghia, Ghia and Shin (1982), J. Comput. Phys. 48, 387–411, Re = 1000 lid-driven cavity, unit square, lid speed 1.
 * u(y) along the vertical centreline x = 0.5, and v(x) along the horizontal centreline y = 0.5.
 */
export const GHIA_RE1000_U: [y: number, u: number][] = [
	[1.0, 1.0],
	[0.9766, 0.65928],
	[0.9688, 0.57492],
	[0.9609, 0.51117],
	[0.9531, 0.46604],
	[0.8516, 0.33304],
	[0.7344, 0.18719],
	[0.6172, 0.05702],
	[0.5, -0.0608],
	[0.4531, -0.10648],
	[0.2813, -0.27805],
	[0.1719, -0.38289],
	[0.1016, -0.2973],
	[0.0703, -0.2222],
	[0.0625, -0.20196],
	[0.0547, -0.18109],
	[0.0, 0.0]
];

export const GHIA_RE1000_V: [x: number, v: number][] = [
	[1.0, 0.0],
	[0.9688, -0.21388],
	[0.9609, -0.27669],
	[0.9531, -0.33714],
	[0.9453, -0.39188],
	[0.9063, -0.5155],
	[0.8594, -0.42665],
	[0.8047, -0.31966],
	[0.5, 0.02526],
	[0.2344, 0.32235],
	[0.2266, 0.33075],
	[0.1563, 0.37095],
	[0.0938, 0.32627],
	[0.0781, 0.30353],
	[0.0703, 0.29012],
	[0.0625, 0.27485],
	[0.0, 0.0]
];

/**
 * de Vahl Davis (1983), Int. J. Numer. Methods Fluids 3, 249–264: natural convection of air (Pr = 0.71) in a
 * square cavity, hot left wall, cold right wall, adiabatic top and bottom. Velocities are scaled by α/H.
 */
export interface DeVahlDavis {
	rayleigh: number;
	/** Average Nusselt number on the hot wall. */
	nusselt: number;
	/** Maximum horizontal velocity on the vertical midplane and its height; maximum vertical velocity on the horizontal midplane and its x. */
	uMax: number;
	uAt: number;
	vMax: number;
	vAt: number;
}

export const DE_VAHL_DAVIS: DeVahlDavis[] = [
	{ rayleigh: 1e3, nusselt: 1.118, uMax: 3.649, uAt: 0.813, vMax: 3.697, vAt: 0.178 },
	{ rayleigh: 1e4, nusselt: 2.243, uMax: 16.178, uAt: 0.823, vMax: 19.617, vAt: 0.119 },
	{ rayleigh: 1e5, nusselt: 4.519, uMax: 34.73, uAt: 0.855, vMax: 68.59, vAt: 0.066 },
	{ rayleigh: 1e6, nusselt: 8.8, uMax: 64.63, uAt: 0.85, vMax: 219.36, vAt: 0.0379 }
];
