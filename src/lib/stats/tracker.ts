// Anonieme statistieken en feedback vanuit de browser.
// Er gaan geen namen mee. Het toestelnummer is een willekeurig nummer dat
// alleen in deze browser staat (localStorage) en nergens anders aan gekoppeld is.
import type { EventLog, FeedbackLog, LogBatch, SessionLog } from '../types.ts';

const DEVICE_KEY = 'simplegames:toestel';
const VISIT_KEY = 'simplegames:bezocht';
const PENDING_KEY = 'simplegames:log';

export function uuid(): string {
	try {
		return crypto.randomUUID();
	} catch {
		const h = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
		h[12] = '4';
		h[16] = ((parseInt(h[16], 16) & 3) | 8).toString(16);
		const s = h.join('');
		return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
	}
}

export function deviceId(): string | null {
	try {
		let id = localStorage.getItem(DEVICE_KEY);
		if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
			id = uuid();
			localStorage.setItem(DEVICE_KEY, id);
		}
		return id;
	} catch {
		return null;
	}
}

const today = () => {
	const d = new Date();
	return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Telt dit toestel één keer per dag als bezoeker. */
export function reportVisit(): void {
	try {
		if (localStorage.getItem(VISIT_KEY) === today()) return;
		const device = deviceId();
		if (!device) return;
		localStorage.setItem(VISIT_KEY, today());
		fetch('/api/bezoek', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ device }),
			keepalive: true
		}).catch(() => {
			/* niet erg */
		});
	} catch {
		/* opslag niet beschikbaar */
	}
}

interface Pending {
	sessions: Record<string, SessionLog>;
	events: EventLog[];
	feedback: FeedbackLog[];
}

const empty = (): Pending => ({ sessions: {}, events: [], feedback: [] });

function load(): Pending {
	try {
		const raw = sessionStorage.getItem(PENDING_KEY);
		const p = raw ? (JSON.parse(raw) as Pending) : null;
		if (p && typeof p === 'object' && Array.isArray(p.events) && Array.isArray(p.feedback)) return p;
	} catch {
		/* negeren */
	}
	return empty();
}

function save(p: Pending) {
	try {
		sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
	} catch {
		/* negeren */
	}
}

/** Batch die verstuurd wordt; maximaal zoveel als de server in één keer aanneemt. */
export function takeBatch(p: Pending, device: string | null): LogBatch {
	return {
		device,
		sessions: Object.values(p.sessions).slice(0, 5),
		events: p.events.slice(0, 80),
		feedback: p.feedback.slice(0, 40)
	};
}

/** Haalt wat verstuurd is uit de wachtrij. */
export function removeSent(p: Pending, sent: LogBatch): Pending {
	const ev = new Set(sent.events.map((e) => e.id));
	const fb = new Set(sent.feedback.map((f) => `${f.session_id}|${f.question_id}`));
	const sessions = { ...p.sessions };
	for (const s of sent.sessions) {
		// alleen weghalen als er sindsdien niets aan is veranderd
		if (JSON.stringify(sessions[s.id]) === JSON.stringify(s)) delete sessions[s.id];
	}
	return {
		sessions,
		events: p.events.filter((e) => !ev.has(e.id)),
		feedback: p.feedback.filter((f) => !fb.has(`${f.session_id}|${f.question_id}`))
	};
}

/**
 * Verzamelt wat er in een spel gebeurt en verstuurt het in kleine bundels,
 * zodat er zo min mogelijk verzoeken naar de server gaan.
 */
export function createTracker(getToken: () => string) {
	let busy = false;

	async function flush() {
		if (busy) return;
		const p = load();
		if (!Object.keys(p.sessions).length && !p.events.length && !p.feedback.length) return;
		const batch = takeBatch(p, deviceId());
		busy = true;
		try {
			const res = await fetch('/api/spel/log', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token: getToken(), ...batch }),
				keepalive: true
			});
			// Gelukt, of verlopen/ongeldig: in beide gevallen niet opnieuw proberen.
			if (res.ok || res.status === 400 || res.status === 401) save(removeSent(load(), batch));
		} catch {
			/* volgende keer opnieuw */
		} finally {
			busy = false;
		}
		const rest = load();
		if (rest.events.length >= 80 || rest.feedback.length >= 40) void flush();
	}

	function update(fn: (p: Pending) => void, flushNow = false) {
		const p = load();
		fn(p);
		// Niet eindeloos bewaren als het versturen steeds mislukt.
		p.events = p.events.slice(-400);
		p.feedback = p.feedback.slice(-100);
		save(p);
		if (flushNow || p.events.length >= 12) void flush();
	}

	const onHide = () => {
		if (document.visibilityState === 'hidden') void flush();
	};
	document.addEventListener('visibilitychange', onHide);

	return {
		session(s: SessionLog, flushNow = false) {
			update((p) => (p.sessions[s.id] = s), flushNow);
		},
		event(e: Omit<EventLog, 'id'>) {
			update((p) => p.events.push({ id: uuid(), ...e }));
		},
		feedback(f: FeedbackLog) {
			update((p) => {
				if (!p.feedback.some((x) => x.session_id === f.session_id && x.question_id === f.question_id)) p.feedback.push(f);
			});
		},
		flush,
		dispose() {
			document.removeEventListener('visibilitychange', onHide);
		}
	};
}

export type Tracker = ReturnType<typeof createTracker>;
