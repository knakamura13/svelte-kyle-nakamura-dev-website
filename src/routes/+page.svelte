<script lang="ts">
	import { onMount } from 'svelte';
	import { repositories, fetchRepositories } from '$lib/stores/repositories';
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';

	let loading = $state(true);

	onMount(async () => {
		await fetchRepositories();
		loading = false;
	});
</script>

<svelte:head>
	<title>About Kyle</title>
</svelte:head>

<div class="page" id="home">
	<!-- Hero -->
	<section class="hero fade-rise">
		<p class="eyebrow">Software Engineer &middot; Machine Learning</p>
		<h1>Hello, I'm Kyle.</h1>
		<p class="tagline">
			I build full-stack web applications and bring machine learning research into real products.
		</p>

		<div class="hero-actions">
			<AnimatedButton href="/resume" size="big" variant="primary" ariaLabel="View my resume" icon="/icons/icon-arrow-dark.svg" iconSize="big">
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

	<!-- About -->
	<section class="about fade-rise" style="animation-delay: 0.1s">
		<h2>About Me</h2>
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

	<!-- Projects -->
	<section class="recent-projects fade-rise" style="animation-delay: 0.2s">
		<h2>Recent Projects</h2>

		<div class="grid">
			{#if loading && !$repositories.length}
				{#each Array(6) as _, i (i)}
					<div class="repo-card skeleton-card" aria-hidden="true">
						<div class="skeleton-line w-60"></div>
						<div class="skeleton-line w-20"></div>
						<div class="skeleton-line w-90"></div>
						<div class="skeleton-line w-75"></div>
					</div>
				{/each}
			{:else}
				{#each $repositories as repo (repo.html_url)}
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
			{/if}
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
		display: flex;
		flex-direction: column;
		gap: 4.5rem;
	}

	/* Hero */
	.hero {
		padding-top: 2.5rem;
	}

	.eyebrow {
		font-size: 0.85rem;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-accent);
		margin-bottom: 1rem;
	}

	.hero h1 {
		font-size: clamp(2.5rem, 7vw, 4rem);
		margin-bottom: 1.25rem;
	}

	.tagline {
		font-size: clamp(1.05rem, 2.5vw, 1.25rem);
		color: var(--color-ink-muted);
		max-width: 34rem;
		margin-bottom: 2.25rem;
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.85rem;
	}

	/* Sections */
	h2 {
		font-size: 1.6rem;
		margin-bottom: 1.25rem;
	}

	.about p {
		color: var(--color-ink-muted);
		margin-bottom: 1rem;
		max-width: 42rem;
	}

	/* Project grid */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.repo-card {
		display: block;
		padding: 1.15rem 1.25rem;
		border-radius: 12px;
		background: var(--color-raised);
		border: 1px solid var(--color-edge);
		text-decoration: none;
		color: inherit;
		transition:
			border-color 0.25s ease,
			background-color 0.25s ease,
			box-shadow 0.25s ease,
			transform 0.25s var(--ease-out-soft);
	}

	.repo-card:hover {
		border-color: rgb(142 198 255 / 0.45);
		background: var(--color-overlay);
		box-shadow: 0 0 28px rgb(142 198 255 / 0.08);
		transform: translateY(-2px);
	}

	.repo-card h3 {
		font-size: 1rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.repo-meta {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-top: 0.45rem;
		font-size: 0.85rem;
		color: var(--color-ink-muted);
	}

	.star-icon {
		height: 0.9rem;
		width: auto;
	}

	.repo-card p {
		margin-top: 0.6rem;
		font-size: 0.875rem;
		line-height: 1.55;
		color: var(--color-ink-muted);
	}

	.no-repos-message {
		grid-column: 1 / -1;
		text-align: center;
		padding: 2rem;
		border-radius: 12px;
		border: 1px dashed var(--color-edge-strong);
		color: var(--color-ink-muted);
	}

	/* Loading skeleton */
	.skeleton-card {
		pointer-events: none;
	}

	.skeleton-line {
		height: 0.8rem;
		border-radius: 4px;
		background: var(--color-edge);
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
</style>
