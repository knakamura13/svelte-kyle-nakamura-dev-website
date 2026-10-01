<script lang="ts">
	import Arrow from '$lib/components/Arrow.svelte';
	import { email } from '$lib/content/portfolio';
	import { resume, type ResumeRecord } from '$lib/content/resume';
	import { reveal } from '$lib/motion/reveal';

	const sections: { id: string; heading: string; records: ResumeRecord[] }[] = [
		{ id: 'experience', heading: 'Experience.', records: resume.experience },
		{ id: 'projects', heading: 'Projects.', records: resume.projects },
		{ id: 'education', heading: 'Education.', records: resume.education }
	];
</script>

<svelte:head>
	<title>Résumé — Kyle Nakamura</title>
	<meta
		name="description"
		content="Kyle Nakamura's résumé: software engineering at HighPoint, machine learning, and full-stack web development."
	/>
</svelte:head>

<article class="resume">
	<header class="page-intro">
		<h1>Résumé,<br /><span>in full.</span></h1>
		<p class="page-lede">{resume.profile}</p>
		<div class="page-meta">
			<span>{resume.location}</span>
			<a class="text-link" href={resume.pdf} download="Kyle-Nakamura-Resume.pdf">Download PDF <span aria-hidden="true"><Arrow direction="down" /></span></a>
			<a class="text-link" href="mailto:{email}">Email <span aria-hidden="true"><Arrow /></span></a>
			<a class="text-link" href="https://linkedin.com/in/kylenakamura" target="_blank" rel="noopener noreferrer">LinkedIn <span aria-hidden="true"><Arrow /></span></a>
			<a class="text-link" href="https://github.com/knakamura13" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true"><Arrow /></span></a>
		</div>
	</header>

	{#each sections as section (section.id)}
		<section id={section.id} class="portfolio-background resume-section" aria-labelledby="{section.id}-heading" use:reveal>
			<div><h2 id="{section.id}-heading">{section.heading}</h2></div>
			<div class="resume-records">
				{#each section.records as record (record.title)}
					<article class="record">
						{#if record.logo === 'kn'}
							<span class="logo-tile kn-tile" aria-hidden="true"><span class="monogram">kn<span><Arrow /></span></span></span>
						{:else if record.logo}
							<img class="logo-tile" src={record.logo.src} alt={record.logo.alt} width={record.logo.width} height={record.logo.height} loading="lazy" />
						{/if}
						<div class="record-copy">
							<h3>
								{record.title}{#if record.organization}<br /><span>{record.organization}{#if record.place}, {record.place}{/if}</span>{/if}
							</h3>
							<p class="record-date">{record.dates}</p>
							{#if record.note}<p class="record-note">{record.note}</p>{/if}
							{#if record.points.length}
								<ul>
									{#each record.points as point (point.text)}
										<li>{#if point.lead}<strong>{point.lead}</strong>{' '}{/if}{point.text}</li>
									{/each}
								</ul>
							{/if}
							{#if record.links}
								<div class="compact-links">
									{#each record.links as link (link.href)}
										<a class="text-link" href={link.href} target="_blank" rel="noopener noreferrer">{link.label} <span aria-hidden="true"><Arrow /></span></a>
									{/each}
								</div>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/each}

	<section id="skills" class="portfolio-background resume-section" aria-labelledby="skills-heading" use:reveal>
		<div><h2 id="skills-heading">Skills.</h2></div>
		<dl class="skill-groups">
			{#each resume.skills as group (group.label)}
				<div>
					<dt>{group.label}</dt>
					<dd>{group.skills}</dd>
				</div>
			{/each}
		</dl>
	</section>
</article>

<section class="personal-contact" aria-labelledby="contact-heading" use:reveal>
	<h2 id="contact-heading">Say hello.</h2>
	<p>You can reach me at <a href="mailto:{email}">{email}</a><span aria-hidden="true"> <Arrow /></span></p>
</section>

<style>
	.resume-records>.record:last-child { margin-bottom:0; }
	.record ul { list-style:disc; padding-left:1.1em; margin-top:12px; display:grid; gap:6px; }
	.record li { font-size:13px; line-height:1.8; color:var(--muted); }
	.record li::marker { color:#a3aca5; }
	.record strong { font-weight:650; color:var(--ink); }
	.record-note { font-size:12px; line-height:1.8; color:var(--muted); }
	.record .compact-links { margin-top:6px; }
	.kn-tile { display:grid; place-items:center; }
	.skill-groups { display:grid; gap:24px; margin:0; }
	.skill-groups dt { font-size:14px; font-weight:600; letter-spacing:-.015em; }
	.skill-groups dd { margin:4px 0 0; font-size:13px; line-height:1.8; color:var(--muted); }
	@media(min-width:701px) {
		.resume-section h2 { position:sticky; top:120px; }
	}
	/*
	 * Approximate spatial progress through a section, drawn under its sticky label. The section owns
	 * the view timeline; only the heading's decorative ::after is bound to it. The 120px inset matches
	 * the sticky offset, so the `contain` range runs from the section's top reaching the label to its
	 * bottom reaching the viewport's lower edge. Everything is gated on the properties it uses.
	 */
	@media(min-width:701px) and (prefers-reduced-motion:no-preference) {
		@supports (animation-timeline:view()) and (view-timeline-inset:0) {
			.resume-section { view-timeline:--resume-section block; view-timeline-inset:120px 0; }
			.resume-section h2::after {
				content:''; display:block; height:2px; margin-top:12px; background:var(--accent);
				transform-origin:left; transform:scaleX(0);
				animation:resume-progress linear both; animation-timeline:--resume-section; animation-range:contain;
			}
		}
	}
	/* Short sections near the end of the page may never scroll their top to the label, so they finish once fully in view. */
	@media(min-width:701px) and (prefers-reduced-motion:no-preference) {
		@supports (animation-timeline:view()) and (view-timeline-inset:0) {
			#education h2::after, #skills h2::after { animation-range:entry; }
		}
	}
	@keyframes resume-progress { to { transform:scaleX(1); } }
	@media print { .resume-section h2::after { display:none; } }
	/* On phones the logo sits beside the title block only, so points use the full width. */
	@media(max-width:700px) {
		.record:has(> .logo-tile) { display:grid; grid-template-columns:64px minmax(0,1fr); gap:0 15px; align-items:start; }
		.record:has(> .logo-tile) .record-copy { display:contents; }
		.record:has(> .logo-tile) .logo-tile { grid-row:span 3; }
		.record:has(> .logo-tile) :is(h3, .record-date, .record-note) { grid-column:2; }
		.record:has(> .logo-tile) :is(ul, .compact-links) { grid-column:1 / -1; }
	}
</style>
