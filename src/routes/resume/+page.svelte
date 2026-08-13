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
		<div class="section-kicker">
			<span class="cat-no">Document</span>
			<h1>Resume</h1>
		</div>
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
		padding: 1.75rem 1.5rem 2.5rem;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.15rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--color-ink);
	}

	h1 {
		font-size: clamp(1.6rem, 3vw, 2.1rem);
	}

	.fallback {
		margin-top: 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		color: var(--color-ink-faint);
		text-align: center;
	}

	@media (max-width: 640px) {
		.toolbar {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
