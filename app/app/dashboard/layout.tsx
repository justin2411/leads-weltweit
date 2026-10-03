import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Rajdhani } from "next/font/google";
import { logout, requireOwner } from "./actions";
import { AutoRefresh } from "./auto-refresh";
import { DASH_CSS, DASH_V2_CSS } from "./dash-css";
import { HUD_CSS } from "./hud-css";
import { LIVE_CSS } from "./live";
import { Nav } from "./nav";
import { Flash } from "./flash";

// Inhaber-Bereich (Inhaber 03.10.2026): nur nach Anmeldung über /login, ohne Sitzung 404, nie indexiert, nie gecacht.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Übersicht", robots: { index: false, follow: false, nocache: true } };

const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--sans", display: "swap" });
// JARVIS-Design (Inhaber 03.10.2026): technische Schrift für Titel, Monospace für Zahlen
const hud = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--hudf", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--monof", display: "swap" });

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireOwner();
  return (
    <div className={`dash ${sans.variable} ${hud.variable} ${mono.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: DASH_CSS + DASH_V2_CSS + LIVE_CSS + HUD_CSS }} />
      <header className="top">
        <div className="in">
          <a href="/dashboard/jarvis" className="mark" style={{ color: "inherit", textDecoration: "none" }}>NextGen <i>Profit</i></a>
          <span className="tag" title="Dashboard zeigt nur die Webagenturen (S2) in US, UK und FR">Webagenturen</span>
          <span className="sp" />
          <AutoRefresh />
          <form action={logout} className="ibf"><button type="submit" className="ib" title="Abmelden" aria-label="Abmelden">
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v9" />
              <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
            </svg>
          </button></form>
        </div>
        <div className="tabs-wrap"><Suspense><Nav /></Suspense></div>
      </header>
      <Suspense><Flash /></Suspense>
      <main>{children}</main>
      <footer className="foot"><a href="/dashboard/alt" title="Bisherige Detailansicht mit allen Branchen, Freigaben und Gehirn">Alte Ansicht</a></footer>
      <Suspense><Nav bottom /></Suspense>
    </div>
  );
}
