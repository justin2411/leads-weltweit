import { LEGAL } from "@/content/legal";
import { LEGAL_I18N, LEGAL_PATHS, TRANSLATION_NOTE, type LegalKey, type LegalLang } from "@/content/legal-i18n";
import { BrandShell, PageHead, SiteFooter, SiteHeader } from "./chrome";

/** Rechtstext in Deutsch (maßgeblich) oder als Übersetzung (en/fr) mit Hinweis. */
export function LegalPage({ doc, lang = "de" }: { doc: LegalKey; lang?: "de" | LegalLang }) {
  const d = lang === "de" ? LEGAL[doc] : LEGAL_I18N[lang][doc];
  const langs: [string, string, boolean][] = (["de", "en", "fr"] as const).map((l) => [l.toUpperCase(), LEGAL_PATHS[l][doc], l === lang]);
  const cta: [string, string] = lang === "fr" ? ["/fr#sample", "Échantillon gratuit"] : lang === "de" ? ["/de#sample", "Kostenlose Probe"] : ["/#sample", "Free sample"];
  return (
    <BrandShell lang={lang} css="brand">
      <SiteHeader cta={cta} langs={langs} />
      <PageHead eyebrow="" title={d.title} />
      <div className="wrap" style={{ paddingBottom: 96 }}>
        <article className="doc">
          {lang !== "de" && <p className="note" style={{ fontStyle: "italic" }}>{TRANSLATION_NOTE[lang]}</p>}
          {d.placeholder && (
            <p className="warn">PLATZHALTER, NOCH NICHT VERÖFFENTLICHEN. Solange dieser Text ein Platzhalter ist, bleiben alle Landingpages offline.</p>
          )}
          {d.body.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
        </article>
      </div>
      <SiteFooter lang={lang} />
    </BrandShell>
  );
}
