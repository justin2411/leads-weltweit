import type { Metadata } from "next";
import { Landing, landingMetadata, type LandingParams, type LandingSearch } from "./landing";

// Mit Suchparametern (Vorschau, persönlicher Link ?r=, ?angefragt=1, ?fehler=1, ?schritt=) pro Aufruf gerendert.
// Aufrufe ohne diese Parameter schreibt proxy.ts auf die zwischengespeicherte Fassung ./s/[b] um.
export const dynamic = "force-dynamic";

type Params = Promise<LandingParams>;
type Search = Promise<LandingSearch>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  return landingMetadata(await params, await searchParams);
}

export default async function LandingPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Landing params={await params} sp={await searchParams} />;
}
