/**
 * The relativity experiment's physics. Pure functions, no DOM: the scenes, the Dock readouts and the
 * tests all read the same numbers. Speeds are fractions of c (`beta`) unless a name says otherwise.
 */

/** Speed of light in vacuum, m/s (exact by definition of the metre). */
export const C = 299_792_458;
export const DAY_S = 86_400;
export const YEAR_S = 31_557_600;

/** Lorentz factor: how many times slower a clock moving at `beta` ticks, as seen by the observer. */
export const gamma = (beta: number) => 1 / Math.sqrt(1 - beta * beta);

/** The speed, as a fraction of c, that has Lorentz factor `g`. */
export const betaFromGamma = (g: number) => Math.sqrt(1 - 1 / (g * g));

/** Maps a slider position (0 to 1) to a speed from 0.9 c to 0.9999 c, spaced by "nines" so that 0.99 c and 0.999 c sit far apart. */
export const betaFromNines = (position: number) => 1 - 10 ** -(1 + 3 * position);

/** The slider position that `betaFromNines` maps to `beta`. */
export const ninesFromBeta = (beta: number) => (-Math.log10(1 - beta) - 1) / 3;

/** Relativistic velocity addition: something moving at `u` inside a frame that moves at `v`. */
export const addVelocities = (u: number, v: number) => (u + v) / (1 + u * v);

/**
 * One half-tick of a light clock as seen by an observer it flies past, in units where c = 1 and the
 * clock's height is `height`. The photon's path is the hypotenuse of a right triangle: the height on
 * one leg, the distance the clock slides forward during the half-tick on the other.
 */
export function lightClockHalfTick(beta: number, height = 1) {
	const g = gamma(beta);
	return { duration: g * height, slide: beta * g * height, path: g * height, height };
}

/** A round trip to a star `distanceLy` light-years away and back, at constant `beta` each way. */
export function twinTrip(distanceLy: number, beta: number) {
	const g = gamma(beta);
	const earthYears = (2 * distanceLy) / beta;
	return {
		gamma: g,
		earthYears,
		travelerYears: earthYears / g,
		/** The distance to the star as the traveler measures it. */
		contractedLy: distanceLy / g
	};
}

/** Where the ship is and what each twin's clock reads once `progress` (0 to 1) of the trip is done. */
export function twinTripAt(distanceLy: number, beta: number, progress: number) {
	const trip = twinTrip(distanceLy, beta);
	return {
		/** 0 at Earth, 1 at the star. */
		along: progress < 0.5 ? progress * 2 : (1 - progress) * 2,
		earthYears: progress * trip.earthYears,
		travelerYears: progress * trip.travelerYears
	};
}

/** Mean proper lifetime of the muon, seconds (Particle Data Group). */
export const MUON_LIFETIME_S = 2.1969811e-6;
/** Roughly where cosmic-ray muons are made, metres above the ground. */
export const MUON_HEIGHT_M = 15_000;
/** How many muons the shower in the Muons chapter follows. */
export const MUON_COUNT = 300;

/** Mean distance a muon travels before decaying, as measured from the ground. */
export const muonDecayLength = (beta: number, dilated: boolean) =>
	beta * (dilated ? gamma(beta) : 1) * C * MUON_LIFETIME_S;

/** Chance that one muon covers `heightM` before it decays. */
export const muonSurvival = (beta: number, dilated: boolean, heightM = MUON_HEIGHT_M) =>
	Math.exp(-heightM / muonDecayLength(beta, dilated));

/** The muon's own trip: ground-clock time, muon-clock time and the height it measures. */
export function muonTrip(beta: number, heightM = MUON_HEIGHT_M) {
	const g = gamma(beta);
	const groundSeconds = heightM / (beta * C);
	return { gamma: g, groundSeconds, muonSeconds: groundSeconds / g, contractedM: heightM / g };
}

/**
 * Deterministic pseudo-random numbers (mulberry32), so a shower of muons decays the same way on every
 * loop and for every visitor. Returns values in (0, 1].
 */
export function seededRandom(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return (((t ^ (t >>> 14)) >>> 0) + 1) / 4294967296;
	};
}

/**
 * A muon whose draw is `u` decays after -length * ln(u), so it reaches the ground exactly when
 * u <= survival. The animation and the readout both use this, so they always agree.
 */
export const reachesGround = (u: number, survival: number) => u <= survival;

export const G = 6.6743e-11;
export const EARTH_GM = 3.986004418e14;
export const EARTH_RADIUS_M = 6_378_137;
/** Semi-major axis of a GPS orbit: about 20,200 km above the surface. */
export const GPS_ORBIT_RADIUS_M = 26_561_750;

/** Schwarzschild radius, 2GM/c², metres. */
export const schwarzschildRadius = (massKg: number) => (2 * G * massKg) / (C * C);

/**
 * How fast a clock at rest `rOverRs` Schwarzschild radii from a non-rotating mass ticks, compared with
 * one far away. Reaches zero at the event horizon.
 */
export const gravityRate = (rOverRs: number) => Math.sqrt(Math.max(0, 1 - 1 / rOverRs));

/** Weak-field slowdown GM/(rc²) of a clock at radius `rM` around a mass with gravitational parameter `gm`. */
export const weakFieldSlowdown = (gm: number, rM: number) => gm / (rM * C * C);

/**
 * How a GPS satellite's clock drifts from a ground clock, microseconds per day: weaker gravity speeds
 * it up, its orbital speed slows it down.
 */
export function gpsClockDrift() {
	const speed = Math.sqrt(EARTH_GM / GPS_ORBIT_RADIUS_M);
	const gravity = (EARTH_GM / (C * C)) * (1 / EARTH_RADIUS_M - 1 / GPS_ORBIT_RADIUS_M);
	const motion = (speed * speed) / (2 * C * C);
	const perDayUs = (fraction: number) => fraction * DAY_S * 1e6;
	const net = gravity - motion;
	return {
		speedKmS: speed / 1000,
		gravityUsPerDay: perDayUs(gravity),
		motionUsPerDay: -perDayUs(motion),
		netUsPerDay: perDayUs(net),
		/** Ranging error that would build up in a day if nobody corrected it. */
		rangeErrorKmPerDay: (net * DAY_S * C) / 1000
	};
}
