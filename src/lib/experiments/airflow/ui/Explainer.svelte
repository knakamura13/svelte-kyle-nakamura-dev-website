<script lang="ts">
	import { reveal } from '$lib/motion/reveal';
</script>

<section class="portfolio-background experiment-close" aria-labelledby="how-heading" use:reveal>
	<div><h2 id="how-heading">How it<br />works.</h2></div>
	<div class="background-copy">
		<ol class="takeaways">
			<li>
				<strong>The home is cut into small cubes of air.</strong> They are 5 to 10 cm across on a fast graphics card and about 20 cm without one. Each
				remembers how fast the air in it moves, its pressure, its temperature, and how much smoke it holds.
			</li>
			<li>
				<strong>Every step moves the air, pushes it, smooths it, then fixes the pressure.</strong> Motion is carried along the flow. Warm air is pushed up,
				cold air down, and fan blades push along their axis. Swirls too small to see mix the air, which is modelled as extra stickiness that grows where
				the air shears fast. Last, the pressure is corrected so no air is made or lost: what flows into a cube flows out. That last step is most of the
				work. This is Fast Fluid Dynamics, which Stam described for animation in 1999 and Zuo and Chen applied to rooms in 2009.
			</li>
			<li>
				<strong>Fans are discs that push, and they push less when the room pushes back.</strong> Each model’s push is set so that, in open air, the flow
				through its blades equals its rated flow. Against the free-jet benchmark a simulated fan delivers its rating to within 2&nbsp;% and its jet slows as 1 over
				the distance, with the decay constant measurements of real jets give (5.7 to 6.1).
			</li>
			<li>
				<strong>Outdoors is not simulated; an open window meets the weather.</strong> Each opening takes the wind’s pressure on its wall, which depends on
				the wind’s direction and speed and on which side of the home the wall faces, plus the pressure that warm and cold air make at different heights.
				Air crossing an opening follows the orifice equation: flow is 0.62 × open area × √(2 × pressure difference ÷ density). The open area is exact, so
				a window open halfway passes the flow of half its fully open area, whatever the grid.
			</li>
			<li>
				<strong>Smoke is fine particulate matter, PM2.5.</strong> The air carries it and swirls spread it. It settles slowly, sticks to surfaces, leaves
				through openings, and is removed by purifiers at their rated clean air delivery rate. The Physics panel adds it all up: smoke released and let in
				equals smoke still in the air plus smoke that left, was filtered, or settled. The two sides agree to rounding.
			</li>
			<li>
				<strong>The solver is checked against published results.</strong> Each of these runs in the test suite: air in a lid-driven cavity at Reynolds number
				1000 (Ghia and colleagues), natural convection in a heated cavity (de Vahl Davis), flow through two openings, the stack effect, the decay of smoke in
				a well-mixed room, and the slowing of a fan’s jet.
			</li>
			<li>
				<strong>On a fast graphics card it uses WebGPU; otherwise it still runs.</strong> The same algorithm runs on the processor in a worker at a coarser
				grid, and the page says so when it does.
			</li>
		</ol>
	</div>
</section>

<section class="portfolio-background experiment-close" aria-labelledby="not-heading" use:reveal>
	<div><h2 id="not-heading">What it<br />isn’t.</h2></div>
	<div class="background-copy">
		<p class="scale-note">
			<strong>It is not engineering or health advice.</strong> It cannot tell you how many air changes your own home gets, whether the air in it is safe to
			breathe, or which purifier to buy. It shows how air behaves when you change one thing at a time, and that is all it has been checked for.
		</p>
		<ul class="sources">
			<li>The weather outside is a pressure and a temperature at each opening. Nothing outdoors is simulated, so there are no gusts, no neighbouring buildings, and no sun.</li>
			<li>
				The wind slider is the speed a weather report gives, measured 10 m up over open ground. The home gets about 55&nbsp;% of it at the eaves, as on a suburban lot.
				That is the top of the 44 to 55&nbsp;% that published tables give for such a lot, so the wind’s push on the home is on the high side. Open country would be about
				85&nbsp;% and a city about 30&nbsp;%.
			</li>
			<li>
				The wind’s effect on each wall uses averages for an isolated low-rise building. They come from a fit made on buildings whose eaves were 0.1 to 0.4 times as high
				as their short wall is wide. The studio’s eaves are about half as high as its short wall is wide, so for the studio the fit is used outside its range. A real
				home’s surroundings change the pressures a lot.
			</li>
			<li>There are no heat sources, no sunlight through windows, no heat through walls, and no humidity. Warm and cold air come only from the temperatures you set.</li>
			<li>The four homes are single-story and rectangular, with fixed furniture. Doors and windows stay where they are drawn.</li>
			<li>
				A window’s free area is less than its frame. Published figures put a double-hung or sliding window at about 40 to 50&nbsp;% of its frame and a single casement sash
				at about 80&nbsp;%. The model uses half for a double-hung window and a sliding door, and all of the frame for a casement and a door, so a casement passes more air
				here than those figures suggest. Every opening also uses one discharge coefficient, 0.62, although measured windows range from 0.2 to 1.
			</li>
			<li>Turbulence is modelled, not resolved. Swirls smaller than a few centimetres, and the thin layers of air at walls, are approximated.</li>
			<li>
				Fans and purifiers are idealised: a disc that pushes by the model’s rated flow, and a region that cleans at its rated rate. Real ones vary with age, filters and where
				they stand. The flows are the makers’ ratings, and none of the sheets read names the test behind its rating.
			</li>
			<li>
				Particulates are PM2.5 only, as a mass in the air. Bigger particles, gases, and anything that changes the particles (such as moisture) are left out. Their
				settling and deposition speeds are rough: published loss rates for one size of particle differ by several times between a quiet room, a test chamber and an
				occupied house, and no source gives these speeds directly.
			</li>
			<li>The smoke amounts marked on the smoke slider (a candle, incense, frying and a cooking burst) are placeholders, not measurements.</li>
		</ul>
	</div>
</section>

<section class="portfolio-background experiment-close" aria-labelledby="sources-heading" use:reveal>
	<div><h2 id="sources-heading">Sources.</h2></div>
	<div class="background-copy">
		<p class="scale-note">Each entry says what it was used for. Where it says the original was not read, the numbers were taken from later papers that print them.</p>

		<h3>The benchmarks</h3>
		<ul class="sources">
			<li>
				Ghia, Ghia and Shin,
				“<a href="https://doi.org/10.1016/0021-9991(82)90058-4" target="_blank" rel="noopener noreferrer"
					>High-Re solutions for incompressible flow using the Navier–Stokes equations and a multigrid method</a
				>,” <i>Journal of Computational Physics</i> 48, 387–411 (1982): the lid-driven cavity at Reynolds number 1000, with the velocity along both centrelines. The values are
				as transcribed in three or four later sources; the original was not read.
			</li>
			<li>
				Botella and Peyret, “Benchmark spectral results on the lid-driven cavity flow,” <i>Computers &amp; Fluids</i> 27, 421–433 (1998): the same cavity solved almost exactly,
				so the solver can be compared with that as well as with Ghia’s table. The values are as printed in later papers; the original was not read.
			</li>
			<li>
				Povitsky, “Mixing in Three-dimensional Cavity by Moving Cavity Walls,”
				<a href="https://arxiv.org/abs/1807.04896" target="_blank" rel="noopener noreferrer">arXiv:1807.04896</a> (2018): the appendix tables of the two cavity solutions above, read in the paper.
			</li>
			<li>
				de Vahl Davis, “<a href="https://doi.org/10.1002/fld.1650030305" target="_blank" rel="noopener noreferrer"
					>Natural convection of air in a square cavity: a bench mark numerical solution</a
				>,” <i>International Journal for Numerical Methods in Fluids</i> 3, 249–264 (1983): the heated cavity at Rayleigh numbers 10³ to 10⁶, from its Table V. The table was read on a scan
				of the paper.
			</li>
			<li>
				Hortmann, Perić and Scheuerer, “<a href="https://doi.org/10.1002/fld.1650110206" target="_blank" rel="noopener noreferrer"
					>Finite volume multigrid prediction of laminar natural convection: bench-mark solutions</a
				>,” <i>International Journal for Numerical Methods in Fluids</i> 11, 189–207 (1990), with later solutions by Le Quéré (1991), Mayne, Usmani and Crapper (2000) and
				Sharma, Straka and Tavares (2018): finer solutions of the same cavity, used to cross-check de Vahl Davis’s table. None of the originals was read; the values are as
				printed in later papers and on the ERCOFTAC knowledge base.
			</li>
			<li>
				Wygnanski and Fiedler, “Some measurements in the self-preserving jet,” <i>Journal of Fluid Mechanics</i> (1969): how fast a free round jet slows, as a constant of about
				5.7 in one later compilation and 5.4 in another. Only the abstract was read.
			</li>
			<li>
				Hussein, Capp and George, “Velocity measurements in a high-Reynolds-number, momentum-conserving, axisymmetric, turbulent jet,” <i>Journal of Fluid Mechanics</i> (1994):
				the same constant, about 5.8, as printed in later papers. Only the abstract was read.
			</li>
			<li>
				Panchapakesan and Lumley, “Turbulence measurements in axisymmetric jets of air and helium. Part 1. Air jet,” <i>Journal of Fluid Mechanics</i> (1993): the same
				constant, about 6.06, as printed in later papers. Only the abstract was read.
			</li>
			<li>
				Pope, <i>Turbulent Flows</i> (Cambridge University Press, 2000): the jet’s decay law and a typical constant of 5.8, as quoted in a later paper and in lecture notes. The
				book was not read.
			</li>
			<li>
				Kiran, Ayanian and Breuer, “The Structure of Merging Turbulent Jets Beneath a Small Quadrotor,”
				<a href="https://arxiv.org/abs/2608.30900" target="_blank" rel="noopener noreferrer">arXiv:2608.30900</a> (2026): the table the constants above were read in, and the
				range of 5.7 to 6.1 it gives for jets at high Reynolds number. Bhatia and De (<a href="https://arxiv.org/abs/2101.08749" target="_blank" rel="noopener noreferrer"
					>arXiv:2101.08749</a
				>) and Yang and Xu (<a href="https://arxiv.org/abs/2507.14524" target="_blank" rel="noopener noreferrer">arXiv:2507.14524</a>) also print them.
			</li>
		</ul>

		<h3>Flow through openings, and wind on walls</h3>
		<ul class="sources">
			<li>
				Swami and Chandra, “Procedures for Calculating Natural Ventilation Airflow Rates in Buildings,” report FSEC-CR-163-86, Florida Solar Energy Center (1987), for ASHRAE
				research project 448-RP: the wall pressure coefficients and the range of buildings they were fitted to, the discharge coefficient of 0.62, and the rule for two
				openings in series. Read on the scanned report.
			</li>
			<li>
				<i>EnergyPlus Engineering Reference</i>, version 9.6, sections “AirflowNetwork Model” and “Outside Surface Heat Balance”: the pressure coefficient formula as
				EnergyPlus documents it, and the law for wind speed with height, with its terrain values. Read as web pages. The ASHRAE Handbook it cites for the terrain values was not
				read.
			</li>
			<li>
				Persily and Ivy, “<a href="https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir6585.pdf" target="_blank" rel="noopener noreferrer"
					>Input Data for Multizone Airflow and IAQ Analysis</a
				>,” NISTIR 6585, National Institute of Standards and Technology (2001): a table of pressure coefficients that agrees with the fit to within 0.001, used as a check, and the
				orifice equation. Read on scanned pages.
			</li>
			<li>
				Orme, Liddament and Wilson, “Numerical Data for Air Infiltration and Natural Ventilation Calculations,” Technical Note 44, Air Infiltration and Ventilation Centre (1998
				printing): pressure coefficients for exposed, semi-sheltered and sheltered sites, compared with the fit, and three of the four wind-speed tables behind the 44 to 55&nbsp;%. Read by
				eye on scanned pages.
			</li>
			<li>
				Klote, “<a href="https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir4588.pdf" target="_blank" rel="noopener noreferrer">A General Routine for Analysis of Stack Effect</a
				>,” NISTIR 4588, National Institute of Standards and Technology (1991): the flow through two openings at different heights, and where the neutral level sits. The equations
				were re-derived as a check.
			</li>
			<li>
				Dols and Polidoro,
				<a href="https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1887r1.pdf" target="_blank" rel="noopener noreferrer"
					><i>CONTAM User Guide and Program Documentation</i>, version 3.4</a
				>, NIST Technical Note 1887 Rev. 1 (2020): the orifice equation, and the flow through one tall opening.
			</li>
			<li>
				Jones, Cook, Fitzgerald and Iddon, “A review of ventilation opening area terminology,” <i>Energy and Buildings</i> 118 (2016): how openings combine in series and in
				parallel. Read as the accepted manuscript.
			</li>
			<li>
				Karava, Stathopoulos and Athienitis, “Natural ventilation openings – a discussion of discharge coefficients,” Concordia University conference paper: the wide range of
				discharge coefficients measured for windows and doors, about 0.2 to 1.
			</li>
			<li>
				Heiselberg, Svidt and Nielsen, “Windows – measurements of air flow capacity,” <i>ROOMVENT 2000</i>, 749–754: measured flow through windows, which changes with how far
				they open, their type and the pressure.
			</li>
			<li>
				Fernandes and others, “Evaluation of discharge coefficients of large openable windows using full-scale samples in wind tunnel tests,” <i>Revista Ingeniería de
				Construcción</i> 35(2), 203–214 (2020): full-size windows tested in a wind tunnel, with coefficients from 0.06 to 0.55, below the 0.60 to 0.65 often assumed.
			</li>
			<li>
				Breezway, “Comparative Ventilation Openings Of Various Window Types,” technical bulletin (2012): the free area of a single window as a share of its frame, 41 to 43&nbsp;% for
				double-hung and sliding windows and 78 to 80&nbsp;% for a casement sash, and less for larger units with several panels. It is one maker’s bulletin, measured on Australian
				aluminium windows.
			</li>
			<li>
				International Code Council, “Code Corner: 2024 International Mechanical Code Chapter 4 Ventilation,” <i>Building Safety Journal</i>: its commentary counts only half of a
				double-hung window as openable.
			</li>
		</ul>

		<h3>Smoke in a well-mixed room</h3>
		<ul class="sources">
			<li>
				Nazaroff, “Indoor particle dynamics,” <i>Indoor Air</i> 14 (Suppl. 7), 2004: the balance of particles entering, leaving, settling and being filtered in one room. Its loss
				rates by particle size were read off a graph, so they are good to about 10&nbsp;%.
			</li>
			<li>
				<i>ANSI/AHAM AC-1-2020, Method for Measuring Performance of Portable Household Electric Room Air Cleaners</i>, Association of Home Appliance Manufacturers: the definition of
				clean air delivery rate: the decay rate of smoke in the test room with the cleaner on, minus the decay rate with it off, times the room’s volume.
			</li>
			<li>
				Association of Home Appliance Manufacturers, “Air Cleaner Performance FAQs” (2020) and “Portable Air Cleaners and Air Changes per Hour” (2021): how a rating converts to air
				changes per hour.
			</li>
			<li>
				Howard-Reed, Wallace and Emmerich, “<a href="https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir7068.pdf" target="_blank" rel="noopener noreferrer"
					>Deposition Rates of Fine and Coarse Particles in Residential Buildings</a
				>,” NISTIR 7068, National Institute of Standards and Technology (2003): deposition rates measured in an occupied townhouse, by particle size, with the central fan on and off.
			</li>
			<li>
				Nazaroff, “Mathematical Modeling and Control of Pollutant Dynamics in Indoor Air,” doctoral thesis, California Institute of Technology (1989), chapter 5: how a particle’s
				deposition speed relates to its loss rate and the surface area, and how settling is counted.
			</li>
			<li>
				Sippola and Nazaroff, “Particle Deposition from Turbulent Flow: Review of Published Research and Its Applicability to Ventilation Ducts in Commercial Buildings,” report
				LBNL-51432, Lawrence Berkeley National Laboratory (2002): the formula for settling speed, with its correction for very small particles.
			</li>
		</ul>
		<p class="scale-note">No source above gives the settling and deposition speeds the simulation uses. Those are rough values.</p>

		<h3>Fan and purifier ratings</h3>
		<ul class="sources">
			<li>Air King, spec sheet 9723, 20-inch box fan (updated 3-23): airflow at high, medium and low speed.</li>
			<li>
				Air King, spec sheet 9155, 16-inch window fan (updated 3-23), and spec sheet 9166, 20-inch whole-house window fan (updated 1-24): airflow at three speeds. The maker’s
				product page says either fan can be set to intake or exhaust, and it gives one rating for both directions.
			</li>
			<li>Lasko, product page for the Pro Power 20-inch box fan, B20548: 2,000 cubic feet per minute at high speed. Lasko gives no other speed.</li>
			<li>Lasko, product description for the Cool Colors 20-inch box fan, B20301, B20308 and B20312: 1,725 cubic feet per minute at high speed. The other speeds were not read.</li>
		</ul>
		<p class="scale-note">
			None of these names the test its rating follows. No purifier’s clean air delivery rate has been confirmed from a source yet, so none is listed.
		</p>
	</div>
</section>
