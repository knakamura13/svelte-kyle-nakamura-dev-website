<script lang="ts">
	import { AppBar } from '@skeletonlabs/skeleton';
</script>

<AppBar>
	<svelte:fragment slot="lead">
		<strong class="text-xl uppercase">Kyle Nakamura</strong>
	</svelte:fragment>

	<svelte:fragment slot="trail">
		<a
			class="btn btn-sm variant-ghost-surface"
			href="https://linkedin.com/in/kylenakamura"
			aria-label="Go to Kyle Nakamura's LinkedIn profile"
			title="Go to Kyle Nakamura's LinkedIn profile"
			target="_blank"
			rel="noreferrer"
		>
			LinkedIn
		</a>

		<a
			class="btn btn-sm variant-ghost-surface"
			href="https://github.com/knakamura13"
			aria-label="Go to Kyle Nakamura's GitHub profile"
			title="Go to Kyle Nakamura's GitHub profile"
			target="_blank"
			rel="noreferrer"
		>
			GitHub
		</a>
	</svelte:fragment>
</AppBar>
