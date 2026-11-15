<script lang="ts">
	import { onMount } from 'svelte';
	import type { FeedbackPrompt, FeedbackReason } from '#lib/types.ts';

	let {
		prompt,
		onPick,
		onClose,
		seconds = 10
	}: { prompt: FeedbackPrompt; onPick: (r: FeedbackReason) => void; onClose: () => void; seconds?: number } = $props();

	const options: { reason: FeedbackReason; icon: string; label: string }[] = [
		{ reason: 'te_moeilijk', icon: '🧩', label: 'Te moeilijk' },
		{ reason: 'leeftijd', icon: '🚫', label: 'Past niet bij deze leeftijd' },
		{ reason: 'niet_leuk', icon: '😐', label: 'Niet leuk genoeg' },
		{ reason: 'prima', icon: '👍', label: 'Niets aan de hand' }
	];

	let thanks = $state(false);
	let hold = $state(false);

	onMount(() => {
		const t = setTimeout(() => {
			if (!hold && !thanks) onClose();
		}, seconds * 1000);
		return () => clearTimeout(t);
	});

	function pick(r: FeedbackReason) {
		if (thanks) return;
		onPick(r);
		thanks = true;
		setTimeout(onClose, 1200);
	}
</script>

<aside
	class="bar"
	aria-label="Feedback over de vraag"
	data-testid="feedback"
	onpointerdown={() => (hold = true)}
	onfocusin={() => (hold = true)}
>
	{#if thanks}
		<p class="thanks" role="status">Bedankt! Daar maken we het spel beter mee.</p>
	{:else}
		<div class="head">
			<p class="q">
				{prompt.moment === 'niet_geraden' ? 'Het was:' : 'Overgeslagen:'} <strong>{prompt.text}</strong>
			</p>
			<button class="close" onclick={onClose} aria-label="Sluiten">✕</button>
		</div>
		<p class="ask">Was dit een geschikte vraag?</p>
		<div class="options">
			{#each options as o (o.reason)}
				<button class="opt" class:ok={o.reason === 'prima'} onclick={() => pick(o.reason)}>
					<span aria-hidden="true">{o.icon}</span>
					{o.label}
				</button>
			{/each}
		</div>
		{#if !hold}
			<div class="countdown" style="animation-duration: {seconds}s" aria-hidden="true"></div>
		{/if}
	{/if}
</aside>

<style>
	.bar {
		position: fixed;
		left: 50%;
		bottom: 0;
		transform: translateX(-50%);
		width: min(100%, 560px);
		z-index: 30;
		background: var(--surface);
		border: 2px solid var(--cyan);
		border-bottom: none;
		border-radius: 18px 18px 0 0;
		box-shadow: 0 -8px 30px rgb(0 0 0 / 0.6), var(--glow-cyan);
		padding: 12px 14px calc(14px + env(safe-area-inset-bottom));
		animation: up 0.25s ease-out;
	}
	.head {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}
	.q {
		flex: 1;
		margin: 0;
		color: var(--muted);
		font-size: 0.95rem;
		overflow-wrap: anywhere;
	}
	.q strong {
		color: var(--text);
	}
	.close {
		background: none;
		border: none;
		color: var(--muted);
		font-size: 1.2rem;
		min-width: 40px;
		min-height: 40px;
		margin: -8px -6px 0 0;
		cursor: pointer;
	}
	.ask {
		margin: 2px 0 10px;
		font-weight: 700;
		color: var(--cyan);
	}
	.options {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.opt {
		min-height: 52px;
		padding: 8px 10px;
		border-radius: 12px;
		border: 2px solid var(--line);
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		font-weight: 600;
		font-size: 0.95rem;
		line-height: 1.2;
		text-align: left;
		display: flex;
		gap: 8px;
		align-items: center;
		cursor: pointer;
	}
	.opt:active {
		border-color: var(--pink);
	}
	.opt.ok {
		border-color: var(--lime);
	}
	.thanks {
		margin: 6px 0;
		text-align: center;
		font-weight: 700;
		color: var(--lime);
	}
	.countdown {
		height: 3px;
		margin-top: 10px;
		background: var(--cyan);
		border-radius: 2px;
		transform-origin: left;
		animation-name: shrink;
		animation-timing-function: linear;
		animation-fill-mode: forwards;
	}
	@keyframes shrink {
		to {
			transform: scaleX(0);
		}
	}
	@keyframes up {
		from {
			transform: translate(-50%, 100%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bar {
			animation: none;
		}
	}
</style>
