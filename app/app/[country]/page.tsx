import { notFound } from "next/navigation";
import { Home, homeMetadata } from "../home";

// Statisch, alle 5 Minuten im Hintergrund neu (wie "/")
export const revalidate = 300;

type Params = Promise<{ country: string }>;
// Startseite in weiteren Sprachen: /fr und /de (Englisch ist "/"). Alles andere mit einem Pfadteil: 404.
const LANGS = { fr: "fr", de: "de" } as const;

export function generateStaticParams() {
  return Object.keys(LANGS).map((country) => ({ country }));
}

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
