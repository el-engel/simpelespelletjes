// Feedback en statistieken voor /beheer: ophalen en downloaden.
import { message, supabase } from './api.ts';
import type { QuestionStat, Sheet, Stats } from './statcalc.ts';

export * from './statcalc.ts';

function check<T>(res: { data: T; error: unknown }): T {
	if (res.error) throw new Error(message(res.error));
	return res.data;
}

export async function loadQuestionStats(gameId: string, from: string, to: string): Promise<QuestionStat[]> {
	return (check(await supabase().rpc('admin_question_stats', { p_game: gameId, p_from: from, p_to: to })) ??
		[]) as QuestionStat[];
}

export async function loadStats(gameId: string, from: string, to: string): Promise<Stats> {
	return check(await supabase().rpc('admin_stats', { p_game: gameId, p_from: from, p_to: to })) as Stats;
}

/** Meldingen over deze vraag negeren (ze tellen daarna niet meer mee). */
export async function dismissFeedback(questionId: string) {
	check(await supabase().from('question_feedback').update({ dismissed: true }).eq('question_id', questionId));
}

export async function setMinAge(questionId: string, minAge: number) {
	check(await supabase().from('questions').update({ min_age: minAge }).eq('id', questionId));
}

export async function downloadXlsx(sheets: Sheet[], filename: string) {
	const writeExcelFile = (await import('write-excel-file/universal')).default;
	const data = sheets.map((s) => ({
		sheet: s.name.slice(0, 31),
		data: s.rows
	}));
	const blob = await writeExcelFile(data as never).toBlob();
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
