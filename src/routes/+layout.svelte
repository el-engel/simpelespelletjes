<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { reportVisit } from '#lib/stats/tracker.ts';

	let { children } = $props();

	// Unieke bezoekers tellen (anoniem, één keer per dag per toestel). Beheer telt niet mee.
	onMount(() => {
		if (!page.url.pathname.startsWith('/beheer')) reportVisit();
	});
</script>

{@render children()}
