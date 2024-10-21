<script lang="ts">
	import { AppBar, popup } from '@skeletonlabs/skeleton';
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';
	import { page } from '$app/stores';

	$: urlPath = $page.url.pathname;
</script>

<AppBar shadow="shadow-2xl">
	<svelte:fragment slot="lead">
		{#if urlPath !== '/'}
			<button
				class="btn back-btn jiggle"
				title="Back"
				on:click={() => {
					history.back();
				}}
			>
				<img src="/icons/icon-arrow-light.svg" alt="" class="rotate-180 cursor-pointer" />
			</button>
		{/if}

		<a href="/" class="link link--zoomies">
			<strong class="text-xl uppercase">Kyle Nakamura</strong>
		</a>
	</svelte:fragment>

	<svelte:fragment slot="trail">
		<div class="hamburger-menu">
			<!-- hamburger trigger -->
			<button
				class="button btn btn-md variant-ghost-surface"
				use:popup={{ event: 'click', target: 'hamburger' }}
			>
				<span class="btn-text">Contact</span>
				<i class="fa-solid fa-caret-down opacity-50"></i>
			</button>

			<!-- hamburger popup -->
			<div class="card p-4 w-40 shadow-xl" data-popup="hamburger">
				<nav class="list-nav">
					<ul>
						<li>
							<a
								href="https://linkedin.com/in/kylenakamura"
								target="_blank"
								title="Visit my LinkedIn profile"
							>
								<img
									src="icons/logo-linkedin-white.png"
									height="16"
									width="16"
									alt="LinkedIn Logo"
								/>
								<span>LinkedIn</span>
							</a>
						</li>
						<li>
							<a
								href="https://github.com/knakamura13"
								target="_blank"
								title="Visit my GitHub profile"
							>
								<img src="icons/logo-github-white.svg" height="16" width="16" alt="GitHub Logo" />
								<span>GitHub</span>
							</a>
						</li>
						<li>
							<a
								href="mailto:knakamura13dev@gmail.com"
								target="_blank"
								title="Email me at knakamura13dev@gmail.com"
							>
								<i class="fa-solid fa-envelope"></i>
								<span>Email</span>
							</a>
						</li>
					</ul>
				</nav>
			</div>
		</div>

		<!-- LinkedIn and GitHub buttons -->
		<div class="linkedin-github-buttons">
			<AnimatedButton
				href="https://linkedin.com/in/kylenakamura"
				ariaLabel="View my LinkedIn profile"
				icon="/icons/logo-linkedin-white.png"
				iconSize="small">LinkedIn</AnimatedButton
			>
		</div>
		<div class="linkedin-github-buttons">
			<AnimatedButton
				href="https://github.com/knakamura13"
				ariaLabel="View my GitHub profile"
				icon="/icons/logo-github-white.svg"
				iconSize="small">GitHub</AnimatedButton
			>
		</div>
	</svelte:fragment>
</AppBar>

<style lang="scss">
	.btn.back-btn {
		padding: 0;
		height: 100%;
		margin-right: 0.5rem;

		img {
			height: 2.2rem;
		}
	}

	.linkedin-github-buttons {
		display: grid;
	}

	@media (min-width: 1024px) {
		.hamburger-menu {
			display: none;
		}
	}

	@media (max-width: 1023px) {
		.linkedin-github-buttons {
			display: none;
		}
	}
</style>
