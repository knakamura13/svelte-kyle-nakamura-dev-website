<script lang="ts">
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>About Kyle</title>
</svelte:head>

<div class="page" id="home">
	<p class="folio" aria-hidden="true">Software · Machine Learning</p>

	<section class="hero">
		<p class="eyebrow fade-rise"><span class="cat-no">01</span> Software Engineer &middot; Machine Learning</p>
		<h1>
			<em>Hello,</em>
			I'm Kyle<span class="stop">.</span>
		</h1>
		<p class="tagline fade-rise" style="animation-delay: 0.08s">
			I build full-stack web applications and bring machine learning research into real products.
		</p>

		<div class="hero-actions fade-rise" style="animation-delay: 0.12s">
			<AnimatedButton href="/resume" size="big" variant="primary" ariaLabel="View my resume" icon="/icons/icon-arrow-light.svg" iconSize="big">
				View my resume
			</AnimatedButton>
			<AnimatedButton
				href="https://github.com/knakamura13"
				size="big"
				ariaLabel="See my work on GitHub"
				icon="/icons/logo-github-white.svg"
				iconSize="med"
			>
				GitHub
			</AnimatedButton>
		</div>
	</section>

	<section class="about fade-rise" style="animation-delay: 0.1s">
		<div class="section-kicker">
			<span class="cat-no">02</span>
			<h2>About Me</h2>
		</div>
		<p>
			I'm a software engineer with 7 years of experience in full-stack web development and a
			lifelong passion for machine learning. Throughout my career, I've loved integrating ML into
			web applications &mdash; bridging the gap between innovative algorithms and user-friendly
			products.
		</p>
		<p>
			I recently completed my Master's in Computer Science at Georgia Tech, specializing in machine
			learning. I'm also an active open-source contributor through projects like
			<a class="prose-link" href="https://github.com/knakamura13/mlrose-ky" target="_blank" rel="noopener noreferrer">mlrose-ky</a>,
			where I overhauled a popular ML package to improve its performance and usability.
		</p>
		<p>
			I'm excited about roles at the intersection of machine learning research and product
			development &mdash; software engineering, full-stack, ML engineering, or data science.
		</p>
	</section>

	<section class="recent-projects fade-rise" style="animation-delay: 0.2s">
		<div class="section-kicker">
			<span class="cat-no">03</span>
			<h2>Recent Projects</h2>
		</div>

		<div class="grid">
			{#await data.projects}
				{#each Array(6) as _, i (i)}
					<div class="repo-card skeleton-card" aria-hidden="true">
						<div class="skeleton-line w-60"></div>
						<div class="skeleton-line w-20"></div>
						<div class="skeleton-line w-90"></div>
						<div class="skeleton-line w-75"></div>
					</div>
				{/each}
			{:then { repositories }}
				{#each repositories as repo (repo.html_url)}
					<a class="repo-card" href={repo.html_url} target="_blank" rel="noopener noreferrer">
						<h3>{repo.name}</h3>
						<div class="repo-meta">
							<img class="star-icon" src="/icons/icon-yellow-star.svg" alt="GitHub stars" />
							<span>{repo.stargazers_count}</span>
						</div>
						<p>{repo.description ?? 'No description.'}</p>
					</a>
				{:else}
					<div class="no-repos-message">
						<p>Projects are loading... If this persists, check the GitHub API connection.</p>
					</div>
				{/each}
			{:catch}
				<div class="no-repos-message">
					<p>Projects are loading... If this persists, check the GitHub API connection.</p>
				</div>
			{/await}
		</div>

		<AnimatedButton
			href="https://github.com/knakamura13?tab=repositories"
			size="big"
			ariaLabel="See more projects on GitHub"
			icon="/icons/logo-github-white.svg"
			iconSize="med"
		>
			See more on GitHub
		</AnimatedButton>
	</section>
</div>

<style>
	.page {
		position: relative;
		max-width: 72rem;
		display: flex;
		flex-direction: column;
		gap: 5.5rem;
		padding-top: 2.5rem;
	}

	.folio {
		display: none;
		position: absolute;
		left: -0.25rem;
		top: 7.5rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-lacquer);
		transform: rotate(-90deg);
		transform-origin: left top;
		white-space: nowrap;
	}

	.hero {
		max-width: 46rem;
		padding-top: 1.5rem;
	}

	.eyebrow {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 500;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-lacquer);
		margin-bottom: 1.35rem;
	}

	.eyebrow .cat-no {
		margin-right: 0.65rem;
		letter-spacing: 0.16em;
	}

	.hero h1 {
		font-size: clamp(3.4rem, 12vw, 7.25rem);
		font-weight: 500;
		line-height: 0.92;
		letter-spacing: -0.04em;
		margin-bottom: 1.5rem;
		font-variation-settings: 'SOFT' 55, 'WONK' 1, 'opsz' 144;
	}

	.hero h1 em {
		display: block;
		font-style: italic;
		font-weight: 400;
		color: var(--color-moss);
		font-variation-settings: 'SOFT' 80, 'WONK' 1, 'opsz' 144;
	}

	.hero h1 .stop {
		color: var(--color-lacquer-hot);
	}

	.tagline {
		font-size: clamp(1.15rem, 2.4vw, 1.4rem);
		color: var(--color-ink-muted);
		max-width: 34rem;
		margin-bottom: 2.4rem;
		font-variation-settings: 'opsz' 18;
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.about {
		max-width: 42rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--color-ink);
	}

	.about p {
		color: var(--color-ink-muted);
		margin-bottom: 1rem;
	}

	.recent-projects {
		padding-top: 0.5rem;
		border-top: 1px solid var(--color-ink);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0;
		margin-bottom: 2rem;
		border-top: 1px solid var(--color-ink);
		border-left: 1px solid var(--color-ink);
	}

	.repo-card {
		display: block;
		min-width: 0;
		padding: 1.25rem 1.3rem 1.4rem;
		border-right: 1px solid var(--color-ink);
		border-bottom: 1px solid var(--color-ink);
		background: var(--color-cream);
		text-decoration: none;
		color: inherit;
		transition:
			background-color 0.25s ease,
			transform 0.25s var(--ease-out-soft);
	}

	.repo-card:hover {
		background: var(--color-raised);
		transform: translateY(-2px);
	}

	.repo-card:active {
		transform: translateY(0);
		background: var(--color-overlay);
		transition-duration: 0.08s;
	}

	.repo-card h3 {
		font-size: 1.15rem;
		font-weight: 500;
		overflow-wrap: anywhere;
		font-variation-settings: 'SOFT' 20, 'WONK' 1, 'opsz' 36;
	}

	.repo-meta {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-top: 0.45rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.star-icon {
		width: 0.9rem;
		height: 0.9rem;
	}

	.repo-card p {
		margin-top: 0.65rem;
		font-size: 0.95rem;
		line-height: 1.55;
		color: var(--color-ink-muted);
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.no-repos-message {
		grid-column: 1 / -1;
		text-align: center;
		padding: 2rem;
		border-right: 1px solid var(--color-ink);
		border-bottom: 1px solid var(--color-ink);
		color: var(--color-ink-muted);
	}

	.skeleton-card {
		pointer-events: none;
	}

	.skeleton-line {
		height: 0.8rem;
		border-radius: 1px;
		background: var(--color-overlay);
		margin-bottom: 0.65rem;
		animation: shimmer 0.9s ease-in-out infinite alternate;
	}

	.skeleton-line:last-child {
		margin-bottom: 0;
	}

	.w-60 {
		width: 60%;
	}
	.w-20 {
		width: 20%;
	}
	.w-90 {
		width: 90%;
	}
	.w-75 {
		width: 75%;
	}

	@media (min-width: 1280px) {
		.folio {
			display: block;
		}
	}
</style>
