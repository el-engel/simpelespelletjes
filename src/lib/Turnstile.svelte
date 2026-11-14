<script lang="ts">
	import { onMount } from 'svelte';

	let { siteKey, onToken, onError }: { siteKey: string; onToken: (t: string) => void; onError?: () => void } =
		$props();

	let el: HTMLDivElement;
	let widgetId: string | undefined;

	const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

	function load(): Promise<void> {
		if (window.turnstile) return Promise.resolve();
		return new Promise((resolve, reject) => {
			const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
			const s = existing ?? document.createElement('script');
			s.addEventListener('load', () => resolve());
			s.addEventListener('error', () => reject(new Error('turnstile')));
			if (!existing) {
				s.src = SRC;
				s.async = true;
				document.head.appendChild(s);
			}
		});
	}

	onMount(() => {
		let cancelled = false;
		load()
			.then(() => {
				if (cancelled || !window.turnstile) return;
				widgetId = window.turnstile.render(el, {
					sitekey: siteKey,
					language: 'nl',
					appearance: 'interaction-only',
					callback: (t: string) => onToken(t),
					'error-callback': () => onError?.(),
					'expired-callback': () => window.turnstile?.reset(widgetId)
				});
			})
			.catch(() => onError?.());
		return () => {
			cancelled = true;
			if (widgetId) window.turnstile?.remove(widgetId);
		};
	});

	export function reset() {
		if (widgetId) window.turnstile?.reset(widgetId);
	}
</script>

<div bind:this={el}></div>
