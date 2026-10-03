import { ContactPage, contactMetadata } from "./contact-page";

// Statisch und alle 5 Minuten neu (Ladezeit); mit ?gesendet= oder ?fehler= rendert proxy.ts /contact/q/en.
export const revalidate = 300;
export const metadata = contactMetadata("en");

export default function Page() {
  return <ContactPage lang="en" />;
}
