"use client";

/**
 * Hinweise an Agenten geben (Inhaber 03.10.2026: „die gelben sachen … ziehen können und dieses problem agents geben“;
 * 04.10.2026: „wieso kann ich das grüne element nicht per drag und drop bewegen und es einem agenten geben oder daneben
 * das blaue?“). Jede Karte und jeder Chip unter „JARVIS empfiehlt“ lässt sich auf A1–A8 ziehen und wird dort zum
 * fertigen Auftrag (Server Action createAgentTask, gleiche Prüfung wie „Neuer Auftrag“); danach öffnet sich der Agent.
 *
 * Ziehen über Pointer-Events statt HTML5-Drag-and-Drop: dieselbe Logik für Maus, Finger und Stift. HTML5-Ziehen ging am
 * Handy/Tablet gar nicht, startete auf einem Link oft als Klick (Seite sprang zur Station) und hing an Browser-Eigenheiten
 * (eigener Datentyp in dataTransfer). Maus: überall auf dem Element ziehen. Finger: am Griff (⠿) ziehen – sonst scrollt die
 * Seite wie gewohnt. Ohne Ziehen: Klick/Enter auf einen Chip öffnet das Menü „an A…“, Karten haben den Knopf „an A…“.
 */
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { TipTask } from "@/lib/leitstand";
import { createAgentTask } from "../control-actions";
import { Icon } from "@/app/icons";
import { marketList } from "@/lib/agents";
import { TipX } from "./dismiss";

type Payload = TipTask & { title: string };
/** Agent für das Menü: Nummer, frei (kein laufender/offener Auftrag), Zustand in Worten. */
export type AgentPick = { n: number; free: boolean; state: string };

const DROP = "jarvis-agent-drop";
type DropDetail = { n: number; payload: Payload };

function give(agent: number, t: Payload) {
  const f = new FormData();
  f.set("agent", String(agent));
  f.set("kind", t.kind);
  // mehrere Länder als einzelne Felder (wie die Häkchen im Formular)
  for (const m of marketList(t.market)) f.append("market", m);
  f.set("brief", t.brief);
  f.set("back", `${location.pathname.startsWith("/dashboard") ? location.pathname : "/dashboard/jarvis"}?a=${agent}`);
  return createAgentTask(f);
}

// ------------------------------------------------------------------------------------------- Ziehen (Pointer-Events)
const MOVE_MOUSE = 6; // px, ab hier ist es Ziehen statt Klick
const MOVE_TOUCH = 4;
const EDGE = 64; // px am Fensterrand: Seite scrollt beim Ziehen mit

/** Ziehen beginnen. Maus: überall außer auf Knöpfen; Finger/Stift: nur am Griff (.drag-grip). */
function beginDrag(e: React.PointerEvent<HTMLElement>, payload: Payload) {
  if (e.button !== 0 || !e.isPrimary) return;
  const target = e.target as Element;
  const mouse = e.pointerType === "mouse";
  if (target.closest("button:not([data-drag]), .tip-x, .jt-pick, .jrec-give")) return;
  if (!mouse && !target.closest(".drag-grip")) return;
  const source = e.currentTarget;
  const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
  let started = false, x = x0, y = y0, raf = 0;
  let ghost: HTMLElement | null = null, over: HTMLElement | null = null;

  const hit = () => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-agent-drop]") ?? null;
    if (el === over) return;
    over?.removeAttribute("data-over");
    over = el;
    over?.setAttribute("data-over", "");
  };
  const scroll = () => {
    const dy = y < EDGE ? -Math.ceil((EDGE - y) / 4) : y > innerHeight - EDGE ? Math.ceil((y - innerHeight + EDGE) / 4) : 0;
    if (dy) { scrollBy(0, dy); hit(); }
    raf = requestAnimationFrame(scroll);
  };
  const start = () => {
    started = true;
    document.documentElement.classList.add("jv-dragging");
    source.classList.add("is-dragged");
    ghost = document.createElement("div");
    ghost.className = "jv-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.textContent = payload.title;
    (source.closest(".dash") ?? document.body).appendChild(ghost);
    try { source.setPointerCapture(id); } catch { /* Element evtl. schon neu gerendert */ }
    raf = requestAnimationFrame(scroll);
  };
  // Vorschau neben dem Zeiger, nie über den Fensterrand hinaus
  const place = () => { if (ghost) ghost.style.transform = `translate(${Math.max(8, Math.min(x + 14, innerWidth - ghost.offsetWidth - 8))}px, ${y + 14}px)`; };
  const cleanup = () => {
    removeEventListener("pointermove", move, true);
    removeEventListener("pointerup", up, true);
    removeEventListener("pointercancel", cancel, true);
    removeEventListener("keydown", key, true);
    cancelAnimationFrame(raf);
    ghost?.remove();
    over?.removeAttribute("data-over");
    source.classList.remove("is-dragged");
    document.documentElement.classList.remove("jv-dragging");
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    x = ev.clientX; y = ev.clientY;
    if (!started && Math.hypot(x - x0, y - y0) >= (mouse ? MOVE_MOUSE : MOVE_TOUCH)) start();
    if (!started) return;
    ev.preventDefault();
    place();
    hit();
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    const n = started && over ? Number(over.dataset.agentDrop) : 0;
    const was = started;
    cleanup();
    if (!was) return;
    // der Klick nach dem Loslassen öffnet sonst den Link/das Menü unter dem Zeiger
    const stop = (c: Event) => { c.preventDefault(); c.stopPropagation(); };
    addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => removeEventListener("click", stop, { capture: true }), 0);
    if (n) dispatchEvent(new CustomEvent<DropDetail>(DROP, { detail: { n, payload } }));
  };
  const cancel = (ev: PointerEvent) => { if (ev.pointerId === id) cleanup(); };
  const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { over?.removeAttribute("data-over"); over = null; cleanup(); } };
  addEventListener("pointermove", move, { capture: true, passive: false });
  addEventListener("pointerup", up, true);
  addEventListener("pointercancel", cancel, true);
  addEventListener("keydown", key, true);
}

/** Props für ein ziehbares Element; natives HTML5-Ziehen (Link-Bild) aus. */
const dragProps = (payload: Payload) => ({
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => beginDrag(e, payload),
  onDragStart: (e: React.DragEvent) => e.preventDefault(),
  draggable: false,
});

/** Griff (⠿): sichtbar, am Handy die Stelle zum Ziehen. */
export function Grip({ className = "" }: { className?: string }) {
  return <i className={`drag-grip ${className}`} aria-hidden><Icon name="griff" size={14} /></i>;
}

// ------------------------------------------------------------------------------------------- Chips
/** Ziehbarer Chip. Klick/Enter öffnet „an A…“ (freie Agenten zuerst markiert, Vorschlag golden) und „Details“ (Station).
 *  dkey = Schlüssel zum Ausblenden (X). */
export function DragTip({ task, title, href, level, tip, dkey, agents, suggest }: { task: TipTask; title: string; href: string; level: string; tip: string; dkey?: string; agents: AgentPick[]; suggest: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const payload: Payload = { ...task, title };
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", esc);
    // Menü nie über den rechten Rand hinaus (Handy: kein seitliches Scrollen)
    const menu = box.current?.querySelector<HTMLElement>(".jt-pick");
    const r = menu?.getBoundingClientRect();
    if (menu && r && r.right > innerWidth - 16) menu.style.left = `${Math.round(innerWidth - 16 - r.right)}px`;
    box.current?.querySelector<HTMLButtonElement>(".jt-pick .sug")?.focus();
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span ref={box} className={`jt-wrap ${open ? "open" : ""}`} data-tip="">
      <button ref={btn} type="button" data-drag="" className={`jt ${level} jt-drag`} title={`${tip}\n\nAuf A1–A8 ziehen oder klicken.`}
        aria-haspopup="menu" aria-expanded={open} {...dragProps(payload)} onClick={() => setOpen((o) => !o)}>
        <Grip className="jt-grip" />{title}
      </button>
      {dkey ? <TipX k={dkey} level={level} title={title} /> : null}
      {open && (
        <span className="jt-pick" role="menu" aria-label={`„${title}“ an Agent geben`}>
          <em>an Agent{pending ? " …" : ""}</em>
          {agents.map((a) => (
            <button key={a.n} type="button" role="menuitem" disabled={pending} className={`${a.n === suggest ? "sug" : ""} ${a.free ? "" : "busy"}`}
              title={`A${a.n}: ${a.state}`} onClick={() => start(async () => { await give(a.n, payload); })}>A{a.n}</button>
          ))}
          <Link href={href} scroll={false} className="jt-more" role="menuitem">Details <Icon name="weiter" size={14} /></Link>
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------------------------------- Ablegen
/** Ablagefläche um eine Agenten-Karte: leuchtet beim Ziehen (html.jv-dragging, [data-over] über der Karte), erteilt beim
 *  Loslassen den Auftrag und zeigt „wird beauftragt …“ bis der Agent ihn anzeigt. */
export function AgentDrop({ n, children }: { n: number; children: ReactNode }) {
  const [pending, start] = useTransition();
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<DropDetail>).detail;
      if (d?.n !== n) return;
      start(async () => { await give(n, d.payload); });
    };
    addEventListener(DROP, on);
    return () => removeEventListener(DROP, on);
  }, [n]);
  return (
    <div className={`ag-drop ${pending ? "busy" : ""}`} data-agent-drop={n}>
      {children}
      <span className="ag-hint" aria-live="polite">{pending ? `an A${n} – wird beauftragt …` : `an A${n} geben`}</span>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- Karten
/** Beliebige Kachel ziehbar machen (Karten unter „JARVIS empfiehlt“, Ampel „Engpass“); Klick auf den Inhalt bleibt wie er
 *  ist, Knöpfe (X, „an A…“) starten kein Ziehen. */
export function DragBox({ task, title, children, tip }: { task: TipTask; title: string; children: ReactNode; tip?: boolean }) {
  const payload: Payload = { ...task, title };
  return (
    <div className="drag-box" data-tip={tip ? "" : undefined} title="Auf A1–A8 ziehen, um es zu beauftragen" {...dragProps(payload)}>
      {children}
    </div>
  );
}
