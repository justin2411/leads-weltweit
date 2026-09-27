import { LEGAL } from "@/content/legal";
import { BrandShell, PageHead, SiteFooter, SiteHeader } from "./chrome";

export function LegalPage({ doc }: { doc: keyof typeof LEGAL }) {
  const d = LEGAL[doc];
  return (
    <BrandShell lang="de">
      <SiteHeader cta={["/#sample", "Free sample"]} />
      <PageHead eyebrow="NextGen Profit" title={d.title} />
      <div className="wrap" style={{ paddingBottom: 96 }}>
        <article className="doc">
          {d.placeholder && (
            <p className="warn">PLATZHALTER, NOCH NICHT VERÖFFENTLICHEN. Solange dieser Text ein Platzhalter ist, bleiben alle Landingpages offline.</p>
          )}
          {d.body.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
        </article>
      </div>
      <SiteFooter labels={["Impressum", "Datenschutz", "AGB"]} />
    </BrandShell>
  );
}
