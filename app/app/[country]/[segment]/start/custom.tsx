"use client";

import { useState } from "react";
import { CUSTOM_MAX, CUSTOM_MIN, customCents, fromSlider, perMonth, toSlider } from "@/lib/custom-price";
import { Icon } from "@/app/icons";
import { agentEligible } from "@/lib/customer-agents";
import { PlanAgentLine } from "../plan-agent";

// Schnellwahl unter dem Regler (Inhaber 02.10.2026: Regler „könnte von der Nutzung besser sein“)
const PRESETS = [250, 500, 1000, 2500];

type Props = {
  base: { key: string; amount_cents?: number; currency?: string };
  variantId: string; preview: boolean; r?: string; online: boolean; offerHref: string;
  T: { title: string; perWeek: string; perMonthL: string; perLeadL: string; per: string; pay: string; mail: string; more: string };
  lang: "en" | "fr";
};

/** Eigenes Volumen per Regler (150–10.000 Leads/Woche), Preis live; bezahlt wird mit dem auf dem Server neu berechneten Preis. */
export function CustomPlan({ base, variantId, preview, r, online, offerHref, T, lang }: Props) {
  const [weekly, setWeekly] = useState(500);
  const [typed, setTyped] = useState("500");
  const cur = (base.currency ?? "gbp").toUpperCase();
  const loc = lang === "fr" ? "fr-FR" : cur === "USD" ? "en-US" : cur === "EUR" ? "de-DE" : "en-GB";
  const money = (v: number, d = 0) => new Intl.NumberFormat(loc, { style: "currency", currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const num = (v: number) => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB").format(v);
  const cents = customCents(base, weekly);
  const set = (v: number) => { setWeekly(v); setTyped(String(v)); };
  const commit = () => {
    const v = Math.round(Number(typed));
    set(Number.isFinite(v) ? Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, v)) : weekly);
  };
  const pct = toSlider(weekly) / 10;
  // Füllung endet in der Mitte des Reglerknopfs (Knopf 26px): sonst läuft der Strich vor oder nach
  const fill = `calc(13px + (100% - 26px) * ${pct / 100})`;

  return (
    <section className="plan2 cu">
      <h2>{T.title}</h2>
      <div className="price"><span className="amt">{money(cents / 100)}</span><small>{T.per}</small></div>
      <div className="qty">
        <label className="qn"><input type="number" inputMode="numeric" min={CUSTOM_MIN} max={CUSTOM_MAX} value={typed}
          onChange={(e) => setTyped(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
          aria-label={T.perWeek} /><span>{T.perWeek}</span></label>
        <input className="rg" type="range" min={0} max={1000} step={1} value={toSlider(weekly)} aria-label={T.perWeek}
          style={{ background: `linear-gradient(90deg,#b08d57 ${fill},var(--line) ${fill})` }}
          onChange={(e) => set(fromSlider(Number(e.target.value)))} />
        <div className="rgl"><span>{num(CUSTOM_MIN)}</span><span>{num(CUSTOM_MAX)}</span></div>
        <div className="chips" role="group" aria-label={T.perWeek}>
          {PRESETS.map((v) => (
            <button type="button" key={v} className={v === weekly ? "on" : ""} onClick={() => set(v)}>{num(v)}</button>
          ))}
        </div>
      </div>
      <ul>
        <li>{T.perMonthL.replace("{n}", num(perMonth(weekly)))}</li>
        <li>{T.perLeadL.replace("{p}", money(cents / 100 / perMonth(weekly), 2))}</li>
        {agentEligible("custom", weekly) && <PlanAgentLine lang={lang} />}
      </ul>
      {online ? (
        <form method="post" action="/api/checkout" className="go">
          <input type="hidden" name="variant_id" value={variantId} />
          <input type="hidden" name="package" value="custom" />
          <input type="hidden" name="weekly" value={weekly} />
          {preview && <input type="hidden" name="vorschau" value="1" />}
          {r && <input type="hidden" name="r" value={r} />}
          <button className="btn gold big" type="submit">{T.pay.replace("{n}", num(weekly))} <span className="ar"><Icon name="pfeil" size={18} /></span></button>
        </form>
      ) : (
        <div className="go"><a className="btn line big" href={offerHref}>{T.mail} <span className="ar"><Icon name="pfeil" size={18} /></span></a></div>
      )}
      <a className="more" href={offerHref}>{T.more}</a>
    </section>
  );
}
