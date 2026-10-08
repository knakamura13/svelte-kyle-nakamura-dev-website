<script lang="ts" generics="T extends string">
	let {
		legend,
		name,
		value = $bindable(),
		options
	}: {
		legend: string;
		name: string;
		value: T;
		options: { value: T; label: string }[];
	} = $props();
</script>

<fieldset class="segmented">
	<legend>{legend}</legend>
	<div class="segments">
		{#each options as option (option.value)}
			<label class="segment">
				<input type="radio" {name} value={option.value} bind:group={value} />
				<span>{option.label}</span>
			</label>
		{/each}
	</div>
</fieldset>
