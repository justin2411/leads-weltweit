"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/app/icons";

/**
 * Probe-Formular (Inhaber 28.09.2026): kurz, eine Seite, höchstens 5 Felder – Firma, E-Mail, welche Leads
 * (bis zu 3 Signale), optional ein Satz, Einwilligung. Sendet per JavaScript (Erfolg direkt auf der Seite),
 * ohne JavaScript als normales Formular an /api/sample-request (Weiterleitung mit ?angefragt=1).
 * Klassen mit Präfix pf- (die Marken-CSS ist global, siehe docs/DESIGN.md).
 */
export type FormOption = { value: string; label: string; wishes: { key: string; label: string }[] };
/** Startseite (Inhaber 03.10.2026): Branche und Lieferland getrennt. pages: Land -> Seiten-Slug dieser Branche. */
export type IndustryOption = FormOption & { pages: Record<string, string> };
type Lang = "en" | "fr" | "de";

const TX: Record<Lang, Record<string, string>> = {
  en: {
    company: "Company name", email: "Business email", which: "Which leads do you need?", upTo: "choose up to 3",
    extra: "Anything specific?", optional: "optional", extraPh: "e.g. hospitality, 10+ staff",
    industry: "Your industry and country", ind: "Your industry", cty: "Delivery country", choose: "Please choose", privacy: "Privacy policy",
    send: "Send me 10 free leads", sending: "Sending…", fine1: "Free", fine2: "No obligation",
    done: "Done. Your 10 leads are being prepared, we'll email them to", doneShort: "Done. Your 10 leads are being prepared.",
    e_company: "Please enter your company name.", e_email: "Please enter a valid email address.",
    e_consent: "Please tick the consent box.", e_server: "Something went wrong. Please try again in a minute.",
    e_page: "Please choose your industry.", e_country: "Please choose the delivery country.",
  },
  fr: {
    company: "Nom de l'entreprise", email: "E-mail professionnel", which: "Quelles pistes vous intéressent ?", upTo: "3 au choix",
    extra: "Une précision ?", optional: "facultatif", extraPh: "ex. restauration, 10+ salariés",
    industry: "Votre secteur et pays", ind: "Votre secteur", cty: "Pays de livraison", choose: "Veuillez choisir", privacy: "Confidentialité",
    send: "Recevoir 10 pistes gratuites", sending: "Envoi…", fine1: "Gratuit", fine2: "Sans engagement",
    done: "C'est fait. Vos 10 pistes sont en préparation, nous les envoyons à", doneShort: "C'est fait. Vos 10 pistes sont en préparation.",
    e_company: "Merci d'indiquer le nom de votre entreprise.", e_email: "Merci d'indiquer une adresse e-mail valide.",
    e_consent: "Merci de cocher la case de consentement.", e_server: "Une erreur s'est produite. Merci de réessayer dans une minute.",
    e_page: "Merci de choisir votre secteur.", e_country: "Merci de choisir le pays de livraison.",
  },
  de: {
    company: "Firmenname", email: "Geschäftliche E-Mail", which: "Welche Leads brauchen Sie?", upTo: "bis zu 3",
    extra: "Etwas Bestimmtes?", optional: "optional", extraPh: "z. B. Gastronomie, ab 10 Personen",
    industry: "Ihre Branche und Land", ind: "Ihre Branche", cty: "Lieferland", choose: "Bitte wählen", privacy: "Datenschutz",
    send: "10 kostenlose Leads anfordern", sending: "Wird gesendet…", fine1: "Kostenlos", fine2: "Unverbindlich",
    done: "Erledigt. Ihre 10 Leads werden vorbereitet, wir schicken sie an", doneShort: "Erledigt. Ihre 10 Leads werden vorbereitet.",
    e_company: "Bitte den Firmennamen angeben.", e_email: "Bitte eine gültige E-Mail-Adresse angeben.",
    e_consent: "Bitte die Einwilligung ankreuzen.", e_server: "Etwas ist schiefgelaufen. Bitte in einer Minute erneut versuchen.",
    e_page: "Bitte die Branche wählen.", e_country: "Bitte das Lieferland wählen.",
  },
};

export function SampleForm({ lang, options, field, consent, privacyHref, hidden = {}, company = "", email = "", id, industries, countries, defCountry = "" }: {
  lang: Lang;
  /** eine Option = feste Seite (kein Auswahlfeld); mehrere = Auswahl Branche/Land (Startseite) */
  options: FormOption[];
  /** Name des Felds für die Seite: variant_id (Landingpage) oder slug (Startseite) */
  field: "variant_id" | "slug";
  consent: string; privacyHref: string;
  hidden?: Record<string, string>;
  company?: string; email?: string; id?: string;
  /** Startseite: Branche und Lieferland als zwei Auswahlfelder (statt options) */
  industries?: IndustryOption[]; countries?: { code: string; label: string }[]; defCountry?: string;
}) {
  const T = TX[lang];
  const [page, setPage] = useState(options.length === 1 ? options[0].value : "");
  const [picked, setPicked] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [cc, setCc] = useState(defCountry);
  const split = !!industries?.length && !!countries?.length;
  const ind = industries?.find((o) => o.value === page);
  // Seite der Branche im gewählten Land, sonst irgendeine Seite der Branche (Land geht extra mit)
  const slug = ind ? (ind.pages[cc] ?? Object.values(ind.pages)[0] ?? "") : "";
  const opt = split ? ind : options.find((o) => o.value === page);
  const wishes = opt?.wishes ?? [];

  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= 3 ? p : [...p, k]));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const mail = String(fd.get("email") ?? "").trim();
    if (!page) return setErr(T.e_page);
    if (split && !cc) return setErr(T.e_country);
    if (String(fd.get("company") ?? "").trim().length < 2) return setErr(T.e_company);
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(mail)) return setErr(T.e_email);
    if (!fd.get("consent")) return setErr(T.e_consent);
    setErr(""); setState("busy");
    try {
      const r = await fetch("/api/sample-request", { method: "POST", body: fd, headers: { Accept: "application/json" }, credentials: "same-origin" });
      const j = await r.json().catch(() => ({ ok: false, error: "server" }));
      if (j.ok) { setSentTo(mail); setState("done"); return; }
      setErr(T[`e_${j.error}`] ?? T.e_server); setState("idle");
    } catch {
      setErr(T.e_server); setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="pf pf-done" id={id} role="status" aria-live="polite">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>
        <p>{sentTo ? <>{T.done} <b>{sentTo}</b>.</> : T.doneShort}</p>
      </div>
    );
  }

  return (
    <form className="pf" id={id} method="post" action="/api/sample-request" onSubmit={submit} noValidate>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="lang" value={lang} />
      {split ? <>
        <input type="hidden" name="slug" value={slug} />
        <div className="pf-row">
          <label className="pf-field"><span>{T.ind}</span>
            <select value={page} required onChange={(e) => { setPage(e.target.value); setPicked([]); }}>
              <option value="" disabled>{T.choose}</option>
              {industries!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="pf-field"><span>{T.cty}</span>
            <select name="country" value={cc} required onChange={(e) => setCc(e.target.value)}>
              <option value="" disabled>{T.choose}</option>
              {countries!.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </label>
        </div>
      </> : options.length === 1 ? <input type="hidden" name={field} value={options[0].value} /> : (
        <label className="pf-field pf-wide"><span>{T.industry}</span>
          <select name={field} value={page} required onChange={(e) => { setPage(e.target.value); setPicked([]); }}>
            <option value="" disabled>{T.choose}</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}
      <div className="pf-row">
        <label className="pf-field"><span>{T.company}</span>
          <input name="company" defaultValue={company} required minLength={2} maxLength={200} autoComplete="organization" /></label>
        <label className="pf-field"><span>{T.email}</span>
          <input name="email" type="email" defaultValue={email} required maxLength={200} autoComplete="email" inputMode="email" /></label>
      </div>
      {wishes.length > 0 && <fieldset className="pf-set">
        <legend>{T.which} <small>{T.upTo}</small></legend>
        <div className="pf-chips">
          {wishes.map((w) => {
            const on = picked.includes(w.key);
            return (
              <label key={w.key} className={`pf-chip${on ? " pf-on" : ""}${!on && picked.length >= 3 ? " pf-off" : ""}`}>
                <input type="checkbox" name="signals" value={w.key} checked={on} onChange={() => toggle(w.key)}
                  disabled={!on && picked.length >= 3} />
                <span>{w.label}</span>
              </label>);
          })}
        </div>
      </fieldset>}
      <label className="pf-field pf-wide"><span>{T.extra} <small>{T.optional}</small></span>
        <input name="text" maxLength={200} placeholder={T.extraPh} /></label>
      {/* Falle für Bots: für Menschen unsichtbar, nicht per Tab erreichbar */}
      <div className="pf-hp" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="pf-consent">
        <input type="checkbox" name="consent" value="yes" required />
        <span>{consent} <a href={privacyHref}>{T.privacy}</a></span>
      </label>
      {err && <p className="pf-err" role="alert">{err}</p>}
      <div className="pf-go">
        <button className="btn gold big" type="submit" data-cta disabled={state === "busy"}>
          {state === "busy" ? T.sending : T.send} <span className="ar"><Icon name="pfeil" size={18} /></span></button>
        <span className="pf-fine">{T.fine1} · {T.fine2}</span>
      </div>
    </form>
  );
}
