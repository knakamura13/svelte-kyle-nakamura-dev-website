/**
 * Published benchmark solutions the solver is held to. Sources are in docs/research/airflow/benchmarks.md.
 */

/**
 * Ghia, Ghia and Shin (1982), J. Comput. Phys. 48, 387–411, Re = 1000 lid-driven cavity, unit square, lid speed 1.
 * u(y) along the vertical centreline x = 0.5, and v(x) along the horizontal centreline y = 0.5. The solution is on a
 * 129 × 129 grid, so every coordinate is k/128; the 4-decimal numbers in the paper's table are those rounded. Values as
 * read in four independent transcriptions (docs/research/airflow/benchmarks.md); the x = 0.9063 entry of v is −0.5155
 * (two transcriptions agree; a third prints −0.51500).
 */
export const GHIA_RE1000_U: [y: number, u: number][] = [
	[128 / 128, 1.0],
	[125 / 128, 0.65928],
	[124 / 128, 0.57492],
	[123 / 128, 0.51117],
	[122 / 128, 0.46604],
	[109 / 128, 0.33304],
	[94 / 128, 0.18719],
	[79 / 128, 0.05702],
	[64 / 128, -0.0608],
	[58 / 128, -0.10648],
	[36 / 128, -0.27805],
	[22 / 128, -0.38289],
	[13 / 128, -0.2973],
	[9 / 128, -0.2222],
	[8 / 128, -0.20196],
	[7 / 128, -0.18109],
	[0, 0.0]
];

export const GHIA_RE1000_V: [x: number, v: number][] = [
	[128 / 128, 0.0],
	[124 / 128, -0.21388],
	[123 / 128, -0.27669],
	[122 / 128, -0.33714],
	[121 / 128, -0.39188],
	[116 / 128, -0.5155],
	[110 / 128, -0.42665],
	[103 / 128, -0.31966],
	[64 / 128, 0.02526],
	[30 / 128, 0.32235],
	[29 / 128, 0.33075],
	[20 / 128, 0.37095],
	[12 / 128, 0.32627],
	[10 / 128, 0.30353],
	[9 / 128, 0.29012],
	[8 / 128, 0.27485],
	[0, 0.0]
];

/**
 * Botella and Peyret (1998), Computers and Fluids 27, 421–433: the spectral (essentially exact) solution at the same nodes,
 * as read in Povitsky (u) and the University of Bonn tables (v). Ghia's own second-order table differs from it by up to
 * 0.0063 in u and 0.0185 in v, so an exact solver shows that much apparent error against Ghia.
 */
export const BOTELLA_PEYRET_RE1000_U: [y: number, u: number][] = [
	[128 / 128, 1.0],
	[125 / 128, 0.6644227],
	[124 / 128, 0.5808359],
	[123 / 128, 0.5169277],
	[122 / 128, 0.4723329],
	[109 / 128, 0.3372212],
	[94 / 128, 0.1886747],
	[79 / 128, 0.0570178],
	[64 / 128, -0.0620561],
	[58 / 128, -0.1081999],
	[36 / 128, -0.2803696],
	[22 / 128, -0.3885691],
	[13 / 128, -0.3004561],
	[9 / 128, -0.2228955],
	[8 / 128, -0.20233],
	[7 / 128, -0.1812881],
	[0, 0.0]
];

export const BOTELLA_PEYRET_RE1000_V: [x: number, v: number][] = [
	[128 / 128, 0.0],
	[124 / 128, -0.227923],
	[123 / 128, -0.293687],
	[122 / 128, -0.355321],
	[121 / 128, -0.410375],
	[116 / 128, -0.526439],
	[110 / 128, -0.426455],
	[103 / 128, -0.320214],
	[64 / 128, 0.025799],
	[30 / 128, 0.325359],
	[29 / 128, 0.333992],
	[20 / 128, 0.376919],
	[12 / 128, 0.333044],
	[10 / 128, 0.30991],
	[9 / 128, 0.29627],
	[8 / 128, 0.280706],
	[0, 0.0]
];

/**
 * de Vahl Davis (1983), Int. J. Numer. Methods Fluids 3, 249–264: natural convection of air (Pr = 0.71) in a
 * square cavity, hot left wall, cold right wall, adiabatic top and bottom. Velocities are scaled by α/H.
 */
export interface DeVahlDavis {
	rayleigh: number;
	/**
	 * Average Nusselt number over the whole cavity (Table V, Nu_avg). In the exact solution it equals the hot-wall average,
	 * which Table V prints slightly differently (1.117, 2.238, 4.509 and 8.817 at Ra 1e3 to 1e6).
	 */
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
