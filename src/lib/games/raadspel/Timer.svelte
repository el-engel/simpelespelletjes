<script lang="ts">
	import { onMount } from 'svelte';
	import { alarm, tick } from './sound.ts';
	import { formatSeconds } from './logic.ts';

	let { seconds, sound }: { seconds: number; sound: boolean } = $props();

	let endAt = 0;
	let left = $state(0);
	let paused = $state(false);
	let pausedLeft = 0;
	let lastTick = -1;
	let done = $state(false);

	const total = $derived(Math.max(1, seconds));
	const fraction = $derived(Math.max(0, Math.min(1, left / total)));
	const urgent = $derived(left <= 5 && !done);

	// Scherm aan houden zolang de timer loopt (als de telefoon dat ondersteunt).
	let lock: { release: () => Promise<void> } | null = null;
	async function keepAwake() {
		try {
			lock = (await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<typeof lock> } }).wakeLock?.request(
				'screen'
			)) ?? null;
		} catch {
			lock = null;
		}
	}

	function step() {
		if (paused || done) return;
		left = Math.max(0, (endAt - Date.now()) / 1000);
		const whole = Math.ceil(left);
		if (whole <= 5 && whole > 0 && whole !== lastTick) {
			lastTick = whole;
			if (sound) tick();
		}
		if (left <= 0) {
			done = true;
			if (sound) alarm();
			else navigator.vibrate?.([300, 150, 300]);
		}
	}

	onMount(() => {
		endAt = Date.now() + seconds * 1000;
		left = seconds;
		keepAwake();
		const timer = setInterval(step, 200);
		const onVisible = () => {
			if (document.visibilityState === 'visible' && !done) keepAwake();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
			lock?.release().catch(() => {});
		};
	});

	function togglePause() {
		if (done) return;
		if (paused) {
			endAt = Date.now() + pausedLeft * 1000;
			paused = false;
		} else {
			pausedLeft = left;
			paused = true;
		}
	}

	function restart() {
		done = false;
		paused = false;
		lastTick = -1;
		endAt = Date.now() + seconds * 1000;
		left = seconds;
	}
</script>

<div class="timer" class:urgent class:done role="timer" aria-live="off" data-testid="timer">
	<svg viewBox="0 0 120 120" aria-hidden="true">
		<circle class="track" cx="60" cy="60" r="52" />
		<circle class="bar" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="100" stroke-dashoffset={100 - fraction * 100} />
	</svg>
	<span class="time">{done ? 'Tijd!' : formatSeconds(left)}</span>
</div>
{#if done}
	<p class="up" role="alert">De tijd is om!</p>
	<button class="btn btn-small" onclick={restart}>Timer opnieuw</button>
{:else}
	<button class="btn btn-small" onclick={togglePause}>{paused ? 'Verder' : 'Pauze'}</button>
{/if}

<style>
	.timer {
		position: relative;
		width: 132px;
		height: 132px;
		display: grid;
		place-items: center;
	}
	svg {
		position: absolute;
		inset: 0;
		transform: rotate(-90deg);
	}
	circle {
		fill: none;
		stroke-width: 9;
	}
	.track {
		stroke: var(--line);
	}
	.bar {
		stroke: var(--cyan);
		stroke-linecap: round;
		transition: stroke-dashoffset 0.2s linear;
		filter: drop-shadow(0 0 6px rgb(92 242 255 / 0.7));
	}
	.time {
		font-family: var(--font-display);
		font-size: 2.2rem;
		color: var(--text);
	}
	.urgent .bar {
		stroke: var(--yellow);
	}
	.urgent .time {
		color: var(--yellow);
		animation: beat 1s ease-in-out infinite;
	}
	.done .bar {
		stroke: var(--red);
	}
	.done .time {
		color: var(--red);
		font-size: 1.8rem;
	}
	.up {
		margin: 0;
		font-weight: 700;
		color: var(--red);
	}
	@keyframes beat {
		50% {
			transform: scale(1.12);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.urgent .time {
			animation: none;
		}
	}
</style>
