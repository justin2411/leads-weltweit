"use client";

import { useState, type FormEvent } from "react";
import type { ContactText } from "./contact-i18n";

/**
 * Kontaktformular (Inhaber 03.10.2026): Name, Firma, E-Mail, Telefon, Branche, Land, gewünschte Leads, Nachricht,
 * Einwilligung. Sendet per JavaScript an /api/contact, ohne JavaScript als normales Formular (Weiterleitung).
 * Gleiche Klassen wie das Probe-Formular (pf-).
 */
export type IndustryOption = { value: string; label: string; wishes: { key: string; label: string }[] };

export function ContactForm({ T, lang, industries, markets, privacyHref }: {
  T: ContactText; lang: string; industries: IndustryOption[]; markets: [string, string][]; privacyHref: string;
}) {
  const f = T.f;
  const [industry, setIndustry] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState("");
  const [sentTo, setSentTo] = useState("");
  const wishes = industries.find((o) => o.value === industry)?.wishes ?? [];
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const mail = String(fd.get("email") ?? "").trim();
    if (String(fd.get("company") ?? "").trim().length < 2) return setErr(f.e_company);
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(mail)) return setErr(f.e_email);
    if (!industry) return setErr(f.e_industry);
    if (!fd.get("consent")) return setErr(f.e_consent);
    setErr(""); setState("busy");
    try {
      const r = await fetch("/api/contact", { method: "POST", body: fd, headers: { Accept: "application/json" }, credentials: "same-origin" });
      const j = await r.json().catch(() => ({ ok: false, error: "server" }));
      if (j.ok) { setSentTo(mail); setState("done"); return; }
      setErr((f as Record<string, string>)[`e_${j.error}`] ?? f.e_server); setState("idle");
    } catch {
      setErr(f.e_server); setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="pf pf-done" role="status" aria-live="polite">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>
        <p>{f.done} <b>{sentTo}</b>.</p>
      </div>
    );
  }

  return (
    <form className="pf" method="post" action="/api/contact" onSubmit={submit} noValidate>
      <input type="hidden" name="lang" value={lang} />
      <div className="pf-row">
        <label className="pf-field"><span>{f.name}</span>
          <input name="name" maxLength={120} autoComplete="name" /></label>
        <label className="pf-field"><span>{f.company}</span>
          <input name="company" required minLength={2} maxLength={200} autoComplete="organization" /></label>
      </div>
      <div className="pf-row">
        <label className="pf-field"><span>{f.email}</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" inputMode="email" /></label>
        <label className="pf-field"><span>{f.phone} <small>{f.optional}</small></span>
          <input name="phone" type="tel" maxLength={40} autoComplete="tel" inputMode="tel" /></label>
      </div>
      <div className="pf-row">
        <label className="pf-field"><span>{f.industry}</span>
          <select name="industry" value={industry} required onChange={(e) => { setIndustry(e.target.value); setPicked([]); }}>
            <option value="" disabled>{f.choose}</option>
            {industries.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="pf-field"><span>{f.market}</span>
          <select name="country" defaultValue={markets[0][0]}>
            {markets.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      {wishes.length > 0 && <fieldset className="pf-set">
        <legend>{f.which} <small>{f.whichHint}</small></legend>
        <div className="pf-chips">
          {wishes.map((w) => {
            const on = picked.includes(w.key);
            return (
              <label key={w.key} className={`pf-chip${on ? " pf-on" : ""}`}>
                <input type="checkbox" name="signals" value={w.key} checked={on} onChange={() => toggle(w.key)} />
                <span>{w.label}</span>
              </label>);
          })}
        </div>
      </fieldset>}
      <label className="pf-field pf-wide"><span>{f.message} <small>{f.optional}</small></span>
        <textarea name="message" maxLength={1500} rows={4} placeholder={f.messagePh} /></label>
      {/* Falle für Bots: für Menschen unsichtbar, nicht per Tab erreichbar */}
      <div className="pf-hp" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="pf-consent">
        <input type="checkbox" name="consent" value="yes" required />
        <span>{T.consent} <a href={privacyHref}>{f.privacy}</a></span>
      </label>
      {err && <p className="pf-err" role="alert">{err}</p>}
      <div className="pf-go">
        <button className="btn gold big" type="submit" disabled={state === "busy"}>
          {state === "busy" ? f.sending : f.send} <span className="ar">→</span></button>
        <span className="pf-fine">{f.fine}</span>
      </div>
    </form>
  );
}
