"use client";

import { useEffect, useState } from "react";
import { ALERT_MIN, ageLabel, ageMinutes } from "@/lib/antworten";
import { Icon } from "@/app/icons";

/** Wartezeit seit Eingang, tickt alle 30 s; rot, wenn eine dringende Antwort länger als ALERT_MIN Minuten wartet. */
export function Age({ received, processed, urgent, open }: { received: string | null; processed: string | null; urgent: boolean; open: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const min = ageMinutes({ received_at: received, processed_at: processed }, now);
  const late = open && urgent && min != null && min > ALERT_MIN;
  return (
    <span className={`aw-age${late ? " late" : ""}`} suppressHydrationWarning title={late ? `wartet länger als ${ALERT_MIN} min` : "seit Eingang"}>
      <Icon name={late ? "warnung" : "uhr"} size={14} />
      <span suppressHydrationWarning>{ageLabel(min)}</span>
    </span>
  );
}
