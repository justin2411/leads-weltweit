"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/** Kurze Rückmeldung nach einer Aktion („gespeichert“ bzw. Fehler), verschwindet nach 4 s. */
export function Flash() {
  const sp = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const ok = sp.get("ok");
  const err = sp.get("fehler");
  useEffect(() => {
    if (!ok && !err) return;
    const t = setTimeout(() => {
      const q = new URLSearchParams(sp.toString());
      q.delete("ok");
      q.delete("fehler");
      router.replace(q.toString() ? `${path}?${q}` : path, { scroll: false });
    }, 4000);
    return () => clearTimeout(t);
  }, [ok, err, sp, path, router]);
  if (!ok && !err) return null;
  return <div className={`flash ${err ? "bad" : "good"}`} role="status">{err ? `✕ ${err}` : `✓ ${ok}`}</div>;
}
