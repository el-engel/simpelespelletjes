<script lang="ts">
	import { onMount } from 'svelte';
	import { gamePicker } from '#lib/admin/useGame.svelte.ts';
	import { message, setActive } from '#lib/admin/api.ts';
	import GamePeriod from '#lib/admin/GamePeriod.svelte';
	import {
		AGE_GROUPS,
		dismissFeedback,
		downloadXlsx,
		feedbackSheet,
		fmtPct,
		guessRate,
		hint,
		loadQuestionStats,
		pct,
		periodRange,
		setMinAge,
		sortFeedback,
		type FeedbackSort,
		type QuestionStat
	} from '#lib/admin/stats.ts';

	const picker = gamePicker();
	const PAGE = 50;

	let days = $state(90);
	let rows = $state<QuestionStat[]>([]);
	let loading = $state(false);
	let error = $state('');
	let info = $state('');
	let onlyReported = $state(true);
	let sortKey = $state<FeedbackSort>('reports');
	let ageFilter = $state('');
	let search = $state('');
	let pageNo = $state(0);
	let openId = $state<string | null>(null);
	let ages = $state<Record<string, number>>({});

	const game = $derived(picker.current);
	const range = $derived(periodRange(days));
	const filtered = $derived.by(() => {
		const s = search.trim().toLowerCase();
		let list = rows.filter(
			(q) =>
				(!onlyReported || q.reports > 0) &&
				(!s || q.text.toLowerCase().includes(s) || q.public_id.toLowerCase().includes(s)) &&
				(!ageFilter || (q.by_age[ageFilter]?.reports ?? 0) > 0 || (!onlyReported && (q.by_age[ageFilter]?.plays ?? 0) > 0))
		);
		list = sortFeedback(list, sortKey);
		return list;
	});
	const pages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE)));
	const visible = $derived(filtered.slice(pageNo * PAGE, pageNo * PAGE + PAGE));
	const totalReports = $derived(rows.reduce((n, q) => n + q.reports, 0));

	onMount(() => picker.load());

	$effect(() => {
		const id = game?.id;
		const r = range;
		if (id) reload(id, r.from, r.to);
	});

	$effect(() => {
		void [onlyReported, sortKey, ageFilter, search];
		pageNo = 0;
	});

	async function reload(gameId = game?.id, from = range.from, to = range.to) {
		if (!gameId) return;
		loading = true;
		error = '';
		try {
			rows = await loadQuestionStats(gameId, from, to);
			ages = Object.fromEntries(rows.map((q) => [q.id, q.min_age]));
		} catch (e) {
			error = message(e);
		} finally {
			loading = false;
		}
	}

	async function act(fn: () => Promise<void>, done: string) {
		error = '';
		info = '';
		try {
			await fn();
			info = done;
			await reload();
		} catch (e) {
			error = message(e);
		}
	}

	const saveAge = (q: QuestionStat) => {
		const a = Math.round(Number(ages[q.id]));
		if (!Number.isFinite(a) || a < 0 || a > 99) return (error = 'Kies een leeftijd van 0 tot 99.');
		return act(() => setMinAge(q.id, a), `Minimumleeftijd van ${q.public_id} is nu ${a}.`);
	};
	const toggleActive = (q: QuestionStat) =>
		act(() => setActive([q.id], !q.active), q.active ? `${q.public_id} is uitgezet.` : `${q.public_id} staat weer aan.`);
	const ignore = (q: QuestionStat) =>
		act(() => dismissFeedback(q.id), `Meldingen over ${q.public_id} worden genegeerd.`);

	async function exportXlsx() {
		await downloadXlsx([feedbackSheet(filtered)], `feedback-${game?.slug ?? 'spel'}-${range.from}-tm-${range.to}.xlsx`);
	}
</script>

<main class="container wide stack">
	<GamePeriod title="Feedback" games={picker.games} {game} onGame={picker.select} bind:days />
	<p class="muted">
		Hier zie je welke vragen spelers melden met de knoppen na <em>Andere vraag</em> of <em>Niemand heeft het geraden</em>.
		Bovenaan staan de vragen met de meeste meldingen. Er worden geen namen opgeslagen.
	</p>
	{#if picker.error}<p class="error">{picker.error}</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if info}<p class="success" role="status">{info}</p>{/if}

	<section class="card filters">
		<label class="check"><input type="checkbox" bind:checked={onlyReported} /> Alleen gemelde vragen</label>
		<div class="field">
			<label for="sorteer">Sorteren op</label>
			<select id="sorteer" bind:value={sortKey}>
				<option value="reports">Meeste meldingen</option>
				<option value="rate">Hoogste percentage meldingen</option>
				<option value="guess">Laagste raadpercentage</option>
			</select>
		</div>
		<div class="field">
			<label for="leeftijd">Leeftijdsgroep</label>
			<select id="leeftijd" bind:value={ageFilter}>
				<option value="">Alle leeftijden</option>
				{#each AGE_GROUPS as g (g)}<option value={g}>{g === 'onbekend' ? g : `${g} jaar`}</option>{/each}
			</select>
		</div>
		<div class="field">
			<label for="zoek">Zoeken</label>
			<input id="zoek" type="search" placeholder="Vraag of ID" bind:value={search} />
		</div>
		<div class="field end">
			<button class="btn" onclick={exportXlsx} disabled={!filtered.length}>Download Excel</button>
		</div>
	</section>

	{#if loading && !rows.length}
		<p class="muted">Feedback laden…</p>
	{:else if !rows.length}
		<p class="card empty">Nog geen gegevens in deze periode. Zodra er gespeeld wordt, verschijnen de vragen hier.</p>
	{:else}
		<p class="muted small">
			{filtered.length} vragen · {totalReports} meldingen in deze periode
		</p>
		<div class="tablewrap">
			<table class="stacked">
				<thead>
					<tr>
						<th>ID</th>
						<th>Vraag</th>
						<th class="num">Gespeeld</th>
						<th class="num">Gemeld</th>
						<th>Waarom</th>
						<th class="num">Geraden</th>
						<th>Acties</th>
					</tr>
				</thead>
				<tbody>
					{#each visible as q (q.id)}
						{@const h = hint(q)}
						<tr class="frow" class:inactive={!q.active}>
							<td class="mono id">{q.public_id}</td>
							<td class="q">
								<button class="linkish" onclick={() => (openId = openId === q.id ? null : q.id)} aria-expanded={openId === q.id}>
									{q.text}
								</button>
								<div class="small muted">
									min. {q.min_age} jaar{#if !q.active} · <span class="badge">uit</span>{/if}
								</div>
								{#if h}<div class="hint">{h}</div>{/if}
							</td>
							<td class="num n1" data-label="Gespeeld">{q.plays}</td>
							<td class="num n2" data-label="Gemeld">
								<strong>{q.reports}</strong>
								<div class="small muted">{fmtPct(pct(q.reports, q.plays))}</div>
							</td>
							<td class="reasons" data-label="Waarom">
								{#if q.te_moeilijk}<span class="badge">🧩 te moeilijk {q.te_moeilijk}</span>{/if}
								{#if q.leeftijd}<span class="badge">🚫 leeftijd {q.leeftijd}</span>{/if}
								{#if q.niet_leuk}<span class="badge">😐 niet leuk {q.niet_leuk}</span>{/if}
								{#if q.prima}<span class="badge badge-on">👍 prima {q.prima}</span>{/if}
								{#if q.dismissed}<span class="small muted">{q.dismissed} genegeerd</span>{/if}
							</td>
							<td class="num n3" data-label="Geraden">{fmtPct(guessRate(q))}<div class="small muted">{q.swapped}× overgeslagen</div></td>
							<td class="actions">
								<div class="row age">
									<label class="sr-only" for="age-{q.id}">Minimumleeftijd {q.public_id}</label>
									<input id="age-{q.id}" type="number" min="0" max="99" bind:value={ages[q.id]} />
									<button class="btn btn-small" onclick={() => saveAge(q)} disabled={ages[q.id] === q.min_age}>
										Leeftijd opslaan
									</button>
								</div>
								<div class="row">
									<button class="btn btn-small" onclick={() => toggleActive(q)}>{q.active ? 'Uitzetten' : 'Aanzetten'}</button>
									{#if q.reports > 0}
										<button class="btn btn-small" onclick={() => ignore(q)}>Negeren</button>
									{/if}
								</div>
							</td>
						</tr>
						{#if openId === q.id}
							<tr class="detail">
								<td></td>
								<td colspan="6">
									<div class="agewrap">
									<table class="ages">
										<thead>
											<tr><th>Leeftijd jongste</th><th class="num">Gespeeld</th><th class="num">Geraden</th><th class="num">Overgeslagen</th><th class="num">Meldingen</th></tr>
										</thead>
										<tbody>
											{#each AGE_GROUPS.filter((g) => q.by_age[g]) as g (g)}
												{@const a = q.by_age[g]}
												<tr>
													<td>{g === 'onbekend' ? g : `${g} jaar`}</td>
													<td class="num">{a.plays}</td>
													<td class="num">{fmtPct(guessRate(a))}</td>
													<td class="num">{a.swapped}</td>
													<td class="num">{a.reports}</td>
												</tr>
											{/each}
										</tbody>
									</table>
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
		{#if pages > 1}
			<div class="row pager">
				<button class="btn btn-small" disabled={pageNo === 0} onclick={() => pageNo--}>Vorige</button>
				<span>Pagina {pageNo + 1} van {pages}</span>
				<button class="btn btn-small" disabled={pageNo >= pages - 1} onclick={() => pageNo++}>Volgende</button>
			</div>
		{/if}
	{/if}
</main>

<style>
	.filters {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 12px;
		align-items: end;
	}
	.filters .end {
		justify-content: flex-end;
	}
	.tablewrap {
		position: relative;
		overflow-x: auto;
		background: var(--surface);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.95rem;
	}
	th,
	td {
		padding: 8px 10px;
		border-bottom: 1px solid var(--line);
		text-align: left;
		vertical-align: top;
	}
	th {
		background: var(--surface-2);
		white-space: nowrap;
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.mono {
		font-family: ui-monospace, monospace;
		white-space: nowrap;
	}
	.linkish {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-weight: 600;
		color: var(--text);
		text-align: left;
		cursor: pointer;
		text-decoration: underline dotted;
	}
	.hint {
		margin-top: 4px;
		font-size: 0.85rem;
		color: var(--yellow);
	}
	.reasons {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		min-width: 160px;
	}
	.actions {
		min-width: 230px;
	}
	.actions .row {
		gap: 6px;
		margin-bottom: 6px;
	}
	.age input {
		width: 70px;
	}
	tr.inactive td {
		color: var(--muted);
	}
	tr.detail > td {
		background: var(--surface-2);
	}
	.ages {
		max-width: 560px;
	}
	.ages th {
		background: transparent;
	}
	.empty {
		text-align: center;
	}
	.pager {
		justify-content: center;
	}
	.agewrap {
		overflow-x: auto;
	}

	/* Telefoon: elke vraag als kaartje met de cijfers naast elkaar. */
	@media (max-width: 700px) {
		table.stacked {
			font-size: 1rem;
		}
		tr.frow {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			grid-template-areas:
				'id id id'
				'q q q'
				'n1 n2 n3'
				'r r r'
				'a a a';
			column-gap: 10px;
		}
		tr.frow > td {
			width: auto;
		}
		tr.frow > .id {
			grid-area: id;
			font-size: 0.85rem;
			color: var(--muted);
		}
		tr.frow > .q {
			grid-area: q;
			font-size: 1.1rem;
		}
		tr.frow > .n1 {
			grid-area: n1;
		}
		tr.frow > .n2 {
			grid-area: n2;
		}
		tr.frow > .n3 {
			grid-area: n3;
		}
		tr.frow > .reasons {
			grid-area: r;
			min-width: 0;
		}
		tr.frow > .reasons::before {
			width: 100%;
		}
		tr.frow > .actions {
			grid-area: a;
			min-width: 0;
			padding-top: 8px;
		}
		.actions .btn {
			min-height: 44px;
			flex: 1;
		}
		.age input {
			flex: 0 0 80px;
		}
		tr.detail > td:first-child {
			display: none;
		}
		tr.detail > td {
			padding: 8px 12px;
		}
		tr.frow > .num {
			text-align: left;
		}
		.ages {
			font-size: 0.85rem;
		}
		.ages th {
			white-space: normal;
		}
		.ages th,
		.ages td {
			padding: 6px 4px;
		}
	}
</style>
