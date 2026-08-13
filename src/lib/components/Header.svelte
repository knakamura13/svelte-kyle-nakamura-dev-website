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
	<div class="bleed" aria-hidden="true"></div>
	<div class="inner">
		<div class="lead">
			{#if urlPath !== '/'}
				<button
					class="back-btn jiggle"
					title="Back"
					aria-label="Go back"
					onclick={() => history.back()}
				>
					<img src="/icons/icon-arrow-dark.svg" alt="" class="back-icon" />
				</button>
			{/if}

			<span class="chop" aria-hidden="true">KN</span>
			<a href="/" class="link link--zoomies wordmark">Kyle Nakamura</a>
		</div>

		<nav class="trail" aria-label="Social links">
			<div class="social-links">
				<a
					href="https://linkedin.com/in/kylenakamura"
					target="_blank"
					rel="noopener noreferrer"
					title="Visit my LinkedIn profile"
					class="link link--zoomies social-link"
				>
					LinkedIn
				</a>
				<a
					href="https://github.com/knakamura13"
					target="_blank"
					rel="noopener noreferrer"
					title="Visit my GitHub profile"
					class="link link--zoomies social-link"
				>
					GitHub
				</a>
			</div>

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
		background: var(--color-paper);
		border-bottom: 3px double var(--color-ink);
	}

	.bleed {
		height: 6px;
		background: var(--color-lacquer-hot);
	}

	.inner {
		max-width: 72rem;
		margin-inline: auto;
		padding: 0.95rem 1.5rem 1.05rem;
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

	.chop {
		display: grid;
		place-items: center;
		width: 2.35rem;
		height: 2.35rem;
		flex-shrink: 0;
		background: var(--color-lacquer-hot);
		color: var(--color-cream);
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		border-radius: 2px 11px 2px 11px;
		font-variation-settings: 'SOFT' 30, 'WONK' 1, 'opsz' 36;
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
		height: 1.55rem;
		transform: rotate(180deg);
	}

	.wordmark {
		font-family: var(--font-display);
		font-style: italic;
		font-weight: 500;
		font-size: 1.35rem;
		letter-spacing: -0.02em;
		font-variation-settings: 'SOFT' 50, 'WONK' 1, 'opsz' 48;
	}

	.trail {
		display: flex;
		align-items: center;
	}

	.social-links {
		display: flex;
		align-items: center;
		gap: 1.35rem;
	}

	.social-link {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-ink);
	}

	.contact-menu {
		position: relative;
		display: none;
	}

	.contact-trigger {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.85rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-ink);
		background: transparent;
		border: 1px solid var(--color-ink);
		border-radius: 2px;
		cursor: pointer;
	}

	.contact-trigger:hover {
		background: var(--color-ink);
		color: var(--color-cream);
	}

	.caret {
		width: 0.85rem;
		height: 0.85rem;
		opacity: 0.7;
		transition: transform 0.2s ease;
	}

	.caret.open {
		transform: rotate(180deg);
	}

	.dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + 0.5rem);
		min-width: 11rem;
		padding: 0.4rem;
		background: var(--color-cream);
		border: 1px solid var(--color-ink);
		border-radius: 2px;
		display: flex;
		flex-direction: column;
		animation: fade-rise 0.18s var(--ease-out-soft) both;
	}

	.dropdown a {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-ink);
		text-decoration: none;
		border-radius: 1px;
		transition: background-color 0.15s ease;
	}

	.dropdown a:hover {
		background: var(--color-overlay);
	}

	.dropdown img {
		filter: invert(1);
	}

	@media (max-width: 1023px) {
		.social-links {
			display: none;
		}

		.contact-menu {
			display: block;
		}

		.wordmark {
			font-size: 1.15rem;
		}
	}
</style>
