<script lang="ts" generics="T extends string">
	let {
		legend,
		name,
		value = $bindable(),
		options,
		onchange
	}: {
		legend: string;
		name: string;
		value: T;
		options: { value: T; label: string }[];
		/** Called when the visitor picks an option, but not when `value` is set from code. For a control whose value the page owns and changes through a method. */
		onchange?: (value: T) => void;
	} = $props();
</script>

<fieldset class="segmented">
	<legend>{legend}</legend>
	<div class="segments">
		{#each options as option (option.value)}
			<label class="segment">
				<input type="radio" {name} value={option.value} bind:group={value} onchange={() => onchange?.(option.value)} />
				<span>{option.label}</span>
			</label>
		{/each}
	</div>
</fieldset>
