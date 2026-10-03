"use client";

/**
 * Hinweise an Agenten geben (Inhaber 03.10.2026: „die gelben sachen … ziehen können und dieses problem agents geben, das
 * die das ausführen“). Ein Hinweis mit fertigem Auftrag lässt sich auf A1–A4 ziehen; am Handy (kein Ziehen) per Tippen
 * auf den Weitergeben-Knopf (Linien-Icon „an-agent“) und Agent wählen. Erteilt wird über die bestehende Server Action createAgentTask (gleiche Prüfung wie das
 * Formular „Neuer Auftrag“) – danach öffnet sich der Agent mit dem neuen Auftrag.
 */
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { TipTask } from "@/lib/leitstand";
import { createAgentTask } from "../control-actions";
import { Icon } from "@/app/icons";

const MIME = "application/x-jarvis-task";
const AGENTS = [1, 2, 3, 4];
type Payload = TipTask & { title: string };

function give(agent: number, t: Payload) {
  const f = new FormData();
  f.set("agent", String(agent));
  f.set("kind", t.kind);
  f.set("market", t.market ?? "");
  f.set("brief", t.brief);
  f.set("back", `/dashboard/jarvis?a=${agent}`);
  return createAgentTask(f);
}

const dragging = (on: boolean) => document.documentElement.classList.toggle("jv-dragging", on);

/** Ziehbarer Hinweis (Link bleibt klickbar) mit Weitergeben-Knopf für Handys. */
export function DragTip({ task, title, href, level, tip }: { task?: TipTask; title: string; href: string; level: string; tip: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [open]);
  if (!task) return <Link href={href} scroll={false} className={`jt ${level}`} title={tip}>{title}</Link>;
  const payload: Payload = { ...task, title };
  return (
    <span ref={box} className={`jt-wrap ${open ? "open" : ""}`}>
      <Link href={href} scroll={false} className={`jt ${level} jt-drag`} title={`${tip}\n\nAuf einen Agenten ziehen, um es zu beauftragen.`} draggable
        onDragStart={(e) => { e.dataTransfer.setData(MIME, JSON.stringify(payload)); e.dataTransfer.setData("text/plain", title); e.dataTransfer.effectAllowed = "copy"; dragging(true); }}
        onDragEnd={() => dragging(false)}>
        <i className="jt-grip" aria-hidden><Icon name="griff" size={14} /></i>{title}
      </Link>
      <button type="button" className="jt-give" aria-label={`„${title}“ an einen Agenten geben`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="an-agent" size={16} />
      </button>
      {open && (
        <span className="jt-pick" role="menu">
          <em>an</em>
          {AGENTS.map((n) => (
            <button key={n} type="button" role="menuitem" disabled={pending} onClick={() => start(async () => { await give(n, payload); })}>A{n}</button>
          ))}
        </span>
      )}
    </span>
  );
}

/** Ablagefläche um eine Agenten-Karte: leuchtet beim Ziehen, erteilt beim Loslassen den Auftrag. */
export function AgentDrop({ n, children }: { n: number; children: ReactNode }) {
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();
  const accepts = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(MIME);
  return (
    <div className={`ag-drop ${over ? "over" : ""} ${pending ? "busy" : ""}`}
      onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        setOver(false);
        dragging(false);
        let t: Payload;
        try { t = JSON.parse(e.dataTransfer.getData(MIME)); } catch { return; }
        start(async () => { await give(n, t); });
      }}>
      {children}
      <span className="ag-hint" aria-hidden>{pending ? "wird beauftragt …" : "hier ablegen"}</span>
    </div>
  );
}

/** Beliebige Kachel ziehbar machen (z. B. Ampel „Engpass“); der Klick auf den Inhalt bleibt wie er ist. */
export function DragBox({ task, title, children }: { task: TipTask; title: string; children: ReactNode }) {
  const payload: Payload = { ...task, title };
  return (
    <div className="drag-box" title="Auf einen Agenten ziehen, um es zu beauftragen"
      onDragStart={(e) => { e.dataTransfer.setData(MIME, JSON.stringify(payload)); e.dataTransfer.setData("text/plain", title); e.dataTransfer.effectAllowed = "copy"; dragging(true); }}
      onDragEnd={() => dragging(false)}>
      {children}
    </div>
  );
}
