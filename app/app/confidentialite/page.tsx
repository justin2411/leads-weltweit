import { LegalPage } from "@/app/legal-page";

export const metadata = { robots: { index: false, follow: false } };

export default function Page() {
  return <LegalPage doc="datenschutz" lang="fr" />;
}
