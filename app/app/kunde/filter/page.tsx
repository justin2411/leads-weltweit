import type { Metadata } from "next";
import { BRAND, CONTACT } from "@/lib/site";
import { db } from "@/lib/supabase";
import { verifyFilterToken } from "@/lib/tokens";
import { BrandShell, SiteFooter, SiteHeader } from "../../chrome";
import { FilterForm, FORM_CSS } from "./form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Your lead preferences | ${BRAND}`, robots: { index: false, follow: false } };

const CSS = `.bx .kf{padding:56px 0 88px}.bx .kf .ff{margin-top:0}.bx .kf .note{margin-top:22px;color:var(--soft);font-size:14.5px}`;

export default async function FilterPage({ searchParams }: { searchParams: Promise<{ t?: string; ok?: string; abgelaufen?: string }> }) {
  const sp = await searchParams;
  const id = verifyFilterToken(sp.t, process.env.SESSION_SECRET?.trim());
  let body;
  if (!id) {
    body = <section className="ff"><h2>This link has expired</h2><p className="sub">Please reply to our welcome email or write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will send you a new link.</p></section>;
  } else {
    const { data: f } = await db().from("customer_filters").select("*").eq("customer_id", id).maybeSingle();
    const { data: c } = await db().from("customers").select("country").eq("id", id).maybeSingle();
    const { data: sub } = await db().from("subscriptions").select("segment_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    body = <FilterForm token={sp.t!} f={f} back={`/kunde/filter?t=${sp.t}`} lang={c?.country === "FR" ? "fr" : "en"} saved={!!sp.ok} segment={sub?.segment_id} />;
  }
  return (
    <BrandShell lang="en" extraCss={FORM_CSS + CSS}>
      <SiteHeader />
      <main className="kf"><div className="wrap">
        {body}
        <p className="note">Questions? Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </div></main>
      <SiteFooter />
    </BrandShell>
  );
}
