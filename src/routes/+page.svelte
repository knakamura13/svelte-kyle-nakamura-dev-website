<script>
	import { onMount } from 'svelte';
	import { repositories, fetchRepositories } from '$lib/stores/repositories';
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';

	onMount(() => {
		fetchRepositories(); // Fetch repositories in the background
	});
</script>

<svelte:head>
	<title>About Kyle</title>
</svelte:head>

<section class="page" id="home">
	<section class="intro">
		<h1 class="header h1">Hi, I'm Kyle Nakamura</h1>

		<p class="sub-header">Welcome to my professional portfolio.</p>
	</section>

	<section class="about">
		<h2 class="header h2">About Me</h2>
		<p class="paragraph">
			Hi, I'm Kyle Nakamura, a software engineer with 7 years of experience in full-stack web
			development and a lifelong passion for machine learning. Throughout my career, I've loved
			integrating machine learning into web applications, bridging the gap between innovative
			algorithms and user-friendly products.
			<br /><br />
			I recently completed my Master's in Computer Science from Georgia Tech, specializing in machine
			learning. This experience deepened my understanding of advanced ML techniques and their real-world
			applications. I'm also an active contributor to the open-source community through projects like
			<a href="https://github.com/knakamura13/mlrose-ky" target="_blank" rel="noopener">mlrose-ky</a
			>, where I overhauled and enhanced a popular machine learning package to improve its
			performance and usability.
			<br /><br />
			I'm excited to explore opportunities that allow me to work at the intersection of machine learning
			research and product development. I'm open to roles such as software engineer, full-stack developer,
			machine learning engineer, or data scientist/analyst, where I can apply my engineering expertise
			to drive innovative machine learning projects.
		</p>

		<AnimatedButton href="/resume" size="big" ariaLabel="View my resume" iconSize="big">
			View my resume
		</AnimatedButton>
	</section>

	<section class="recent-projects">
		<h2 class="header h2">My Most Recent Projects</h2>
		<div class="grid">
			{#each $repositories as repo}
				<a class="repo-card" href={repo.html_url} target="_blank" rel="noopener noreferrer">
					<h3>{repo.name}</h3>
					<div class="github-stars-container">
						<img
							class="github-stars-icon"
							src="icons/icon-yellow-star.svg"
							alt="GitHub Stars Icon"
						/>
						<span class="github-stars-count">{repo.stargazers_count}</span>
					</div>
					<p>{repo.description ?? 'No description.'}</p>
				</a>
			{/each}
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
</section>

<style lang="scss">
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
	}

	.repo-card {
		border: 1px solid transparent;
		padding: 1rem;
		margin: 0;
		border-radius: 8px;
		background-color: rgba(255, 255, 255, 0.1);
		cursor: pointer;
		transition: all 0.2s ease-in-out;

		&:hover {
			background-color: rgba(255, 255, 255, 0.15);
			border-color: #919191;
		}

		.github-stars-container {
			display: flex;
			height: 1rem;
			gap: 0.25rem;
			align-items: center;
			margin-top: 0.5rem;

			.github-stars-icon {
				width: auto;
				height: 100%;
				margin: 0;
			}

			.github-stars-count {
				margin: 0;
			}
		}
	}
</style>
