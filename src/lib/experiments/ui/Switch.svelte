<script lang="ts">
	let {
		checked = $bindable(),
		label,
		onchange
	}: {
		checked: boolean;
		label: string;
		/** Called when the visitor flips it, but not when `checked` is set from code. For a control whose state the page owns and changes through a method. */
		onchange?: (checked: boolean) => void;
	} = $props();
</script>

<label class="switch">
	<input type="checkbox" bind:checked onchange={(event) => onchange?.(event.currentTarget.checked)} />
	<span>{label}</span>
</label>
