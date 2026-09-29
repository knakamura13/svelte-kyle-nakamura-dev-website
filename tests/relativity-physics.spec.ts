import { expect, test } from '@playwright/test';
import { formatBeta, formatChance, formatGamma, formatYears } from '../src/lib/experiments/relativity/format';
import {
	C,
	MUON_LIFETIME_S,
	YEAR_S,
	addVelocities,
	betaFromGamma,
	betaFromNines,
	gamma,
	gpsClockDrift,
	gravityRate,
	lightClockHalfTick,
	muonDecayLength,
	muonSurvival,
	ninesFromBeta,
	muonTrip,
	reachesGround,
	seededRandom,
	twinTrip,
	twinTripAt,
	weakFieldSlowdown,
	EARTH_GM
} from '../src/lib/experiments/relativity/physics';

test.describe('special relativity', () => {
	test('the Lorentz factor matches the textbook values', () => {
		expect(gamma(0)).toBe(1);
		expect(gamma(0.6)).toBeCloseTo(1.25, 12);
		expect(gamma(0.8)).toBeCloseTo(5 / 3, 12);
		expect(gamma(0.99)).toBeCloseTo(7.0888, 4);
		expect(gamma(Math.sqrt(3) / 2)).toBeCloseTo(2, 12);
		expect(betaFromGamma(gamma(0.937))).toBeCloseTo(0.937, 12);
	});

	test('the muon slider counts nines', () => {
		expect(betaFromNines(0)).toBeCloseTo(0.9, 12);
		expect(betaFromNines(1 / 3)).toBeCloseTo(0.99, 12);
		expect(betaFromNines(2 / 3)).toBeCloseTo(0.999, 12);
		expect(betaFromNines(1)).toBeCloseTo(0.9999, 12);
		expect(ninesFromBeta(betaFromNines(0.4337))).toBeCloseTo(0.4337, 12);
	});

	test('velocities add but never pass c', () => {
		expect(addVelocities(0.6, 0.5)).toBeCloseTo(1.1 / 1.3, 12);
		expect(addVelocities(1, 0.7)).toBe(1);
		expect(addVelocities(0.999, 0.999)).toBeLessThan(1);
		expect(addVelocities(0, 0.4)).toBe(0.4);
	});

	test('a moving light clock’s photon path is the hypotenuse, gamma times the height', () => {
		for (const beta of [0, 0.3, 0.6, 0.9, 0.99]) {
			const { path, slide, height, duration } = lightClockHalfTick(beta, 1.5);
			expect(path ** 2).toBeCloseTo(height ** 2 + slide ** 2, 9);
			expect(path / height).toBeCloseTo(gamma(beta), 12);
			expect(slide / duration).toBeCloseTo(beta, 12);
		}
	});

	test('a round trip to Sirius at 0.9 c leaves the traveler less than half the age', () => {
		const trip = twinTrip(8.6, 0.9);
		expect(trip.earthYears).toBeCloseTo(19.11, 2);
		expect(trip.travelerYears).toBeCloseTo(8.33, 2);
		expect(trip.contractedLy).toBeCloseTo(8.6 / gamma(0.9), 12);
	});

	test('the ship turns around halfway through the trip', () => {
		expect(twinTripAt(4.2, 0.9, 0).along).toBe(0);
		expect(twinTripAt(4.2, 0.9, 0.5).along).toBe(1);
		expect(twinTripAt(4.2, 0.9, 1).along).toBe(0);
		const end = twinTripAt(4.2, 0.9, 1);
		expect(end.travelerYears).toBeCloseTo(twinTrip(4.2, 0.9).travelerYears, 12);
	});
});

test.describe('muons', () => {
	test('c times the muon lifetime is about 659 m', () => {
		expect(C * MUON_LIFETIME_S).toBeCloseTo(658.64, 1);
	});

	test('time dilation is what lets them reach the ground', () => {
		expect(muonSurvival(0.995, true)).toBeCloseTo(0.1017, 3);
		expect(muonSurvival(0.995, false)).toBeLessThan(1e-9);
		expect(muonDecayLength(0.995, true) / muonDecayLength(0.995, false)).toBeCloseTo(gamma(0.995), 9);
		expect(muonSurvival(0.9999, true)).toBeGreaterThan(muonSurvival(0.99, true));
	});

	test('the muon and the ground agree on the trip, one by dilation and one by contraction', () => {
		const trip = muonTrip(0.995, 15_000);
		expect(trip.muonSeconds * trip.gamma).toBeCloseTo(trip.groundSeconds, 12);
		expect(trip.contractedM / 0.995 / C).toBeCloseTo(trip.muonSeconds, 12);
	});

	test('a shower is reproducible, and survivors are exactly the draws under the survival chance', () => {
		const a = seededRandom(7);
		const b = seededRandom(7);
		const draws = Array.from({ length: 2000 }, () => a());
		expect(draws).toEqual(Array.from({ length: 2000 }, () => b()));
		expect(draws.every((u) => u > 0 && u <= 1)).toBe(true);
		const p = muonSurvival(0.995, true);
		const survivors = draws.filter((u) => reachesGround(u, p)).length;
		expect(survivors / draws.length).toBeGreaterThan(p - 0.03);
		expect(survivors / draws.length).toBeLessThan(p + 0.03);
	});
});

test.describe('general relativity', () => {
	test('a clock slows as it nears the horizon and stops there', () => {
		expect(gravityRate(1)).toBe(0);
		expect(gravityRate(3)).toBeCloseTo(Math.sqrt(2 / 3), 12);
		expect(1 - gravityRate(1e6)).toBeCloseTo(5e-7, 9);
	});

	test('Earth’s surface clock loses about 22 milliseconds a year to a far-away one', () => {
		const fraction = weakFieldSlowdown(EARTH_GM, 6_371_000);
		expect(fraction).toBeCloseTo(6.96e-10, 12);
		expect(fraction * YEAR_S).toBeCloseTo(0.022, 3);
	});

	test('GPS clocks gain about 38 microseconds a day, which would be about 11 km of error', () => {
		const gps = gpsClockDrift();
		expect(gps.gravityUsPerDay).toBeGreaterThan(45.4);
		expect(gps.gravityUsPerDay).toBeLessThan(46);
		expect(gps.motionUsPerDay).toBeGreaterThan(-7.4);
		expect(gps.motionUsPerDay).toBeLessThan(-7);
		expect(gps.netUsPerDay).toBeGreaterThan(38.2);
		expect(gps.netUsPerDay).toBeLessThan(38.8);
		expect(gps.rangeErrorKmPerDay).toBeGreaterThan(11);
		expect(gps.rangeErrorKmPerDay).toBeLessThan(12);
		expect(gps.speedKmS).toBeCloseTo(3.87, 2);
	});
});

test.describe('formatting', () => {
	test('speeds keep enough digits to tell the nines apart', () => {
		expect(formatBeta(0.6)).toBe('0.60');
		expect(formatBeta(0.99)).toBe('0.99');
		expect(formatBeta(0.999)).toBe('0.999');
		expect(formatBeta(0.9999)).toBe('0.9999');
		expect(formatBeta(0)).toBe('0.00');
	});

	test('the Lorentz factor loses decimals as it grows', () => {
		expect(formatGamma(1.25)).toBe('1.25');
		expect(formatGamma(70.71)).toBe('70.7');
		expect(formatGamma(1234.5)).toBe('1,235');
	});

	test('chances read as percentages until they are tiny', () => {
		expect(formatChance(0.1017)).toBe('10%');
		expect(formatChance(0.039)).toBe('3.9%');
		expect(formatChance(0.72)).toBe('72%');
		expect(formatChance(1.14e-10)).toBe('1 in 8.8 billion');
		expect(formatChance(2e-5)).toBe('1 in 50,000');
		expect(formatChance(0)).toBe('0%');
	});

	test('years get two decimals below one year', () => {
		expect(formatYears(0.456)).toBe('0.46 yr');
		expect(formatYears(9.4356)).toBe('9.4 yr');
	});
});
