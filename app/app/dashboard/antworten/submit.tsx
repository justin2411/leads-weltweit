"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "@/app/icons";

/** Großer Knopf, der während der Aktion gesperrt ist (kein Doppelklick, keine doppelte Mail). */
export function Submit({ children, className = "", disabled, name, value }: { children: ReactNode; className?: string; disabled?: boolean; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`aw-big ${className}`} disabled={disabled || pending} aria-busy={pending} name={name} value={value}>
      {pending ? <><Icon name="warten" size={18} /> …</> : children}
    </button>
  );
}
