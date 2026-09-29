import { C } from './physics';

const grouped = new Intl.NumberFormat('en-US');

/** A speed as a fraction of c, with enough digits to tell 0.99 from 0.999 from 0.9999. */
export function formatBeta(beta: number) {
	const digits = Math.min(6, Math.max(2, Math.ceil(-Math.log10(1 - beta) - 1e-9)));
	return beta.toFixed(digits);
}

/** The Lorentz factor, with fewer decimals as it grows. */
export function formatGamma(g: number) {
	if (g < 10) return g.toFixed(2);
	if (g < 100) return g.toFixed(1);
	return grouped.format(Math.round(g));
}

export const formatSpeedKmS = (beta: number) => `${grouped.format(Math.round((beta * C) / 1000))} km/s`;

/** Years with one decimal, or two below a year. */
export const formatYears = (years: number) => `${years < 1 ? years.toFixed(2) : years.toFixed(1)} yr`;

/** A probability as a percentage, or as "1 in N" once it is too small for a percentage to read well. */
export function formatChance(p: number) {
	if (p >= 0.001) return `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
	if (p <= 0) return '0%';
	const oneIn = 1 / p;
	if (oneIn >= 1e12) return 'less than 1 in a trillion';
	if (oneIn >= 1e9) return `1 in ${(oneIn / 1e9).toFixed(oneIn < 1e10 ? 1 : 0)} billion`;
	if (oneIn >= 1e6) return `1 in ${(oneIn / 1e6).toFixed(oneIn < 1e7 ? 1 : 0)} million`;
	return `1 in ${grouped.format(Math.round(oneIn))}`;
}

export const formatMicroseconds = (seconds: number) => `${(seconds * 1e6).toFixed(1)} μs`;
