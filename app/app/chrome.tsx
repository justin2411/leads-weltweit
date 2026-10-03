import type { CSSProperties, ReactNode } from "react";
import { Inter } from "next/font/google";
import { BRAND_CSS } from "@/lib/brand-css";
import { CONTACT } from "@/lib/site";
import { LEGAL_LABELS, LEGAL_PATHS } from "@/content/legal-i18n";
import { Motion } from "./motion";
import { preload } from "react-dom";
import { cssHrefs, type CssBundle } from "@/lib/css-bundles";

// Schrift wird beim Build selbst gehostet (kein Abruf bei Google durch Besucher, DSGVO).
const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--sans", display: "swap" });

/** Rahmen aller öffentlichen Seiten: gleiches Design, Schrift, Effekte. */
/** css: Seiten-CSS als zwischengespeicherte Datei (lib/css-bundles.ts, gleicher Inhalt wie BRAND_CSS + extraCss). */
export function BrandShell({ lang, children, extraCss, css }: { lang: string; children: ReactNode; extraCss?: string; css?: CssBundle }) {
  const hrefs = css ? cssHrefs(css) : [];
  // früh im <head> anfordern; angewendet wird es wie bisher an dieser Stelle (gleiche Reihenfolge der Regeln)
  for (const href of hrefs) preload(href, { as: "style" });
  return (
    <div className={`bx ${sans.variable}`} lang={lang}>
      {css ? hrefs.map((href) => <link rel="stylesheet" href={href} key={href} />) : <style dangerouslySetInnerHTML={{ __html: BRAND_CSS + (extraCss ?? "") }} />}
      {/* Das Grundgerüst steht auf lang="de"; Browser und Screenreader sollen die Sprache der Seite kennen */}
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.lang=${JSON.stringify(/^[a-z]{2}$/.test(lang) ? lang : "en")}` }} />
      <Motion />
      {children}
    </div>
  );
}

/** Überschrift Wort für Wort. Punkte am Ende werden entfernt (Überschriften ohne Punkt). gold: Wörter in Gold. */
export function Words({ text, gold = [], start = 0 }: { text: string; gold?: string[]; start?: number }) {
  const clean = text.trim().replace(/[.。]+$/u, "");
  const goldSet = new Set(gold.map((g) => g.toLowerCase()));
  // Zeilenumbruch: "\n" im Text beginnt eine neue Zeile
  let n = start;
  return (
    <>
      {clean.split("\n").map((line, li) => (
        <span key={li}>
          {li > 0 && <br />}
          {line.trim().split(/\s+/).map((w, i) => (
            <span key={i}>
              <span className={`w${goldSet.has(w.toLowerCase().replace(/[.,!?]/g, "")) ? " gold-t" : ""}`} style={{ "--i": n++ } as CSSProperties}>{w}</span>{" "}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}

export function Mark() {
  return <a className="mark" href="/">NextGen <i>Profit</i></a>;
}

export function SiteHeader({ links = [], cta, langs }: { links?: [string, string][]; cta?: [string, string]; langs?: [string, string, boolean][] }) {
  return (
    <header className="nav"><div className="wrap">
      <Mark />
      <nav className="links" aria-label="Main">
        {links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        {langs && (
          <span className="langs" aria-label="Language">
            {langs.map(([code, href, on]) => <a key={code} href={href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined} hrefLang={code.toLowerCase()}>{code}</a>)}
          </span>
        )}
        {cta && <a className="pill" href={cta[0]}>{cta[1]}</a>}
      </nav>
    </div></header>
  );
}

export function SiteFooter({ lang = "en" }: { lang?: string }) {
  const k = (lang === "fr" || lang === "de" ? lang : "en") as keyof typeof LEGAL_PATHS;
  const labels = LEGAL_LABELS[k], paths = LEGAL_PATHS[k];
  return (
    <footer><div className="wrap">
      <div>
        <Mark />
        {/* Inhaber 03.10.2026: Büro Leipzig, gilt für alles */}
        <address>Nikolaistraße 3-7 · 04109 Leipzig · Germany<br /><a href={`mailto:${CONTACT}`}>{CONTACT}</a></address>
      </div>
      <nav aria-label="Legal"><a href={{ en: "/contact", fr: "/fr/contact", de: "/de/kontakt" }[k]}>{{ en: "Contact", fr: "Contact", de: "Kontakt" }[k]}</a><a href={paths.impressum}>{labels[0]}</a><a href={paths.datenschutz}>{labels[1]}</a><a href={paths.agb}>{labels[2]}</a></nav>
      <div style={{ width: "100%", marginTop: 8 }}>© {new Date().getFullYear()} NextGen Profit</div>
    </div></footer>
  );
}

/** Kopf mit Überschrift für Textseiten (dunkel, gleiche Effekte wie der Hero). */
export function PageHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="hero solo">
      <div className="wrap" style={{ paddingBottom: 130 }}>
        <h1><Words text={title} /></h1>
      </div>
    </div>
  );
}
