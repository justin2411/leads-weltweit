import type { Metadata } from "next";
import { BRAND, CONTACT, siteUrl } from "@/lib/site";
import { stripe, stripeEnabled, type StripeMode } from "@/lib/stripe";
import { db } from "@/lib/supabase";
import { filterToken } from "@/lib/tokens";
import { PER_WEEK, perMonth } from "@/lib/custom-price";
import { BrandShell, SiteFooter, SiteHeader } from "../chrome";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Welcome | ${BRAND}`, robots: { index: false, follow: false } };

const TXT = {
  en: {
    eyebrow: "Subscription confirmed", hello: "Welcome to {b}", helloFirm: "Welcome to {b}, {f}.",
    lede: "Your subscription is active. Thank you for your trust, we look forward to working with you and to bringing you new clients at the right moment.",
    plan: "Your plan", leads: "Leads per week", month: "About {n} per month", price: "Price", per: "per month", email: "Receipts and deliveries to", first: "First delivery",
    next: "What happens next",
    s1: ["Payment confirmed", "Your receipt is on its way to your inbox."],
    s2: ["Set your focus", "Choose the signals and the kind of companies you want. It takes two minutes."],
    s2mail: "We have emailed you the link to a short form. Choose the signals and the kind of companies you want.",
    s3: ["Leads every Monday", "Your first PDF briefing and spreadsheet arrive on {d}, then every Monday."],
    btn: "Set your focus now", q: "Questions? Just reply to any of our emails or write to",
    generic: "Your subscription is set up. You will receive a welcome email with a short form to choose your signals and the kind of companies you want.",
  },
  fr: {
    eyebrow: "Abonnement confirmé", hello: "Bienvenue chez {b}", helloFirm: "Bienvenue chez {b}, {f}.",
    lede: "Votre abonnement est actif. Merci de votre confiance, nous nous réjouissons de travailler avec vous et de vous apporter de nouveaux clients au bon moment.",
    plan: "Votre formule", leads: "Pistes par semaine", month: "Environ {n} par mois", price: "Prix", per: "par mois", email: "Reçus et livraisons à", first: "Première livraison",
    next: "La suite",
    s1: ["Paiement confirmé", "Votre reçu arrive dans votre boîte e-mail."],
    s2: ["Définissez votre cible", "Choisissez les signaux et le type d'entreprises souhaités, en deux minutes."],
    s2mail: "Nous vous avons envoyé par e-mail le lien vers un court formulaire. Choisissez les signaux et le type d'entreprises souhaités.",
    s3: ["Des pistes chaque lundi", "Votre premier briefing PDF et votre tableau arrivent le {d}, puis chaque lundi."],
    btn: "Définir ma cible", q: "Des questions ? Répondez simplement à nos e-mails ou écrivez à",
    generic: "Votre abonnement est en place. Vous recevrez un e-mail de bienvenue avec un court formulaire pour choisir vos signaux et le type d'entreprises souhaités.",
  },
};

const CSS = `
.bx .wl{padding:72px 0 88px}
.bx .wl .eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);font-weight:700;display:flex;align-items:center;gap:10px}
.bx .wl .eyebrow i{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#e2c894,#b08d57);display:inline-flex;align-items:center;justify-content:center;color:#141008;font-style:normal;font-size:13px}
.bx .wl h1{font-size:clamp(32px,4.4vw,52px);letter-spacing:-.03em;line-height:1.06;margin:16px 0 16px;max-width:880px}
.bx .wl .lede{max-width:660px;color:var(--soft);font-size:18px;margin:0}
.bx .wl-sum{margin-top:40px;max-width:1080px;border:1.5px solid var(--gold);border-radius:22px;background:var(--card);display:grid;grid-template-columns:repeat(4,1fr);box-shadow:0 30px 70px -48px rgba(176,141,87,.7)}
.bx .wl-sum div{padding:22px 24px;border-left:1px solid var(--line)}.bx .wl-sum div:first-child{border-left:0}
.bx .wl-sum small{display:block;font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft);font-weight:700;margin-bottom:8px}
.bx .wl-sum b{display:block;font-size:22px;letter-spacing:-.02em}.bx .wl-sum span{display:block;margin-top:4px;color:var(--soft);font-size:13.5px;overflow-wrap:anywhere}
.bx .wl-next{margin-top:52px;max-width:1080px}
.bx .wl-next .hd{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);font-weight:700;margin:0 0 16px}
.bx .wl-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.bx .wl-steps li{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px 24px 24px;display:flex;flex-direction:column}
.bx .wl-steps li.done{border-color:rgba(176,141,87,.55)}
.bx .wl-steps .n{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.bx .wl-steps .n span{font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1;background:linear-gradient(135deg,#d4b075,#8a6a33);-webkit-background-clip:text;background-clip:text;color:transparent}
.bx .wl-steps .n i{flex:1;height:1px;background:linear-gradient(90deg,rgba(176,141,87,.55),rgba(176,141,87,0))}
.bx .wl-steps .n em{font-style:normal;font-size:12px;font-weight:700;color:#3f7a52;background:rgba(91,212,154,.14);border-radius:99px;padding:4px 10px}
.bx .wl-steps b{display:block;font-size:17px;margin-bottom:6px;letter-spacing:-.01em}.bx .wl-steps p{margin:0;color:var(--soft);font-size:14.5px;line-height:1.55}
.bx .wl-steps .btn{margin-top:18px;justify-content:center}
.bx .wl .note{margin-top:28px;color:var(--soft);font-size:14.5px}
@media (max-width:900px){.bx .wl-sum{grid-template-columns:1fr 1fr}.bx .wl-sum div:nth-child(3){border-left:0}.bx .wl-sum div:nth-child(n+3){border-top:1px solid var(--line)}}
@media (max-width:820px){.bx .wl-steps{grid-template-columns:1fr}}
@media (max-width:520px){.bx .wl-sum{grid-template-columns:1fr}.bx .wl-sum div{border-left:0;border-top:1px solid var(--line)}.bx .wl-sum div:first-child{border-top:0}}
`;

/** Erste Lieferung: Montag mit mindestens zwei Tagen Vorlauf (Formular + Freigabe der ersten Lieferung). */
function nextMonday(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2));
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d;
}

async function loadSession(id: string | undefined) {
  if (!id || !/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(id)) return null;
  const mode: StripeMode = id.startsWith("cs_live_") ? "live" : "test";
  if (!stripeEnabled(mode)) return null;
  try {
    const s = await stripe(`checkout/sessions/${id}`, undefined, mode, "GET");
    return s?.status === "complete" && s.mode === "subscription" ? { s, mode } : null;
  } catch {
    return null;
  }
}

export default async function Danke({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  const found = await loadSession(session_id);
  const lang = found?.s.locale === "fr" ? "fr" : "en";
  const T = TXT[lang];
  const s: any = found?.s;
  const m = s?.metadata ?? {};
  const firm: string | undefined = s?.custom_fields?.find((c: any) => c.key === "company")?.text?.value || s?.customer_details?.name || undefined;
  const weekly = Number(m.weekly) || PER_WEEK[m.package] || 0;
  const cur = String(s?.currency ?? "gbp").toUpperCase();
  const loc = lang === "fr" ? "fr-FR" : cur === "EUR" ? "de-DE" : "en-GB";
  const price = s?.amount_total != null
    ? new Intl.NumberFormat(loc, { style: "currency", currency: cur, maximumFractionDigits: s.amount_total % 100 ? 2 : 0 }).format(s.amount_total / 100) : "";
  const num = (n: number) => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB").format(n);
  const first = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(nextMonday());
  const planName = m.package === "custom" ? (lang === "fr" ? "Sur mesure" : "Custom") : m.package ? m.package[0].toUpperCase() + m.package.slice(1) : "";

  // Direktlink zum Formular, sobald der Webhook den Kunden angelegt hat (sonst kommt er per Mail)
  let formLink: string | null = null;
  const secret = process.env.SESSION_SECRET?.trim();
  if (s?.customer && secret) {
    const { data: c } = await db().from("customers").select("id").eq("stripe_customer_id", s.customer).maybeSingle();
    if (c?.id) formLink = `${siteUrl()}/kunde/filter?t=${filterToken(c.id, secret)}`;
  }

  return (
    <BrandShell lang={lang} extraCss={CSS}>
      <SiteHeader />
      <main className="wl"><div className="wrap">
        <div className="eyebrow"><i>✓</i>{T.eyebrow}{found?.mode === "test" ? " · TEST" : ""}</div>
        <h1>{firm ? T.helloFirm.replace("{b}", BRAND).replace("{f}", firm) : T.hello.replace("{b}", BRAND) + "."}</h1>
        <p className="lede">{found ? T.lede : T.generic}</p>

        {found && (
          <div className="wl-sum">
            <div><small>{T.plan}</small><b>{planName}</b>{price && <span>{price} {T.per}</span>}</div>
            <div><small>{T.leads}</small><b>{weekly ? num(weekly) : "–"}</b>{weekly > 0 && <span>{T.month.replace("{n}", num(perMonth(weekly)))}</span>}</div>
            <div><small>{T.first}</small><b style={{ fontSize: 19 }}>{first}</b></div>
            <div><small>{T.email}</small><b style={{ fontSize: 15.5, overflowWrap: "anywhere" }}>{s.customer_details?.email ?? "–"}</b></div>
          </div>
        )}

        <div className="wl-next"><div className="hd">{T.next}</div>
          <ol className="wl-steps">
            <li className={found ? "done" : ""}><div className="n"><span>01</span><i />{found && <em>✓</em>}</div><b>{T.s1[0]}</b><p>{T.s1[1]}</p></li>
            <li><div className="n"><span>02</span><i /></div><b>{T.s2[0]}</b><p>{formLink ? T.s2[1] : T.s2mail}</p>
              {formLink && <a className="btn gold big" href={formLink}>{T.btn} <span className="ar">→</span></a>}</li>
            <li><div className="n"><span>03</span><i /></div><b>{T.s3[0]}</b><p>{T.s3[1].replace("{d}", first)}</p></li>
          </ol>
        </div>
        <p className="note">{T.q} <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </div></main>
      <SiteFooter lang={lang} />
    </BrandShell>
  );
}
