<script lang="ts">
	import { reveal } from '$lib/motion/reveal';
</script>

<section class="portfolio-background experiment-close" aria-labelledby="how-heading" use:reveal>
	<div><h2 id="how-heading">How it<br />works.</h2></div>
	<div class="background-copy">
		<ol class="takeaways">
			<li>
				<strong>The home is cut into small cubes of air.</strong> How small depends on the device: finer on a fast graphics card, coarser on the processor, and the Physics panel says the size in use. Each
				remembers how fast the air in it moves, its pressure, its temperature, and how much smoke it holds.
			</li>
			<li>
				<strong>Every step moves the air, pushes it, smooths it, then fixes the pressure.</strong> Motion is carried along the flow. Warm air is pushed up,
				cold air down, and fan blades push along their axis. Swirls too small to see mix the air, which is modelled as extra stickiness that grows with
				the air’s speed and with the width of the stream it is in. Last, the pressure is corrected so no air is made or lost: what flows into a cube flows
				out. This is Fast Fluid Dynamics: Stam described the method for animation in 1999, and Zuo and Chen named it and applied it to rooms in 2009.
			</li>
			<li>
				<strong>Fans are discs that push, and they push less when the room pushes back.</strong> A window fan pushes the same way across the whole window
				it fills. Each model’s push is set so that, in open air, the flow
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
				through openings, and is removed by purifiers at their rated clean air delivery rate. The Physics panel adds it all up: smoke that was already there, released and let in
				equals smoke still in the air plus smoke that left, was filtered, or settled. The two sides agree to within 0.1&nbsp;%, and the panel says so if they stop, as rounding alone can after half an hour in a sealed, still home on the coarse grid a phone runs.
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
			<li>
				The weather outside is a pressure, a temperature and an amount of smoke at each opening. Nothing outdoors is simulated, so there are no gusts, no neighbouring
				buildings, and no sun.
			</li>
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
				The homes are airtight: with every window and door shut, no air comes in or goes out. Real homes leak through cracks, about 0.4 air changes an hour in a typical
				US home with the windows shut, from under 0.2 in a new, tight one to about 1 in an old, leaky one. An open window or a running purifier moves several to many times
				that, so the leaks matter little while one is open or on. They matter most in a home shut against smoke outside, which in a real home slowly comes back in.
			</li>
			<li>
				A window’s free area is less than its frame. Published figures put a double-hung or sliding window at about 40 to 50&nbsp;% of its frame and a single casement sash
				at about 80&nbsp;%. The model uses half of the frame for a double-hung window and a sliding door, about 80&nbsp;% for a casement, and all of it for a door. The
				casement figure is one maker’s measurement, on Australian aluminium windows, and the open sash can funnel or shield the opening in a wind, which the model does not
				do. Every opening also uses one discharge coefficient, 0.62, although measured windows range from under 0.1 to 1.
			</li>
			<li>
				Turbulence is modelled, not resolved. Swirls smaller than the cubes (7.5 to 30&nbsp;cm across, depending on the device), and the thin layers of air at walls, are
				approximated.
			</li>
			<li>
				Fans and purifiers are idealised: a disc that pushes by the model’s rated flow, and a purifier that draws its rated rate of air in through a band of its body and
				blows it out of the top, clean. On every grid it clears a closed room at about the rate its rating implies, a little slower where its own clean air comes back to it.
				Its body is not solid, so about as much air again rises through it into the jet. Real ones vary with age, filters and where they stand. A fan’s flow is the maker’s rating, and none of the fan sheets read names the test behind
				it. A purifier’s rate is its clean air delivery rate for smoke, which is published for the top speed only. Sleep, Low and Medium are derived, not published: the top
				rate times 0.25, 0.5 and 0.75, which assumes the rate follows the fan’s speed. Real purifiers will differ. No maker gives the size of a purifier’s openings, so those
				are estimated from the makers’ drawings.
			</li>
			<li>
				Particulates are PM2.5 only, as one mass in the air. Bigger particles, gases, and anything that changes the particles (such as moisture) are left out. One
				settling speed and one deposition speed stand for every size in that mass, although published loss rates rise 2.6 to 14 times from particles of 0.3&nbsp;µm to
				2.5&nbsp;µm, and the literature prefers two or three sizes where accuracy matters. No source gives the two speeds directly, so both are worked out. Settling, about
				11&nbsp;cm an hour, is the speed of the particles in a published sample of Los Angeles air, averaged over their sizes by mass; it is good to a factor of 3, and fresh
				smoke, which is finer, settles several times slower. Deposition, about 18&nbsp;cm an hour, is what makes the smoke in a closed room fade at the rate measured in
				occupied homes, about 0.4 per hour, once settling’s share is taken out; that rate varies by a factor of 2.5 either way between homes.
			</li>
			<li>
				The smoke amounts marked on the smoke slider are from published measurements, one to a few studies each: a candle releases 0.02&nbsp;mg of PM2.5 a minute,
				incense 0.6 (the middle of a published range), frying 2 and a cooking burst 10. Real sources differ from them by a factor of several or more, with the candle’s
				flame, the kind of incense, the food and the heat. The top mark is about the 95th percentile of 836 smoke releases (cooking and other activities) logged in 18
				apartments in one study, and it sits where measurements of hot or burned cooking cluster, 9 to 16&nbsp;mg a minute.
			</li>
		</ul>
	</div>
</section>

<section class="portfolio-background experiment-close" aria-labelledby="sources-heading" use:reveal>
	<div><h2 id="sources-heading">Sources.</h2></div>
	<div class="background-copy">
		<p class="scale-note">Each entry says what it was used for. Where it says the original was not read, the numbers were taken from later papers that print them.</p>

		<h3>The method</h3>
		<ul class="sources">
			<li>
				Stam, “<a href="https://doi.org/10.1145/311535.311548" target="_blank" rel="noopener noreferrer">Stable Fluids</a>,” <i>Proceedings of SIGGRAPH 99</i>, ACM,
				121–128 (1999): the method each step follows, written for animation. Forces are added, the flow is carried along by itself, smoothed, and then corrected by a
				pressure solve so no fluid is made or lost.
			</li>
			<li>
				Zuo and Chen, “<a href="https://doi.org/10.1111/j.1600-0668.2008.00559.x" target="_blank" rel="noopener noreferrer"
					>Real-time or faster-than-real-time simulation of airflow in buildings</a
				>,” <i>Indoor Air</i> 19, 33–44 (2009): Stam’s method, which they named fast fluid dynamics, applied to airflow in rooms and checked against measured flows. It
				was about 50 times faster than the usual way of simulating airflow, but less accurate. They did best without a turbulence model; the stickiness of small swirls
				used here was set against the jet benchmark below.
			</li>
		</ul>

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
				<a href="https://arxiv.org/abs/1807.04896v3" target="_blank" rel="noopener noreferrer">arXiv:1807.04896v3</a> (2020), later published in
				<i>Theoretical and Computational Fluid Dynamics</i> 34, 593–617 (2020): the appendix tables of the two cavity solutions above, read in the arXiv paper.
			</li>
			<li>
				de Vahl Davis, “<a href="https://doi.org/10.1002/fld.1650030305" target="_blank" rel="noopener noreferrer"
					>Natural convection of air in a square cavity: a bench mark numerical solution</a
				>,” <i>International Journal for Numerical Methods in Fluids</i> 3, 249–264 (1983): the heated cavity at Rayleigh numbers 10³ to 10⁶, from its Table V, of which the
				test suite checks 10³ to 10⁵. The table was read on a scan of the paper.
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
				U.S. Environmental Protection Agency, “<a href="https://www.epa.gov/sites/default/files/2015-09/documents/efh-chapter19.pdf" target="_blank" rel="noopener noreferrer"
					>Exposure Factors Handbook, Chapter 19: Building Characteristics</a
				>” (2011): air change rates measured in about 3,000 US homes, a median of 0.45 per hour and a tenth of homes under 0.18. Some homes had windows open.
			</li>
			<li>
				Persily, Musser and Emmerich, “<a href="https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=904946" target="_blank" rel="noopener noreferrer"
					>Modeled Infiltration Rate Distributions for U.S. Housing</a
				>,” <i>Indoor Air</i> 20, 473–485 (2010): leakage alone, windows shut, about 0.4 per hour in the median US home, and under 0.25 for much of the year in the newest.
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
				Karava, Stathopoulos and Athienitis, “<a href="https://www.irbnet.de/daten/iconda/CIB1749.pdf" target="_blank" rel="noopener noreferrer"
					>Natural ventilation openings – a discussion of discharge coefficients</a
				>,” paper 346, CIB World Building Congress 2004, Toronto (2004): the wide range of discharge coefficients measured for windows and doors, about 0.2 to 1.
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
				International Code Council, “<a
					href="https://www.iccsafe.org/building-safety-journal/bsj-technical/code-corner-2024-international-mechanical-code-chapter-4-ventilation/"
					target="_blank"
					rel="noopener noreferrer">Code Corner: 2024 International Mechanical Code Chapter 4: Ventilation</a
				>,” <i>Building Safety Journal</i> (2025): its commentary counts only half of a double-hung window as openable.
			</li>
		</ul>

		<h3>Smoke in a well-mixed room</h3>
		<ul class="sources">
			<li>
				Nazaroff, “<a href="https://doi.org/10.1111/j.1600-0668.2004.00286.x" target="_blank" rel="noopener noreferrer">Indoor particle dynamics</a>,” <i>Indoor Air</i> 14
				(Suppl. 7), 175–183 (2004): the balance of particles entering, leaving, settling and being filtered in one room; how much faster particles of 2.5&nbsp;µm are lost
				than particles of 0.3&nbsp;µm, from loss rates by particle size read off its Figure 6 to about 5&nbsp;%; and why two or three particle sizes are better than one
				where accuracy matters.
			</li>
			<li>
				<i>ANSI/AHAM AC-1-2020, Method for Measuring Performance of Portable Household Electric Room Air Cleaners</i>, Association of Home Appliance Manufacturers: the definition of
				clean air delivery rate: the decay rate of smoke in the test room with the cleaner on, minus the decay rate with it off, times the room’s volume, in cubic feet per
				minute.
			</li>
			<li>
				Association of Home Appliance Manufacturers, “<a href="https://ahamverifide.org/wp-content/uploads/2020/06/Air-Cleaner-Performance-FAQs.pdf" target="_blank" rel="noopener noreferrer"
					>Frequently Asked Questions about Testing of Portable Air Cleaners</a
				>” (2020) and “<a
					href="https://ahamverifide.org/wp-content/uploads/2021/11/White-Paper-Portable-Air-Cleaners-and-AIr-Changes-per-Hour-FINAL-00106301.pdf"
					target="_blank"
					rel="noopener noreferrer">Portable Air Cleaners and Air Changes per Hour</a
				>” (2021): how a rating converts to air changes per hour, and that a rating is measured at a cleaner’s highest speed.
			</li>
			<li>
				Howard-Reed, Wallace and Emmerich, “<a href="https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir7068.pdf" target="_blank" rel="noopener noreferrer"
					>Deposition Rates of Fine and Coarse Particles in Residential Buildings: Literature Review and Measurements in an Occupied Townhouse</a
				>,” NISTIR 7068, National Institute of Standards and Technology (2003): deposition rates measured in an occupied townhouse, by particle size, with the central fan on and off.
				The rates with the fan off, with Wallace’s below, are the measured loss the deposition speed is worked out from.
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

		<h3>How fast smoke settles and sticks</h3>
		<ul class="sources">
			<li>
				Flagan and Seinfeld, <a href="https://resolver.caltech.edu/CaltechBOOK:1988.001" target="_blank" rel="noopener noreferrer"
					><i>Fundamentals of Air Pollution Engineering</i></a
				> (Prentice Hall, 1988), chapter 5, “Aerosols”: the settling speed of a particle, with its correction for very small particles, and the book’s table of settling
				speeds, which the calculation here reproduces.
			</li>
			<li>
				Kim, Mulholland, Kukuck and Pui, “<a href="https://doi.org/10.6028/jres.110.005" target="_blank" rel="noopener noreferrer"
					>Slip Correction Measurements of Certified PSL Nanoparticles Using a Nanometer Differential Mobility Analyzer (Nano-DMA) for Knudsen Number From 0.5 to 83</a
				>,” <i>Journal of Research of the National Institute of Standards and Technology</i> 110, 31–54 (2005): the constants of the correction for very small particles,
				and the viscosity and mean free path of air, with their change with temperature.
			</li>
			<li>
				John, Wall, Ondo and Winklmayr, “<a href="https://ww2.arb.ca.gov/sites/default/files/classic/research/apr/past/a6-112-32.pdf" target="_blank" rel="noopener noreferrer"
					>Acidic Aerosol Size Distributions During SCAQS</a
				>,” final report, California Air Resources Board contract A6-112-32 (1989): the sizes of the particles in Los Angeles air, which the settling speed is averaged over.
			</li>
			<li>
				Wallace, “<a href="https://doi.org/10.1080/10473289.1996.10467451" target="_blank" rel="noopener noreferrer">Indoor Particles: A Review</a>,”
				<i>Journal of the Air &amp; Waste Management Association</i> 46, 98–126 (1996): a loss rate of 0.39 per hour for fine particles in homes. Only the abstract
				was read.
			</li>
			<li>
				Thatcher and others, “<a href="https://doi.org/10.1016/S1352-2310(02)00157-7" target="_blank" rel="noopener noreferrer"
					>Effects of room furnishings and air speed on particle deposition rates indoors</a
				>,” <i>Atmospheric Environment</i> 36, 1811–1819 (2002): the surface area per volume of real rooms, and how furniture and air speed raise deposition. Read as the
				Berkeley Lab manuscript, LBNL-48414.
			</li>
			<li>
				Riley, McKone, Lai and Nazaroff, “<a href="https://doi.org/10.1021/es010723y" target="_blank" rel="noopener noreferrer"
					>Indoor Particulate Matter of Outdoor Origin: Importance of Size-Dependent Removal Mechanisms</a
				>,” <i>Environmental Science &amp; Technology</i> 36, 200–207 (2002): why two or three particle sizes are preferred to one where accuracy matters. Only the abstract
				was read.
			</li>
		</ul>
		<p class="scale-note">
			No source gives the settling and deposition speeds directly. The settling speed is the formula above, averaged by mass over the particle sizes John and colleagues
			measured; the deposition speed is what gives the loss rate measured in occupied homes (Wallace, and NISTIR 7068 above), once settling’s share is taken out.
		</p>

		<h3>The smoke slider’s marks</h3>
		<ul class="sources">
			<li>
				Pagels and others, “<a href="https://doi.org/10.1016/j.jaerosci.2008.10.005" target="_blank" rel="noopener noreferrer"
					>Chemical composition and mass emission factors of candle smoke particles</a
				>,” <i>Journal of Aerosol Science</i> 40, 193–208 (2009): the smoke from one candle burning steadily, flickering, and being snuffed.
			</li>
			<li>
				Derudi and others, “<a href="https://doi.org/10.1007/s11356-013-2394-2" target="_blank" rel="noopener noreferrer"
					>Emission of air pollutants from burning candles with different composition in indoor environments</a
				>,” <i>Environmental Science and Pollution Research</i> 21, 4320–4330 (2014): candle smoke weighed by impactor for three kinds of paraffin candle.
			</li>
			<li>
				Ongwandee and Pipithakul, “<a href="https://ph01.tci-thaijo.org/index.php/aer/article/view/9702" target="_blank" rel="noopener noreferrer"
					>Air Pollutant Emissions from the Burning of Incense, Mosquito Coils, and Candles in a Small Experimental Chamber</a
				>,” <i>Journal of Environmental Research</i> 32(1), 69–79 (2010): smoke from candles and incense sticks in a 1&nbsp;m³ chamber, measured with an uncorrected
				photometer.
			</li>
			<li>
				Jetter, Guo, McBrian and Flynn, “<a href="https://doi.org/10.1016/S0048-9697(02)00043-8" target="_blank" rel="noopener noreferrer"
					>Characterization of emissions from burning incense</a
				>,” <i>Science of the Total Environment</i> 295, 51–67 (2002): the range of PM2.5 released by 23 kinds of incense. Only the abstract was read.
			</li>
			<li>
				Lung and Hu, “<a href="https://doi.org/10.1016/S0045-6535(02)00613-6" target="_blank" rel="noopener noreferrer"
					>Generation rates and emission factors of particulate matter and particle-bound polycyclic aromatic hydrocarbons of incense sticks</a
				>,” <i>Chemosphere</i> 50, 673–679 (2003): the release rates of two kinds of incense. Only the abstract was read.
			</li>
			<li>
				He, Morawska, Hitchins and Gilbert, “<a href="https://doi.org/10.1016/j.atmosenv.2004.03.027" target="_blank" rel="noopener noreferrer"
					>Contribution from indoor sources to particle number and mass concentrations in residential houses</a
				>,” <i>Atmospheric Environment</i> 38, 3405–3415 (2004): smoke release rates from frying and grilling in 14 houses in Brisbane.
			</li>
			<li>
				Fortmann, Kariher and Clayton, “<a href="https://ww2.arb.ca.gov/sites/default/files/classic/research/apr/past/97-330a.pdf" target="_blank" rel="noopener noreferrer"
					>Indoor Air Quality: Residential Cooking Exposures</a
				>,” final report, California Air Resources Board contract 97-330 (2001; the report’s
				<a href="https://ww2.arb.ca.gov/sites/default/files/classic/research/apr/past/97-330b.pdf" target="_blank" rel="noopener noreferrer">second file</a>): the release of
				smoke in standard and worst-case cooking tests in a test house.
			</li>
			<li>
				Buonanno, Morawska and Stabile, “<a href="https://doi.org/10.1016/j.atmosenv.2009.03.044" target="_blank" rel="noopener noreferrer"
					>Particle emission factors during cooking activities</a
				>,” <i>Atmospheric Environment</i> 43, 3235–3242 (2009): the smoke from frying chips and grilling on a gas stove at full power.
			</li>
			<li>
				O’Leary and others, “<a href="https://doi.org/10.1111/ina.12542" target="_blank" rel="noopener noreferrer"
					>Investigating measurements of fine particle (PM2.5) emissions from the cooking of meals and mitigating exposure using a cooker hood</a
				>,” <i>Indoor Air</i> 29, 423–438 (2019): the release of smoke while four whole meals were cooked in a test kitchen.
			</li>
			<li>
				Chan and others, “<a href="https://doi.org/10.1111/ina.12425" target="_blank" rel="noopener noreferrer"
					>Quantifying fine particle emission events from time-resolved measurements: Method description and application to 18 California low-income apartments</a
				>,” <i>Indoor Air</i> 28, 89–101 (2018): the spread of 836 smoke-release events in 18 apartments, whose 95th percentile sets the top of the smoke slider.
			</li>
			<li>
				Dacunto and others, “<a href="https://doi.org/10.1039/c3em00209h" target="_blank" rel="noopener noreferrer"
					>Real-time particle monitor calibration factors and PM2.5 emission factors for multiple indoor sources</a
				>,” <i>Environmental Science: Processes &amp; Impacts</i> 15, 1511–1519 (2013): the most PM2.5 of the sources it measured, 15 to 16&nbsp;mg a minute from burned
				food and from fireplaces, with photometers calibrated against filters. Only the abstract was read.
			</li>
		</ul>
		<p class="scale-note">
			Each mark is one candle, one stick of incense or one cooking event. The candle and the incense come from the studies of them, frying from the middle of four
			cooking studies, and the cooking burst from the 95th percentile of the apartments’ events and the hottest cooking tests.
		</p>

		<h3>Fan and purifier ratings</h3>
		<ul class="sources">
			<li>
				Air King, spec sheets for the
				<a href="https://www.airkinglimited.com/wp-content/uploads/2020/09/9723spec1.pdf" target="_blank" rel="noopener noreferrer">9723 20-inch box fan</a>, the
				<a href="https://www.airkinglimited.com/wp-content/uploads/2020/09/9119Spec1.pdf" target="_blank" rel="noopener noreferrer">9119 18-inch</a> and
				<a href="https://www.airkinglimited.com/wp-content/uploads/2020/09/9126Spec1.pdf" target="_blank" rel="noopener noreferrer">9126 16-inch pedestal fans</a>, and the
				<a href="https://www.airkinglimited.com/wp-content/uploads/2020/09/9155Spec1.pdf" target="_blank" rel="noopener noreferrer">9155 16-inch window fan</a>, each
				updated 3-23: airflow at high, medium and low speed, and each fan’s size.
			</li>
			<li>
				Air King, <a href="https://www.airkinglimited.com/product/window-fan/" target="_blank" rel="noopener noreferrer">product page for its window fans</a>: the 9155 can
				be set to intake or exhaust, with one rating for both, and the page says its window fans are tested to AMCA standard 230-99. Air King’s pages for its box and
				pedestal fans name no test.
			</li>
			<li>
				Levoit, <a href="https://levoit.com/cdn/shop/files/HEAPAPLVNUS0161Y_Core_300-p_Air_Purifier_manual_US_A2-241204_1.pdf" target="_blank" rel="noopener noreferrer"
					>user manual for the Core 300 and Core 300-P series air purifiers</a
				>: a clean air delivery rate for smoke of 143 cubic feet per minute at the highest speed, the purifier’s size, and where air goes in and out. The Association of
				Home Appliance Manufacturers’ <a href="https://www.ahamdir.com/room-air-cleaners/" target="_blank" rel="noopener noreferrer">directory</a> lists the same 143 for
				the Core 300.
			</li>
			<li>
				Coway, <a href="https://cowaymega.com/products/mighty-ap-1512hh" target="_blank" rel="noopener noreferrer">product page</a> and
				<a href="https://cdn.shopify.com/s/files/1/0351/1864/5383/files/9240281_AP-1512HH__Manual_US__25.11.13.pdf" target="_blank" rel="noopener noreferrer">user manual</a>
				for the Airmega Mighty AP-1512HH: 233 for smoke at the highest speed, with no unit on either, the size, and where air leaves. The Association of Home Appliance
				Manufacturers’
				<a href="https://web.archive.org/web/20180219113032/http://www.ahamdir.com/aham_cm/ahampdf/AirCleanerFullDir.pdf" target="_blank" rel="noopener noreferrer"
					>directory of January 2018</a
				> lists the same 233 as the certified rating, which AC-1 gives in cubic feet per minute. Neither the page nor the manual says where air comes in, so the front is
				assumed.
			</li>
			<li>
				ENERGY STAR, <a href="https://data.energystar.gov/resource/gaa3-swy6.json?pd_id=4512742" target="_blank" rel="noopener noreferrer"
					>certified-product record for the Coway Airmega 400, AP-2015F</a
				> (certified 2021): 376 cubic feet per minute for smoke at the highest speed. Coway’s own
				<a href="https://cowaymega.com/products/airmega-400" target="_blank" rel="noopener noreferrer">page</a> prints 328, with no unit and no certified record behind it,
				and nothing read explains the difference. The size, the air outlet on top, and the perforated side covers over the filters, which the model takes as the inlets,
				are from Coway’s
				<a href="https://original.accentuate.io/4791712645255/1590201445072/Coway-Airmega-300-400-Series-Manual.pdf" target="_blank" rel="noopener noreferrer"
					>user manual for the Airmega 300 and 400 series</a
				>.
			</li>
		</ul>
		<p class="scale-note">
			Of the fans, only the window fan’s rating comes with a named test, on its maker’s page; none of the spec sheets names one. Clean air delivery rate is the rating
			ANSI/AHAM AC-1 defines (above), and it tests the highest speed only, so a purifier’s lower speeds are derived from it. No source gives the size of any purifier’s
			inlet or outlet.
		</p>
	</div>
</section>
