<script lang="ts">
	import { onMount } from 'svelte';
	import Arrow from '$lib/components/Arrow.svelte';
	import { projects } from '$lib/content/portfolio';
	import { reveal } from '$lib/motion/reveal';
	import SyllableBuilder from './SyllableBuilder.svelte';
	const project = projects[0];
	const sectionIds = ['lesson', 'practice', 'guest', 'status'];
	// An anchor click can land a little short of the reading line when layout shifts after load, so a
	// heading this close below the line already counts as reached.
	const slack = 32;
	let activeId = $state('');

	// The active section is the last one whose heading has crossed the reading line, which is the same
	// offset anchor links land on. Scroll and resize only schedule a recompute (at most one per frame);
	// the answer always comes from geometry, so long sections, large jumps and the short final section agree.
	onMount(() => {
		const sections = sectionIds.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
		if (!sections.length) return;
		const update = () => {
			const line = parseFloat(getComputedStyle(sections[0]).scrollMarginTop) || 0;
			const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
			let current = '';
			for (const section of sections) {
				// A section waiting on its reveal is translated down; measure where it will rest instead.
				const shift = new DOMMatrixReadOnly(getComputedStyle(section).transform).m42;
				if ((section.querySelector('h2') ?? section).getBoundingClientRect().top - shift <= line + slack) current = section.id;
			}
			activeId = atBottom ? sections[sections.length - 1].id : current;
		};
		let frame = 0;
		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(update);
		};
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule, { passive: true });
		update();
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', schedule);
		};
	});
</script>

<svelte:head>
	<title>Learning Korean — Kyle Nakamura</title>
	<meta name="description" content="A personal learning project: interactive Hangul labs, a spaced-repetition scheduler, and practice without an account." />
</svelte:head>

<article class="case-study">
	<header class="page-intro">
		<a class="text-link page-back" href="/#work"><span aria-hidden="true"><Arrow direction="left" /></span> All projects</a>
		<h1>Learning Korean,<br /><span>one experiment at a time.</span></h1>
		<p class="page-lede">I wanted to understand how Hangul works and make time to practise it in short sessions. That became the starting point for Learning Korean: an app where you try something, get feedback, and return to it later through spaced repetition.</p>
		<div class="page-meta">
			<span>SvelteKit · TypeScript</span>
			<a class="text-link" href={project.href} target="_blank" rel="noopener noreferrer">Try the first lab <span aria-hidden="true"><Arrow /></span></a>
			<a class="text-link" href={project.source} target="_blank" rel="noopener noreferrer">Source <span aria-hidden="true"><Arrow /></span></a>
		</div>
	</header>

	<figure class="case-figure">
		<img src={project.image} alt={project.alt} width="1280" height="720" fetchpriority="high" />
		<figcaption>The first lab starts with a sound and a mouth diagram. The learner makes an attempt before seeing an explanation.</figcaption>
	</figure>

	<div class="case-body">
		<aside class="case-contents" aria-label="In this project">
			<a href="#lesson" data-active={activeId === 'lesson' ? 'true' : undefined}>The lesson</a>
			<a href="#practice" data-active={activeId === 'practice' ? 'true' : undefined}>The practice loop</a>
			<a href="#guest" data-active={activeId === 'guest' ? 'true' : undefined}>The first session</a>
			<a href="#status" data-active={activeId === 'status' ? 'true' : undefined}>Where it stands</a>
		</aside>
		<div class="case-sections">
			<section id="lesson" use:reveal>
				<h2>A lesson starts with<br />something to do.</h2>
				<p>The first lab asks you to make a sound and locate it on a mouth diagram. An explanation follows your answer. Later steps ask you to change a letter, build a syllable, or read unfamiliar text.</p>
				<p>This sequence reflects a requirement in the project brief: lessons should be interactive, with explanations arriving as feedback. Each explanation has an immediate connection to something the learner has just tried.</p>
				<div class="case-example">
					<p>Make the sound <em>mmm</em> → identify where your mouth closes → discover the letter <span lang="ko">ㅁ</span>.</p>
				</div>
				<p>The same idea applies to building syllables. Korean packs each one into a square block, and the vowel decides where the consonant goes.</p>
				<SyllableBuilder />
			</section>
			<section id="practice" use:reveal>
				<h2>Keep the lesson separate<br />from the practice schedule.</h2>
				<p>A lab introduces a pattern. The review deck brings it back over time. Completing labs unlocks material for practice, so lesson progress and retention have separate jobs.</p>
				<p>The scheduler uses correctness and response time to assign a grade. A slow correct answer receives a different grade from a fast one. A newly introduced card cannot earn the easiest grade on its first appearance.</p>
				<p>The scheduling function then calculates the next due time from that grade and the card’s history. The visible interaction is small, while the state underneath tracks what has been introduced, attempted, and scheduled for later.</p>
				<a class="text-link" href="https://github.com/knakamura13/learning-korean/blob/e993c60808c3a88bb171745b8c89587fe0b2772c/app/src/lib/domain/srs.ts#L372-L465" target="_blank" rel="noopener noreferrer">Read the scheduling code <span aria-hidden="true"><Arrow /></span></a>
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
				<a class="text-link" href={project.href} target="_blank" rel="noopener noreferrer">Explore the lab <span aria-hidden="true"><Arrow /></span></a>
			</section>
		</div>
	</div>
	<div class="case-end">
		<a class="text-link" href="/#work"><span aria-hidden="true"><Arrow direction="left" /></span> Back to selected projects</a>
		<a class="text-link" href="/resume">Résumé <span aria-hidden="true"><Arrow /></span></a>
	</div>
</article>

<style>
	.case-contents a { position:relative; transition:color 160ms ease; }
	.case-contents a::before {
		content:''; position:absolute; left:-14px; top:50%; width:4px; height:14px; margin-top:-7px;
		border-radius:2px; background:var(--accent); opacity:0; transition:opacity 160ms ease;
	}
	.case-contents a[data-active] { color:var(--ink); }
	.case-contents a[data-active]::before { opacity:1; }
	/* On phones the list wraps in the page flow, so the tick becomes an underline in the same colour. */
	@media(max-width:700px) {
		.case-contents a::before { left:0; right:0; top:auto; bottom:6px; width:auto; height:2px; margin-top:0; }
	}
	@media(prefers-reduced-motion:reduce) {
		.case-contents a, .case-contents a::before { transition:none; }
	}
</style>
