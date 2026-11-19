/**
 * The allow-list a stored blog `contentHtml` must satisfy before it is trusted.
 *
 * WHY THIS EXISTS. `contentHtml` is rendered with `dangerouslySetInnerHTML` on the public site. It is
 * produced only by the API's markdown renderer, which escapes everything it does not write itself, so it
 * is safe by construction. This module is the second, independent check on the OUTPUT, so that safety does
 * not rest on that renderer alone:
 *
 *   - at SAVE time the API refuses to store HTML that fails it (a renderer regression cannot ship), and
 *   - at RENDER time the web app refuses to inject HTML that fails it (a value written straight into
 *     the database, bypassing the API, is shown as an inert fallback instead).
 *
 * It is deliberately a strict GRAMMAR, not a sanitiser that repairs input: HTML is either exactly what the
 * renderer can emit, or it is rejected whole. Text may not contain a raw `<` or `>` (the renderer writes
 * those as `&lt;`/`&gt;`), tag names are the fixed set below in lower case, and each tag may carry only the
 * attributes the renderer writes for it, with values that match a fixed pattern. Pure and
 * environment-agnostic so the API and the web app run the identical check.
 */

/** `https://…`, `http://…`, `mailto:…`, `/path`, or `#fragment` — and nothing else. */
export function isSafeUrl(url: string): boolean {
  // Any control character, space or backslash: browsers normalise `/\host` to `//host`, and
  // embedded control characters are a classic filter-bypass for `javascript:`.
  // eslint-disable-next-line no-control-regex
  if (url.length === 0 || /[\u0000- \u007f-\u009f\\]/.test(url)) return false;
  // A host must follow `http(s)://`; `mailto:` must be followed by an address.
  if (/^https?:\/\/[^/]/i.test(url) || /^mailto:[^/]/i.test(url)) return true;
  if (url.startsWith('#')) return true;
  // A single leading slash; `//` would be protocol-relative (off-site).
  return url.startsWith('/') && !url.startsWith('//');
}

/** The only attributes each tag may carry, and the exact shape of each value. */
const TAG_ATTRIBUTES: Readonly<Record<string, Readonly<Record<string, RegExp>>>> = {
  h2: { id: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  h3: { id: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  p: {},
  ul: {},
  ol: {},
  li: {},
  blockquote: {},
  pre: {},
  code: { class: /^language-[a-z0-9+#-]{1,20}$/ },
  a: { href: /[\s\S]*/, rel: /^noopener noreferrer$/ },
  strong: {},
  em: {},
  div: {
    class: /^article-table-scroll$/,
    role: /^region$/,
    tabindex: /^0$/,
    'aria-label': /^Comparison table$/,
  },
  table: {},
  thead: {},
  tbody: {},
  tr: {},
  th: { scope: /^col$/ },
  td: {},
};

/** `<name attr="value" …>` or `</name>`. Values are double-quoted and contain no `"`, `<` or `>`. */
const TAG = /<(\/?)([a-z][a-z0-9]*)((?:\s+[a-z][a-z-]*="[^"<>]*")*)\s*>/y;
const ATTRIBUTE = /\s+([a-z][a-z-]*)="([^"<>]*)"/g;
const BRACKET = /[<>]/g;

/**
 * The renderer writes exactly five entities. In an attribute value any other `&` could be a numeric or
 * named entity the browser would decode into something else (`&#106;avascript:`), so it is refused.
 */
const UNKNOWN_ENTITY = /&(?!(?:amp|lt|gt|quot|#39);)/;

function decodeRendererEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** A short reason the HTML is not what the renderer can emit, or `null` if it passes every check. */
export function findUnsafeArticleHtml(html: string): string | null {
  let position = 0;

  while (position < html.length) {
    BRACKET.lastIndex = position;
    const bracket = BRACKET.exec(html);
    if (!bracket) return null; // only text remains, and text with no `<`/`>` cannot open a tag
    position = bracket.index;

    if (html[position] === '>') return 'a stray ">" outside a tag';

    TAG.lastIndex = position;
    const match = TAG.exec(html);
    if (!match) return 'markup that is not a well-formed allowed tag';

    const [whole, closing = '', name = '', attributeText = ''] = match;
    const allowed = TAG_ATTRIBUTES[name];
    if (!allowed) return `a <${name}> tag`;

    if (closing) {
      if (attributeText !== '') return `attributes on a closing </${name}> tag`;
    } else {
      for (const attribute of attributeText.matchAll(ATTRIBUTE)) {
        const [, attributeName = '', value = ''] = attribute;
        const pattern = allowed[attributeName];
        if (!pattern) return `a "${attributeName}" attribute on <${name}>`;

        if (attributeName === 'href') {
          if (UNKNOWN_ENTITY.test(value)) return 'an unrecognised entity in a link';
          if (!isSafeUrl(decodeRendererEntities(value))) return 'a link with an unsafe target';
        } else if (!pattern.test(value)) {
          return `an unexpected "${attributeName}" value on <${name}>`;
        }
      }
    }

    position += whole.length;
  }

  return null;
}
