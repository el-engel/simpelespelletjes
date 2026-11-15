import { tick } from 'svelte';

/** Zet het scherm bovenaan zodra een nieuw spelscherm verschijnt. */
export async function toTop() {
	await tick();
	if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}
