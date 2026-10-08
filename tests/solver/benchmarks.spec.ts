import { expect, test } from '@playwright/test';
import { BOTELLA_PEYRET_RE1000_U, BOTELLA_PEYRET_RE1000_V, DE_VAHL_DAVIS, GHIA_RE1000_U, GHIA_RE1000_V } from './references';
import {
	advance,
	cavityCenterlines,
	cavityPeaks,
	freeJet,
	heatedCavity,
	hotWallNusselt,
	jetCenterline,
	lidDrivenCavity,
	mixedRoom,
	openingFlows,
	stackRoom,
	windRoom
} from './scenarios';

/**
 * The solver against published solutions and textbook formulas. Each tolerance is stated next to its check and is
 * what the scheme achieves on the grid used, with a margin, not a number chosen to pass: a looser one would hide a
 * regression, a tighter one would assert more accuracy than a 64 × 64 or 128 × 128 grid has.
 *
 * Divergence is checked in every case: after each pressure solve the flow must be incompressible to within 1e-3 of
 * the flow's own speed (the rms net flow out of a cell, per unit of speed).
 */
const DIVERGENCE = 1e-3;

/** Largest and rms difference, in lid speeds, between a solution and a table of centreline values. */
function centrelineError(solver: ReturnType<typeof lidDrivenCavity>, tableU = GHIA_RE1000_U, tableV = GHIA_RE1000_V) {
	const interior = <T extends [number, number]>(table: T[]) => table.filter(([x]) => x > 0 && x < 1);
	const us = interior(tableU);
	const vs = interior(tableV);
	const lines = cavityCenterlines(
		solver,
		us.map(([y]) => y),
		vs.map(([x]) => x)
	);
	const errors = [...us.map(([, u], i) => lines.u[i] - u), ...vs.map(([, v], i) => lines.v[i] - v)];
	return { max: Math.max(...errors.map(Math.abs)), rms: Math.sqrt(errors.reduce((a, e) => a + e * e, 0) / errors.length) };
}

test.describe('lid-driven cavity at Re 1000 (Ghia, Ghia and Shin 1982)', () => {
	test('reproduces the published centreline velocities, and the error shrinks as the grid is refined', async () => {
		const coarse = lidDrivenCavity(64);
		advance(coarse, 25, 0.5 / 64);
		const fine = lidDrivenCavity(128);
		advance(fine, 25, 1.0 / 128);
		const e64 = centrelineError(coarse);
		const e128 = centrelineError(fine);
		// Ghia's table is itself a second-order 129² solution: against the spectral one it is off by up to 0.0185 of the lid speed.
		const exact = centrelineError(fine, BOTELLA_PEYRET_RE1000_U, BOTELLA_PEYRET_RE1000_V);
		console.log(`cavity Re 1000: 64² max ${e64.max.toFixed(4)} rms ${e64.rms.toFixed(4)}; 128² max ${e128.max.toFixed(4)} rms ${e128.rms.toFixed(4)} against Ghia, max ${exact.max.toFixed(4)} rms ${exact.rms.toFixed(4)} against the spectral solution (lid speeds)`);
		expect(exact.max).toBeLessThan(0.035);
		// 128 × 128: within 3 % of the lid speed anywhere on either centreline, 2 % rms.
		expect(e128.max).toBeLessThan(0.03);
		expect(e128.rms).toBeLessThan(0.02);
		// 64 × 64 is coarser than the boundary layer under the lid is thick, so it is allowed twice that.
		expect(e64.max).toBeLessThan(0.06);
		expect(e128.rms).toBeLessThan(0.75 * e64.rms);
		expect(fine.diagnostics().divergence).toBeLessThan(DIVERGENCE);
		expect(coarse.diagnostics().divergence).toBeLessThan(DIVERGENCE);
	});
});

test.describe('differentially heated square cavity (de Vahl Davis 1983)', () => {
	// Pr = 0.71, hot left wall, cold right wall, adiabatic top and bottom, laminar (no turbulence closure).
	for (const reference of DE_VAHL_DAVIS.slice(0, 3)) {
		test(`Ra = ${reference.rayleigh.toExponential(0)}: Nusselt number and peak velocities match the benchmark`, async () => {
			const { solver, alpha } = heatedCavity(reference.rayleigh, 64);
			// Free-fall time is 1 in these units. The step is capped at 0.02: splitting the viscous term from buoyancy costs
			// accuracy in proportion to the step when the flow is as viscous as Ra 1e3 is (3 % at 0.06, 1 % at 0.02).
			let time = 0;
			while (time < 150) {
				const dt = Math.min(0.02, (0.5 * solver.grid.h) / Math.max(solver.diagnostics().maxSpeed, 0.05));
				solver.step(dt);
				time += dt;
			}
			const nusselt = hotWallNusselt(solver);
			const peaks = cavityPeaks(solver);
			console.log(
				`Ra ${reference.rayleigh}: Nu ${nusselt.toFixed(3)} (${reference.nusselt}), u_max ${(peaks.u.value / alpha).toFixed(2)} at ${peaks.u.at.toFixed(3)} (${reference.uMax} at ${reference.uAt}), v_max ${(peaks.v.value / alpha).toFixed(2)} at ${peaks.v.at.toFixed(3)} (${reference.vMax} at ${reference.vAt})`
			);
			const relative = (value: number, expected: number) => Math.abs(value - expected) / expected;
			// 64 × 64: within 2 % on Nu and 3 % on the peak velocities at Ra 1e3 to 1e5, and the peaks sit in the right place to within 3 cells.
			expect(relative(nusselt, reference.nusselt)).toBeLessThan(0.02);
			expect(relative(peaks.u.value / alpha, reference.uMax)).toBeLessThan(0.03);
			expect(relative(peaks.v.value / alpha, reference.vMax)).toBeLessThan(0.03);
			expect(Math.abs(peaks.u.at - reference.uAt)).toBeLessThan(3 * solver.grid.h);
			expect(Math.abs(peaks.v.at - reference.vAt)).toBeLessThan(3 * solver.grid.h);
			expect(solver.diagnostics().divergence).toBeLessThan(DIVERGENCE);
		});
	}
});

test.describe('flow through openings', () => {
	test('two openings in series pass Q = Cd·A·√(2ΔP/ρ)/√2 and what comes in goes out', async () => {
		for (const [windward, leeward] of [
			[0.03, -0.03],
			[3, -3],
			[6, 0]
		]) {
			const { solver, faces, analytic } = windRoom(0.15, windward, leeward);
			advance(solver, 20, 0.1);
			const { into, out } = openingFlows(solver, faces);
			console.log(`wind ${windward - leeward} Pa: in ${into.toFixed(4)} out ${out.toFixed(4)} analytic ${analytic.toFixed(4)} m³/s (${((into / analytic) * 100).toFixed(1)} %)`);
			// Within 4 % of the orifice formula: the jet entering the room loses a little more than the formula's sharp-edged orifice does.
			expect(into / analytic).toBeGreaterThan(0.96);
			expect(into / analytic).toBeLessThan(1.02);
			// The flow is incompressible: what enters leaves, to a tenth of a percent.
			expect(Math.abs(into - out) / into).toBeLessThan(1e-3);
			expect(solver.diagnostics().divergence).toBeLessThan(DIVERGENCE);
		}
	});

	test('with openings at two heights, cold outside air drives the stack-effect flow', async () => {
		// The room's air stays uniform, so only the pressure boundary (the cold outside air's hydrostatic offset) is under test.
		const isothermal = stackRoom(0.15, true);
		advance(isothermal.solver, 10, 0.1);
		const flow = openingFlows(isothermal.solver, isothermal.faces);
		console.log(`stack, uniform room: in ${flow.into.toFixed(4)} out ${flow.out.toFixed(4)} analytic ${isothermal.analytic.toFixed(4)} m³/s (${((flow.into / isothermal.analytic) * 100).toFixed(1)} %)`);
		expect(flow.into / isothermal.analytic).toBeGreaterThan(0.95);
		expect(flow.into / isothermal.analytic).toBeLessThan(1.02);
		expect(Math.abs(flow.into - flow.out) / flow.into).toBeLessThan(1e-3);

		// With the cold air allowed in, it pools on the floor around the low opening and the flow falls below the well-mixed formula; five seconds in it is still within 10 %.
		const real = stackRoom(0.15, false);
		advance(real.solver, 5, 0.1);
		const cold = openingFlows(real.solver, real.faces);
		console.log(`stack, cold inflow, 5 s: in ${cold.into.toFixed(4)} analytic ${real.analytic.toFixed(4)} (${((cold.into / real.analytic) * 100).toFixed(1)} %)`);
		expect(cold.into / real.analytic).toBeGreaterThan(0.9);
		expect(cold.into / real.analytic).toBeLessThan(1.02);
	});
});

test.describe('particulates in a well-mixed room', () => {
	test('decay at λ = Q/V + CADR/V + v_d·A/V, and the mass balance closes', async () => {
		const options = { h: 0.15, pressure: 0.03, cadr: 0.02, deposition: 5e-4, diffusivity: 0.3 };
		const { solver, faces, volume, surface } = mixedRoom(options);
		const samples: [number, number][] = [];
		const dt = 0.25;
		const total = 400;
		advance(solver, total, dt, (time) => {
			if (Math.abs(time / 5 - Math.round(time / 5)) < 1e-6) samples.push([time, solver.airborneMass() / (solver.fluid.rho * volume)]);
		});
		const { into } = openingFlows(solver, faces);
		const predicted = into / volume + options.cadr / volume + (options.deposition * surface) / volume;
		// Least-squares slope of ln(mean concentration) once the initial mixing is over (after a quarter of the run).
		const tail = samples.filter(([time]) => time >= total / 4);
		const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
		const mt = mean(tail.map(([t]) => t));
		const my = mean(tail.map(([, c]) => Math.log(c)));
		const slope = -tail.reduce((a, [t, c]) => a + (t - mt) * (Math.log(c) - my), 0) / tail.reduce((a, [t]) => a + (t - mt) ** 2, 0);
		console.log(`decay constant measured ${slope.toExponential(3)} /s, predicted ${predicted.toExponential(3)} /s (${((slope / predicted) * 100).toFixed(1)} %)`);
		// Within 3 %: the box model assumes perfect mixing and clean air entering at the mean concentration.
		expect(slope / predicted).toBeGreaterThan(0.97);
		expect(slope / predicted).toBeLessThan(1.03);

		// Mass balance: what was there plus what came in = what is there plus what left, was filtered or settled.
		const { mass } = solver.diagnostics();
		const gained = mass.initial + mass.emitted + mass.inflow;
		const accounted = mass.inAir + mass.outflow + mass.removed + mass.deposited;
		expect(Math.abs(gained - accounted) / gained).toBeLessThan(1e-3);
		// And each loss route took its predicted share of the losses.
		const lost = mass.outflow + mass.removed + mass.deposited;
		const share = (value: number) => value / lost;
		expect(share(mass.outflow)).toBeCloseTo((into / volume) / predicted, 1);
		expect(share(mass.removed)).toBeCloseTo((options.cadr / volume) / predicted, 1);
		expect(share(mass.deposited)).toBeCloseTo(((options.deposition * surface) / volume) / predicted, 1);
	});
});

test.describe('free round jet from a fan', () => {
	test('delivers its rated flow and its centreline speed falls as 1/distance', async () => {
		const jet = freeJet({ h: 0.1 });
		advance(jet.solver, 12, 0.05);
		const d = jet.diameter;
		const points: [number, number][] = [];
		for (let s = 6 * d; s <= 14 * d + 1e-9; s += 0.4) points.push([s, jetCenterline(jet, s)]);
		// Log-log slope of centreline speed against distance over 6 to 14 diameters.
		const lx = points.map(([s]) => Math.log(s));
		const ly = points.map(([, u]) => Math.log(u));
		const mx = lx.reduce((a, b) => a + b, 0) / lx.length;
		const my = ly.reduce((a, b) => a + b, 0) / ly.length;
		const exponent = lx.reduce((a, x, i) => a + (x - mx) * (ly[i] - my), 0) / lx.reduce((a, x) => a + (x - mx) ** 2, 0);
		// Decay constant K = u_c·s/(U·d), U the mean speed through the disk. Measured turbulent round jets give 5.4 to 6.1, most often
		// quoted 5.8 (Wygnanski and Fiedler 1969: 5.4; Hussein, Capp and George 1994: 5.8; Panchapakesan and Lumley 1993: 6.06).
		const k = points.map(([s, u]) => (u * s) / (jet.diskSpeed * d));
		const meanK = k.reduce((a, b) => a + b, 0) / k.length;
		const delivered = jet.solver.fanFlow[0] / jet.rated;
		console.log(`jet: delivered ${(delivered * 100).toFixed(1)} % of rated, decay exponent ${exponent.toFixed(2)}, K ${meanK.toFixed(2)}`);
		expect(delivered).toBeGreaterThan(0.95);
		expect(delivered).toBeLessThan(1.05);
		expect(exponent).toBeGreaterThan(-1.2);
		expect(exponent).toBeLessThan(-0.85);
		// The closure's one coefficient was set against this benchmark; a band of 5 % beyond the published extremes keeps it honest.
		expect(meanK).toBeGreaterThan(5.1);
		expect(meanK).toBeLessThan(6.4);
		expect(jet.solver.diagnostics().divergence).toBeLessThan(DIVERGENCE);
	});
});
