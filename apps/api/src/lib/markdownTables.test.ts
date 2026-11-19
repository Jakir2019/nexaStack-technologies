import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findUnsafeArticleHtml } from '@nexastack/shared';
import { renderArticle } from './markdown.js';

test('tables preserve inline formatting and escape hostile cells', () => {
  const { html } = renderArticle(
    '## Compare\n\n| Choice | Detail |\n| --- | --- |\n| **One** | <script>alert(1)</script> |\n| Two | [bad](javascript:alert) |',
  );
  assert.match(html, /<th scope="col">Choice<\/th>/);
  assert.match(html, /<strong>One<\/strong>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.equal(findUnsafeArticleHtml(html), null);
  assert.ok(findUnsafeArticleHtml('<td onclick="alert(1)">bad</td>'));
  assert.ok(findUnsafeArticleHtml('<div class="other">bad</div>'));
});

test('escaped pipes, short rows and surrounding blocks remain usable', () => {
  const { html, tableOfContents } = renderArticle(
    'Paragraph\n| A | B |\n| :--- | ---: |\n| a\\|b |\n\n## Next\n\n- Item\n\n```\n| raw | table |\n```',
  );
  assert.match(html, /<td>a\|b<\/td><td><\/td>/);
  assert.match(html, /<li>Item<\/li>/);
  assert.match(html, /<pre><code>\| raw \| table \|<\/code><\/pre>/);
  assert.equal(tableOfContents[0]?.text, 'Next');
});
