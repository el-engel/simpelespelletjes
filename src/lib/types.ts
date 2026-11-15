export interface GameSummary {
	id: string;
	slug: string;
	name: string;
	description: string;
}

export interface TaskType {
	id: string;
	code: string;
	name: string;
}

export interface Category {
	id: string;
	name: string;
	is18plus: boolean;
}

export interface GameDetails extends GameSummary {
	rules: string;
	minutesPerQuestion: number;
	taskTypes: TaskType[];
	categories: Category[];
}

/** Wat de browser krijgt na een geslaagde botcheck. */
export interface StartData {
	token: string;
	expiresAt: number;
	game: GameSummary & { minutesPerQuestion: number };
	rulesHtml: string;
	taskTypes: TaskType[];
	categories: Category[];
}

export interface DrawnQuestion {
	id: string;
	text: string;
	minAge: number;
	taskCodes: string[];
	adult: boolean;
}

export interface DrawRequest {
	token: string;
	age: number;
	taskCodes: string[];
	categoryIds: string[];
	count: number;
	exclude: string[];
}

// ---- anonieme statistieken en feedback

export type EndReason = 'done' | 'out' | 'stopped' | 'quit';
export type EventKind = 'guessed' | 'not_guessed' | 'swapped';
export type FeedbackReason = 'te_moeilijk' | 'leeftijd' | 'niet_leuk' | 'prima';
export type FeedbackMoment = 'andere_vraag' | 'niet_geraden';

export interface SessionLog {
	id: string;
	started_at: number;
	ended_at: number | null;
	end_reason: EndReason | null;
	players: number;
	per_player: number;
	age: number;
	task_codes: string[];
	category_ids: string[];
	skip_players: number;
	repeats_offered: boolean;
	played_repeats: boolean;
	turns: number;
}

export interface EventLog {
	id: string;
	session_id: string;
	question_id: string;
	kind: EventKind;
	task_code: string;
	age: number;
}

export interface FeedbackLog {
	session_id: string;
	question_id: string;
	reason: FeedbackReason;
	moment: FeedbackMoment;
	age: number;
}

export interface LogBatch {
	device: string | null;
	sessions: SessionLog[];
	events: EventLog[];
	feedback: FeedbackLog[];
}

/** Feedbackbalk die even onder in beeld komt. */
export interface FeedbackPrompt {
	key: number;
	questionId: string;
	text: string;
	moment: FeedbackMoment;
	/** Scherm waarop de balk verscheen; bij een ander scherm verdwijnt hij. */
	stage: string;
}
