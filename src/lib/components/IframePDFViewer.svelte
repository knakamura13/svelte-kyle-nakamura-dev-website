<script>
	export let pdfPath = '';
	export let pdfTitle = '';
</script>

{#if pdfPath}
	<iframe
		class="pdf-viewer"
		src={pdfPath}
		type="application/pdf"
		title={pdfTitle}
		width="100%"
		height="600px"
	>
		This browser does not support PDFs. Please download the PDF to view it:
		<a href={pdfPath}>Download PDF</a>.
	</iframe>
{:else}
	<p>This browser does not support PDFs.</p>
{/if}

<style>
	.pdf-viewer {
		/* Add your styles here */
		border: none;
		height: 100%;
		width: 100%;
	}
</style>
