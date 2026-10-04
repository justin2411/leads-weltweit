#!/usr/bin/env node
/**
 * Betriebswerte für das Inhaber-Dashboard aus den Konfigurationsdateien des Repos (config/*.yaml, countries.yaml,
 * Zeitpläne der GitHub-Workflows) → lib/ops-config.json.
 *
 * Läuft vor jedem `npm run build`. Die Vercel-App liegt in app/; liegen die Dateien eine Ebene höher nicht vor
 * (Build ohne Dateien außerhalb des Root-Verzeichnisses), bleibt die eingecheckte JSON-Datei unverändert.
 * Nur einfache Schlüssel/Wert-Zeilen werden gelesen – keine YAML-Abhängigkeit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(APP, "..");
const OUT = join(APP, "lib", "ops-config.json");

const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : null);

/** Wert einer Zeile `schluessel: wert` (ohne Kommentar, ohne Anführungszeichen). */
function val(text, key) {
  const m = text?.match(new RegExp(`^${key}:\\s*([^#\\n]+)`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}
const num = (text, key, dflt) => {
  const v = Number(val(text, key));
  return Number.isFinite(v) && val(text, key) !== null ? v : dflt;
};
const bool = (text, key, dflt) => (val(text, key) === null ? dflt : val(text, key) === "true");

/** Freigabe-Liste für Tests aus config/fokus.yaml (`tests:` mit `segmente: [S2]`, `laender: [US, UK, FR]`);
 *  gleiche Regeln wie scripts/lib/fokus.py test_scope(). Fehlt der Block, ist nichts freigegeben. */
export function parseTests(text) {
  const block = text?.match(/^tests:\s*\n((?:[ \t]+.*\n?)*)/m)?.[1] ?? "";
  const list = (key) => (block.match(new RegExp(`^\\s+${key}:\\s*\\[([^\\]]*)\\]`, "m"))?.[1] ?? "")
    .split(",").map((x) => x.trim().replace(/^["']|["']$/g, "").toUpperCase()).filter(Boolean);
  return { segmente: list("segmente"), laender: list("laender") };
}

/** Länder aus countries.yaml: Blockform (`  US:` + eingerückte Felder) und Kurzform (`  DE: { allowed: false … }`). */
export function parseCountries(text) {
  const out = {};
  if (!text) return out;
  const defLimit = Number(text.match(/^defaults:\s*\n(?:\s+.*\n)*?\s+daily_limit:\s*(\d+)/m)?.[1] ?? 20);
  const body = text.split(/^countries:\s*$/m)[1] ?? "";
  let cur = null;
  for (const line of body.split("\n")) {
    const inline = line.match(/^ {2}([A-Z]{2}):\s*\{(.*)\}/);
    if (inline) {
      out[inline[1]] = { allowed: /allowed:\s*true/.test(inline[2]), daily_limit: Number(inline[2].match(/daily_limit:\s*(\d+)/)?.[1] ?? defLimit) };
      cur = null;
      continue;
    }
    const head = line.match(/^ {2}([A-Z]{2}):\s*$/);
    if (head) {
      cur = head[1];
      out[cur] = { allowed: false, daily_limit: defLimit };
      continue;
    }
    if (!cur) continue;
    const f = line.match(/^ {4}(allowed|daily_limit):\s*([^#\s]+)/);
    if (f) out[cur][f[1]] = f[1] === "allowed" ? f[2] === "true" : Number(f[2]);
    else if (/^\S/.test(line)) cur = null;
  }
  return out;
}

/** Rechts-Felder je Land aus countries.yaml (Recht-Seite /dashboard/recht, nur Anzeige): erlaubt, nie, nur allgemeine
 *  Adressen, nur Kapitalgesellschaften, Tageslimit, offene Frage. Block- und Kurzform wie parseCountries. */
export function parseCountryRules(text) {
  const out = {};
  if (!text) return out;
  const body = text.split(/^countries:\s*$/m)[1] ?? "";
  const flag = (s, k) => new RegExp(`${k}:\\s*true`).test(s);
  const pick = (s, k) => s.match(new RegExp(`${k}:\\s*"([^"]*)"`))?.[1] ?? null;
  const mk = (s) => ({ allowed: flag(s, "allowed"), never: flag(s, "never"), generic_only: flag(s, "generic_only"),
    company_forms_only: flag(s, "company_forms_only"), daily_limit: Number(s.match(/daily_limit:\s*(\d+)/)?.[1] ?? 0) || null,
    open_question: pick(s, "open_question") });
  let cur = null, buf = "";
  const flush = () => { if (cur) out[cur] = mk(buf); cur = null; buf = ""; };
  for (const line of body.split("\n")) {
    const inline = line.match(/^ {2}([A-Z]{2}):\s*\{(.*)\}/);
    if (inline) { flush(); out[inline[1]] = mk(inline[2]); continue; }
    const head = line.match(/^ {2}([A-Z]{2}):\s*$/);
    if (head) { flush(); cur = head[1]; continue; }
    if (cur && /^ {4}\S/.test(line)) buf += line + "\n";
    else if (/^\S/.test(line)) flush();
  }
  flush();
  return out;
}

const LAND_CODE = { USA: "US", Singapur: "SG", Hongkong: "HK", Brasilien: "BR", Mexiko: "MX", Frankreich: "FR", Australien: "AU",
  Neuseeland: "NZ", Kanada: "CA", Japan: "JP", Israel: "IL", UK: "UK", Irland: "IE", Schweden: "SE", Finnland: "FI", Belgien: "BE",
  Deutschland: "DE", Niederlande: "NL", "Österreich": "AT", Schweiz: "CH", Italien: "IT", Spanien: "ES", Polen: "PL", "Dänemark": "DK",
  "Südafrika": "ZA" };

/** Rechts-Tabelle aus docs/KALTMAIL-RECHT.md (Land, Einzelunternehmer, Firmen, Bedingung, Risiko). Markdown-Hervorhebung entfernt. */
export function parseRechtTabelle(md) {
  if (!md) return [];
  const clean = (s) => s.replace(/\*\*/g, "").trim();
  const rows = [];
  for (const line of md.split("\n")) {
    const c = line.split("|").slice(1, -1).map(clean);
    if (c.length < 6 || !LAND_CODE[c[0]]) continue;
    rows.push({ code: LAND_CODE[c[0]], name: c[0], einzel: c[1], firmen: c[2], bedingung: c[3], risiko: c[4] });
  }
  return rows;
}

/** Cron-Ausdrücke eines Workflows (nur aktive Zeilen, keine auskommentierten). */
export function parseCrons(text) {
  if (!text) return [];
  return [...text.matchAll(/^[^#\n]*cron:\s*"([^"]+)"/gm)].map((m) => m[1]);
}

const WORKFLOWS = {
  "send.yml": "Versand Kaltmails",
  "lead-werk.yml": "Lead-Werk",
  "kunden-werk.yml": "Kunden-Werk",
  "proben-vorrat.yml": "Proben-Vorrat",
  "antworten.yml": "Antwort-Assistent",
  "taeglich.yml": "Automatiklauf (Nachfass, Entwürfe)",
  "kundenlieferung.yml": "Kundenlieferung",
  "tagescheck.yml": "Tagescheck",
  "wachhund.yml": "Wachhund",
};

export const SIGNATUR_FILES = ["scripts/drafts.py", "scripts/lib/html_email.py", "app/lib/welcome-mail.ts"];
export const SIGNATUR_RE = /Exclusive trigger leads|Pistes exclusives/;

function build() {
  const versand = read("config/versand.yaml");
  if (versand === null) return null;
  const proben = read("config/proben.yaml");
  const fokus = read("config/fokus.yaml");
  const pipeline = read("config/pipeline.yaml");
  return {
    versand: {
      aktiv: bool(versand, "aktiv", false),
      notbremse_ab: val(versand, "notbremse_ab"),
      tagesziel: num(versand, "tagesziel", 100),
      tagesziel_ab: val(versand, "tagesziel_ab"),
      tagesziel_schritt: num(versand, "tagesziel_schritt", 0),
      tagesziel_max: num(versand, "tagesziel_max", num(versand, "tagesziel", 100)),
      anbieter_tageslimit: num(versand, "anbieter_tageslimit", 100),
      postfach_start: num(versand, "postfach_start", 60),
      postfach_schritt: num(versand, "postfach_schritt", 15),
      postfach_tageslimit: num(versand, "postfach_tageslimit", 100),
      gesamtgrenze: num(versand, "gesamtgrenze", 1000),
    },
    proben: {
      fokus_je_seite: num(proben, "fokus_je_seite", 6),
      andere_je_seite: num(proben, "andere_je_seite", 3),
      max_alter_stunden: num(proben, "max_alter_stunden", 48),
    },
    fokus: [...(fokus ?? "").matchAll(/^\s*-\s*(S\d+)\/([A-Z]{2})\s*$/gm)].map((m) => `${m[1]}/${m[2]}`),
    nur_fokus: bool(fokus, "nur_fokus", false),
    tests: parseTests(fokus),
    lead_suche: bool(pipeline, "lead_suche", true),
    kunden_suche: bool(pipeline, "kunden_suche", true),
    countries: parseCountries(read("countries.yaml")),
    rules: {
      signal_max_age_days: Number(read("scripts/extraktor/sc.py")?.match(/^MAX_AGE_DAYS\s*=\s*(\d+)/m)?.[1] ?? 0) || null,
      sample_size: Number(read("scripts/lib/leadreport.py")?.match(/^SAMPLE_SIZE\s*=\s*(\d+)/m)?.[1] ?? 0) || null,
      // „Braucht dich“: Signatur-Zeile mit Exklusivitätszusage (widerspricht docs/KALTMAIL-VORLAGE.md §2)
      signatur_exklusiv: SIGNATUR_FILES.filter((f) => SIGNATUR_RE.test(read(f) ?? "")),
    },
    recht: { laender: parseCountryRules(read("countries.yaml")), tabelle: parseRechtTabelle(read("docs/KALTMAIL-RECHT.md")) },
    workflows: Object.entries(WORKFLOWS).map(([file, name]) => ({ file, name, crons: parseCrons(read(`.github/workflows/${file}`)) })),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cfg = build();
  if (!cfg) {
    console.log("ops-config: config/ nicht gefunden – eingecheckte lib/ops-config.json bleibt");
  } else {
    const next = JSON.stringify(cfg, null, 2) + "\n";
    const prev = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (next !== prev) writeFileSync(OUT, next);
    console.log(`ops-config: ${next === prev ? "unverändert" : "aktualisiert"} (${OUT})`);
  }
}
