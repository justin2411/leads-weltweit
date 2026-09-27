import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSettings, isOwner, loadPage, pageIsPublic } from "@/lib/pages";
import { BRAND, CONTACT } from "@/lib/site";
import { checkoutMode, lineItemFor, priceLabel, stripeEnabled, type Plan } from "@/lib/stripe";
import { personalFor } from "@/lib/recipient";
import { pickVariant } from "@/lib/variants";
import { BrandShell, SiteFooter, SiteHeader } from "../../../chrome";

export const dynamic = "force-dynamic";
// Verkaufsseite aus dem PDF-Report: nicht in Suchmaschinen, nicht in der Navigation
export const metadata: Metadata = { title: `Start | ${BRAND}`, robots: { index: false, follow: false } };

type Params = Promise<{ country: string; segment: string }>;
type Search = Promise<{ vorschau?: string; v?: string; r?: string }>;

const TXT = {
  en: {
    eyebrow: "Weekly trigger leads", title: "Start your weekly leads",
    lede: "Every Monday a fresh briefing: companies with a real reason to buy your service right now, each with phone, email, contact person and a short sales briefing.",
    for: "For", per: "per month", pick: "Start with", popular: "Recommended",
    plan: {
      starter: ["Up to 30 new leads per week", "Weekly PDF briefing and spreadsheet", "Phone, email and contact person", "Every lead exclusive to your firm"],
      pro: ["Up to 100 new leads per week", "All signals that fit your business", "Weekly PDF briefing and spreadsheet", "Every lead exclusive to your firm"],
    } as Record<string, string[]>,
    how: "How it works",
    steps: [["Choose your plan", "Pick the number of leads that fits your team and pay securely by card via Stripe."],
            ["Set your focus", "Right after payment you get a short form by email. Choose the signals and the kind of companies you want, it takes two minutes."],
            ["Leads every Monday", "From the following Monday a fresh PDF briefing and spreadsheet land in your inbox. Each lead goes to one firm in your field only."]],
    stepsMail: [["Choose your plan", "Pick the number of leads that fits your team and send us a short email. We reply with your invoice."],
            ["Set your focus", "With the invoice you get a short form. Choose the signals and the kind of companies you want, it takes two minutes."],
            ["Leads every Monday", "From the following Monday a fresh PDF briefing and spreadsheet land in your inbox. Each lead goes to one firm in your field only."]],
    mail: "Start by email", mailNote: "Online payment opens shortly. Until then we start your subscription by email and send an invoice.",
    perLead: "From about {p} per lead", perLeadC: "The more leads, the lower the price per lead",
    subject: "Start", q: "Questions? Just reply to our email or write to",
    custom: "Custom", customP: "Your number", customL: ["Tell us how many leads you need per week", "An offer that fits your team", "Same quality and exclusivity"],
    customBtn: "Ask for an offer", customSubject: "Custom offer",
  },
  fr: {
    eyebrow: "Pistes chaque semaine", title: "Recevez vos pistes chaque semaine",
    lede: "Chaque lundi un nouveau briefing : des entreprises qui ont en ce moment une vraie raison d'acheter votre service, avec téléphone, e-mail, interlocuteur et un court briefing commercial.",
    for: "Pour", per: "par mois", pick: "Choisir", popular: "Recommandé",
    plan: {
      starter: ["Jusqu'à 30 nouvelles pistes par semaine", "Briefing PDF et tableau chaque semaine", "Téléphone, e-mail et interlocuteur", "Chaque piste réservée à votre entreprise"],
      pro: ["Jusqu'à 100 nouvelles pistes par semaine", "Tous les signaux utiles", "Briefing PDF et tableau chaque semaine", "Chaque piste réservée à votre entreprise"],
    } as Record<string, string[]>,
    how: "Comment ça marche",
    steps: [["Choisissez votre formule", "Choisissez le nombre de pistes adapté à votre équipe et payez par carte en toute sécurité via Stripe."],
            ["Définissez votre cible", "Juste après le paiement, vous recevez un court formulaire par e-mail. Choisissez les signaux et le type d'entreprises souhaités, en deux minutes."],
            ["Des pistes chaque lundi", "Dès le lundi suivant, un nouveau briefing PDF et un tableau arrivent dans votre boîte. Chaque piste va à une seule entreprise de votre secteur."]],
    stepsMail: [["Choisissez votre formule", "Choisissez le nombre de pistes adapté à votre équipe et envoyez-nous un court e-mail. Nous répondons avec votre facture."],
            ["Définissez votre cible", "Avec la facture, vous recevez un court formulaire. Choisissez les signaux et le type d'entreprises souhaités, en deux minutes."],
            ["Des pistes chaque lundi", "Dès le lundi suivant, un nouveau briefing PDF et un tableau arrivent dans votre boîte. Chaque piste va à une seule entreprise de votre secteur."]],
    mail: "Démarrer par e-mail", mailNote: "Le paiement en ligne ouvre bientôt. D'ici là, nous démarrons votre abonnement par e-mail et envoyons une facture.",
    perLead: "À partir d'environ {p} par piste", perLeadC: "Plus de pistes, prix unitaire plus bas",
    subject: "Démarrer", q: "Des questions ? Répondez simplement à notre e-mail ou écrivez à",
    custom: "Sur mesure", customP: "Votre volume", customL: ["Indiquez combien de pistes il vous faut par semaine", "Une offre adaptée à votre équipe", "Même qualité et même exclusivité"],
    customBtn: "Demander une offre", customSubject: "Offre sur mesure",
  },
};

const PER_WEEK: Record<string, number> = { starter: 30, pro: 100 };
function perLead(p: Plan): string | null {
  const n = PER_WEEK[p.key];
  if (!n || !p.amount_cents) return null;
  const cur = (p.currency ?? "eur").toUpperCase();
  return new Intl.NumberFormat(cur === "EUR" ? "de-DE" : "en-GB", { style: "currency", currency: cur, minimumFractionDigits: 2 })
    .format(p.amount_cents / 100 / (n * 52 / 12));
}

const CSS = `
.bx .start{padding:72px 0 88px}
.bx .start .eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);font-weight:700}
.bx .start h1{font-size:clamp(32px,4.4vw,52px);letter-spacing:-.03em;line-height:1.05;margin:14px 0 16px}
.bx .start .lede{max-width:640px;color:var(--soft);font-size:18px;margin:0}
.bx .start .for{display:inline-block;margin-top:18px;font-size:13px;color:var(--gold);border:1px solid rgba(176,141,87,.45);padding:6px 14px;border-radius:99px}
.bx .plans2{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;margin-top:44px;max-width:1080px}
.bx .plan2.cu{border-style:dashed}.bx .plan2.cu .price{font-size:30px;padding:8px 0}
.bx .plan2{position:relative;border:1px solid var(--line);border-radius:22px;padding:30px 30px 26px;background:var(--card);display:flex;flex-direction:column;gap:14px}
.bx .plan2.hi{border:1.5px solid var(--gold);box-shadow:0 30px 70px -44px rgba(176,141,87,.7)}
.bx .plan2 .tag{position:absolute;top:-12px;right:24px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;background:linear-gradient(135deg,#e2c894,#b08d57);color:#141008;padding:5px 12px;border-radius:99px}
.bx .plan2 h2{margin:0;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--soft)}
.bx .plan2 .price{font-size:44px;font-weight:800;letter-spacing:-.02em}.bx .plan2 .price small{font-size:15px;font-weight:600;color:var(--soft);margin-left:6px}
.bx .plan2 ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}.bx .plan2 li{font-size:15.5px;display:flex;gap:10px}.bx .plan2 li:before{content:"✓";color:var(--gold);font-weight:800;flex:none}
.bx .plan2 .pl{font-size:13.5px;font-weight:700;color:#8a6a33;padding-top:12px;border-top:1px solid var(--line)}
.bx .plan2 form,.bx .plan2 .go{margin-top:auto}.bx .plan2 .btn{width:100%;justify-content:center}
.bx .how{margin-top:64px;max-width:1080px}
.bx .how h2{margin:0 0 22px;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}
.bx .steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:22px;counter-reset:st}
.bx .steps li{position:relative;border-top:1px solid var(--line);padding:22px 0 0 58px}
.bx .steps li:before{counter-increment:st;content:counter(st);position:absolute;left:0;top:18px;width:40px;height:40px;border-radius:50%;border:1.5px solid var(--gold);color:var(--gold);font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center}
.bx .steps b{display:block;font-size:16.5px;margin-bottom:6px}.bx .steps p{margin:0;color:var(--soft);font-size:14.5px;line-height:1.55}
.bx .start .note{margin-top:28px;max-width:920px;color:var(--soft);font-size:14.5px}
`;

export default async function StartPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { country, segment } = await params;
  const sp = await searchParams;
  const slug = `${country}/${segment}`.toLowerCase();
  if (!/^[a-z]{2}\/[a-z0-9-]+$/.test(slug)) notFound();
  const [data, settings] = await Promise.all([loadPage(slug), getSettings()]);
  if (!data) notFound();
  const isPublic = pageIsPublic(data.page, settings);
  const preview = !isPublic && sp.vorschau === "1" && (await isOwner());
  if (!isPublic && !preview) notFound();
  const variants = data.variants.filter((v: any) => (preview ? v.status !== "retired" : v.status === "live"));
  const v: any = (preview && sp.v && variants.find((x: any) => x.variant_key === sp.v)) || pickVariant(variants);
  if (!v) notFound();

  const page = data.page;
  const lang = page.language === "fr" ? "fr" : "en";
  const T = TXT[lang];
  const plans = ((v.pricing ?? settings.pricing ?? []) as Plan[]).filter((p) => p.amount_cents || p.price_label);
  if (!plans.length) notFound();
  const mode = checkoutMode({ vercelEnv: process.env.VERCEL_ENV, ownerPreview: preview });
  const online = stripeEnabled(mode);
  const who = await personalFor(sp.r, page);

  return (
    <BrandShell lang={lang} extraCss={CSS}>
      <SiteHeader />
      <main className="start"><div className="wrap">
        <div className="eyebrow">{T.eyebrow}</div>
        <h1>{T.title}</h1>
        <p className="lede">{T.lede}</p>
        {who?.firma && <div className="for">{T.for} {who.firma}</div>}

        <div className="plans2">{plans.map((p, k) => {
          const hi = k === plans.length - 1 && plans.length > 1;
          const mail = `mailto:${CONTACT}?subject=${encodeURIComponent(`${T.subject} ${p.name} – ${slug}${who?.firma ? ` – ${who.firma}` : ""}`)}`;
          return (
            <section className={`plan2${hi ? " hi" : ""}`} key={p.key}>
              {hi && <span className="tag">{T.popular}</span>}
              <h2>{p.name}</h2>
              <div className="price">{priceLabel(p)}<small>{T.per}</small></div>
              <ul>{(T.plan[p.key] ?? (p.description ? [p.description] : [])).map((x) => <li key={x}>{x}</li>)}</ul>
              {perLead(p) && <div className="pl">{T.perLead.replace("{p}", perLead(p)!)}</div>}
              {online && lineItemFor(p, mode, BRAND) ? (
                <form method="post" action="/api/checkout">
                  <input type="hidden" name="variant_id" value={v.id} />
                  <input type="hidden" name="package" value={p.key} />
                  {preview && <input type="hidden" name="vorschau" value="1" />}
                  <button className={`btn ${hi ? "gold" : "line"} big`} type="submit">{T.pick} {p.name} <span className="ar">→</span></button>
                </form>
              ) : (
                <div className="go"><a className={`btn ${hi ? "gold" : "line"} big`} href={mail}>{T.mail}: {p.name} <span className="ar">→</span></a></div>
              )}
            </section>);
        })}
          <section className="plan2 cu">
            <h2>{T.custom}</h2>
            <div className="price">{T.customP}</div>
            <ul>{T.customL.map((x) => <li key={x}>{x}</li>)}</ul>
            <div className="pl">{T.perLeadC}</div>
            <div className="go"><a className="btn line big" href={`mailto:${CONTACT}?subject=${encodeURIComponent(`${T.customSubject} – ${slug}${who?.firma ? ` – ${who.firma}` : ""}`)}&body=${encodeURIComponent(lang === "fr" ? "Nombre de pistes par semaine : " : "Leads per week: ")}`}>{T.customBtn} <span className="ar">→</span></a></div>
          </section>
        </div>

        {!online && <p className="note">{T.mailNote}</p>}
        <section className="how"><h2>{T.how}</h2>
          <ol className="steps">{(online ? T.steps : T.stepsMail).map(([h, d]) => <li key={h}><b>{h}</b><p>{d}</p></li>)}</ol>
        </section>
        <p className="note">{T.q} <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </div></main>
      <SiteFooter lang={lang} />
    </BrandShell>
  );
}
