import { Home, homeMetadata } from "./home";

// Statisch, alle 5 Minuten im Hintergrund neu (Kennzahlen, Branchen aus der Datenbank) – Ladezeit
export const revalidate = 300;
export const metadata = homeMetadata("en");

export default function Page() {
  return <Home lang="en" />;
}
