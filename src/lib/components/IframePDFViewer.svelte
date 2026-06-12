<script lang="ts">
	interface Props {
		pdfPath?: string;
		pdfTitle?: string;
	}

	let { pdfPath = '', pdfTitle = '' }: Props = $props();
</script>

{#if pdfPath}
	<iframe class="pdf-viewer" src={pdfPath} title={pdfTitle}>
		This browser does not support PDFs. Please download the PDF to view it:
		<a href={pdfPath}>Download PDF</a>.
	</iframe>
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
</style>
