import { ContactPage, contactMetadata } from "../../contact/contact-page";

// Statisch und alle 5 Minuten neu (Ladezeit); mit ?gesendet= oder ?fehler= rendert proxy.ts /contact/q/de.
export const revalidate = 300;
export const metadata = contactMetadata("de");

export default function Page() {
  return <ContactPage lang="de" />;
}
