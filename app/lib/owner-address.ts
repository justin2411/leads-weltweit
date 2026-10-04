/**
 * Ist die Adresse eine des Inhabers (OWNER_EMAIL / SALE_NOTIFY_EMAIL aus der Umgebung, nie im Code)?
 * Dann ist eine Probe-Anfrage ein Test und zählt nicht als echte Probe (Prüfung 04.10.2026).
 */
export function isOwnerAddress(email: string, env: Record<string, string | undefined>): boolean {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  return [env.OWNER_EMAIL, env.SALE_NOTIFY_EMAIL]
    .flatMap((x) => (x ?? "").split(","))
    .map((x) => x.trim().toLowerCase())
    .some((x) => x !== "" && x === e);
}
