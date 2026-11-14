import { Marked, type Tokens } from 'marked';

const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const safeUrl = (href: string) => /^(https?:|mailto:)/i.test(href.trim());

const marked = new Marked({
	gfm: true,
	breaks: true,
	renderer: {
		// Ruwe HTML in de spelregels wordt als tekst getoond, nooit uitgevoerd.
		html(token: Tokens.HTML | Tokens.Tag) {
			return escapeHtml(token.text);
		},
		link(token: Tokens.Link) {
			const text = this.parser.parseInline(token.tokens);
			if (!safeUrl(token.href)) return text;
			return `<a href="${escapeHtml(token.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
		},
		image(token: Tokens.Image) {
			return escapeHtml(token.text);
		}
	}
});

/** Zet spelregels (Markdown) om naar veilige HTML. */
export function renderMarkdown(src: string): string {
	return marked.parse(src ?? '', { async: false }) as string;
}
