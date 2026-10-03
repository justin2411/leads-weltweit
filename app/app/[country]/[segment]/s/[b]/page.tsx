import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";
import { BUCKETS, bucketRand } from "@/lib/landing-buckets";
import { Landing, landingMetadata, type LandingParams } from "../../landing";

/**
 * Zwischengespeicherte Landingpage ohne Suchparameter (proxy.ts schreibt /<land>/<zielgruppe> hierher um).
 * Alle 5 Minuten im Hintergrund neu gerendert; der Besucher bekommt sofort die gespeicherte Fassung.
 */
export const revalidate = 300;

type Params = Promise<LandingParams & { b: string }>;

function bucket(b: string): number | null {
  const n = Number(b);
  return /^\d{1,2}$/.test(b) && n < BUCKETS ? n : null;
}

/** Beim Build: alle Live-Seiten in jedem Eimer vorbereiten (ohne Datenbank: beim ersten Aufruf). */
export async function generateStaticParams() {
  try {
    const { data, error } = await db().from("landing_pages").select("slug").eq("status", "live");
    if (error) return [];
    return (data ?? []).flatMap((p: any) => {
      const [country, segment] = String(p.slug).split("/");
      return country && segment ? Array.from({ length: BUCKETS }, (_, b) => ({ country, segment, b: String(b) })) : [];
    });
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { b, ...p } = await params;
  const n = bucket(b);
  return n === null ? { robots: { index: false, follow: false } } : landingMetadata(p, {}, bucketRand(n));
}

export default async function StaticLandingPage({ params }: { params: Params }) {
  const { b, ...p } = await params;
  const n = bucket(b);
  if (n === null) notFound();
  return <Landing params={p} sp={{}} rand={bucketRand(n)} />;
}
