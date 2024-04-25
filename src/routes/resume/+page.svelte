<script>
	import IframePDFViewer from '$lib/components/IframePDFViewer.svelte';

	const pdfPath = '/documents/resume.pdf'; // Update this path
</script>

<svelte:head>
	<title>Kyle's Resume</title>
</svelte:head>

<section class="page" id="resume">
	<IframePDFViewer {pdfPath} />
</section>

<style lang="scss">
	.page#resume {
		padding: 0;
		max-width: 72rem;
	}
</style>
