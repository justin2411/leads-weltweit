import { ContactPage, contactMetadata } from "../../contact/contact-page";

export const dynamic = "force-dynamic";
export const metadata = contactMetadata("fr");

type Search = Promise<{ gesendet?: string; fehler?: string }>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  return <ContactPage lang="fr" sent={sp.gesendet === "1"} error={sp.fehler?.replace(/[^a-z]/g, "").slice(0, 20)} />;
}
