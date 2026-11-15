<script lang="ts">
	import { onMount } from 'svelte';
	import { gamePicker } from '#lib/admin/useGame.svelte.ts';
	import { message } from '#lib/admin/api.ts';
	import GamePeriod from '#lib/admin/GamePeriod.svelte';
	import BarChart, { type Bar } from '#lib/admin/charts/BarChart.svelte';
	import HBars from '#lib/admin/charts/HBars.svelte';
	import Heatmap from '#lib/admin/charts/Heatmap.svelte';
	import {
		AGE_GROUPS,
		downloadXlsx,
		feedbackSheet,
		fmtPct,
		guessRate,
		loadQuestionStats,
		loadStats,
		pct,
		periodLabel,
		periodRange,
		statsSheets,
		type QuestionStat,
		type SeriesPoint,
		type Stats
	} from '#lib/admin/stats.ts';

	const picker = gamePicker();

	let days = $state(30);
	let unit = $state<SeriesPoint['unit']>('day');
	let stats = $state<Stats | null>(null);
	let questions = $state<QuestionStat[]>([]);
	let loading = $state(false);
	let error = $state('');

	const game = $derived(picker.current);
	const range = $derived(periodRange(days));

	onMount(() => picker.load());

	$effect(() => {
		const id = game?.id;
		const r = range;
		if (id) reload(id, r.from, r.to);
	});

	// Per dag past niet goed bij een heel jaar: kies automatisch een handige indeling.
	$effect(() => {
		unit = days <= 30 ? 'day' : days <= 90 ? 'week' : 'month';
	});

	async function reload(gameId: string, from: string, to: string) {
		loading = true;
		error = '';
		try {
			[stats, questions] = await Promise.all([loadStats(gameId, from, to), loadQuestionStats(gameId, from, to)]);
		} catch (e) {
			error = message(e);
		} finally {
			loading = false;
		}
	}

	const points = $derived((stats?.series ?? []).filter((p) => p.unit === unit));
	const gameBars = $derived<Bar[]>(
		points.map((p) => ({
			label: periodLabel(unit, p.period),
			values: [p.completed, p.games - p.completed],
			tip: `${periodLabel(unit, p.period)}\n${p.games} spellen, ${p.completed} afgemaakt`
		}))
	);
	const visitorBars = $derived<Bar[]>(
		points.map((p) => ({
			label: periodLabel(unit, p.period),
			values: [p.new_visitors, p.visitors - p.new_visitors],
			tip: `${periodLabel(unit, p.period)}\n${p.visitors} unieke bezoekers\n${p.new_visitors} nieuw, ${p.visitors - p.new_visitors} terug`
		}))
	);
	const ageRows = $derived(
		AGE_GROUPS.map((g) => ({
			label: g === 'onbekend' ? g : `${g} jaar`,
			value: stats?.ages.find((a) => a.group === g)?.games ?? 0
		})).filter((r) => r.value > 0 || r.label !== 'onbekend')
	);
	const playerRows = $derived((stats?.players ?? []).map((p) => ({ label: `${p.players} spelers`, value: p.games })));
	const taskRows = $derived(
		(stats?.task_types ?? []).map((t) => ({ label: t.name, value: pct(t.games_on, stats?.summary.games ?? 0) ?? 0 }))
	);
	const categoryRows = $derived(
		(stats?.categories ?? [])
			.map((c) => ({ label: c.name, value: pct(c.games_on, c.games_allowed) ?? 0 }))
			.sort((a, b) => b.value - a.value)
	);
	const played = $derived(questions.filter((q) => q.plays > 0));
	const mostPlayed = $derived([...played].sort((a, b) => b.plays - a.plays).slice(0, 10));
	const leastGuessed = $derived(
		played
			.filter((q) => q.guessed + q.not_guessed >= 3)
			.sort((a, b) => (guessRate(a) ?? 0) - (guessRate(b) ?? 0))
			.slice(0, 10)
	);
	const mostSkipped = $derived(
		played
			.filter((q) => q.swapped > 0)
			.sort((a, b) => b.swapped / b.plays - a.swapped / a.plays || b.swapped - a.swapped)
			.slice(0, 10)
	);
	const ageGuess = $derived(
		AGE_GROUPS.map((g) => {
			const t = questions.reduce(
				(acc, q) => {
					const a = q.by_age[g];
					if (a) {
						acc.guessed += a.guessed;
						acc.not_guessed += a.not_guessed;
						acc.swapped += a.swapped;
						acc.plays += a.plays;
					}
					return acc;
				},
				{ guessed: 0, not_guessed: 0, swapped: 0, plays: 0 }
			);
			return { group: g, ...t };
		}).filter((r) => r.plays > 0)
	);

	async function exportXlsx() {
		if (!stats) return;
		const r = range;
		const sheets = [...statsSheets(stats, r.from, r.to), feedbackSheet(questions)];
		await downloadXlsx(sheets, `statistieken-${game?.slug ?? 'spel'}-${r.from}-tm-${r.to}.xlsx`);
	}
</script>

<main class="container wide stack">
	<GamePeriod title="Statistieken" games={picker.games} {game} onGame={picker.select} bind:days />
	<p class="muted">
		Alles is anoniem: er worden geen namen of IP-adressen bewaard. Een bezoeker is een toestel (telefoon of browser).
		Speelt iemand op twee toestellen, dan telt dat als twee.
	</p>
	{#if picker.error}<p class="error">{picker.error}</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	{#if loading && !stats}
		<p class="muted">Statistieken laden…</p>
	{:else if stats}
		{@const s = stats.summary}
		{@const v = stats.visitors}
		<div class="row toolbar">
			<span class="spacer"></span>
			<button class="btn" onclick={exportXlsx}>Download Excel</button>
		</div>

		<section class="tiles" aria-label="Kerncijfers">
			<div class="tile"><span class="big" data-testid="stat-bezoekers">{v.visitors}</span><span>unieke bezoekers</span><small>{v.new} nieuw · {v.returning} terug</small></div>
			<div class="tile"><span class="big" data-testid="stat-spellen">{s.games}</span><span>gespeelde spellen</span><small>{fmtPct(pct(s.completed, s.games))} afgemaakt</small></div>
			<div class="tile"><span class="big">{s.avg_minutes ?? '–'}</span><span>minuten per spel</span><small>gemiddeld {s.avg_turns ?? '–'} beurten</small></div>
			<div class="tile"><span class="big">{s.avg_players ?? '–'}</span><span>spelers per spel</span><small>gemiddeld</small></div>
			<div class="tile"><span class="big">{fmtPct(guessRate(stats.questions))}</span><span>van de vragen geraden</span><small>{stats.questions.swapped}× andere vraag gekozen</small></div>
		</section>

		<section class="card stack">
			<div class="row">
				<h2>Spellen en bezoekers</h2>
				<span class="spacer"></span>
				<div class="seg" role="group" aria-label="Indeling">
					{#each [['day', 'Per dag'], ['week', 'Per week'], ['month', 'Per maand']] as [u, label] (u)}
						<button class:on={unit === u} aria-pressed={unit === u} onclick={() => (unit = u as SeriesPoint['unit'])}>{label}</button>
					{/each}
				</div>
			</div>
			<div class="two">
				<div>
					<h3>Gespeelde spellen</h3>
					<BarChart title="Gespeelde spellen" bars={gameBars} series={['Afgemaakt', 'Niet afgemaakt']} />
				</div>
				<div>
					<h3>Unieke bezoekers</h3>
					<BarChart title="Unieke bezoekers" bars={visitorBars} series={['Nieuw', 'Terugkerend']} />
				</div>
			</div>
		</section>

		<section class="card stack">
			<h2>Wanneer wordt er gespeeld?</h2>
			<Heatmap cells={stats.heatmap} />
		</section>

		<div class="two">
			<section class="card stack">
				<h2>Hoe eindigen spellen?</h2>
				<HBars
					rows={[
						{ label: 'Afgemaakt', value: s.completed },
						{ label: 'Gestopt met uitslag', value: s.stopped },
						{ label: 'Gestopt via menu', value: s.quit },
						{ label: 'Weggegaan', value: s.unfinished }
					]}
				/>
				<p class="small muted">
					"Mag vragen overslaan" aan in {s.skip_games} van de {s.games} spellen ({fmtPct(pct(s.skip_games, s.games))}).
					"Alles al gespeeld?" kwam {s.repeats_offered}× in beeld; {s.played_repeats}× werd er op "Toch spelen" gedrukt.
				</p>
			</section>
			<section class="card stack">
				<h2>Leeftijd jongste speler</h2>
				<HBars rows={ageRows} />
			</section>
			<section class="card stack">
				<h2>Aantal spelers</h2>
				<HBars rows={playerRows} />
			</section>
			<section class="card stack">
				<h2>Soorten opdrachten aan</h2>
				<HBars rows={taskRows} unit="%" />
				<p class="small muted">Percentage van de spellen waarin deze soort aan stond.</p>
			</section>
			<section class="card stack">
				<h2>Categorieën aan</h2>
				<HBars rows={categoryRows} unit="%" />
				<p class="small muted">Percentage van de spellen waarin de categorie aan stond (18+ alleen als dat mocht).</p>
			</section>
			<section class="card stack">
				<h2>Raadpercentage per leeftijd</h2>
				<table class="mini">
					<thead><tr><th>Leeftijd jongste</th><th class="num">Vragen</th><th class="num">Geraden</th><th class="num">Overgeslagen</th></tr></thead>
					<tbody>
						{#each ageGuess as a (a.group)}
							<tr>
								<td>{a.group === 'onbekend' ? a.group : `${a.group} jaar`}</td>
								<td class="num">{a.plays}</td>
								<td class="num">{fmtPct(guessRate(a))}</td>
								<td class="num">{fmtPct(pct(a.swapped, a.plays))}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		</div>

		<div class="two">
			<section class="card stack">
				<h2>Minst vaak geraden</h2>
				<table class="mini">
					<thead><tr><th>Vraag</th><th class="num">Gespeeld</th><th class="num">Geraden</th></tr></thead>
					<tbody>
						{#each leastGuessed as q (q.id)}
							<tr><td>{q.text} <span class="small muted">{q.public_id}</span></td><td class="num">{q.plays}</td><td class="num">{fmtPct(guessRate(q))}</td></tr>
						{:else}
							<tr><td colspan="3" class="muted">Nog te weinig gegevens (een vraag moet minstens 3 keer gespeeld zijn).</td></tr>
						{/each}
					</tbody>
				</table>
			</section>
			<section class="card stack">
				<h2>Vaakst overgeslagen</h2>
				<table class="mini">
					<thead><tr><th>Vraag</th><th class="num">Gespeeld</th><th class="num">Overgeslagen</th></tr></thead>
					<tbody>
						{#each mostSkipped as q (q.id)}
							<tr><td>{q.text} <span class="small muted">{q.public_id}</span></td><td class="num">{q.plays}</td><td class="num">{q.swapped}×</td></tr>
						{:else}
							<tr><td colspan="3" class="muted">Nog geen vragen overgeslagen.</td></tr>
						{/each}
					</tbody>
				</table>
			</section>
			<section class="card stack">
				<h2>Meest gespeeld</h2>
				<table class="mini">
					<thead><tr><th>Vraag</th><th class="num">Gespeeld</th></tr></thead>
					<tbody>
						{#each mostPlayed as q (q.id)}
							<tr><td>{q.text} <span class="small muted">{q.public_id}</span></td><td class="num">{q.plays}</td></tr>
						{:else}
							<tr><td colspan="2" class="muted">Nog niets gespeeld.</td></tr>
						{/each}
					</tbody>
				</table>
				<p class="small muted">De volledige lijst per vraag (ook de minst gespeelde) staat in de Excel-download.</p>
			</section>
		</div>
	{/if}
</main>

<style>
	.toolbar {
		margin-top: -8px;
	}
	.spacer {
		flex: 1;
	}
	h2,
	h3 {
		margin: 0;
	}
	h3 {
		font-size: 1rem;
		color: var(--muted);
		margin-bottom: 8px;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: 12px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--surface);
		border: 2px solid var(--line);
		border-radius: var(--radius);
		padding: 14px 16px;
	}
	.big {
		font-family: var(--font-display);
		font-size: 1.9rem;
		color: var(--text);
	}
	.tile small {
		color: var(--muted);
	}
	.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
		gap: 16px;
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
	}
	.seg button {
		background: none;
		border: none;
		color: var(--muted);
		font: inherit;
		padding: 6px 12px;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--surface-2);
		color: var(--text);
		font-weight: 600;
	}
	.mini {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	.mini th,
	.mini td {
		padding: 6px 8px;
		border-bottom: 1px solid var(--line);
		text-align: left;
	}
	.num {
		text-align: right !important;
		font-variant-numeric: tabular-nums;
	}
</style>
