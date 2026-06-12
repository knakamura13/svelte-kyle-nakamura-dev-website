<script lang="ts">
	import { page } from '$app/stores';

	let urlPath = $derived($page.url.pathname);
	let menuOpen = $state(false);
	let menuContainer: HTMLDivElement | undefined = $state();

	function handleWindowClick(event: MouseEvent) {
		if (menuOpen && menuContainer && !menuContainer.contains(event.target as Node)) {
			menuOpen = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') menuOpen = false;
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<header class="site-header">
	<div class="inner">
		<div class="lead">
			{#if urlPath !== '/'}
				<button
					class="back-btn jiggle"
					title="Back"
					aria-label="Go back"
					onclick={() => history.back()}
				>
					<img src="/icons/icon-arrow-light.svg" alt="" class="back-icon" />
				</button>
			{/if}

			<a href="/" class="link link--zoomies wordmark">Kyle Nakamura</a>
		</div>

		<nav class="trail" aria-label="Social links">
			<!-- Desktop: inline social links -->
			<div class="social-links">
				<a
					href="https://linkedin.com/in/kylenakamura"
					target="_blank"
					rel="noopener noreferrer"
					title="Visit my LinkedIn profile"
					class="social-link"
				>
					<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
						><path
							d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"
						/></svg
					>
					<span>LinkedIn</span>
				</a>
				<a
					href="https://github.com/knakamura13"
					target="_blank"
					rel="noopener noreferrer"
					title="Visit my GitHub profile"
					class="social-link"
				>
					<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
						><path
							d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.83.57A12 12 0 0 0 12 .3"
						/></svg
					>
					<span>GitHub</span>
				</a>
			</div>

			<!-- Mobile: contact dropdown -->
			<div class="contact-menu" bind:this={menuContainer}>
				<button
					class="contact-trigger"
					aria-expanded={menuOpen}
					aria-haspopup="true"
					onclick={(e) => {
						e.stopPropagation();
						menuOpen = !menuOpen;
					}}
				>
					Contact
					<svg
						class="caret"
						class:open={menuOpen}
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg
					>
				</button>

				{#if menuOpen}
					<div class="dropdown" role="menu">
						<a
							role="menuitem"
							href="https://linkedin.com/in/kylenakamura"
							target="_blank"
							rel="noopener noreferrer"
						>
							<img src="/icons/logo-linkedin-white.png" height="16" width="16" alt="" />
							LinkedIn
						</a>
						<a
							role="menuitem"
							href="https://github.com/knakamura13"
							target="_blank"
							rel="noopener noreferrer"
						>
							<img src="/icons/logo-github-white.svg" height="16" width="16" alt="" />
							GitHub
						</a>
						<a role="menuitem" href="mailto:knakamura13dev@gmail.com">
							<svg
								viewBox="0 0 24 24"
								width="16"
								height="16"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								aria-hidden="true"
								><rect x="2.5" y="4.5" width="19" height="15" rx="2" /><path
									d="m3 6 9 7 9-7"
								/></svg
							>
							Email
						</a>
					</div>
				{/if}
			</div>
		</nav>
	</div>
</header>

<style>
	.site-header {
		position: sticky;
		top: 0;
		z-index: 50;
		background: rgb(10 10 11 / 0.7);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--color-edge);
	}

	.inner {
		max-width: 64rem;
		margin-inline: auto;
		padding: 0.85rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.lead {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.back-btn {
		display: grid;
		place-items: center;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	.back-icon {
		height: 1.6rem;
		transform: rotate(180deg);
	}

	.wordmark {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 1.05rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.trail {
		display: flex;
		align-items: center;
	}

	.social-links {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.social-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.85rem;
		border-radius: 8px;
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		transition:
			color 0.2s ease,
			background-color 0.2s ease;
	}

	.social-link:hover {
		color: var(--color-ink);
		background: var(--color-overlay);
	}

	.social-link svg {
		width: 1rem;
		height: 1rem;
	}

	.contact-menu {
		position: relative;
		display: none;
	}

	.contact-trigger {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.9rem;
		font-size: 0.875rem;
		color: var(--color-ink);
		background: var(--color-raised);
		border: 1px solid var(--color-edge);
		border-radius: 8px;
		cursor: pointer;
		transition: border-color 0.2s ease;
	}

	.contact-trigger:hover {
		border-color: var(--color-edge-strong);
	}

	.caret {
		width: 0.85rem;
		height: 0.85rem;
		opacity: 0.6;
		transition: transform 0.2s ease;
	}

	.caret.open {
		transform: rotate(180deg);
	}

	.dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + 0.5rem);
		min-width: 10rem;
		padding: 0.4rem;
		background: var(--color-overlay);
		border: 1px solid var(--color-edge);
		border-radius: 10px;
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.45);
		display: flex;
		flex-direction: column;
		animation: fade-rise 0.18s var(--ease-out-soft) both;
	}

	.dropdown a {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.75rem;
		font-size: 0.875rem;
		color: var(--color-ink);
		text-decoration: none;
		border-radius: 6px;
		transition: background-color 0.15s ease;
	}

	.dropdown a:hover {
		background: var(--color-edge);
	}

	@media (max-width: 1023px) {
		.social-links {
			display: none;
		}

		.contact-menu {
			display: block;
		}
	}
</style>
