<script lang="ts">
	interface Props {
		pdfPath?: string;
		pdfTitle?: string;
	}

	let { pdfPath = '', pdfTitle = '' }: Props = $props();
</script>

{#if pdfPath}
	<iframe class="pdf-viewer" src={pdfPath} title={pdfTitle}></iframe>
	<p class="fallback">
		Can't view the PDF?
		<a class="prose-link" href={pdfPath} target="_blank" rel="noopener noreferrer">Open or download it</a>.
	</p>
{:else}
	<p>This browser does not support PDFs.</p>
{/if}

<style>
	.pdf-viewer {
		display: block;
		border: none;
		height: 100%;
		width: 100%;
	}

	.fallback {
		margin-top: 0.75rem;
		font-size: 0.85rem;
		color: var(--color-ink-muted);
	}
</style>
