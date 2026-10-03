import { COUNTRIES } from "@/lib/dashboard-data";
import { isPeriod, type PeriodKey } from "@/lib/dashboard-periods";

export type SP = Promise<Record<string, string | string[] | undefined>>;

/** Land (?land=US) und Zeitraum (?z=woche) aus der Adresse; Standard: alle Länder, heute. */
export async function readParams(searchParams: SP) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const landRaw = one("land")?.toUpperCase();
  const land = landRaw && COUNTRIES.includes(landRaw) ? landRaw : null;
  const zRaw = one("z");
  const z: PeriodKey = isPeriod(zRaw) ? zRaw : "heute";
  return { land, countries: land ? [land] : COUNTRIES, z, raw: { land: land ?? undefined, z: zRaw && isPeriod(zRaw) ? zRaw : undefined }, one };
}

export const withQuery = (base: string, q: Record<string, string | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) u.set(k, v);
  return u.toString() ? `${base}?${u}` : base;
};
