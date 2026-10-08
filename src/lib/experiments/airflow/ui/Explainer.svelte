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
				through its blades equals its rated flow. Against the free-jet benchmark a simulated fan delivers 102 % of its rating and its jet slows as 1 over
				the distance, as real jets do.
			</li>
			<li>
				<strong>Outdoors is not simulated; an open window meets the weather.</strong> Each opening takes the wind’s pressure on its wall, which depends on
				the wind’s direction and speed and on which side of the home the wall faces, plus the pressure that warm and cold air make at different heights.
				Air crossing an opening follows the orifice equation: flow is 0.62 × open area × √(2 × pressure difference ÷ density). The open area is exact, so
				a window open halfway passes the flow of half its frame whatever the grid.
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
			<li>There are no heat sources, no sunlight through windows, no heat through walls, and no humidity. Warm and cold air come only from the temperatures you set.</li>
			<li>The four homes are single-story and rectangular, with fixed furniture. Doors and windows stay where they are drawn.</li>
			<li>Turbulence is modelled, not resolved. Swirls smaller than a few centimetres, and the thin layers of air at walls, are approximated.</li>
			<li>Fans and purifiers are idealised: a disc that pushes by the model’s rated flow, and a region that cleans at its rated rate. Real ones vary with age, filters and where they stand.</li>
			<li>The wind’s effect on each wall uses averages for an isolated low-rise building. A real home’s surroundings change it a lot.</li>
			<li>Particulates are PM2.5 only, as a mass in the air. Bigger particles, gases, and anything that changes the particles (such as moisture) are left out.</li>
		</ul>
	</div>
</section>
