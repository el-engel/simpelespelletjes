import type { Component } from 'svelte';
import type { StartData } from '#lib/types.ts';
import Raadspel from './raadspel/Raadspel.svelte';

export interface GameProps {
	start: StartData;
	/** Spel afgesloten of gebruiker wil terug naar het menu. */
	onExit: () => void;
	/** Spel-token verlopen: opnieuw botcheck doen. */
	onExpired: () => void;
}

/**
 * Elk spel heeft een eigen map in src/lib/games/<slug>/ met één hoofdcomponent.
 * Een nieuw spel toevoegen: maak de map, voeg hier één regel toe en maak het
 * spel aan in /beheer met dezelfde slug.
 */
export const games: Record<string, Component<GameProps>> = {
	raadspel: Raadspel
};
