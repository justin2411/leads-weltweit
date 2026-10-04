/**
 * Kleiner, sicherer Markdown-Renderer für das Gehirn-Wissen (/dashboard/gehirn#wissen). Reine Funktion ohne
 * Abhängigkeiten: jeder Text wird ZUERST maskiert (& < > " '), erst danach entstehen die wenigen erlaubten Tags –
 * so kann kein HTML aus dem Markdown in die Seite gelangen. Links nur https://… oder /dashboard…, mit rel=noopener.
 * Unterstützt: Überschriften #–####, Absätze, Listen (-, *, 1.), Zitate (>), Code-Blöcke (```), Inline-Code,
 * **fett**, *kursiv*, [Text](Link), Trennlinie (---), einfache Tabellen (| a | b |).
 */

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const SAFE_URL = /^(https:\/\/[^\s"'<>]+|\/dashboard(?:[/?#][^\s"'<>]*)?)$/;

/** Inline-Formatierung auf bereits maskiertem Text. */
function inline(raw: string): string {
  const codes: string[] = [];
  let t = esc(raw).replace(/`([^`]+)`/g, (_, c: string) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
    const u = url.replace(/&amp;/g, "&");
    if (!SAFE_URL.test(u) || u.includes("//", 8)) return label;
    const ext = u.startsWith("https://");
    return `<a href="${esc(u)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return t.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${codes[Number(i)]}</code>`);
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** Markdown → sicheres HTML (höchstens 60.000 Zeichen Eingabe). */
export function mdToHtml(md: string): string {
  const lines = String(md ?? "").slice(0, 60000).replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`); list = null; } };
  const flush = () => { flushPara(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i].trim()); i++) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); const n = Math.min(4, h[1].length + 1); out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); out.push("<hr>"); continue; }
    if (isTableRow(line)) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && isTableRow(lines[i]); i++) {
        const c = cells(lines[i]);
        if (c.every((x) => /^:?-{2,}:?$/.test(x))) continue;
        rows.push(c);
      }
      i--;
      const [head, ...body] = rows;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${
        body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) { flush(); out.push(`<blockquote>${inline(q[1])}</blockquote>`); continue; }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line), ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const tag = ul ? "ul" : "ol";
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] += ` ${line.trim()}`; continue; }
    flushList();
    para.push(line.trim());
  }
  flush();
  return out.join("\n");
}

/** Dateiname zum Herunterladen: „<slug>.md“. */
export const mdFileName = (slug: string) => `${String(slug || "wissen").replace(/[^a-z0-9-]/gi, "-").slice(0, 80) || "wissen"}.md`;
