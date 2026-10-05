/**
 * Schwebender Knopf „JARVIS“ unten rechts → bestehender Chat (/dashboard/jarvis/chat). Die früheren Kopf-Bausteine
 * (fünf Ströme, Firma-Kacheln) sind mit der Zentrale (05.10.2026) entfallen.
 */
import Link from "next/link";
import { Icon } from "@/app/icons";

export function ChatKnopf({ neu }: { neu: number }) {
  return (
    <Link href="/dashboard/jarvis/chat" className="jfab" aria-label={neu ? `Chat, ${neu} neu` : "Chat mit JARVIS"} title="Schreib JARVIS">
      <Icon name="antworten" size={24} />{neu > 0 && <b>{neu}</b>}
    </Link>
  );
}

export const KOPF_CSS = `
.dash .jfab{position:fixed;right:24px;bottom:24px;z-index:30;display:grid;place-items:center;width:60px;height:60px;border-radius:50%;background:linear-gradient(180deg,#e2c68f,#b8954f);color:#04101f;text-decoration:none;box-shadow:0 10px 30px -8px rgba(0,0,0,.8),0 0 24px -6px rgba(226,198,143,.7)}
.dash .jfab:hover,.dash .jfab:focus-visible{filter:brightness(1.08)}
.dash .jfab b{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--amp-red);color:#fff;font-size:var(--fs-xs);line-height:22px;text-align:center}
@media (max-width:760px){
  .dash .jfab{right:16px;bottom:calc(76px + env(safe-area-inset-bottom));width:56px;height:56px}
}
`;
