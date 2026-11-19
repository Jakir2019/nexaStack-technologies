import { findUnsafeArticleHtml, isSafeUrl, type BlogTocItem } from '@nexastack/shared';

import { slugify } from './slug.js';

/**
 * A deliberately small markdown renderer for blog post bodies. Zero dependencies.
 *
 * SECURITY MODEL — the output is stored as `contentHtml` and rendered with
 * `dangerouslySetInnerHTML` on the public site, so it is only safe if this file never emits
 * anything the author controls except as escaped text. That is guaranteed by construction:
 *
 *   1. There is no raw-HTML passthrough. Every `<`, `>`, `&`, `"` and `'` in author text is
 *      escaped; the only tags in the output are the ones this file writes itself.
 *   2. Link targets are allow-listed (`http:`, `https:`, `mailto:`, or a single-slash relative
 *      path or `#fragment`). Anything else (`javascript:`, `data:`, `//host`, `/\host`, control
 *      characters, backslashes) is dropped and only the link text is kept.
 *   3. The only attribute values that come from the author are the escaped link `href` and a
 *      code-fence language restricted to `[a-z0-9+#-]`.
 *
 * Supported: `##` and `###` headings, paragraphs, `-`/`*` bullet lists, `1.` numbered lists,
 * `>` blockquotes, ``` fenced code blocks, and inline **bold**, *italic*, `code`, [links](url).
 * Only elements `.article-prose` in styles/globals.css actually styles are emitted.
 * Pipe tables support inline formatting and escaped pipes; alignment markers are accepted but
 * presentation stays left-aligned. Not supported: raw HTML, images, nested lists, `#` and `####`
 * headings. `#` is not a heading because the page template already owns the one `<h1>`.
 */

export interface RenderedMarkdown {
  html: string;
  tableOfContents: BlogTocItem[];
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

// The link allow-list lives in `@nexastack/shared` so the save-time and render-time checks of the
// rendered HTML (`findUnsafeArticleHtml`) use the SAME rule this renderer applies. Re-exported here
// because the renderer's own tests and callers import it from this module.
export { isSafeUrl };

const CODE_SPAN = /`([^`\n]+)`/g;
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** Emphasis on text that is ALREADY escaped, so the only `<` in it are the ones added here. */
function renderEmphasis(escaped: string): string {
  return escaped
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
}

/** Text with no code spans left: links first (validated), then emphasis on the remainder. */
function renderTextWithLinks(text: string): string {
  let out = '';
  let last = 0;

  for (const match of text.matchAll(LINK)) {
    const [whole, label = '', url = ''] = match;
    const start = match.index ?? 0;
    out += renderEmphasis(escapeHtml(text.slice(last, start)));

    const labelHtml = renderEmphasis(escapeHtml(label));
    if (isSafeUrl(url)) {
      const external = /^https?:/i.test(url);
      const rel = external ? ' rel="noopener noreferrer"' : '';
      out += `<a href="${escapeHtml(url)}"${rel}>${labelHtml}</a>`;
    } else {
      out += labelHtml; // unsafe target: keep the words, drop the link
    }
    last = start + whole.length;
  }

  return out + renderEmphasis(escapeHtml(text.slice(last)));
}

/** Inline markup for one line of author text. Code spans are cut out first so nothing inside
 * them is interpreted. */
export function renderInline(raw: string): string {
  let out = '';
  let last = 0;

  for (const match of raw.matchAll(CODE_SPAN)) {
    const start = match.index ?? 0;
    out += renderTextWithLinks(raw.slice(last, start));
    out += `<code>${escapeHtml(match[1] ?? '')}</code>`;
    last = start + match[0].length;
  }

  return out + renderTextWithLinks(raw.slice(last));
}

/** Heading text with its inline markers removed, for the table of contents and the id. */
function toPlainText(raw: string): string {
  return raw
    .replace(LINK, '$1')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/\*\*([^*\n]*)\*\*/g, '$1')
    .replace(/(^|[^*\w])\*([^*\n]*)\*(?![*\w])/g, '$1$2')
    .replace(/(^|[^\w])_([^_\n]*)_(?!\w)/g, '$1$2')
    .trim();
}

export function slugifyHeading(text: string): string {
  return slugify(text, 'section');
}

const HEADING = /^(#{2,3})\s+(.+?)\s*#*\s*$/;
const FENCE = /^```([A-Za-z0-9+#-]{0,20})\s*$/;
const BULLET = /^[-*]\s+(.+)$/;
const NUMBERED = /^\d{1,3}[.)]\s+(.+)$/;
const QUOTE = /^>\s?(.*)$/;

/** Pipe tables with optional outer pipes; escaped pipes remain literal cell text. */
function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function tableStart(lines: string[], index: number): boolean {
  const header = lines[index] ?? '';
  const separator = lines[index + 1] ?? '';
  const cells = tableCells(separator);
  return (
    header.includes('|') &&
    cells.length === tableCells(header).length &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell))
  );
}

export function renderMarkdown(source: string): RenderedMarkdown {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  const tableOfContents: BlogTocItem[] = [];
  const usedIds = new Map<string, number>();

  const uniqueId = (base: string): string => {
    const count = usedIds.get(base) ?? 0;
    usedIds.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    // Fenced code block: everything up to the closing fence (or the end) is literal text.
    const fence = FENCE.exec(line.trim());
    if (fence) {
      const language = (fence[1] ?? '').toLowerCase();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      index += 1; // the closing fence
      const cls = language ? ` class="language-${language}"` : '';
      html.push(`<pre><code${cls}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    if (tableStart(lines, index)) {
      const headers = tableCells(line);
      const rows: string[] = [];
      index += 2;
      while (
        index < lines.length &&
        (lines[index] ?? '').includes('|') &&
        (lines[index] ?? '').trim()
      ) {
        const cells = tableCells(lines[index] ?? '');
        rows.push(
          `<tr>${headers.map((_, column) => `<td>${renderInline(cells[column] ?? '')}</td>`).join('')}</tr>`,
        );
        index += 1;
      }
      html.push(
        `<div class="article-table-scroll" role="region" tabindex="0" aria-label="Comparison table"><table><thead><tr>${headers.map((cell) => `<th scope="col">${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`,
      );
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1]?.length === 2 ? 2 : 3;
      const raw = heading[2] ?? '';
      const text = toPlainText(raw);
      const id = uniqueId(slugifyHeading(text));
      tableOfContents.push({ id, text, level });
      html.push(`<h${level} id="${id}">${renderInline(raw)}</h${level}>`);
      index += 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      const pattern = bullet ? BULLET : NUMBERED;
      const tag = bullet ? 'ul' : 'ol';
      const items: string[] = [];
      while (index < lines.length) {
        const item = pattern.exec(lines[index] ?? '');
        if (!item) break;
        items.push(`<li>${renderInline(item[1] ?? '')}</li>`);
        index += 1;
      }
      html.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const item = QUOTE.exec(lines[index] ?? '');
        if (!item) break;
        quoted.push(item[1] ?? '');
        index += 1;
      }
      html.push(`<blockquote><p>${renderInline(quoted.join(' ').trim())}</p></blockquote>`);
      continue;
    }

    // Paragraph: consecutive lines that are not the start of another block.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? '';
      if (
        current.trim() === '' ||
        tableStart(lines, index) ||
        FENCE.test(current.trim()) ||
        HEADING.test(current) ||
        BULLET.test(current) ||
        NUMBERED.test(current) ||
        QUOTE.test(current)
      ) {
        break;
      }
      paragraph.push(current.trim());
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  return { html: html.join('\n'), tableOfContents };
}

/**
 * `renderMarkdown` plus an independent check of its OUTPUT against the article-HTML allow-list in
 * `@nexastack/shared` (the same check the public site runs before injecting stored HTML). Use this
 * wherever the HTML is going to be STORED: if the renderer ever regressed and emitted something outside
 * the grammar, the save fails (a logged 500) instead of persisting markup that would be injected into
 * the public page. The message names the rule broken, never the author's text.
 */
export function renderArticle(source: string): RenderedMarkdown {
  const rendered = renderMarkdown(source);
  const problem = findUnsafeArticleHtml(rendered.html);
  if (problem) {
    throw new Error(`Rendered article HTML failed the allow-list check: ${problem}`);
  }
  return rendered;
}
