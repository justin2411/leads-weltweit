import { notFound } from "next/navigation";
import { Home, homeMetadata } from "../home";

export const dynamic = "force-dynamic";

type Params = Promise<{ country: string }>;
// Startseite in weiteren Sprachen: /fr und /de (Englisch ist "/"). Alles andere mit einem Pfadteil: 404.
const LANGS = { fr: "fr", de: "de" } as const;

export async function generateMetadata({ params }: { params: Params }) {
  const { country } = await params;
  const lang = LANGS[country as keyof typeof LANGS];
  return lang ? homeMetadata(lang) : { robots: { index: false, follow: false } };
}

export default async function Page({ params }: { params: Params }) {
  const { country } = await params;
  const lang = LANGS[country as keyof typeof LANGS];
  if (!lang) notFound();
  return <Home lang={lang} />;
}
