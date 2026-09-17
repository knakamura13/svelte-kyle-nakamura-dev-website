<script lang="ts">
 import { goto } from '$app/navigation';
 import { onMount } from 'svelte';
 onMount(() => { goto('/prototype/gallery', { replaceState: true }); });
</script>
<p><a href="/prototype/gallery">Open Gallery concept</a> · <a href="/prototype/workbench">Open Workbench concept</a></p>
