<script lang="ts">
	let { checked = $bindable(), label }: { checked: boolean; label: string } = $props();
</script>

<label class="switch">
	<input type="checkbox" bind:checked />
	<span>{label}</span>
</label>
