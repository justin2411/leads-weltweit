import { BrandShell, PageHead, SiteFooter, SiteHeader } from "../chrome";

export const metadata = { robots: { index: false, follow: false } };

export default function Danke() {
  return (
    <BrandShell lang="en">
      <SiteHeader />
      <PageHead eyebrow="Subscription confirmed" title="Thank you" />
      <div className="wrap" style={{ paddingBottom: 96 }}>
        <article className="doc">
          <p>Your subscription is set up. You will receive a welcome email with a short form to choose your areas and signals.</p>
          <p style={{ color: "var(--soft)" }}>Merci ! Vous recevrez un e-mail de bienvenue avec un formulaire pour choisir vos zones et signaux.</p>
        </article>
      </div>
      <SiteFooter />
    </BrandShell>
  );
}
