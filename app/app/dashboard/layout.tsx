import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { logout, requireOwner } from "./actions";
import { AutoRefresh } from "./auto-refresh";
import { DASH_CSS, DASH_V2_CSS } from "./dash-css";
import { Nav } from "./nav";

// Inhaber-Bereich (Inhaber 03.10.2026): nur nach Anmeldung über /login, ohne Sitzung 404, nie indexiert, nie gecacht.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Übersicht", robots: { index: false, follow: false, nocache: true } };

const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--sans", display: "swap" });

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireOwner();
  return (
    <div className={`dash ${sans.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: DASH_CSS + DASH_V2_CSS }} />
      <header className="top">
        <div className="in">
          <a href="/dashboard" className="mark" style={{ color: "inherit", textDecoration: "none" }}>NextGen <i>Profit</i></a>
          <span className="tag" title="Dashboard zeigt nur die Webagenturen (S2) in US, UK und FR">Webagenturen</span>
          <span className="sp" />
          <AutoRefresh />
          <form action={logout}><button type="submit" className="ib" title="Abmelden" aria-label="Abmelden">⏻</button></form>
        </div>
        <div className="tabs-wrap"><Suspense><Nav /></Suspense></div>
      </header>
      <main>{children}</main>
      <footer className="foot"><a href="/dashboard/alt" title="Bisherige Detailansicht mit allen Branchen, Freigaben und Gehirn">Alte Ansicht</a></footer>
      <Suspense><Nav bottom /></Suspense>
    </div>
  );
}
