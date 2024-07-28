<script>
	import { onMount } from 'svelte';

	import AnimatedButton from '$lib/components/AnimatedButton.svelte';

	let repositories = [];

	onMount(async () => {
		const response = await fetch('https://api.github.com/users/knakamura13/repos?sort=updated');
		const data = await response.json();
		repositories = data.slice(0, 6); // Get the 6 most recent repositories
	});
</script>

<svelte:head>
	<title>About Kyle</title>
</svelte:head>

<section class="page" id="home">
	<section class="intro">
		<h1 class="header h1">Hi, I'm Kyle Nakamura</h1>

		<p class="sub-header">
			Welcome to my professional portfolio.<br />
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
			in areas like computer vision and natural language processing. With over 7 years of professional
			experience in full-stack web and mobile development, I've worked at Azusa Pacific University and
			various startups as a freelance software developer.
			<br /><br />
			I am driven by a passion for innovation and problem-solving in AI and web development, always striving
			to create impactful, user-centric solutions. Let's collaborate to build something remarkable together.
		</p>

		<AnimatedButton href="/resume" size="big" ariaLabel="View my resume" iconSize="big">
			View my resume
		</AnimatedButton>
	</section>

	<section class="recent-projects">
		<h2 class="header h2">Recent Projects</h2>
		<div class="grid">
			{#each repositories as repo}
				<a class="repo-card" href={repo.html_url} target="_blank" rel="noopener noreferrer">
					<h3>{repo.name}</h3>
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
	}
</style>
