<script lang="ts" module>
	/** Blijft bestaan zolang de pagina niet ververst wordt (navigeren binnen de app). */
	let mountedBefore = false;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import type { GameProps } from '../registry';
	import { untrack } from 'svelte';
	import type { DrawnQuestion, FeedbackMoment, FeedbackPrompt, FeedbackReason } from '#lib/types.ts';
	import { toTop } from '#lib/scroll.ts';
	import { createTracker, uuid, type Tracker } from '#lib/stats/tracker.ts';
	import Scoreboard from './Scoreboard.svelte';
	import FeedbackBar from './FeedbackBar.svelte';
	import Timer from './Timer.svelte';
	import { unlockSound } from './sound.ts';
	import { addSeen, buildExclude, loadSeen } from './history.ts';
	import {
		DEFAULT_TIMER,
		MAX_PER_PLAYER,
		MAX_PLAYERS,
		MAX_TIMER_SECONDS,
		MIN_TIMER_SECONDS,
		addPlayer,
		canGiveFeedback,
		cleanTimer,
		markFeedback,
		sessionLog,
		estimateMinutes,
		finishTurn,
		makePlayer,
		newState,
		playAgain,
		remainingTurns,
		setAge,
		setCanSkip,
		startTurn,
		swapQuestion,
		winners,
		type GameState,
		type TimerSettings
	} from './logic';

	let { start, onExit, onExpired }: GameProps = $props();

	const storageKey = $derived(`spel:${start.game.slug}:state`);

	let game = $state<GameState>(newState());
	let loading = $state(false);
	let message = $state('');
	let menuOpen = $state(false);
	let confirmQuit = $state(false);
	/** Er stond nog een spel klaar toen je terugkwam: eerst kiezen of je verder speelt. */
	let resumeAsk = $state(false);
	/** Te weinig nieuwe vragen: aanbieden om toch te spelen met vragen die al geweest zijn. */
	let repeatOffer = $state<{ state: GameState; fresh: DrawnQuestion[]; needed: number } | null>(null);
	/** Kwam "Alles al gespeeld?" in beeld bij het instellen van dit spel? */
	let offeredRepeats = false;
	/** Feedbackbalk na "andere vraag" of "niemand heeft het geraden". */
	let feedback = $state<FeedbackPrompt | null>(null);
	let feedbackKey = 0;
	let tracker: Tracker | null = null;

	// ---- timer (laatste keuze wordt op deze telefoon onthouden)
	const TIMER_KEY = 'simplegames:timer';
	let timer = $state<TimerSettings>({ ...DEFAULT_TIMER });

	// ---- invoerscherm
	let playerCount = $state<number | null>(null);
	let names = $state<string[]>([]);
	let skips = $state<boolean[]>([]);
	let perPlayer = $state<number | null>(3);
	let age = $state<number | null>(null);
	let taskCodes = $state<string[]>([]);
	let categoryIds = $state<string[]>([]);
	/** Soorten opdrachten, categorieën en timer staan achter een knop. */
	let settingsOpen = $state(false);

	// ---- menu tijdens het spel
	let newPlayerName = $state('');
	let newPlayerSkip = $state(false);
	let newAge = $state<number | null>(null);

	const taskName = (code: string) => start.taskTypes.find((t) => t.code === code)?.name ?? code;
	const playerName = (id: string | null | undefined) => game.players.find((p) => p.id === id)?.name ?? '';
	const adultBlocked = $derived(age === null || age < 18);
	const minutes = $derived(
		estimateMinutes(playerCount ?? 0, perPlayer ?? 0, start.game.minutesPerQuestion)
	);
	const settingsSummary = $derived(
		[
			taskCodes.length === start.taskTypes.length ? 'alle opdrachten' : `${taskCodes.length} van ${start.taskTypes.length} opdrachten`,
			`${categoryIds.length} ${categoryIds.length === 1 ? 'categorie' : 'categorieën'}`,
			timer.on ? `timer ${timer.seconds} sec` : 'geen timer'
		].join(' · ')
	);
	const gameTimer = $derived(game.timer ?? timer);
	const currentPlayer = $derived(game.current ? playerName(game.current.playerId) : '');
	const upcoming = $derived.by(() => {
		const s = game;
		const n = s.players.length;
		for (let step = 1; step <= n; step++) {
			const i = (s.lastIndex + step + n) % n;
			if (s.players[i].turns < s.perPlayer) return s.players[i];
		}
		return null;
	});

	onMount(() => {
		tracker = createTracker(() => start.token);
		try {
			timer = cleanTimer(JSON.parse(localStorage.getItem(TIMER_KEY) ?? 'null'));
		} catch {
			/* standaard */
		}
		const reloadHere = isReloadHere();
		taskCodes = start.taskTypes.map((t) => t.code);
		categoryIds = start.categories.filter((c) => !c.is18plus).map((c) => c.id);
		try {
			const raw = sessionStorage.getItem(storageKey);
			if (raw) {
				const saved = JSON.parse(raw) as GameState;
				if (saved?.version === 1) {
					game = saved;
					const busy = saved.stage !== 'setup' && saved.stage !== 'end';
					if (busy && !reloadHere) resumeAsk = true;
				}
			}
		} catch {
			/* negeren */
		}
		if (game.stage !== 'setup') topUp();
		return () => {
			tracker?.flush();
			tracker?.dispose();
		};
	});

	// Anonieme statistieken bijhouden (alleen aantallen en instellingen, geen namen).
	$effect(() => {
		const s = game;
		untrack(() => {
			if (!s.sessionId || s.stage === 'setup') return;
			if (s.stage === 'end' && !s.endedAt) {
				game = { ...s, endedAt: Date.now() };
				return;
			}
			const log = sessionLog(s);
			if (log) tracker?.session(log, s.stage === 'end');
		});
	});

	// Feedbackbalk verdwijnt zodra er een ander scherm komt.
	$effect(() => {
		const stage = game.stage;
		if (feedback && untrack(() => feedback?.stage) !== stage) feedback = null;
	});

	function saveTimer(t: TimerSettings) {
		timer = cleanTimer(t);
		try {
			localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
		} catch {
			/* negeren */
		}
	}

	/** Timerinstellingen van dit spel aanpassen (via het menu). */
	function setGameTimer(change: Partial<TimerSettings>) {
		const t = cleanTimer({ ...(game.timer ?? timer), ...change });
		game = { ...game, timer: t };
		saveTimer(t);
	}

	function logQuestion(kind: 'guessed' | 'not_guessed' | 'swapped') {
		if (!game.current || !game.sessionId) return;
		tracker?.event({
			session_id: game.sessionId,
			question_id: game.current.question.id,
			kind,
			task_code: game.current.taskCode,
			age: game.age
		});
	}

	function askFeedback(moment: FeedbackMoment, q: DrawnQuestion) {
		if (!game.sessionId || !canGiveFeedback(game, q.id)) return;
		feedback = { key: ++feedbackKey, questionId: q.id, text: q.text, moment, stage: game.stage };
	}

	function giveFeedback(reason: FeedbackReason) {
		if (!feedback || !game.sessionId || !canGiveFeedback(game, feedback.questionId)) return;
		tracker?.feedback({
			session_id: game.sessionId,
			question_id: feedback.questionId,
			reason,
			moment: feedback.moment,
			age: game.age
		});
		game = markFeedback(game, feedback.questionId);
	}

	/** Nieuw spel voor de statistieken. */
	const newSession = () => ({ sessionId: uuid(), startedAt: Date.now(), endedAt: undefined, feedbackGiven: [] });

	// Elk nieuw scherm in het spel begint bovenaan.
	$effect(() => {
		void game.stage;
		toTop();
	});

	$effect(() => {
		const snapshot = JSON.stringify(game);
		addSeen(start.game.slug, game.used);
		try {
			sessionStorage.setItem(storageKey, snapshot);
		} catch {
			/* negeren */
		}
	});

	// Bij een leeftijd onder 18 gaat 18+ automatisch uit.
	$effect(() => {
		if (adultBlocked) {
			const adult = new Set(start.categories.filter((c) => c.is18plus).map((c) => c.id));
			if (categoryIds.some((id) => adult.has(id))) categoryIds = categoryIds.filter((id) => !adult.has(id));
		}
	});

	/** Alleen bij verversen van precies deze pagina speel je zonder vragen verder. */
	function isReloadHere() {
		if (mountedBefore) return false;
		mountedBefore = true;
		try {
			const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
			return nav?.type === 'reload' && new URL(nav.name).pathname === location.pathname;
		} catch {
			return false;
		}
	}

	function resume() {
		resumeAsk = false;
		toTop();
	}

	function freshGame() {
		resumeAsk = false;
		newGame();
	}

	function quitToMenu() {
		menuOpen = false;
		confirmQuit = false;
		logQuit();
		exit();
	}

	/** Tussentijds gestopt zonder uitslag. */
	function logQuit() {
		if (!game.sessionId || game.stage === 'setup' || game.stage === 'end') return;
		const log = sessionLog(game);
		if (log) tracker?.session({ ...log, ended_at: Date.now(), end_reason: 'quit' }, true);
	}

	function setPlayerCount(n: number | null) {
		playerCount = n;
		if (n === null || !Number.isFinite(n)) return;
		const count = Math.max(0, Math.min(MAX_PLAYERS, Math.floor(n)));
		names = Array.from({ length: count }, (_, i) => names[i] ?? '');
		skips = Array.from({ length: count }, (_, i) => skips[i] ?? false);
	}

	async function fetchQuestions(count: number, state: GameState): Promise<DrawnQuestion[]> {
		const inGame = [...state.used, ...state.queue.map((q) => q.id)];
		if (state.current) inGame.push(state.current.question.id);
		const exclude = buildExclude(inGame, state.allowRepeats ? [] : loadSeen(start.game.slug));
		const res = await fetch('/api/spel/vragen', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				token: start.token,
				age: state.age,
				taskCodes: state.taskCodes,
				categoryIds: state.categoryIds,
				count: Math.min(200, count),
				exclude
			})
		});
		if (res.status === 401) {
			onExpired();
			throw new Error('verlopen');
		}
		const body = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(body.message ?? 'Vragen ophalen is mislukt.');
		return body.questions as DrawnQuestion[];
	}

	/** Zorgt dat er genoeg vragen klaarstaan voor alle resterende beurten (+2 reserve). */
	async function topUp() {
		const need = remainingTurns(game) + 2 - game.queue.length;
		if (need <= 0) return;
		loading = true;
		try {
			let extra = await fetchQuestions(need, game);
			// Midden in een spel (bijv. een speler erbij) vullen we stil aan met eerder gespeelde vragen.
			if (extra.length < need && !game.allowRepeats) {
				game = { ...game, allowRepeats: true };
				const more = await fetchQuestions(need, game);
				const ids = new Set(extra.map((q) => q.id));
				extra = [...extra, ...more.filter((q) => !ids.has(q.id))].slice(0, need);
			}
			const known = new Set([...game.used, ...game.queue.map((q) => q.id)]);
			game = { ...game, queue: [...game.queue, ...extra.filter((q) => !known.has(q.id))] };
		} catch (e) {
			if (e instanceof Error && e.message !== 'verlopen') message = e.message;
		} finally {
			loading = false;
		}
	}

	async function startGame() {
		message = '';
		// Lege naamvelden tellen niet mee.
		const entered = names.map((n, i) => ({ name: n.trim(), skip: skips[i] ?? false })).filter((p) => p.name);
		const filled = entered.map((p) => p.name);
		if (filled.length < 2) return (message = 'Vul minstens twee spelers in.');
		if (perPlayer === null || perPlayer < 1 || perPlayer > MAX_PER_PLAYER)
			return (message = `Kies 1 tot ${MAX_PER_PLAYER} vragen per speler.`);
		if (age === null || age < 1 || age > 120) return (message = 'Vul de leeftijd van de jongste speler in.');
		if (taskCodes.length === 0) {
			settingsOpen = true;
			return (message = 'Kies minstens één soort opdracht (bij Spelinstellingen).');
		}
		if (categoryIds.length === 0) {
			settingsOpen = true;
			return (message = 'Zet minstens één categorie aan (bij Spelinstellingen).');
		}

		const t = cleanTimer(timer);
		saveTimer(t);
		const s: GameState = {
			...newState(),
			...newSession(),
			stage: 'turn',
			players: entered.map((p) => makePlayer(p.name, p.skip)),
			perPlayer,
			age,
			taskCodes: [...taskCodes],
			categoryIds: [...categoryIds],
			timer: t,
			repeatsOffered: offeredRepeats
		};
		repeatOffer = null;
		loading = true;
		try {
			const qs = await fetchQuestions(remainingTurns(s) + 2, s);
			const needed = remainingTurns(s);
			if (qs.length < needed) {
				// Te weinig vragen die nog niet geweest zijn: eerst vragen of herhalen mag.
				repeatOffer = { state: s, fresh: qs, needed };
				offeredRepeats = true;
				return;
			}
			game = { ...s, queue: qs };
		} catch (e) {
			if (e instanceof Error && e.message !== 'verlopen') message = e.message;
		} finally {
			loading = false;
		}
	}

	/** Toch spelen: aanvullen met vragen die op deze telefoon al eens geweest zijn. */
	async function playWithRepeats() {
		if (!repeatOffer) return;
		const { state, fresh } = repeatOffer;
		const s: GameState = { ...state, allowRepeats: true, repeatsOffered: true, playedRepeats: true };
		loading = true;
		message = '';
		try {
			const more = await fetchQuestions(remainingTurns(s) + 2, { ...s, queue: fresh });
			const qs = [...fresh, ...more];
			if (qs.length === 0) {
				message = 'Er zijn geen vragen die passen bij deze keuzes. Zet meer categorieën of opdrachtsoorten aan.';
				return;
			}
			if (qs.length < remainingTurns(s)) {
				message = `Let op: er zijn maar ${qs.length} passende vragen, dus het spel is eerder klaar.`;
			}
			repeatOffer = null;
			game = { ...s, queue: qs };
		} catch (e) {
			if (e instanceof Error && e.message !== 'verlopen') message = e.message;
		} finally {
			loading = false;
		}
	}

	function showQuestion() {
		// Geluid mag op telefoons alleen starten na een tik; daarom hier alvast klaarzetten.
		if (game.timer?.on && game.timer.sound) unlockSound();
		game = { ...game, stage: 'question' };
	}

	async function showTaskType() {
		message = '';
		if (game.queue.length === 0) await topUp();
		game = startTurn(game);
	}

	async function otherQuestion() {
		if (game.queue.length === 0) await topUp();
		if (game.queue.length === 0) {
			message = 'Er zijn geen andere vragen meer.';
			return;
		}
		const old = game.current?.question;
		logQuestion('swapped');
		game = swapQuestion(game);
		if (old) askFeedback('andere_vraag', old);
	}

	function guessed(by: string | null) {
		const q = game.current?.question;
		logQuestion(by ? 'guessed' : 'not_guessed');
		game = finishTurn(game, by);
		if (!by && q) askFeedback('niet_geraden', q);
	}

	async function addPlayerNow() {
		const name = newPlayerName.trim();
		if (!name) return;
		if (game.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
			message = 'Die naam bestaat al.';
			return;
		}
		game = addPlayer(game, name, newPlayerSkip);
		newPlayerName = '';
		newPlayerSkip = false;
		message = `${name} doet mee.`;
		await topUp();
	}

	async function changeAge() {
		if (newAge === null || newAge < 1 || newAge > 120) return;
		const adult = new Set(start.categories.filter((c) => c.is18plus).map((c) => c.id));
		let s = setAge(game, newAge);
		if (newAge < 18) s = { ...s, categoryIds: s.categoryIds.filter((id) => !adult.has(id)) };
		game = s;
		message = `Leeftijd aangepast naar ${newAge}. De vragen zijn aangepast.`;
		await topUp();
	}

	function stopGame() {
		menuOpen = false;
		game = { ...game, stage: 'end', current: null, endReason: 'stopped' };
	}

	async function again() {
		message = '';
		game = { ...playAgain(game), ...newSession(), repeatsOffered: false, playedRepeats: false };
		await topUp();
	}

	function newGame() {
		names = game.players.map((p) => p.name);
		skips = game.players.map((p) => !!p.canSkip);
		playerCount = names.length;
		perPlayer = game.perPlayer;
		age = game.age;
		game = newState();
		message = '';
		offeredRepeats = false;
		feedback = null;
	}

	function exit() {
		logQuit();
		void tracker?.flush();
		try {
			sessionStorage.removeItem(storageKey);
		} catch {
			/* negeren */
		}
		onExit();
	}

	function toggle(list: string[], value: string, on: boolean) {
		return on ? [...new Set([...list, value])] : list.filter((v) => v !== value);
	}
</script>

<main class="container stack game">
	{#if resumeAsk}
		<h1>{start.game.name}</h1>
		<section class="card card-neon stack" aria-live="polite">
			<h2>Je was nog bezig</h2>
			<p>
				Er loopt nog een spel met {game.players.map((p) => p.name).join(', ')}. Wil je verder spelen of een
				nieuw spel beginnen?
			</p>
			<button class="btn btn-primary btn-big" onclick={resume}>Verder spelen</button>
			<button class="btn btn-big" onclick={freshGame}>Nieuw spel</button>
			<button class="btn-link" onclick={exit}>Stoppen en naar het hoofdmenu</button>
		</section>
	{:else if game.stage === 'setup'}
		<a class="btn-link" href="/">← Alle spelletjes</a>
		<h1>{start.game.name}</h1>
		<p class="kicker">Stel je spel in</p>

		<section class="card stack">
			<div class="field">
				<label for="count">Hoeveel spelers?</label>
				<input
					id="count"
					type="number"
					inputmode="numeric"
					min="2"
					max={MAX_PLAYERS}
					value={playerCount ?? ''}
					oninput={(e) => setPlayerCount(e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
				/>
			</div>

			<div class="field">
				<label for="per">Hoeveel vragen per speler?</label>
				<input id="per" type="number" inputmode="numeric" min="1" max={MAX_PER_PLAYER} bind:value={perPlayer} />
				{#if minutes > 0}
					<p class="estimate" data-testid="duur">Spel duurt ongeveer {minutes} {minutes === 1 ? 'minuut' : 'minuten'}</p>
				{/if}
			</div>

			<div class="field">
				<label for="age">Leeftijd jongste speler?</label>
				<input id="age" type="number" inputmode="numeric" min="1" max="120" bind:value={age} />
			</div>
		</section>

		{#if names.length > 0}
			<section class="card stack">
				<h2>Spelers</h2>
				{#each names as _, i (i)}
					<div class="field">
						<label for="speler-{i}">Speler {i + 1}</label>
						<input
							id="speler-{i}"
							type="text"
							maxlength="30"
							autocomplete="off"
							placeholder="Naam of initialen"
							bind:value={names[i]}
						/>
						<label class="check small-check">
							<input type="checkbox" bind:checked={skips[i]} />
							Mag vragen overslaan
						</label>
					</div>
				{/each}
			</section>
		{/if}

		<section class="card stack settings">
			<button
				class="settings-toggle"
				aria-expanded={settingsOpen}
				aria-controls="spelinstellingen"
				onclick={() => (settingsOpen = !settingsOpen)}
			>
				<span class="settings-title"><span aria-hidden="true">⚙</span> Spelinstellingen</span>
				<span class="settings-summary">{settingsSummary}</span>
				<span class="chev" aria-hidden="true">{settingsOpen ? '▲' : '▼'}</span>
			</button>
		</section>
		{#if settingsOpen}
			<div id="spelinstellingen" class="stack">
			<section class="card stack">
				<h2>Soort opdrachten</h2>
				<div>
					{#each start.taskTypes as t (t.id)}
						<label class="check">
							<input
								type="checkbox"
								checked={taskCodes.includes(t.code)}
								onchange={(e) => (taskCodes = toggle(taskCodes, t.code, e.currentTarget.checked))}
							/>
							{t.name}
						</label>
					{/each}
				</div>

				<h2>Categorieën</h2>
				<div>
					{#each start.categories as c (c.id)}
						{@const disabled = c.is18plus && adultBlocked}
						<label class="check" class:disabled>
							<input
								type="checkbox"
								{disabled}
								checked={categoryIds.includes(c.id)}
								onchange={(e) => (categoryIds = toggle(categoryIds, c.id, e.currentTarget.checked))}
							/>
							{c.name}
							{#if disabled}<span class="small muted">(alleen als alle spelers 18 of ouder zijn)</span>{/if}
						</label>
					{/each}
				</div>
			</section>

			<section class="card stack">
				<h2>Timer</h2>
				<label class="check">
					<input type="checkbox" checked={timer.on} onchange={(e) => (timer = { ...timer, on: e.currentTarget.checked })} />
					Timer gebruiken
				</label>
				{#if timer.on}
					<div class="field">
						<label for="seconden">Hoeveel seconden per beurt?</label>
						<input
							id="seconden"
							type="number"
							inputmode="numeric"
							min={MIN_TIMER_SECONDS}
							max={MAX_TIMER_SECONDS}
							value={timer.seconds}
							onchange={(e) => (timer = cleanTimer({ ...timer, seconds: Number(e.currentTarget.value) }))}
						/>
					</div>
					<label class="check">
						<input type="checkbox" checked={timer.sound} onchange={(e) => (timer = { ...timer, sound: e.currentTarget.checked })} />
						Geluid als de tijd om is
					</label>
				{/if}
			</section>
			</div>
		{/if}

		{#if message}<p class="error" role="alert">{message}</p>{/if}
		{#if repeatOffer}
			<section class="card card-neon stack" aria-live="polite">
				<h2>Alles al gespeeld?</h2>
				{#if repeatOffer.fresh.length === 0}
					<p>Jullie hebben alle vragen die bij deze keuzes passen al eens gehad op deze telefoon.</p>
				{:else}
					<p>
						Er zijn nog maar {repeatOffer.fresh.length} nieuwe vragen voor dit spel, en er zijn er
						{repeatOffer.needed} nodig. De rest hebben jullie al eens gehad.
					</p>
				{/if}
				<button class="btn btn-primary btn-big" onclick={playWithRepeats} disabled={loading}>
					Toch spelen, ook met vragen die al geweest zijn
				</button>
				<p class="muted small">Of zet hierboven meer categorieën of soorten opdrachten aan.</p>
			</section>
		{/if}
		<button class="btn btn-primary btn-big" onclick={startGame} disabled={loading}>
			{loading ? 'Even geduld…' : 'Start spel'}
		</button>
	{:else}
		<div class="topbar">
			<span class="muted small">{start.game.name}</span>
			<button class="btn btn-small" onclick={() => {
					menuOpen = !menuOpen;
					confirmQuit = false;
				}} aria-expanded={menuOpen}>
				{menuOpen ? 'Sluit menu' : 'Menu'}
			</button>
		</div>

		{#if menuOpen}
			<section class="card stack" aria-label="Menu">
				<div class="field">
					<label for="nieuw">Speler toevoegen</label>
					<div class="row">
						<input id="nieuw" type="text" maxlength="30" placeholder="Naam of initialen" bind:value={newPlayerName} />
						<button class="btn" onclick={addPlayerNow} disabled={!newPlayerName.trim()}>Toevoegen</button>
					</div>
					<label class="check small-check">
						<input type="checkbox" bind:checked={newPlayerSkip} />
						Mag vragen overslaan
					</label>
				</div>
				<fieldset class="skipset">
					<legend>Wie mag vragen overslaan?</legend>
					{#each game.players as p (p.id)}
						<label class="check small-check">
							<input
								type="checkbox"
								checked={!!p.canSkip}
								onchange={(e) => (game = setCanSkip(game, p.id, e.currentTarget.checked))}
							/>
							{p.name}
						</label>
					{/each}
				</fieldset>
				<div class="field">
					<label for="nieuwe-leeftijd">Leeftijd jongste speler (nu {game.age})</label>
					<div class="row">
						<input id="nieuwe-leeftijd" type="number" min="1" max="120" bind:value={newAge} />
						<button class="btn" onclick={changeAge} disabled={!newAge}>Aanpassen</button>
					</div>
				</div>
				<fieldset class="skipset">
					<legend>Timer</legend>
					<label class="check small-check">
						<input type="checkbox" checked={gameTimer.on} onchange={(e) => setGameTimer({ on: e.currentTarget.checked })} />
						Timer aan
					</label>
					{#if gameTimer.on}
						<label class="check small-check">
							<input type="checkbox" checked={gameTimer.sound} onchange={(e) => setGameTimer({ sound: e.currentTarget.checked })} />
							Geluid aan
						</label>
						<div class="row seconds">
							<label for="menu-seconden">Seconden</label>
							<input
								id="menu-seconden"
								type="number"
								inputmode="numeric"
								min={MIN_TIMER_SECONDS}
								max={MAX_TIMER_SECONDS}
								value={gameTimer.seconds}
								onchange={(e) => setGameTimer({ seconds: Number(e.currentTarget.value) })}
							/>
						</div>
					{/if}
				</fieldset>
				<button class="btn" onclick={stopGame}>Spel afronden en uitslag tonen</button>
				{#if confirmQuit}
					<div class="quit stack" role="group" aria-label="Stoppen bevestigen">
						<p>Weet je het zeker? Het spel en de punten worden gewist.</p>
						<div class="row">
							<button class="btn btn-red" onclick={quitToMenu}>Ja, stoppen</button>
							<button class="btn" onclick={() => (confirmQuit = false)}>Nee, verder spelen</button>
						</div>
					</div>
				{:else}
					<button class="btn" onclick={() => (confirmQuit = true)}>Stoppen en naar het hoofdmenu</button>
				{/if}
			</section>
		{/if}

		{#if message}<p class="notice" role="status">{message}</p>{/if}

		{#if game.stage === 'turn'}
			{#if game.lastGuess}
				<p class="success" role="status">
					{#if game.lastGuess.by}
						{playerName(game.lastGuess.by)} heeft het geraden: +1 punt!
					{:else}
						Niemand heeft het geraden.
					{/if}
				</p>
			{/if}
			<section class="turn">
				<p class="label">Aan de beurt</p>
				<p class="who" data-testid="aan-de-beurt">{upcoming?.name ?? ''}</p>
				<button class="btn btn-orange btn-big" onclick={showTaskType} disabled={loading}>
					Laat soort opdracht zien
				</button>
			</section>
			<Scoreboard players={game.players} perPlayer={game.perPlayer} />
		{:else if game.stage === 'type' && game.current}
			<section class="turn">
				<p class="label">{currentPlayer}, jouw opdracht is</p>
				<p class="task" data-testid="soort">{taskName(game.current.taskCode)}</p>
				<button class="btn btn-red btn-big" onclick={showQuestion}>
					Laat vraag zien
				</button>
			</section>
		{:else if game.stage === 'question' && game.current}
			<section class="turn">
				<p class="pill">{taskName(game.current.taskCode)}</p>
				<p class="question" data-testid="vraag">{game.current.question.text}</p>
				{#if game.timer?.on}
					{#key game.current.question.id + (game.timer.seconds)}
						<Timer seconds={game.timer.seconds} sound={game.timer.sound} />
					{/key}
				{:else}
					<p class="muted small">Leg de telefoon omgekeerd neer en begin!</p>
				{/if}
				<button class="btn btn-green btn-big" onclick={() => (game = { ...game, stage: 'guess' })}>Klaar!</button>
				{#if game.players.find((p) => p.id === game.current?.playerId)?.canSkip}
					<button class="btn btn-big skip" onclick={otherQuestion} disabled={loading}>Overslaan, andere vraag</button>
				{/if}
			</section>
		{:else if game.stage === 'guess' && game.current}
			<section class="card stack">
				<h2>Wie heeft het geraden?</h2>
				<div class="guessers">
					{#each game.players.filter((p) => p.id !== game.current?.playerId) as p (p.id)}
						<button class="btn btn-big" onclick={() => guessed(p.id)}>{p.name}</button>
					{/each}
					<button class="btn btn-big btn-link" onclick={() => guessed(null)}>Niemand heeft het geraden</button>
				</div>
			</section>
		{:else if game.stage === 'end'}
			{@const top = winners(game.players)}
			<section class="card stack end">
				{#if game.endReason === 'out'}
					<p class="notice">De vragen zijn op.</p>
				{/if}
				{#if top.length === 0}
					<h1>Niemand heeft punten gescoord</h1>
				{:else if top.length === 1}
					<p class="label">De winnaar is</p>
					<h1 class="winner" data-testid="winnaar">{top[0].name}!</h1>
					<p>met {top[0].score} {top[0].score === 1 ? 'punt' : 'punten'}</p>
				{:else}
					<p class="label">Gelijkspel! De winnaars zijn</p>
					<h1 class="winner" data-testid="winnaar">{top.map((p) => p.name).join(' en ')}!</h1>
					<p>met elk {top[0].score} {top[0].score === 1 ? 'punt' : 'punten'}</p>
				{/if}
			</section>
			<Scoreboard players={game.players} perPlayer={game.perPlayer} showTurns={false} />
			<button class="btn btn-primary btn-big" onclick={again}>Nog een keer met dezelfde spelers</button>
			<button class="btn btn-big" onclick={newGame}>Nieuw spel instellen</button>
			<button class="btn-link" onclick={exit}>Terug naar alle spelletjes</button>
		{/if}
	{/if}
</main>

{#if feedback}
	{#key feedback.key}
		<FeedbackBar prompt={feedback} onPick={giveFeedback} onClose={() => (feedback = null)} />
	{/key}
{/if}

<style>
	.game {
		padding-bottom: 48px;
	}
	.game > h1 {
		font-size: 2.2rem;
		margin-top: 8px;
	}
	.kicker,
	.label {
		margin: 0;
		font-weight: 700;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		color: var(--cyan);
		font-size: 0.9rem;
	}
	.kicker {
		margin-top: -8px;
	}
	.estimate {
		margin: 6px 0 0;
		font-weight: 700;
		color: var(--lime);
	}
	.topbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.topbar .muted {
		font-family: var(--font-display);
		letter-spacing: 0.05em;
	}
	.turn {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 18px;
		padding: 40px 0 24px;
		min-height: 52dvh;
		justify-content: center;
	}
	.who {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2.4rem, 14vw, 3.6rem);
		line-height: 1.05;
		color: var(--pink);
		text-shadow: var(--glow-pink);
		word-break: break-word;
	}
	.task {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2.2rem, 12vw, 3.2rem);
		line-height: 1.05;
		color: var(--lime);
		text-shadow: var(--glow-lime);
		word-break: break-word;
	}
	.pill {
		margin: 0;
		padding: 6px 18px;
		border: 2px solid var(--lime);
		border-radius: 999px;
		font-family: var(--font-display);
		font-size: 1.1rem;
		color: var(--lime);
		text-transform: uppercase;
	}
	.question {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.8rem, 9vw, 2.6rem);
		line-height: 1.15;
		color: var(--text);
		text-shadow: 0 0 16px rgb(92 242 255 / 0.8);
		word-break: break-word;
	}
	.small-check {
		font-weight: 500;
		color: var(--muted);
		min-height: 40px;
	}
	.skipset {
		border: 2px solid var(--line);
		border-radius: 14px;
		padding: 8px 14px 4px;
		margin: 0;
	}
	.skipset legend {
		font-weight: 600;
		padding: 0 6px;
	}
	.settings {
		padding: 0;
	}
	.settings-toggle {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 2px 12px;
		width: 100%;
		min-height: 64px;
		padding: 12px 18px;
		background: none;
		border: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.settings-title {
		font-weight: 700;
		font-size: 1.1rem;
	}
	.settings-summary {
		grid-column: 1;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.chev {
		grid-column: 2;
		grid-row: 1 / span 2;
		align-self: center;
		color: var(--cyan);
	}
	.seconds {
		align-items: center;
		gap: 10px;
		padding: 4px 0 8px;
	}
	.seconds input {
		max-width: 110px;
	}
	.skip {
		border-color: var(--yellow) !important;
		color: var(--yellow);
	}
	.quit {
		border: 2px solid var(--red);
		border-radius: 14px;
		padding: 14px;
	}
	.quit p {
		margin: 0;
	}
	.guessers {
		display: grid;
		gap: 10px;
	}
	.end {
		text-align: center;
		border-color: var(--yellow);
		box-shadow: 0 0 30px rgb(255 210 63 / 0.4);
	}
	.winner {
		font-size: clamp(2.2rem, 12vw, 3rem);
		color: var(--yellow);
		text-shadow: 0 0 24px rgb(255 210 63 / 0.8);
		margin: 0;
		word-break: break-word;
		animation: pulse 1.6s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			transform: scale(1.06);
		}
	}
</style>
