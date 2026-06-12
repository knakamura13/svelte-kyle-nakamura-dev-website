<script lang="ts">
	import IframePDFViewer from '$lib/components/IframePDFViewer.svelte';
	import AnimatedButton from '$lib/components/AnimatedButton.svelte';

	const pdfPath = '/documents/resume.pdf';
</script>

<svelte:head>
	<title>Kyle's Resume</title>
</svelte:head>

<div class="resume-page fade-rise">
	<div class="toolbar">
		<h1>Resume</h1>
		<AnimatedButton
			href={pdfPath}
			ariaLabel="Download my resume as a PDF"
			icon="/icons/icon-arrow-light.svg"
			iconSize="small"
		>
			Download PDF
		</AnimatedButton>
	</div>

	<IframePDFViewer {pdfPath} pdfTitle="Kyle Nakamura's Resume" />

	<p class="fallback">
		Can't view the PDF?
		<a class="prose-link" href={pdfPath} target="_blank" rel="noopener noreferrer">Open or download it</a>.
	</p>
</div>

<style>
	.resume-page {
		width: 100%;
		max-width: 72rem;
		margin-inline: auto;
		padding: 1.5rem;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	h1 {
		font-size: 1.5rem;
	}

	.fallback {
		margin-top: 0.75rem;
		font-size: 0.85rem;
		color: var(--color-ink-faint);
		text-align: center;
	}
</style>
