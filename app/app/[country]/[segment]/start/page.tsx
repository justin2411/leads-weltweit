import { billingOptions, isoOf } from "@/lib/billing";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSettings, isOwner, loadPage, pageIsPublic } from "@/lib/pages";
import { BRAND, CONTACT } from "@/lib/site";
import { checkoutMode, lineItemFor, moneyLocale, priceLabel, stripeEnabled, type Plan } from "@/lib/stripe";
import { personalFor } from "@/lib/recipient";
import { pickVariant } from "@/lib/variants";
import { BrandShell, SiteFooter, SiteHeader } from "../../../chrome";
import { basePlan, PER_WEEK } from "@/lib/custom-price";
import { CustomPlan } from "./custom";
import { Icon } from "@/app/icons";
import { CHECK_PATH, maskIcon } from "@/lib/brand-css";
import { agentEligible } from "@/lib/customer-agents";
import { PlanAgentLine } from "../plan-agent";
import { VisitBeacon } from "../tracker";

export const dynamic = "force-dynamic";
// Verkaufsseite aus dem PDF-Report: nicht in Suchmaschinen, nicht in der Navigation
export const metadata: Metadata = { title: `Start | ${BRAND}`, robots: { index: false, follow: false } };

type Params = Promise<{ country: string; segment: string }>;
type Search = Promise<{ vorschau?: string; v?: string; r?: string }>;

const TXT = {
  en: {
    eyebrow: "Weekly trigger leads", title: "Start your weekly leads",
    lede: "Every Monday a fresh briefing: companies with a real reason to buy your service right now, each with phone, email, contact person and a short sales briefing.",
    for: "For", per: "per month", pick: "Start with", popular: "Recommended", billing: "Billing country",
    plan: {
      starter: ["Up to 15 new leads per week", "Weekly PDF briefing and spreadsheet", "Phone, email and contact person", "Every lead exclusive to your firm"],
      pro: ["Up to 40 new leads per week", "All signals that fit your business", "Weekly PDF briefing and spreadsheet", "Every lead exclusive to your firm"],
    } as Record<string, string[]>,
    how: "How it works",
    // Überschriften unter dem Video, einzeilig (Inhaber 02.10.2026)
    short: ["Choose your plan", "Set your focus", "Personal contact", "Leads every Monday"],
    steps: [["Choose your plan", "Pick the number of leads that fits your team and pay securely by card via Stripe."],
            ["Set your focus", "Right after payment you get a short form. Choose the signals and the kind of companies you want, it takes two minutes."],
            ["Personal contact", "You get your own contact person to talk through your leads at any time. Together you fine tune them so they keep working for you in the long run."],
            ["Leads every Monday", "From the following Monday a fresh PDF briefing and spreadsheet land in your inbox. Each lead goes to one firm in your field only."]],
    stepsMail: [["Choose your plan", "Pick the number of leads that fits your team and send us a short email. We reply with your invoice."],
            ["Set your focus", "With the invoice you get a short form. Choose the signals and the kind of companies you want, it takes two minutes."],
            ["Personal contact", "You get your own contact person to talk through your leads at any time. Together you fine tune them so they keep working for you in the long run."],
            ["Leads every Monday", "From the following Monday a fresh PDF briefing and spreadsheet land in your inbox. Each lead goes to one firm in your field only."]],
    mail: "Start by email", mailNote: "Online payment opens shortly. Until then we start your subscription by email and send an invoice.",
    perLead: "From about {p} per lead", perLeadC: "The more leads, the lower the price per lead",
    subject: "Start", q: "Questions? Just reply to our email or write to",
    custom: "Custom", customP: "Your number", customL: ["Tell us how many leads you need per week", "An offer that fits your team", "Same quality and exclusivity"],
    customBtn: "Ask for an offer",
    cu: { title: "Your volume", perWeek: "leads per week", perMonthL: "About {n} leads per month", perLeadL: "About {p} per lead",
          per: "per month", pay: "Start with {n}/week", mail: "Start by email", more: "Something special in mind? Ask for an offer" },
  },
  fr: {
    eyebrow: "Pistes chaque semaine", title: "Recevez vos pistes chaque semaine",
    lede: "Chaque lundi un nouveau briefing : des entreprises qui ont en ce moment une vraie raison d'acheter votre service, avec téléphone, e-mail, interlocuteur et un court briefing commercial.",
    for: "Pour", per: "par mois", pick: "Choisir", popular: "Recommandé", billing: "Pays de facturation",
    plan: {
      starter: ["Jusqu'à 15 nouvelles pistes par semaine", "Briefing PDF et tableau chaque semaine", "Téléphone, e-mail et interlocuteur", "Chaque piste réservée à votre entreprise"],
      pro: ["Jusqu'à 40 nouvelles pistes par semaine", "Tous les signaux utiles", "Briefing PDF et tableau chaque semaine", "Chaque piste réservée à votre entreprise"],
    } as Record<string, string[]>,
    how: "Comment ça marche",
    short: ["Votre formule", "Votre cible", "Votre contact", "Chaque lundi"],
    steps: [["Choisissez votre formule", "Choisissez le nombre de pistes adapté à votre équipe et payez par carte en toute sécurité via Stripe."],
            ["Définissez votre cible", "Juste après le paiement, vous recevez un court formulaire. Choisissez les signaux et le type d'entreprises souhaités, en deux minutes."],
            ["Votre interlocuteur dédié", "Vous avez votre propre interlocuteur pour parler de vos pistes à tout moment. Ensemble, vous les ajustez pour qu'elles fonctionnent pour vous sur la durée."],
            ["Des pistes chaque lundi", "Dès le lundi suivant, un nouveau briefing PDF et un tableau arrivent dans votre boîte. Chaque piste va à une seule entreprise de votre secteur."]],
    stepsMail: [["Choisissez votre formule", "Choisissez le nombre de pistes adapté à votre équipe et envoyez-nous un court e-mail. Nous répondons avec votre facture."],
            ["Définissez votre cible", "Avec la facture, vous recevez un court formulaire. Choisissez les signaux et le type d'entreprises souhaités, en deux minutes."],
            ["Votre interlocuteur dédié", "Vous avez votre propre interlocuteur pour parler de vos pistes à tout moment. Ensemble, vous les ajustez pour qu'elles fonctionnent pour vous sur la durée."],
            ["Des pistes chaque lundi", "Dès le lundi suivant, un nouveau briefing PDF et un tableau arrivent dans votre boîte. Chaque piste va à une seule entreprise de votre secteur."]],
    mail: "Démarrer par e-mail", mailNote: "Le paiement en ligne ouvre bientôt. D'ici là, nous démarrons votre abonnement par e-mail et envoyons une facture.",
    perLead: "À partir d'environ {p} par piste", perLeadC: "Plus de pistes, prix unitaire plus bas",
    subject: "Démarrer", q: "Des questions ? Répondez simplement à notre e-mail ou écrivez à",
    custom: "Sur mesure", customP: "Votre volume", customL: ["Indiquez combien de pistes il vous faut par semaine", "Une offre adaptée à votre équipe", "Même qualité et même exclusivité"],
    customBtn: "Demander une offre",
    cu: { title: "Votre volume", perWeek: "pistes par semaine", perMonthL: "Environ {n} pistes par mois", perLeadL: "Environ {p} par piste",
          per: "par mois", pay: "Démarrer · {n}/sem.", mail: "Démarrer par e-mail", more: "Un besoin particulier ? Demandez une offre" },
  },
};

const LAND: Record<string, [string, string]> = { uk: ["the UK", "Royaume-Uni"], us: ["the US", "États-Unis"], fr: ["France", "France"], ie: ["Ireland", "Irlande"], nl: ["the Netherlands", "Pays-Bas"] };

/** Vorbereitete Anfrage für ein individuelles Angebot: der Kunde füllt nur noch die Lücken aus. */
function offerMail(lang: "en" | "fr", country: string, segment: string, firma?: string): string {
  const land = (LAND[country] ?? [country.toUpperCase(), country.toUpperCase()])[lang === "fr" ? 1 : 0];
  const field = segment.replace(/-/g, " ");
  const subject = lang === "fr" ? `Demande d'offre sur mesure${firma ? ` – ${firma}` : ""}` : `Custom offer request${firma ? ` – ${firma}` : ""}`;
  const body = lang === "fr" ? [
    "Bonjour l'équipe NextGen Profit,", "",
    "Nous souhaitons recevoir une offre sur mesure pour des pistes hebdomadaires.", "",
    "— NOTRE ENTREPRISE —",
    `Entreprise : ${firma ?? ""}`, "Site web : ", "Interlocuteur : ", "Téléphone : ", "",
    "— NOTRE BESOIN —",
    "Nombre de pistes par semaine : ", `Pays / régions : ${land}`, `Notre activité : ${field}`,
    "Signaux les plus utiles (ex. postes ouverts depuis longtemps, nouvelles entreprises, croissance) : ",
    "Taille d'entreprise visée : ", "Démarrage souhaité : ", "",
    "Remarques : ", "",
    "Merci d'avance pour votre proposition.", "", "Cordialement,", "",
  ] : [
    "Hello NextGen Profit team,", "",
    "We would like a custom offer for weekly trigger leads.", "",
    "— ABOUT US —",
    `Company: ${firma ?? ""}`, "Website: ", "Contact person: ", "Phone: ", "",
    "— WHAT WE NEED —",
    "Leads per week: ", `Countries / regions: ${land}`, `Our field: ${field}`,
    "Most useful signals (e.g. roles open for weeks, new companies, fast growth): ",
    "Target company size: ", "Preferred start date: ", "",
    "Anything else we should know: ", "",
    "Thank you, we look forward to your offer.", "", "Kind regards,", "",
  ];
  return `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.join("\r\n"))}`;
}
function perLead(p: Plan, lang?: string): string | null {
  const n = PER_WEEK[p.key];
  if (!n || !p.amount_cents) return null;
  const cur = (p.currency ?? "eur").toUpperCase();
  return new Intl.NumberFormat(moneyLocale(cur, lang), { style: "currency", currency: cur, minimumFractionDigits: 2 })
    .format(p.amount_cents / 100 / (n * 52 / 12));
}

/** Erklärvideo „How it works“ je Land (zeigt Preise in der Landeswährung, darum nicht länderübergreifend). */
const HOW_VIDEO: Record<string, { src: string; poster: string; vtt?: string; srclang: string }> = {
  us: { src: "/video/howitworks-us.mp4", poster: "/video/howitworks-us.jpg", vtt: "/video/howitworks-us.vtt", srclang: "en" },
  uk: { src: "/video/howitworks-uk-v2.mp4", poster: "/video/howitworks-uk-v2.jpg", srclang: "en" },
  fr: { src: "/video/howitworks-fr.mp4", poster: "/video/howitworks-fr.jpg", srclang: "fr" },
};

const CSS = `
.bx .start{padding:72px 0 88px}
.bx .start .eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);font-weight:700}
.bx .start h1{font-size:clamp(32px,4.4vw,52px);letter-spacing:-.03em;line-height:1.05;margin:14px 0 16px}
.bx .start .lede{max-width:640px;color:var(--soft);font-size:18px;margin:0}
.bx .start .for{display:inline-block;margin-top:18px;font-size:13px;color:var(--gold);border:1px solid rgba(176,141,87,.45);padding:6px 14px;border-radius:99px}
.bx .plans2{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;margin-top:44px;max-width:1080px}
.bx .plan2.cu{border-style:dashed}
.bx .plan2 .qty{display:grid;gap:10px}
.bx .plan2 .qn{display:flex;align-items:baseline;gap:10px;font-size:14.5px;color:var(--soft)}
.bx .plan2 .qn input{width:110px;font:inherit;font-size:20px;font-weight:800;color:var(--ink,inherit);padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:transparent}
.bx .plan2 .qn input:focus{outline:none;border-color:var(--gold)}
.bx .plan2 .rg{-webkit-appearance:none;appearance:none;width:100%;height:8px;border-radius:99px;margin:10px 0 2px;cursor:pointer;touch-action:pan-y}
.bx .plan2 .rg:focus-visible{outline:2px solid var(--gold);outline-offset:6px}
.bx .plan2 .rg::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#fff;border:2px solid #b08d57;box-shadow:0 4px 12px -4px rgba(0,0,0,.35);cursor:grab}
.bx .plan2 .rg::-moz-range-thumb{box-sizing:border-box;width:26px;height:26px;border-radius:50%;background:#fff;border:2px solid #b08d57;cursor:grab}
.bx .plan2 .chips{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:2px}
.bx .plan2 .chips button{font:inherit;font-size:13px;font-weight:600;padding:7px 4px;border-radius:99px;border:1px solid var(--line);background:transparent;color:var(--soft);cursor:pointer;font-variant-numeric:tabular-nums}
.bx .plan2 .chips button:hover{border-color:var(--gold);color:inherit}
.bx .plan2 .chips button.on{background:linear-gradient(135deg,#e2c894,#b08d57);border-color:transparent;color:#141008}
.bx .plan2 .rgl{display:flex;justify-content:space-between;font-size:12px;color:var(--soft)}
.bx .plan2 .more{font-size:13px;color:var(--soft);text-align:center;text-decoration:underline;text-underline-offset:3px}
.bx .plan2{position:relative;border:1px solid var(--line);border-radius:22px;padding:30px 30px 26px;background:var(--card);display:flex;flex-direction:column;gap:14px}
.bx .plan2.hi{border:1.5px solid var(--gold);box-shadow:0 30px 70px -44px rgba(176,141,87,.7)}
.bx .plan2 .tag{position:absolute;top:-12px;right:24px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;background:linear-gradient(135deg,#e2c894,#b08d57);color:#141008;padding:5px 12px;border-radius:99px}
.bx .plan2 h2{margin:0;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--soft)}
.bx .plan2 .price{font-size:44px;font-weight:800;letter-spacing:-.02em;white-space:nowrap;font-variant-numeric:tabular-nums}
.bx .plan2.cu .price{font-size:clamp(30px,2.9vw,40px)}
.bx .plan2.cu .price .amt{display:inline-block;min-width:7.6ch}.bx .plan2 .price small{font-size:15px;font-weight:600;color:var(--soft);margin-left:6px}
.bx .plan2 ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}.bx .plan2 li{font-size:15.5px;display:flex;gap:10px}.bx .plan2 li:before{${maskIcon(CHECK_PATH, 2.8)};width:1em;height:1em;margin-top:.2em;color:var(--gold)}
.bx .plan2 li.agl:before{display:none}.bx .plan2 li.agl .ico{flex:none;margin-top:.2em;color:var(--gold)}.bx .plan2 li.agl b{font-weight:700}
/* Desktop: Ansprechpartner immer 3 Zeilen (Titel + 2 Zeilen über die volle Kartenbreite), Montags-Satz immer 2 Zeilen (Inhaber 04.10.2026) */
@media (min-width:900px){.bx .plan2 li.agl{display:block;container-type:inline-size}.bx .plan2 li.agl .ico{display:inline-block;vertical-align:-3px;margin:0 8px 0 0}.bx .plan2 li.agl b{white-space:nowrap;font-size:min(1em,calc((100cqi - 30px) / (var(--nt) * .6)))}.bx .plan2 li.agl .agl-t{display:block;text-wrap:balance;font-size:min(1em,calc(100cqi * 3.9 / var(--n)))}.bx .start .lede{max-width:880px;text-wrap:balance}}
.bx .plan2 .pl{font-size:13.5px;font-weight:700;color:#8a6a33;padding-top:12px;border-top:1px solid var(--line)}
.bx .plan2 form,.bx .plan2 .go{margin-top:auto}.bx .plan2 .btn{width:100%;justify-content:center}
.bx .sx-how{margin:44px 0 52px;max-width:1080px}
.bx .sx-how .hd{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);font-weight:700;margin:0 0 16px}
.bx .sx-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.bx .sx-steps li{position:relative;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px 24px 24px}
.bx .sx-steps .n{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.bx .sx-steps .n span{font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1;background:linear-gradient(135deg,#d4b075,#8a6a33);-webkit-background-clip:text;background-clip:text;color:transparent}
.bx .sx-steps .n i{flex:1;height:1px;background:linear-gradient(90deg,rgba(176,141,87,.55),rgba(176,141,87,0))}
.bx .sx-steps b{display:block;font-size:17px;margin-bottom:6px;letter-spacing:-.01em}.bx .sx-steps p{margin:0;color:var(--soft);font-size:14.5px;line-height:1.55}
.bx .sx-vid{position:relative;border-radius:22px;overflow:hidden;background:#0b1430;border:1.5px solid rgba(176,141,87,.55);box-shadow:0 40px 90px -50px rgba(11,20,48,.75),0 30px 70px -48px rgba(176,141,87,.6);aspect-ratio:16/9}
.bx .sx-vid video{display:block;width:100%;height:100%;object-fit:cover;background:#0b1430}
.bx .sx-steps.short{margin-top:28px}.bx .sx-steps.short li{padding:18px 20px;display:flex;align-items:center;gap:14px}
.bx .sx-steps.short .n{margin:0}.bx .sx-steps.short .n i{display:none}.bx .sx-steps.short .n span{font-size:26px}
.bx .sx-steps.short b{margin:0;font-size:16px;white-space:nowrap}
@media (max-width:1100px){.bx .sx-steps{grid-template-columns:repeat(2,1fr)}}
@media (max-width:820px){.bx .sx-steps{grid-template-columns:1fr}.bx .sx-steps.short{grid-template-columns:1fr 1fr;gap:10px}.bx .sx-steps.short li{padding:14px;gap:10px}.bx .sx-steps.short .n span{font-size:22px}.bx .sx-steps.short b{font-size:14.5px;line-height:1.3;white-space:normal}}
.bx .start .billing{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:6px 0 22px;font-size:14.5px;font-weight:600;color:var(--soft)}
.bx .start .billing select{font:inherit;font-weight:600;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px 44px 10px 14px;-webkit-appearance:none;appearance:none;cursor:pointer;background:var(--card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%23b08d57' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 16px center}
.bx .start .billing select:focus{outline:2px solid rgba(176,141,87,.45);outline-offset:1px}
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
  const howVideo = HOW_VIDEO[String(page.country).toLowerCase()];
  const who = await personalFor(sp.r, page);

  return (
    <BrandShell lang={lang} extraCss={CSS}>
      {/* Eindeutige Besucher der Tarifseite (JARVIS-Linie „Tarif“): ohne Cookies, Vorschau zählt nie */}
      <VisitBeacon variantId={v.id} page="tarif" enabled={!preview && sp.vorschau !== "1"} />
      <SiteHeader />
      <main className="start"><div className="wrap">
        <div className="eyebrow">{T.eyebrow}</div>
        <h1>{T.title}</h1>
        <p className="lede">{T.lede}</p>
        {who?.firma && <div className="for">{T.for} {who.firma}</div>}

        <div className="sx-how"><div className="hd">{T.how}</div>
          {online && howVideo ? (<>
            <div className="sx-vid"><video controls playsInline preload="metadata" poster={howVideo.poster} src={howVideo.src}>
              {howVideo.vtt && <track kind="captions" src={howVideo.vtt} srcLang={howVideo.srclang} label={lang === "fr" ? "Français" : "English"} />}
            </video></div>
          </>) : (
          <ol className="sx-steps">{(online ? T.steps : T.stepsMail).map(([h, d], k) => (
            <li key={h}><div className="n"><span>{String(k + 1).padStart(2, "0")}</span><i /></div><b>{h}</b><p>{d}</p></li>))}</ol>)}
        </div>
        {online && (
          <label className="billing">{T.billing}
            <select id="billing" defaultValue={isoOf(page.country)} autoComplete="country">
              {billingOptions(lang).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>)}
        {/* Rechnungsland in jedes Bezahl-Formular übernehmen (ohne JavaScript gilt das Land der Seite) */}
        {online && <script dangerouslySetInnerHTML={{ __html: `document.addEventListener("submit",function(e){var f=e.target,s=document.getElementById("billing");if(!s||!f||!/\\/api\\/checkout$/.test(f.getAttribute("action")||""))return;var i=f.querySelector('input[name="billing"]');if(!i){i=document.createElement("input");i.type="hidden";i.name="billing";f.appendChild(i)}i.value=s.value},true);` }} />}
        <div className="plans2">{plans.map((p, k) => {
          const hi = k === plans.length - 1 && plans.length > 1;
          const mail = `mailto:${CONTACT}?subject=${encodeURIComponent(`${T.subject} ${p.name} – ${slug}${who?.firma ? ` – ${who.firma}` : ""}`)}`;
          return (
            <section className={`plan2${hi ? " hi" : ""}`} key={p.key}>
              {hi && <span className="tag">{T.popular}</span>}
              <h2>{p.name}</h2>
              <div className="price">{priceLabel(p, lang)}<small>{T.per}</small></div>
              <ul>{(T.plan[p.key] ?? (p.description ? [p.description] : [])).map((x) => <li key={x}>{x}</li>)}
                {agentEligible(p.key) && <PlanAgentLine lang={lang} />}</ul>
              {perLead(p, lang) && <div className="pl">{T.perLead.replace("{p}", perLead(p, lang)!)}</div>}
              {online && lineItemFor(p, mode, BRAND) ? (
                <form method="post" action="/api/checkout">
                  <input type="hidden" name="variant_id" value={v.id} />
                  <input type="hidden" name="package" value={p.key} />
                  <input type="hidden" name="billing" value={isoOf(page.country)} />
                  {preview && <input type="hidden" name="vorschau" value="1" />}
                  {sp.r && <input type="hidden" name="r" value={sp.r} />}
                  <button className={`btn ${hi ? "gold" : "line"} big`} type="submit">{T.pick} {p.name} <span className="ar"><Icon name="pfeil" size={18} /></span></button>
                </form>
              ) : (
                <div className="go"><a className={`btn ${hi ? "gold" : "line"} big`} href={mail}>{T.mail}: {p.name} <span className="ar"><Icon name="pfeil" size={18} /></span></a></div>
              )}
            </section>);
        })}
          {basePlan(plans) ? (
            <CustomPlan base={basePlan(plans)!} variantId={v.id} preview={preview} r={who ? sp.r : undefined} online={online}
              offerHref={offerMail(lang, country.toLowerCase(), segment.toLowerCase(), who?.firma)} T={T.cu} lang={lang} />
          ) : (
          <section className="plan2 cu">
            <h2>{T.custom}</h2>
            <div className="price">{T.customP}</div>
            <ul>{T.customL.map((x) => <li key={x}>{x}</li>)}</ul>
            <div className="pl">{T.perLeadC}</div>
            <div className="go"><a className="btn line big" href={offerMail(lang, country.toLowerCase(), segment.toLowerCase(), who?.firma)}>{T.customBtn} <span className="ar"><Icon name="pfeil" size={18} /></span></a></div>
          </section>)}
        </div>

        {/* Kurz-Schritte unter den Tarifen (Inhaber 04.10.2026: „pack das doch unter die tarife“) */}
        {online && howVideo && <ol className="sx-steps short">{T.short.map((h, k) => (
          <li key={h}><div className="n"><span>{String(k + 1).padStart(2, "0")}</span></div><b>{h}</b></li>))}</ol>}
        {!online && <p className="note">{T.mailNote}</p>}
        <p className="note">{T.q} <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </div></main>
      <SiteFooter lang={lang} />
    </BrandShell>
  );
}
