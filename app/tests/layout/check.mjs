// Layout-Wächter (Inhaber 04.10.2026: „bündig oben und unten … das X immer mittig … prüfe das überall“).
// Öffnet die Dashboard-Seiten mit Testdaten (mock-supabase.mjs) in Chromium und prüft:
//  1. nebeneinanderliegende Kästen schließen oben und unten bündig ab (±1 px)
//  2. jedes .x-btn-Zeichen sitzt mittig (±1 px)
//  3. kein seitliches Scrollen bei 1440 / 760 / 390 px
//  4. JARVIS-Werke-Karte (.jz-wk, sichtbare Fassung): Durchsatz-Texte liegen frei (keine Kachel darunter), Kacheln
//     überlappen sich nicht; alte Fluss-Karte (.fl-map, Büro) wie bisher
//  5. überall: kein absolut gesetztes Abzeichen (z. B. „vom Gehirn“ auf A1–A8) überdeckt Text in seinem Kasten
//  6. nichts ragt links/rechts aus dem Bildschirm; in der Zentrale nichts aus seinem Panel (.p)
//  7. Zentrale: zentrale Namen und Zahlen werden nicht gekürzt (Ellipsis/abgeschnitten = Fehler)
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

export const WIDTHS = [1440, 1180, 760, 721, 390];
export const PAGES = [
  "/dashboard/jarvis", "/dashboard/jarvis?s=versand", "/dashboard/jarvis?s=versand&t=set", "/dashboard/jarvis?teil=mehr", "/dashboard", "/dashboard/gehirn", "/dashboard/website", "/dashboard/website/auswertung", "/dashboard/baukasten",
  "/dashboard/regler", "/dashboard/speicher", "/dashboard/antworten", "/dashboard/versand", "/dashboard/kunden", "/dashboard/kunden-agenten",
  "/dashboard/bestand", "/dashboard/proben", "/dashboard/hilfe", "/dashboard/kontakte",
  "/dashboard/finanzen", "/dashboard/vertrieb", "/dashboard/ziele",
  "/dashboard/recht", "/dashboard/betrieb", "/dashboard/protokoll", "/dashboard/firma",
  // JARVIS-Zentrale (05.10.2026): Seitenfenster, Büro und Bereichs-Büros
  "/dashboard/jarvis?bereich=vertrieb", "/dashboard/jarvis?s=lern&p=messen", "/dashboard/jarvis?s=planke&p=notbremse", "/dashboard/jarvis?s=du",
  "/dashboard/buero", "/dashboard/buero/werke", "/dashboard/buero/bereich/vertrieb", "/dashboard/buero/bereich/qualitaet?p=rolle-test",
  "/dashboard/buero/bereich/strategie", "/dashboard/strategie", "/dashboard/buero/bereich/produktion", "/dashboard/kunden?tab=agenten",
];
const TOL = 1;

/** Playwright laden: lokal installiert, sonst global (Sandbox: /opt/node22/lib/node_modules). */
export async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return createRequire(`${root}/`)("playwright");
}

/** Chromium: PW_CHROMIUM oder /opt/pw-browsers/chromium (Sandbox, kein „playwright install“), sonst Playwright-Standard. */
export function chromiumPath() {
  const p = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium";
  return existsSync(p) ? p : undefined;
}

export function ownerCookie(secret, now = Date.now()) {
  const payload = `owner.${Math.floor(now / 1000) + 3600}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

/** Läuft im Browser: sammelt alle Verstöße einer Seite. */
export function inspect(tol) {
  const out = { scroll: null, x: [], uneven: [], flow: [], overlap: [], aus: [], kurz: [], seen: { rows: 0, x: 0, labels: 0, badges: 0, namen: 0 } };
  const vw = document.documentElement.clientWidth;
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + tol) {
    const wide = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + tol && getComputedStyle(e).position !== "fixed"; })
      .filter((e) => !e.closest("[style*='overflow'], .ags, .tick-v")).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}`);
    out.scroll = `scrollWidth ${sw} > ${vw} (${wide.join(", ")})`;
  }
  const label = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`;
  const visible = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  // 2. X mittig: Mitte des Zeichens (Icon oder Text) = Mitte des Knopfs
  for (const b of document.querySelectorAll(".x-btn")) {
    if (!visible(b)) continue;
    const r = b.getBoundingClientRect();
    const svg = b.querySelector("svg");
    let t;
    if (svg) t = svg.getBoundingClientRect();
    else { const rg = document.createRange(); rg.selectNodeContents(b); t = rg.getBoundingClientRect(); }
    if (!t.width) continue;
    out.seen.x++;
    const dx = t.left + t.width / 2 - (r.left + r.width / 2), dy = t.top + t.height / 2 - (r.top + r.height / 2);
    if (Math.abs(dx) > tol || Math.abs(dy) > tol) out.x.push(`${label(b)} versetzt dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`);
  }
  // 1. Bündig: Kästen (Rahmen oder Hintergrund) nebeneinander in einem Grid/Flex-Container
  const boxy = (e) => {
    const cs = getComputedStyle(e);
    const bg = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent" || cs.backgroundImage !== "none";
    return parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderBottomWidth) > 0 || bg;
  };
  for (const g of document.querySelectorAll("main *, .dash *")) {
    const cs = getComputedStyle(g);
    const flexRow = cs.display.includes("flex") && cs.flexDirection.startsWith("row");
    if (!cs.display.includes("grid") && !flexRow) continue;
    if (g.closest(".fl-map, svg, .tick")) continue;
    const kids = [...g.children].filter((k) => !["BUTTON", "TEXTAREA", "INPUT", "SELECT"].includes(k.tagName) && visible(k) && !["absolute", "fixed"].includes(getComputedStyle(k).position) && boxy(k) && k.getBoundingClientRect().height >= 48);
    // Reihe = Kästen, die sich senkrecht zu mehr als der Hälfte überdecken (nicht nur „Oberkante ±8 px“ –
    // sonst fällt ein Versatz von 12 px durchs Raster und gilt als neue Reihe)
    const rows = [];
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      const row = rows.find((rs) => rs.some((x) => Math.min(x.r.bottom, r.bottom) - Math.max(x.r.top, r.top) > Math.min(x.r.height, r.height) / 2 && Math.abs(x.r.left - r.left) > tol));
      if (row) row.push({ k, r }); else rows.push([{ k, r }]);
    }
    for (const rs of rows) {
      if (rs.length < 2) continue;
      out.seen.rows++;
      const tops = rs.map((x) => x.r.top), bots = rs.map((x) => x.r.bottom);
      const dt = Math.max(...tops) - Math.min(...tops), db = Math.max(...bots) - Math.min(...bots);
      if (dt > tol || db > tol) out.uneven.push(`${label(g)}: ${rs.map((x) => label(x.k)).slice(0, 3).join(" | ")} oben ±${dt.toFixed(1)} unten ±${db.toFixed(1)} px`);
    }
  }
  // 4. Fluss-Karte (nur die sichtbare: breit oder hoch)
  const map = [...document.querySelectorAll(".fl-map")].find(visible);
  if (map) {
    const st = [...map.querySelectorAll(".fl-st")].filter(visible).map((e) => ({ e, r: e.getBoundingClientRect(), n: e.querySelector(".fl-l")?.textContent ?? "?" }));
    const texts = [];
    for (const s of st) for (const t of s.e.querySelectorAll(".fl-v, .fl-l, .fl-s, .fl-neck")) if (visible(t)) {
      const rg = document.createRange(); rg.selectNodeContents(t); const r = rg.getBoundingClientRect();
      if (r.width) texts.push({ n: `${s.n}: „${t.textContent.trim()}“`, r, own: s.e });
    }
    const badges = [...map.querySelectorAll(".fl-auto")].filter(visible).map((e) => ({ n: `Abzeichen „${e.textContent.trim()}“`, r: e.getBoundingClientRect() }));
    const rates = [...map.querySelectorAll(".fl-rate")].map((e) => ({ n: `Menge „${e.textContent.trim()}“`, r: e.getBoundingClientRect() })).filter((x) => x.r.width);
    const hit = (a, b, gap = 1) => a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
    const circleGap = (r, s) => {  // Abstand Rechteck → Kreis (Station)
      const cx = s.r.left + s.r.width / 2, cy = s.r.top + s.r.height / 2;
      const nx = Math.max(r.left, Math.min(cx, r.right)), ny = Math.max(r.top, Math.min(cy, r.bottom));
      return Math.hypot(nx - cx, ny - cy) - s.r.width / 2;
    };
    const lbl = [...badges, ...rates];
    out.seen.labels = lbl.length + texts.length;
    for (let i = 0; i < lbl.length; i++) for (let j = i + 1; j < lbl.length; j++) if (hit(lbl[i].r, lbl[j].r)) out.flow.push(`${lbl[i].n} berührt ${lbl[j].n}`);
    for (const b of badges) for (const t of texts) if (hit(b.r, t.r, 2)) out.flow.push(`${b.n} berührt ${t.n}`);
    for (const r of rates) for (const s of st) if (circleGap(r.r, s) < 0) out.flow.push(`${r.n} liegt im Kreis ${s.n}`);
    for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
      const a = st[i], b = st[j];
      const d = Math.hypot(a.r.left + a.r.width / 2 - b.r.left - b.r.width / 2, a.r.top + a.r.height / 2 - b.r.top - b.r.height / 2);
      if (d < (a.r.width + b.r.width) / 2) out.flow.push(`Kreis ${a.n} überlappt Kreis ${b.n}`);
    }
    for (const x of [...badges, ...rates]) { const m = map.getBoundingClientRect(); if (x.r.left < m.left - tol || x.r.right > m.right + tol) out.flow.push(`${x.n} ragt aus der Karte`); }
  }
  // 4b. Werke-Karte der Zentrale (nur die sichtbare Fassung breit/hoch)
  const wk = [...document.querySelectorAll(".jz-wk")].find(visible);
  if (wk) {
    const hit = (a, b, gap = 0) => a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
    const tiles = [...wk.querySelectorAll(".jz-w")].filter(visible).map((e) => ({ n: e.getAttribute("aria-label")?.split(":")[0] ?? "?", r: e.getBoundingClientRect() }));
    const rates = [...wk.querySelectorAll("text.rate")].filter((e) => getComputedStyle(e).display !== "none").map((e) => ({ n: `Durchsatz „${e.textContent.trim()}“`, r: e.getBoundingClientRect() })).filter((x) => x.r.width);
    out.seen.labels += tiles.length + rates.length;
    for (const t of rates) for (const k of tiles) if (hit(t.r, k.r, 1)) out.flow.push(`${t.n} liegt unter der Kachel ${k.n}`);
    for (let i = 0; i < rates.length; i++) for (let j = i + 1; j < rates.length; j++) if (hit(rates[i].r, rates[j].r)) out.flow.push(`${rates[i].n} berührt ${rates[j].n}`);
    for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) if (hit(tiles[i].r, tiles[j].r)) out.flow.push(`Kachel ${tiles[i].n} überlappt Kachel ${tiles[j].n}`);
  }
  // 6. Aus dem Bildschirm / aus dem Panel (Elemente in abschneidenden Behältern oder fest positioniert zählen nicht)
  const clipped = (e, stop) => {
    for (let a = e.parentElement; a && a !== stop && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.position === "fixed" || /(hidden|auto|scroll|clip)/.test(cs.overflowX + cs.overflowY)) return true;
    }
    return false;
  };
  for (const e of document.querySelectorAll("main *")) {
    if (e.closest("svg") || !visible(e) || getComputedStyle(e).position === "fixed" || e.closest(".drw, [role='dialog']")) continue;
    const r = e.getBoundingClientRect();
    if ((r.left < -tol || r.right > vw + tol) && !clipped(e, null)) { out.aus.push(`${label(e)} liegt bei x ${r.left.toFixed(0)}–${r.right.toFixed(0)} (Bildschirm 0–${vw})`); continue; }
    const pnl = e.closest(".jz .p");
    if (!pnl || pnl === e || clipped(e, pnl)) continue;
    const pr = pnl.getBoundingClientRect();
    if (r.left < pr.left - tol || r.right > pr.right + tol || r.top < pr.top - tol || r.bottom > pr.bottom + tol)
      out.aus.push(`${label(e)} ragt aus dem Panel ${label(pnl)}`);
  }
  // 7. Gekürzte Namen/Zahlen in der Zentrale
  for (const e of document.querySelectorAll(".jz-pl b.nm, .jz-pl b.z, .jz-w .kz > span:not(.tl), .jz-w b.z, .jz-b .nm, .jz-ziel b.z, .jz-ziel > span > span, .jz .ag-t")) {
    if (!visible(e)) continue;
    out.seen.namen++;
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2) out.kurz.push(`${label(e)} „${e.textContent.trim().slice(0, 24)}“ gekürzt (${e.scrollWidth}>${e.clientWidth} px)`);
  }
  // 5. Abzeichen über Text: absolut gesetzte, kleine Elemente mit Text dürfen keinen anderen Text im selben Kasten berühren
  const textRects = (root, skip) => {
    const rs = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim() || skip.contains(n) || !n.parentElement || !visible(n.parentElement)) continue;
      if (n.parentElement.closest("svg, .sr-only, [aria-hidden='true']")) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 1 && r.height > 1) rs.push({ r, t: n.textContent.trim().slice(0, 24) });
    }
    return rs;
  };
  for (const b of document.querySelectorAll("main *")) {
    if (b.closest(".fl-map, svg, .drw, [role='dialog']")) continue;
    const cs = getComputedStyle(b);
    if (cs.position !== "absolute" || !visible(b) || !b.textContent.trim()) continue;
    const br = b.getBoundingClientRect();
    if (br.height > 40 || br.width > 240) continue;
    const host = b.offsetParent;
    if (!host || host === document.body) continue;
    out.seen.badges++;
    for (const { r, t } of textRects(host, b)) {
      if (r.left < br.right - tol && br.left < r.right - tol && r.top < br.bottom - tol && br.top < r.bottom - tol) {
        out.overlap.push(`${label(b)} „${b.textContent.trim().slice(0, 20)}“ überdeckt „${t}“`);
        break;
      }
    }
  }
  return out;
}

/** Prüft alle Seiten × Breiten; gibt die Liste der Fehler zurück (leer = alles bündig). */
export async function runChecks({ base, secret, pages = PAGES, widths = WIDTHS, shots = process.env.LAYOUT_SHOTS, log = console.log }) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const errors = [];
  if (shots) mkdirSync(shots, { recursive: true });
  try {
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w > 600 ? 900 : 844 }, reducedMotion: "reduce" });
      await ctx.addCookies([{ name: "sw_session", value: ownerCookie(secret), url: base }]);
      await ctx.route("**/api/events", (r) => r.abort());
      const page = await ctx.newPage();
      for (const p of pages) {
        const res = await page.goto(`${base}${p}`, { waitUntil: "load", timeout: 180_000 });
        await page.waitForTimeout(400);
        const tag = `${p.replace(/^\/dashboard\/?/, "") || "start"}`.replace(/[/?=&]/g, "_");
        const status = res?.status() ?? 0;
        if (status >= 400) { errors.push(`${p} @${w}: HTTP ${status}`); continue; }
        const r = await page.evaluate(inspect, TOL);
        const list = [...(r.scroll ? [`seitliches Scrollen: ${r.scroll}`] : []), ...r.x.map((x) => `X nicht mittig: ${x}`), ...r.uneven.map((x) => `nicht bündig: ${x}`), ...r.flow.map((x) => `Fluss-Karte: ${x}`), ...r.overlap.map((x) => `Überlappung: ${x}`), ...r.aus.map((x) => `außerhalb: ${x}`), ...r.kurz.map((x) => `gekürzt: ${x}`)];
        for (const e of list) errors.push(`${p} @${w}: ${e}`);
        log(`${list.length ? "✗" : "✓"} ${p} @${w}${list.length ? ` (${list.length})` : ""} · geprüft: ${r.seen.rows} Kasten-Reihen, ${r.seen.x} X, ${r.seen.labels} Karten-Texte, ${r.seen.badges} Abzeichen, ${r.seen.namen} Namen`);
        if (shots) await page.screenshot({ path: `${shots}/${tag}-${w}.png`, fullPage: true });
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return errors;
}
