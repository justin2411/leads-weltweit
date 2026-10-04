import "server-only";
import { loadZentraleKpis } from "@/lib/zentrale/data";
import { kpi as rechtKpi } from "@/lib/zentrale/recht";
import { kpi as betriebKpi } from "@/lib/zentrale/betrieb";
import { kpi as protokollKpi } from "@/lib/zentrale/protokoll";
import { sicher, type Kz } from "@/lib/abteilungen";
import type { Ampel } from "@/lib/ampel";

/**
 * Kennzahlen der Abteilungen aus den Zentrale-Seiten (Finanzen, Vertrieb, Ziele, Recht, Betrieb, Protokoll).
 * Jede Quelle einzeln mit Zeitlimit abgesichert: fällt eine aus, ist sie null (Kachel „–“), die Seite läuft weiter.
 */
export type ZentraleKz = { finanzen: Kz; vertrieb: Kz; ziele: Kz; recht: Kz; betrieb: Kz; protokoll: Kz };

const kz = (k: { wert: string; ampel: Ampel; grund?: string } | null | undefined): Kz =>
  k ? { wert: k.wert, ampel: k.ampel, grund: k.grund } : null;

export async function loadAbteilungen(ms = 6000): Promise<ZentraleKz> {
  const [z, r, b, p] = await Promise.all([
    sicher(() => loadZentraleKpis(), ms), sicher(() => rechtKpi(), ms), sicher(() => betriebKpi(), ms), sicher(() => protokollKpi(), ms),
  ]);
  return { finanzen: kz(z?.finanzen), vertrieb: kz(z?.vertrieb), ziele: kz(z?.ziele), recht: kz(r), betrieb: kz(b), protokoll: kz(p) };
}
