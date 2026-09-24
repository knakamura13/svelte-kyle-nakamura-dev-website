<script lang="ts">
	import { projects } from '$lib/content/portfolio';
	import { reveal } from '$lib/motion/reveal';
	const project = projects[0];
</script>

<svelte:head>
	<title>Learning Korean — Kyle Nakamura</title>
	<meta name="description" content="A personal learning project: interactive Hangul labs, a spaced-repetition scheduler, and practice without an account." />
</svelte:head>

<article class="case-study">
	<header class="page-intro">
		<a class="text-link page-back" href="/#work"><span aria-hidden="true">←</span> All projects</a>
		<h1>Learning Korean,<br /><span>one experiment at a time.</span></h1>
		<p class="page-lede">I wanted to understand how Hangul works and make time to practise it in short sessions. That became the starting point for Learning Korean: an app where you try something, get feedback, and return to it later through spaced repetition.</p>
		<div class="page-meta">
			<span>SvelteKit · TypeScript</span>
			<a class="text-link" href={project.href} target="_blank" rel="noopener noreferrer">Try the first lab <span aria-hidden="true">↗</span></a>
			<a class="text-link" href={project.source} target="_blank" rel="noopener noreferrer">Source <span aria-hidden="true">↗</span></a>
		</div>
	</header>

	<figure class="case-figure">
		<img src={project.image} alt={project.alt} width="1280" height="720" fetchpriority="high" />
		<figcaption>The first lab starts with a sound and a mouth diagram. The learner makes an attempt before seeing an explanation.</figcaption>
	</figure>

	<div class="case-body">
		<aside class="case-contents" aria-label="In this project">
			<a href="#lesson">The lesson</a>
			<a href="#practice">The practice loop</a>
			<a href="#guest">The first session</a>
			<a href="#status">Where it stands</a>
		</aside>
		<div class="case-sections">
			<section id="lesson" use:reveal>
				<h2>A lesson starts with<br />something to do.</h2>
				<p>The first lab asks you to make a sound and locate it on a mouth diagram. An explanation follows your answer. Later steps ask you to change a letter, build a syllable, or read unfamiliar text.</p>
				<p>This sequence reflects a requirement in the project brief: lessons should be interactive, with explanations arriving as feedback. Each explanation has an immediate connection to something the learner has just tried.</p>
				<div class="case-example">
					<p>Make the sound <em>mmm</em> → identify where your mouth closes → discover the letter <span lang="ko">ㅁ</span>.</p>
				</div>
			</section>
			<section id="practice" use:reveal>
				<h2>Keep the lesson separate<br />from the practice schedule.</h2>
				<p>A lab introduces a pattern. The review deck brings it back over time. Completing labs unlocks material for practice, so lesson progress and retention have separate jobs.</p>
				<p>The scheduler uses correctness and response time to assign a grade. A slow correct answer receives a different grade from a fast one. A newly introduced card cannot earn the easiest grade on its first appearance.</p>
				<p>The scheduling function then calculates the next due time from that grade and the card’s history. The visible interaction is small, while the state underneath tracks what has been introduced, attempted, and scheduled for later.</p>
				<a class="text-link" href="https://github.com/knakamura13/learning-korean/blob/e993c60808c3a88bb171745b8c89587fe0b2772c/app/src/lib/domain/srs.ts#L372-L465" target="_blank" rel="noopener noreferrer">Read the scheduling code <span aria-hidden="true">↗</span></a>
			</section>
			<section id="guest" use:reveal>
				<h2>Let practice begin<br />without an account.</h2>
				<p>Signed-out use stores progress in the browser. The project also supports optional accounts and cross-device sync. The core learning experience can run as a static site; account and sync features use a server.</p>
				<p>That split keeps the initial learning flow simple. It also creates an explicit tradeoff: browser-local progress belongs to that browser unless the learner uses the available transfer or sync features.</p>
			</section>
			<section id="status" use:reveal>
				<h2>Where it stands.</h2>
				<p>The public project contains interactive Hangul labs, a spaced-repetition review deck, browser-local progress, and optional account infrastructure. You can explore the first lab directly.</p>
				<p>The first lab is open to try without an account. Start with the mouth diagram, then work through the letter-building exercises.</p>
				<a class="text-link" href={project.href} target="_blank" rel="noopener noreferrer">Explore the lab <span aria-hidden="true">↗</span></a>
			</section>
		</div>
	</div>
	<div class="case-end">
		<a class="text-link" href="/#work"><span aria-hidden="true">←</span> Back to selected projects</a>
		<a class="text-link" href="/resume">Résumé <span aria-hidden="true">↗</span></a>
	</div>
</article>
