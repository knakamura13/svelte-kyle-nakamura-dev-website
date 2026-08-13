<footer class="site-footer">
	<div class="inner">
		<span>&copy; {new Date().getFullYear()} Kyle Nakamura</span>
		<span class="divider" aria-hidden="true"></span>
		<span>
			Built with
			<a class="prose-link" href="https://svelte.dev" target="_blank" rel="noopener noreferrer"
				>SvelteKit</a
			>
		</span>
	</div>
</footer>

<style>
	.site-footer {
		border-top: 3px double var(--color-ink);
		margin-top: auto;
	}

	.inner {
		max-width: 72rem;
		margin-inline: auto;
		padding: 1.35rem 1.5rem 1.6rem;
		padding-bottom: calc(1.6rem + env(safe-area-inset-bottom, 0px));
		padding-left: calc(1.5rem + env(safe-area-inset-left, 0px));
		padding-right: calc(1.5rem + env(safe-area-inset-right, 0px));
		display: flex;
		align-items: center;
		gap: 0.85rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}

	.divider {
		width: 4px;
		height: 4px;
		background: var(--color-lacquer);
		border-radius: 0;
	}
</style>
