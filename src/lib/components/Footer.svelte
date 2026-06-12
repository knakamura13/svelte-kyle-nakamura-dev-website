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
		border-top: 1px solid var(--color-edge);
		margin-top: auto;
	}

	.inner {
		max-width: 64rem;
		margin-inline: auto;
		padding: 1.25rem 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.8rem;
		color: var(--color-ink-faint);
	}

	.divider {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--color-edge-strong);
	}
</style>
