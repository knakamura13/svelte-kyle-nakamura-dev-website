<script lang="ts">
	interface Props {
		pdfPath?: string;
		pdfTitle?: string;
	}

	let { pdfPath = '', pdfTitle = '' }: Props = $props();

	// Inline height as a hard fallback — HTML/CSS percentage chains collapse on iframes
	const embedHeight = 'calc(100dvh - 10.5rem)';
</script>

{#if pdfPath}
	<iframe
		class="resume-embed"
		src={pdfPath}
		title={pdfTitle}
		style:height={embedHeight}
		style:min-height="600px"
		style:width="100%"
	></iframe>
{:else}
	<p class="empty">This browser does not support PDFs.</p>
{/if}

<style>
	.empty {
		padding: 2rem;
		color: var(--color-ink-muted);
		text-align: center;
	}
</style>
