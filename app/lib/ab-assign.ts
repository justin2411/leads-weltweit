/**
 * Zuweisung A/B fest je Einheit (wie scripts/lib/ab.py assign): sha256(salt:einheit), erstes Byte gerade = A.
 * Einheit = ?r=-Token der Mail, sonst Tages-Besucher-Schlüssel (IP|Browser|Tag, nur gehasht, nie gespeichert),
 * Probe- oder Checkout-ID. Nichts im Browser (kein Cookie, kein Storage). Nur serverseitig (node:crypto).
 */
import { createHash } from "node:crypto";
import type { AbKey } from "./ab.ts";

export function assign(salt: string | null | undefined, unit: string | null | undefined): AbKey {
  const u = String(unit ?? "");
  const key = salt ? `${salt}:${u}` : u;
  return createHash("sha256").update(key, "utf8").digest()[0] % 2 === 0 ? "A" : "B";
}
