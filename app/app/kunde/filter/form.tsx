import { saveFilters } from "./actions";

const TXT = {
  en: {
    title: "Tell us which leads you want", sub: "Two minutes now, better leads every Monday. You can change this at any time.",
    signals: "Which signals matter to you?", signalsHint: "Leave all ticked if you want everything that fits your business.",
    sig: {
      job_open_30d: ["Roles open 30+ days", "The internal search has stalled – the classic moment for a recruiter."],
      jobs_3plus: ["3+ roles at once", "Growing teams that need help hiring fast."],
      new_incorporation: ["Newly registered companies", "New owners choosing their first providers."],
      outdated_website: ["Outdated or missing website", "Companies that need to modernise."],
    } as Record<string, [string, string]>,
    industries: "Industries or job types to focus on", industriesPh: "e.g. construction, logistics, finance roles",
    regions: "Specific regions", regionsPh: "Empty = whole country, or e.g. London",
    exclusions: "Companies or keywords to leave out", exclusionsPh: "e.g. your existing clients",
    optional: "optional", save: "Save my preferences", saved: "Saved. Your next delivery will follow these preferences.",
  },
  fr: {
    title: "Dites-nous quelles pistes vous voulez", sub: "Deux minutes maintenant, de meilleures pistes chaque lundi. Modifiable à tout moment.",
    signals: "Quels signaux vous intéressent ?", signalsHint: "Laissez tout coché si vous voulez tout ce qui correspond à votre activité.",
    sig: {
      job_open_30d: ["Postes ouverts depuis 30+ jours", "La recherche interne piétine – le bon moment pour un cabinet."],
      jobs_3plus: ["3+ postes en même temps", "Des équipes en croissance qui doivent recruter vite."],
      new_incorporation: ["Entreprises nouvellement créées", "De nouveaux dirigeants qui choisissent leurs prestataires."],
      outdated_website: ["Site web ancien ou absent", "Des entreprises qui doivent se moderniser."],
    } as Record<string, [string, string]>,
    industries: "Secteurs ou métiers à privilégier", industriesPh: "ex. BTP, logistique, finance",
    regions: "Régions précises", regionsPh: "Vide = tout le pays, ou ex. Paris",
    exclusions: "Entreprises ou mots-clés à exclure", exclusionsPh: "ex. vos clients actuels",
    optional: "facultatif", save: "Enregistrer mes préférences", saved: "Enregistré. Votre prochaine livraison suivra ces préférences.",
  },
};

export const FORM_CSS = `
.bx .ff{margin-top:28px;max-width:1080px;border:1px solid var(--line);border-radius:22px;background:var(--card);padding:30px 32px 32px;scroll-margin-top:90px}
.bx .ff h2{margin:0;font-size:clamp(22px,2.4vw,28px);letter-spacing:-.02em;line-height:1.2}
.bx .ff .sub{margin:8px 0 0;color:var(--soft);font-size:15.5px}
.bx .ff form{display:grid;gap:22px;margin-top:24px}
.bx .ff .lb{display:block;font-weight:700;font-size:15px;margin-bottom:4px}.bx .ff .lb em{font-style:normal;font-weight:500;color:var(--soft);font-size:13px;margin-left:6px}
.bx .ff .hint{color:var(--soft);font-size:13.5px;margin:0 0 10px}
.bx .ff .sg{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.bx .ff .sg label{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:14px;padding:14px 16px;cursor:pointer;transition:border-color .2s,background .2s}
.bx .ff .sg label:has(input:checked){border-color:rgba(176,141,87,.7);background:rgba(216,189,138,.08)}
.bx .ff .sg input{accent-color:#b08d57;width:18px;height:18px;margin-top:2px;flex:none}
.bx .ff .sg b{display:block;font-size:15px}.bx .ff .sg span{display:block;color:var(--soft);font-size:13.5px;margin-top:2px}
.bx .ff .row{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.bx .ff input[type=text]{width:100%;box-sizing:border-box;font:inherit;font-size:15px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;color:inherit}
.bx .ff input[type=text]:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(176,141,87,.15)}
.bx .ff .ok{border-radius:12px;background:rgba(91,212,154,.12);color:#2f6b45;padding:12px 16px;font-weight:600;font-size:14.5px;margin-top:18px}
.bx .ff button{justify-self:start}
@media (max-width:760px){.bx .ff{padding:24px 20px}.bx .ff .sg,.bx .ff .row{grid-template-columns:1fr}}
`;

type F = { regions?: string[]; signals?: string[]; industries?: string[]; exclusions?: string[] } | null;

/** Wunschprofil als Formular (eingebettet auf der Danke-Seite und unter /kunde/filter). */
export function FilterForm({ token, f, back, lang, saved }: { token: string; f: F; back: string; lang: "en" | "fr"; saved?: boolean }) {
  const T = TXT[lang];
  const chosen = f?.signals?.length ? f.signals : Object.keys(T.sig);
  return (
    <section className="ff" id="focus">
      <h2>{T.title}</h2>
      <p className="sub">{T.sub}</p>
      {saved && <div className="ok">✓ {T.saved}</div>}
      <form action={saveFilters}>
        <input type="hidden" name="t" value={token} />
        <input type="hidden" name="back" value={back} />
        <div>
          <span className="lb">{T.signals}</span>
          <p className="hint">{T.signalsHint}</p>
          <div className="sg">{Object.entries(T.sig).map(([k, [h, d]]) => (
            <label key={k}><input type="checkbox" name="signals" value={k} defaultChecked={chosen.includes(k)} /><div><b>{h}</b><span>{d}</span></div></label>
          ))}</div>
        </div>
        <div className="row">
          <label><span className="lb">{T.industries}<em>{T.optional}</em></span>
            <input type="text" name="industries" placeholder={T.industriesPh} defaultValue={(f?.industries ?? []).join(", ")} /></label>
          <label><span className="lb">{T.regions}<em>{T.optional}</em></span>
            <input type="text" name="regions" placeholder={T.regionsPh} defaultValue={(f?.regions ?? []).join(", ")} /></label>
        </div>
        <label><span className="lb">{T.exclusions}<em>{T.optional}</em></span>
          <input type="text" name="exclusions" placeholder={T.exclusionsPh} defaultValue={(f?.exclusions ?? []).join(", ")} /></label>
        <button className="btn gold big" type="submit">{T.save} <span className="ar">→</span></button>
      </form>
    </section>
  );
}
