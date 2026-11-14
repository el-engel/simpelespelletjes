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
