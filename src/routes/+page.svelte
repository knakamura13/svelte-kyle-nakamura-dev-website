<script>
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';
</script>

<svelte:head>
	<title>About Kyle</title>
</svelte:head>

<section class="page" id="home">
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
			I'm a dedicated Machine Learning enthusiast and seasoned Full-Stack Web Developer with a
			Master's degree in Computer Science from Georgia Tech.
			<br /><br />
			My academic journey concentrated on Machine Learning, integrating it with practical applications
			in areas like computer vision and autonomous vehicles. With over 7 years of professional experience
			in full-stack web and mobile development, I've worked at Azusa Pacific University and various startups
			as a freelance software developer.
			<br /><br />
			I am driven by a passion for innovation and problem-solving in AI and web development, always striving
			to create impactful, user-centric solutions. Let's collaborate to build something remarkable together.
		</p>
	</section>

	<AnimatedButton href="/resume" size="big" ariaLabel="View my resume">
		View my resume
	</AnimatedButton>
</section>
