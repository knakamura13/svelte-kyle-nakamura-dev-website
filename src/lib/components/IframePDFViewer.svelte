<script lang="ts">
	interface Props {
		pdfPath?: string;
		pdfTitle?: string;
	}

	let { pdfPath = '', pdfTitle = '' }: Props = $props();
</script>

{#if pdfPath}
	<div class="pdf-shell">
		<iframe class="pdf-viewer" src={pdfPath} title={pdfTitle}></iframe>
	</div>
{:else}
	<p class="empty">This browser does not support PDFs.</p>
{/if}

<style>
	.pdf-shell {
		height: 100%;
		width: 100%;
	}

	.pdf-viewer {
		display: block;
		border: none;
		height: 100%;
		width: 100%;
	}

	.empty {
		padding: 2rem;
		color: var(--color-ink-muted);
		text-align: center;
	}
</style>
