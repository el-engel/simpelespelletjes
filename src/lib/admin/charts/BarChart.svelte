<script lang="ts">
	import { SERIES } from './colors.ts';

	export interface Bar {
		label: string;
		/** Eén waarde per reeks; meerdere reeksen worden op elkaar gestapeld. */
		values: number[];
		tip: string;
	}

	let {
		bars,
		series,
		title,
		height = 180
	}: { bars: Bar[]; series: string[]; title: string; height?: number } = $props();

	let hover = $state<number | null>(null);

	const max = $derived(Math.max(1, ...bars.map((b) => b.values.reduce((a, v) => a + v, 0))));
	const niceMax = $derived.by(() => {
		const p = 10 ** Math.floor(Math.log10(max));
		const steps = [1, 2, 2.5, 5, 10];
		return (steps.find((s) => s * p >= max) ?? 10) * p;
	});
	const every = $derived(Math.max(1, Math.ceil(bars.length / 10)));
	const total = (b: Bar) => b.values.reduce((a, v) => a + v, 0);
</script>

<figure class="chart">
	<figcaption class="sr-only">{title}</figcaption>
	{#if series.length > 1}
		<div class="legend" aria-hidden="true">
			{#each series as name, i (name)}
				<span><i style="background: {SERIES[i]}"></i>{name}</span>
			{/each}
		</div>
	{/if}
	<div class="plot" style="height: {height}px">
		<div class="grid" aria-hidden="true">
			<span style="bottom: 100%">{niceMax}</span>
			<span style="bottom: 50%">{niceMax / 2}</span>
			<span style="bottom: 0">0</span>
		</div>
		<div class="bars" role="list" onmouseleave={() => (hover = null)}>
			{#each bars as b, i (b.label + i)}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class="col"
					role="listitem"
					tabindex="0"
					aria-label={b.tip}
					onmouseenter={() => (hover = i)}
					onfocus={() => (hover = i)}
					onblur={() => (hover = null)}
				>
					<div class="stack" style="height: {(total(b) / niceMax) * 100}%">
						{#each b.values as v, s (s)}
							{#if v > 0}
								<div class="seg" style="flex: {v}; background: {SERIES[s]}"></div>
							{/if}
						{/each}
					</div>
					{#if hover === i}
						<div class="tip" class:right={i > bars.length / 2}>{b.tip}</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
	<div class="labels" aria-hidden="true">
		{#each bars as b, i (b.label + i)}
			<span>{i % every === 0 ? b.label : ''}</span>
		{/each}
	</div>
</figure>

<style>
	.chart {
		margin: 0;
	}
	.legend {
		display: flex;
		gap: 16px;
		font-size: 0.85rem;
		color: var(--muted);
		margin-bottom: 8px;
	}
	.legend i {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		margin-right: 6px;
	}
	.plot {
		position: relative;
		margin-left: 34px;
	}
	.grid span {
		position: absolute;
		left: -34px;
		right: 0;
		border-bottom: 1px solid rgb(179 170 222 / 0.15);
		font-size: 0.7rem;
		color: var(--muted);
		line-height: 0;
	}
	.bars {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: flex-end;
		gap: 2px;
	}
	.col {
		position: relative;
		flex: 1;
		height: 100%;
		display: flex;
		align-items: flex-end;
		min-width: 2px;
		outline: none;
	}
	.col:hover .stack,
	.col:focus-visible .stack {
		filter: brightness(1.25);
	}
	.stack {
		width: 100%;
		max-width: 36px;
		margin: 0 auto;
		display: flex;
		flex-direction: column-reverse;
		gap: 2px;
		border-radius: 4px 4px 0 0;
		overflow: hidden;
	}
	.seg {
		min-height: 1px;
	}
	.tip {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		z-index: 5;
		white-space: pre;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 6px 8px;
		font-size: 0.8rem;
		color: var(--text);
		pointer-events: none;
	}
	.tip.right {
		left: auto;
		right: 0;
	}
	.labels {
		display: flex;
		gap: 2px;
		margin-left: 34px;
		margin-top: 4px;
	}
	.labels span {
		flex: 1;
		min-width: 2px;
		font-size: 0.7rem;
		color: var(--muted);
		white-space: nowrap;
		overflow: visible;
	}
</style>
