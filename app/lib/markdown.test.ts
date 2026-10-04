import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, mdFileName, mdToHtml } from "./markdown.ts";

test("Markdown: Grundformen", () => {
  const h = mdToHtml("# Ziele\n\nText **fett** und *kursiv* mit `code`.\n\n- eins\n- zwei\n\n1. a\n2. b\n\n> Zitat\n\n---\n\n```\n<b>roh</b>\n```");
  assert.match(h, /<h2>Ziele<\/h2>/);
  assert.match(h, /<p>Text <strong>fett<\/strong> und <em>kursiv<\/em> mit <code>code<\/code>\.<\/p>/);
  assert.match(h, /<ul><li>eins<\/li><li>zwei<\/li><\/ul>/);
  assert.match(h, /<ol><li>a<\/li><li>b<\/li><\/ol>/);
  assert.match(h, /<blockquote>Zitat<\/blockquote>/);
  assert.match(h, /<hr>/);
  assert.match(h, /<pre><code>&lt;b&gt;roh&lt;\/b&gt;<\/code><\/pre>/);
});

test("Markdown: Tabellen", () => {
  const h = mdToHtml("| Land | Kunden |\n|---|---|\n| UK | 2 |");
  assert.equal(h, "<table><thead><tr><th>Land</th><th>Kunden</th></tr></thead><tbody><tr><td>UK</td><td>2</td></tr></tbody></table>");
});

test("Markdown: kein HTML, keine gefährlichen Links", () => {
  const h = mdToHtml('<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[a](javascript:alert(1)) [b](https://ok.example/x) [c](/dashboard/gehirn) [d](//evil.example) [e](https://x.example" onclick="y)');
  assert.ok(!h.includes("<script"), h);
  assert.ok(!h.includes("<img"), h);
  assert.ok(!/href="javascript/i.test(h), h);
  assert.ok(!h.includes('href="//'), h);
  assert.ok(!/ onclick="/.test(h), h);
  assert.ok(!/<(?!\/?(p|a|strong|em|code)\b)/.test(h), h); // nur erlaubte Tags
  assert.match(h, /<a href="https:\/\/ok\.example\/x" target="_blank" rel="noopener noreferrer">b<\/a>/);
  assert.match(h, /<a href="\/dashboard\/gehirn">c<\/a>/);
  assert.equal(esc(`<"'&>`), "&lt;&quot;&#39;&amp;&gt;");
});

test("Dateiname", () => {
  assert.equal(mdFileName("ziele-grenzen"), "ziele-grenzen.md");
  assert.equal(mdFileName("../x y"), "---x-y.md");
  assert.equal(mdFileName(""), "wissen.md");
});
