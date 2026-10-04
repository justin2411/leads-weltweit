"use client";

/**
 * Karte „Braucht dich“ (Inhaber 04.10.2026): offene Punkte, die nur der Inhaber erledigen kann. Je Zeile Titel,
 * ein Satz Grund und Ziel-Link; Details per Aufklappen. Leer = Karte entfällt. Farben aus lib/ampel.ts (t-red/t-gold/t-grey).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/app/icons";
import { bdZaehler, type BdPunkt } from "@/lib/braucht-dich";
import { decideSignatur, markDone } from "./braucht-dich-actions";

export function BrauchtDich({ items }: { items: BdPunkt[] }) {
  if (!items.length) return null;
  return (
    <section className="bd" id="braucht-dich" aria-label="Braucht dich">
      <h2><Icon name="achtung" size={16} /> Braucht dich <em>{bdZaehler(items.length)}</em></h2>
      <ul className="bd-l">{items.map((x) => <Row key={x.key} x={x} />)}</ul>
    </section>
  );
}

function Row({ x }: { x: BdPunkt }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (f: () => Promise<{ ok: true; text: string } | { ok: false; error: string }>) => start(async () => {
    const r = await f();
    setMsg(r.ok ? { ok: true, text: r.text } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });
  const ext = /^https?:/.test(x.href);
  return (
    <li className={`bd-i t-${x.tone}${msg?.ok ? " gone" : ""}`}>
      <i className="bd-dot" aria-hidden />
      <details className="bd-d">
        <summary><b>{x.title}</b><span>{x.reason}</span></summary>
        <p>{x.detail}</p>
        {x.act === "erledigt" && x.decisionId && !msg?.ok && (
          <button type="button" className="bd-btn" disabled={busy} onClick={() => run(() => markDone(x.decisionId!))}>Erledigt</button>
        )}
        {x.act === "signatur" && !msg?.ok && (
          <span className="bd-two">
            <button type="button" className="bd-btn" disabled={busy} onClick={() => run(() => decideSignatur("aendern"))}>Ändern lassen</button>
            <button type="button" className="bd-btn" disabled={busy} onClick={() => run(() => decideSignatur("behalten"))}>Behalten</button>
          </span>
        )}
        {msg && <em className={msg.ok ? "ok" : "bad"} role="status">{msg.text}</em>}
      </details>
      {ext
        ? <a className="bd-go" href={x.href} target="_blank" rel="noopener noreferrer">{x.cta}<Icon name="weiter" size={14} /></a>
        : <Link className="bd-go" href={x.href}>{x.cta}<Icon name="weiter" size={14} /></Link>}
    </li>
  );
}
