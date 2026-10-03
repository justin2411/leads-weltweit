import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContactPage, contactMetadata } from "../../contact-page";
import type { HomeLang } from "../../../home-i18n";

// Kontaktseite mit Meldung nach dem Absenden (?gesendet=1 / ?fehler=…): pro Aufruf gerendert.
// proxy.ts schreibt /contact, /fr/contact und /de/kontakt mit diesen Parametern hierher um (Adresse bleibt).
export const dynamic = "force-dynamic";

type Params = Promise<{ lang: string }>;
type Search = Promise<{ gesendet?: string; fehler?: string }>;
const LANGS = new Set<HomeLang>(["en", "fr", "de"]);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang } = await params;
  return LANGS.has(lang as HomeLang) ? contactMetadata(lang as HomeLang) : { robots: { index: false, follow: false } };
}

export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { lang } = await params;
  if (!LANGS.has(lang as HomeLang)) notFound();
  const sp = await searchParams;
  return <ContactPage lang={lang as HomeLang} sent={sp.gesendet === "1"} error={sp.fehler?.replace(/[^a-z]/g, "").slice(0, 20)} />;
}
