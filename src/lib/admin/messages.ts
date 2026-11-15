// Contactberichten in /beheer. De database laat alleen de admin met 2FA erbij.
import { check, supabase } from './api.ts';

export interface ContactMessage {
	id: string;
	created_at: string;
	name: string;
	email: string;
	phone: string;
	message: string;
	is_read: boolean;
	emailed: boolean;
}

export const MAX_SHOWN = 500;

export async function loadMessages(): Promise<ContactMessage[]> {
	return check(
		await supabase()
			.from('contact_messages')
			.select('id, created_at, name, email, phone, message, is_read, emailed')
			.order('created_at', { ascending: false })
			.limit(MAX_SHOWN)
	) as ContactMessage[];
}

export async function setRead(ids: string[], isRead: boolean) {
	if (!ids.length) return;
	check(await supabase().from('contact_messages').update({ is_read: isRead }).in('id', ids));
}

export async function deleteMessage(id: string) {
	check(await supabase().from('contact_messages').delete().eq('id', id));
}

const fmt = new Intl.DateTimeFormat('nl-NL', {
	timeZone: 'Europe/Amsterdam',
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
});
export const formatDate = (iso: string) => fmt.format(new Date(iso));

/** Mailto-link om direct te antwoorden, met het oorspronkelijke bericht geciteerd. */
export function replyLink(m: ContactMessage): string {
	const quoted = m.message
		.split('\n')
		.map((l) => `> ${l}`)
		.join('\n');
	const body = `Hoi ${m.name},\n\n\n\nOp ${formatDate(m.created_at)} schreef je:\n${quoted}`;
	return `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent('Re: je bericht aan Simpele spelletjes')}&body=${encodeURIComponent(body)}`;
}
