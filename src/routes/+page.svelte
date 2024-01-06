<script>
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';
</script>

<section class="page" id="home-bio">
	<section class="intro">
		<h1 class="header h1">Hi, I'm Kyle Nakamura</h1>
		<p class="sub-header">
			Welcome to my professional portfolio (a work in progress).<br />
			I specialize in Machine Learning and Full-Stack Web Development.
		</p>
	</section>

	<section class="about">
		<h2 class="header h2">About Me</h2>
		<p class="paragraph">
			I'm a passionate Machine Learning enthusiast and experienced Full-Stack Web Developer,
			currently pursuing a Master's in Computer Science at Georgia Tech (expected to graduate in May
			2024).
			<br /><br />
			My academic focus is on Machine Learning, blending it with practical applications in fields like
			computer vision and autonomous vehicle technologies. Professionally, I've honed my skills over
			six years in full-stack web and mobile development, working at Azusa Pacific University as well
			as various startups.
			<br /><br />
			My drive to innovate and problem-solve in AI and web development is matched by my commitment to
			creating impactful, user-centric solutions. I look forward to seeing what you and I can build together.
		</p>
	</section>

	<AnimatedButton
		href="https://linkedin.com/in/kylenakamura/"
		size="big"
		ariaLabel="Learn more about me on LinkedIn">Learn more</AnimatedButton
	>
</section>
