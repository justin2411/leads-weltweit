import type { CSSProperties, ReactNode } from "react";
import { Inter } from "next/font/google";
import { BRAND_CSS } from "@/lib/brand-css";
import { BRAND, CONTACT } from "@/lib/site";
import { Motion } from "./motion";

// Schrift wird beim Build selbst gehostet (kein Abruf bei Google durch Besucher, DSGVO).
const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--sans", display: "swap" });

/** Rahmen aller öffentlichen Seiten: gleiches Design, Schrift, Effekte. */
export function BrandShell({ lang, children, extraCss }: { lang: string; children: ReactNode; extraCss?: string }) {
  return (
    <div className={`bx ${sans.variable}`} lang={lang}>
      <style dangerouslySetInnerHTML={{ __html: BRAND_CSS + (extraCss ?? "") }} />
      <Motion />
      {children}
    </div>
  );
}

/** Überschrift Wort für Wort. Punkte am Ende werden entfernt (Überschriften ohne Punkt). gold: Wörter in Gold. */
export function Words({ text, gold = [], start = 0 }: { text: string; gold?: string[]; start?: number }) {
  const clean = text.trim().replace(/[.。]+$/u, "");
  const goldSet = new Set(gold.map((g) => g.toLowerCase()));
  return (
    <>
      {clean.split(/\s+/).map((w, i) => (
        <span key={i}>
          <span className={`w${goldSet.has(w.toLowerCase().replace(/[.,!?]/g, "")) ? " gold-t" : ""}`} style={{ "--i": i + start } as CSSProperties}>{w}</span>{" "}
        </span>
      ))}
    </>
  );
}

export function Mark() {
  return <a className="mark" href="/">NextGen <i>Profit</i></a>;
}

export function SiteHeader({ links = [], cta }: { links?: [string, string][]; cta?: [string, string] }) {
  return (
    <header className="nav"><div className="wrap">
      <Mark />
      <nav className="links" aria-label="Main">
        {links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        {cta && <a className="pill" href={cta[0]}>{cta[1]}</a>}
      </nav>
    </div></header>
  );
}

export function SiteFooter({ labels = ["Legal notice", "Privacy policy", "Terms"] }: { labels?: readonly string[] }) {
  return (
    <footer><div className="wrap">
      <div>
        <Mark />
        <address>Poststraße 14-16 · 20354 Hamburg · Germany<br /><a href={`mailto:${CONTACT}`}>{CONTACT}</a></address>
      </div>
      <nav aria-label="Legal"><a href="/impressum">{labels[0]}</a><a href="/datenschutz">{labels[1]}</a><a href="/agb">{labels[2]}</a></nav>
      <div style={{ width: "100%", marginTop: 8 }}>© {new Date().getFullYear()} {BRAND}</div>
    </div></footer>
  );
}

/** Kopf mit Überschrift für Textseiten (dunkel, gleiche Effekte wie der Hero). */
export function PageHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="hero solo">
      <div className="spot" aria-hidden="true" />
      <div className="wrap" style={{ paddingBottom: 130 }}>
        <div className="eyebrow later" style={{ "--d": ".1s" } as CSSProperties}>{eyebrow}</div>
        <h1><Words text={title} /></h1>
      </div>
    </div>
  );
}
