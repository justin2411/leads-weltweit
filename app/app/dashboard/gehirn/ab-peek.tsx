"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/app/icons";
import { kassePeek, mailPeek, pagePeek, peekKind } from "@/lib/ab-vorschau";

/**
 * Live-Vorschau eines A/B-Tests (Inhaber 05.10.2026: „wenn ich drüber hover einen screenshot auszug sehe was dort
 * genau getestet wird … wie ein livebild“). Maus: Überfahren der Testkarte; Tastatur: Fokus; Finger: Tippen.
 * A und B nebeneinander, getestete Stelle golden markiert. Mails: echtes Mail-Layout mit Beispiel-Firma (keine
 * echten Daten); Seiten: verkleinerte Inhaber-Vorschau (?vorschau=1, zählt nie), erst beim Öffnen geladen.
 */
export type PeekVariant = { key: string; n: number; voll: string | null; pageKey?: string | null };
export type PeekTest = {
  id: string; step: string; stepTitel: string; country: string; segment: string; element: string;
  status: string; gestartet: string | null; variants: PeekVariant[];
};

const MAIL_W = 600, PAGE_W = 960;

function since(iso: string | null): string {
  if (!iso) return "nicht gestartet";
  const d = Math.max(0, (Date.now() - Date.parse(iso)) / 86_400_000);
  if (d < 1) return `seit ${Math.max(1, Math.round(d * 24))} h`;
  return `seit ${Math.round(d)} ${Math.round(d) === 1 ? "Tag" : "Tagen"}`;
}

/** Skaliert ein festes Fenster (w px breit) auf die Breite des Kastens. */
function useScale(w: number) {
  const box = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(0.3);
  const [h, setH] = useState(300);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const upd = () => { setS(Math.max(0.15, el.clientWidth / w)); setH(el.clientHeight || 300); };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return { box, s, h };
}

function MailPane({ t, v }: { t: PeekTest; v: PeekVariant }) {
  const m = useMemo(() => mailPeek(t.step, t.element, t.country, v.voll), [t, v]);
  const { box, s, h } = useScale(MAIL_W);
  return (
    <>
      <div className="abp-inbox">
        <span className="abp-av" aria-hidden>J</span>
        <span className="abp-ib">
          <b>{m.from}</b>
          <span className={m.subjectMarked ? "abp-mk" : ""}>{m.subject}</span>
          <small>{m.preheader}</small>
        </span>
        {m.chip && <span className={`abp-chip${m.chipMarked ? " abp-mk" : ""}`}>{m.chip}</span>}
      </div>
      <div className="abp-shot" ref={box}>
        <iframe title={`Mail Variante ${v.key}`} srcDoc={m.html} sandbox="" tabIndex={-1} loading="lazy"
          style={{ width: MAIL_W, height: Math.round(h / s), transform: `scale(${s})` }} />
      </div>
    </>
  );
}

function PagePane({ t, v }: { t: PeekTest; v: PeekVariant }) {
  const p = useMemo(() => pagePeek(t.step, t.element, t.country, t.segment, v.key, v.pageKey), [t, v]);
  const { box, s, h } = useScale(PAGE_W);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);
  const onLoad = useCallback((e: SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const doc = e.currentTarget.contentDocument;
      if (!doc || !p) return;
      const st = doc.createElement("style");
      st.textContent = "*{animation:none!important;transition:none!important}html{scroll-behavior:auto!important}" +
        "[data-ab-mark]{outline:6px solid #D8BD8A!important;outline-offset:8px;box-shadow:0 0 0 16px rgba(216,189,138,.3)!important;border-radius:6px}" +
        ".banner{display:none!important}";
      doc.head.appendChild(st);
      const el = doc.querySelector(p.selector) ?? doc.querySelector(p.fallback);
      if (el) {
        if (doc.querySelector(p.selector)) el.setAttribute("data-ab-mark", ""); else setMissing(true);
        const r = el.getBoundingClientRect();
        doc.defaultView?.scrollTo(0, Math.max(0, r.top + (doc.defaultView?.scrollY ?? 0) - 120));
      }
    } catch { /* fremde Seite: nur anzeigen */ }
    setReady(true);
  }, [p]);
  if (!p) return <p className="abp-none">keine Seiten-Vorschau</p>;
  return (
    <div className={`abp-shot page${ready ? " ready" : ""}`} ref={box}>
      <iframe title={`Seite Variante ${v.key}`} src={p.src} tabIndex={-1} onLoad={onLoad}
        style={{ width: PAGE_W, height: Math.round(h / s), transform: `scale(${s})` }} />
      {!ready && <span className="abp-load" aria-hidden />}
      {missing && <span className="abp-off">{t.element} aus</span>}
    </div>
  );
}

function KassePane({ t, v }: { t: PeekTest; v: PeekVariant }) {
  const html = useMemo(() => kassePeek(t.country, v.voll), [t, v]);
  const { box, s, h } = useScale(760);
  return (
    <div className="abp-shot" ref={box}>
      <iframe title={`Kasse Variante ${v.key}`} srcDoc={html} sandbox="" tabIndex={-1}
        style={{ width: 760, height: Math.round(h / s), transform: `scale(${s})` }} />
    </div>
  );
}

function Panel({ t, onClose }: { t: PeekTest; onClose: () => void }) {
  const kind = peekKind(t.step);
  return (
    <>
      <header className="abp-h">
        <b>{t.stepTitel}</b><span className="ab-cc">{t.country}</span>
        <span className="abp-meta">{t.element} · {since(t.gestartet)}</span>
        <button type="button" className="x-btn" aria-label="Schließen" onClick={onClose}><Icon name="schliessen" size={16} /></button>
      </header>
      <div className="abp-grid">
        {t.variants.map((v) => (
          <figure key={v.key} className="abp-pane">
            <figcaption><span className="ab-k">{v.key}</span><span>{v.voll ? "Variante" : "heute"}</span><small>n {v.n}</small></figcaption>
            {kind === "mail" ? <MailPane t={t} v={v} /> : kind === "page" ? <PagePane t={t} v={v} /> : kind === "kasse" ? <KassePane t={t} v={v} />
              : <p className="abp-none">{v.voll ?? "heutiger Stand"}</p>}
          </figure>
        ))}
      </div>
    </>
  );
}

/** Hülle um eine Testkarte: öffnet die Vorschau bei Überfahren, Fokus oder Tippen. */
export function AbPeek({ t, label, children }: { t: PeekTest; label: string; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; sheet: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const later = (fn: () => void, ms: number) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(fn, ms); };
  const close = useCallback(() => { window.clearTimeout(timer.current); setOpen(false); }, []);

  const place = useCallback(() => {
    const w = wrap.current, c = card.current;
    if (!w || !c) return;
    const r = w.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, m = 8;
    if (vw < 640) { setPos({ left: m, top: Math.max(m, vh - c.offsetHeight - m), sheet: true }); return; }
    const cw = c.offsetWidth, ch = c.offsetHeight;
    const below = r.bottom + ch + m <= vh || r.top - ch - m < m;
    const top = below ? Math.min(r.bottom + m, Math.max(m, vh - ch - m)) : r.top - ch - m;
    const left = Math.min(Math.max(m, r.left + r.width / 2 - cw / 2), Math.max(m, vw - cw - m));
    setPos({ left, top, sheet: false });
  }, []);

  useLayoutEffect(() => { setPos(null); if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); wrap.current?.focus(); } };
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!card.current?.contains(n) && !wrap.current?.contains(n)) close();
    };
    const onMove = () => requestAnimationFrame(place);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    const ro = card.current ? new ResizeObserver(onMove) : null;
    if (card.current) ro?.observe(card.current);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      ro?.disconnect();
    };
  }, [open, place, close]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const id = `abp-${t.id.slice(0, 8)}`;
  return (
    <div ref={wrap} className={`abp-wrap${open ? " is-open" : ""}`} tabIndex={0} role="button" aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? id : undefined} aria-label={label}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") later(() => setOpen(true), 180); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") later(() => { if (!card.current?.matches(":hover")) setOpen(false); }, 160); }}
      onFocus={(e) => { if (e.target === e.currentTarget) setOpen(true); }}
      onBlur={(e) => { const n = e.relatedTarget as Node | null; if (!n || (!card.current?.contains(n) && !wrap.current?.contains(n))) close(); }}
      onClick={(e) => { if (e.detail > 0) setOpen((o) => !o); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}>
      {children}
      {open && typeof document !== "undefined" && createPortal(
        <div ref={card} id={id} role="dialog" aria-label={`Vorschau ${t.stepTitel} ${t.country}`}
          className={`abp-card${pos?.sheet ? " sheet" : ""}`}
          style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: "hidden" }}
          onPointerEnter={() => window.clearTimeout(timer.current)}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") later(() => { if (!wrap.current?.matches(":hover")) setOpen(false); }, 160); }}>
          <Panel t={t} onClose={() => { close(); wrap.current?.focus({ preventScroll: true }); }} />
        </div>,
        document.querySelector(".dash") ?? document.body,
      )}
    </div>
  );
}
