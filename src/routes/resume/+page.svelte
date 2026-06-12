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

	<div class="viewer">
		<IframePDFViewer {pdfPath} pdfTitle="Kyle Nakamura's Resume" />
	</div>

	<p class="fallback">
		Can't view the PDF?
		<a class="prose-link" href={pdfPath} target="_blank" rel="noopener noreferrer">Open or download it</a>.
	</p>
</div>

<style>
	.resume-page {
		flex: 1;
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 72rem;
		margin-inline: auto;
		padding: 1.5rem;
		gap: 0.75rem;
		min-height: 0;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-shrink: 0;
	}

	h1 {
		font-size: 1.5rem;
	}

	.viewer {
		flex: 1;
		height: calc(100dvh - 11rem);
		min-height: 32rem;
		border: 1px solid var(--color-edge);
		border-radius: 12px;
		overflow: hidden;
		background: var(--color-raised);
	}

	.fallback {
		flex-shrink: 0;
		font-size: 0.85rem;
		color: var(--color-ink-faint);
		text-align: center;
	}
</style>
