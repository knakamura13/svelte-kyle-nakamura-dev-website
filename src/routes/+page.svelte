<script lang="ts">
	import ProjectStack from '$lib/prototype/ProjectStack.svelte';
	import { projects, email } from '$lib/prototype/content';
	import { reveal } from '$lib/prototype/reveal';
	const story = '/projects/learning-korean';
</script>

<svelte:head>
	<title>Kyle Nakamura — Software engineer</title>
	<meta name="description" content="Full-stack engineering, machine learning, and a few projects by Kyle Nakamura." />
</svelte:head>

<div class="portfolio-opening">
	<section class="personal-intro" aria-labelledby="intro-title">
		<h1 id="intro-title">Kyle<br />{' '}Nakamura<span>.</span></h1>
		<p class="personal-role">Senior full-stack engineer<br />with a background in machine learning.</p>
		<p class="personal-note">I work across interfaces, applications, and the systems behind them. Outside of work, my projects range from learning to read Korean to open-source tools for exploring optimization.</p>
		<div class="personal-links">
			<a class="text-link" href="/resume">Résumé <span aria-hidden="true">↗</span></a>
			<a class="text-link" href="https://github.com/knakamura13" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
		</div>
		<a class="intro-about" href="#about">A little more about me <span aria-hidden="true">↓</span></a>
	</section>

	<ProjectStack />
</div>

<section id="work" class="portfolio-work" aria-labelledby="work-heading">
	<div class="work-label"><h2 id="work-heading">Selected projects</h2></div>
	<article id="korean" class="compact-entry featured-entry" use:reveal>
		<a class="compact-image korean-thumbnail" href={story} aria-label="Read the Learning Korean project story">
			<img src={projects[0].image} alt={projects[0].alt} width="1280" height="720" loading="lazy" />
		</a>
		<div>
			<h3><a href={story}>Learning Korean</a></h3>
			<p>I wanted to learn Hangul by working out its patterns. This project turns that preference into short interactive labs, with a review deck to return to between lessons.</p>
			<p class="entry-detail">The interesting part: explanations follow an attempt, and the review scheduler distinguishes a quick correct answer from a slow one.</p>
			<div class="entry-bottom">
				<a class="text-link" href={story}>Read the project story <span aria-hidden="true">↗</span></a>
				<span class="tech-note">SvelteKit · TypeScript</span>
			</div>
		</div>
	</article>

	<article id="mlrose" class="compact-entry" use:reveal>
		<a class="compact-image" href={projects[1].href} target="_blank" rel="noopener noreferrer" aria-label="Explore the mlrose-ky documentation">
			<img src={projects[1].image} alt={projects[1].alt} width="751" height="727" loading="lazy" />
		</a>
		<div>
			<h3>mlrose-ky</h3>
			<p>My work on a Python optimization library: refactoring the code, expanding test coverage, and improving documentation.</p>
			<div class="compact-links">
				<a class="text-link" href={projects[1].href} target="_blank" rel="noopener noreferrer">Documentation <span aria-hidden="true">↗</span></a>
				<a class="source-link" href={projects[1].source} target="_blank" rel="noopener noreferrer">Source ↗</a>
			</div>
		</div>
	</article>

	<article id="oc-foods" class="compact-entry" use:reveal>
		<a class="compact-image oc-food-image" href="https://oc-food.up.railway.app/" target="_blank" rel="noopener noreferrer" aria-label="Explore the OC Foods project">
			<img src="/images/concepts/oc-foods.png" alt="OC Foods orange icon" width="180" height="180" loading="lazy" />
		</a>
		<div>
			<h3>OC Foods</h3>
			<p>A restaurant explorer for Orange County, built from local Reddit recommendations. Search by cuisine or city, browse a map, and trace a recommendation back to the original comment.</p>
			<div class="compact-links">
				<a class="text-link" href="https://oc-food.up.railway.app/" target="_blank" rel="noopener noreferrer">Explore the site <span aria-hidden="true">↗</span></a>
				<a class="source-link" href="https://github.com/knakamura13/oc-food-recs" target="_blank" rel="noopener noreferrer">Source ↗</a>
			</div>
		</div>
	</article>
</section>

<section id="about" class="portfolio-background" aria-labelledby="about-heading" use:reveal>
	<div><h2 id="about-heading">A little more<br />{' '}about me.</h2></div>
	<div class="background-copy">
		<p>I studied computer science at Georgia Tech, with a focus on machine learning. My professional background is in full-stack development, and I like having room to work across both.</p>
		<div class="background-record">
			<img class="university-logo" src="/images/concepts/apu.webp" alt="Azusa Pacific University logo" width="1350" height="714" loading="lazy" />
			<div class="record-copy">
				<h3>Full-stack developer<br /><span>Azusa Pacific University</span></h3>
				<p class="record-date">2017–2022</p>
				<p>University web applications, API integrations, and mentoring junior developers.</p>
			</div>
		</div>
		<div class="background-record">
			<img class="university-logo" src="/images/concepts/georgia-tech.png" alt="Georgia Tech logo" width="675" height="675" loading="lazy" />
			<div class="record-copy">
				<h3>M.S. Computer Science<br /><span>Georgia Institute of Technology</span></h3>
				<p class="record-date">2024</p>
				<p>Specialization in machine learning.</p>
			</div>
		</div>
		<a class="text-link" href="/resume">More experience in my résumé <span aria-hidden="true">↗</span></a>
	</div>
</section>

<section class="personal-contact" aria-labelledby="contact-heading" use:reveal>
	<h2 id="contact-heading">Say hello.</h2>
	<p>You can reach me at <a href="mailto:{email}">{email}</a><span aria-hidden="true"> ↗</span></p>
</section>
