<script>
	import IframePDFViewer from '$lib/components/IframePDFViewer.svelte';

	const pdfPath = '/documents/resume.pdf'; // Update this path
</script>

<section class="page" id="resume">
	<IframePDFViewer {pdfPath} />
</section>

<style lang="scss">
	.page#resume {
		padding: 0;
		max-width: 72rem;
	}
</style>
