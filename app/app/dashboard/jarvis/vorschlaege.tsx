"use client";

/**
 * Karte „Vorschläge“ (Inhaber 04.10.2026: „im system sehen und dort die verbesserungsvorschläge mit haken annehmen
 * oder kreuz ablehnen“; „wenig Text überall“): je Vorschlag Titel (≤ 60 Zeichen) und ein Satz Grund, Haken = annehmen
 * (Agent setzt um), Kreuz = ablehnen (optional mit Grund). Volltext und Zahlen nur hinter „Details“. Darunter kurz,
 * was JARVIS in den letzten 7 Tagen selbst umgesetzt hat.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Proposal } from "@/lib/vorschlaege";
import { Icon } from "@/app/icons";
import { acceptProposal, rejectProposal } from "./vorschlag-actions";

const day = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(new Date(iso));

export function Vorschlaege({ open, done }: { open: Proposal[]; done: Proposal[] }) {
  if (!open.length && !done.length) return null;
  return (
    <section className="jvs" aria-label="Vorschläge">
      {open.length > 0 && (
        <>
          <h2><Icon name="frage" size={16} /> Vorschläge <em>{open.length}</em></h2>
          <ul className="jvs-l">{open.map((p) => <Item key={p.id} p={p} />)}</ul>
        </>
      )}
      {done.length > 0 && (
        <details className="jvs-done">
          <summary><Icon name="ok-kreis" size={14} /> JARVIS hat umgesetzt <em>{done.length} in 7 Tagen</em></summary>
          <ul>{done.map((p) => (
            <li key={p.id}><b>{p.title}</b><time>{day(p.at)}</time>{p.reason && <span>{p.reason}</span>}</li>
          ))}</ul>
        </details>
      )}
    </section>
  );
}

function Item({ p }: { p: Proposal }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ask, setAsk] = useState(false);
  const [why, setWhy] = useState("");
  const run = (f: () => Promise<{ ok: true; text: string } | { ok: false; error: string }>) => start(async () => {
    const r = await f();
    setMsg(r.ok ? { ok: true, text: r.text } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <li className={`jvs-i${msg?.ok ? " gone" : ""}`}>
      <div className="jvs-t">
        <b>{p.title}</b>
        {p.reason && <span>{p.reason}</span>}
        {(p.full || p.numbers.length > 0) && (
          <details className="jvs-d">
            <summary>Details</summary>
            {p.full && <p>{p.full}</p>}
            {p.numbers.length > 0 && <dl>{p.numbers.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
          </details>
        )}
        {msg && <em className={msg.ok ? "ok" : "bad"} role="status">{msg.text}</em>}
        {ask && !msg?.ok && (
          <form className="jvs-why" onSubmit={(e) => { e.preventDefault(); run(() => rejectProposal(p.id, why)); }}>
            <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} placeholder="Grund (optional)" aria-label="Grund (optional)" autoFocus />
            <button type="submit" disabled={busy}>Ablehnen</button>
          </form>
        )}
      </div>
      {!msg?.ok && (
        <span className="jvs-b">
          <button type="button" className="yes" onClick={() => run(() => acceptProposal(p.id))} disabled={busy} aria-label={`Annehmen: ${p.title}`} title="Annehmen – ein Agent setzt um">
            <Icon name="ok" size={18} />
          </button>
          <button type="button" className="no" onClick={() => setAsk((a) => !a)} disabled={busy} aria-label={`Ablehnen: ${p.title}`} title="Ablehnen" aria-expanded={ask}>
            <Icon name="schliessen" size={18} />
          </button>
        </span>
      )}
    </li>
  );
}
