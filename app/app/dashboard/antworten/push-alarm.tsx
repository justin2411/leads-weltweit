import { vapidPublicKey } from "@/lib/push";
import { PushButton } from "./push-button";

/**
 * „Alarm aufs Handy“ für den Kopf des Antworten-Cockpits (Server-Komponente). Gibt den öffentlichen VAPID-Schlüssel
 * als Prop weiter und verlinkt das Manifest nur hier (React hebt <link> in den <head>), damit „Zum Home-Bildschirm“
 * die App mit Startseite Antworten anlegt – öffentliche Seiten verlinken nichts davon.
 * Einbau (Integrator): `import { PushAlarm } from "./push-alarm";` und `<PushAlarm />` im Kopf von page.tsx.
 */
export function PushAlarm() {
  return (
    <>
      <link rel="manifest" href="/dashboard/antworten/manifest.webmanifest" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="NextGen" />
      <style dangerouslySetInnerHTML={{ __html: PUSH_CSS }} />
      <PushButton vapidKey={vapidPublicKey()} />
    </>
  );
}

const PUSH_CSS = `
.aw-push{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.aw-push-btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:12px;cursor:pointer;
  border:1px solid var(--cy,#5fd4ff);background:linear-gradient(180deg,rgba(95,212,255,.24),rgba(95,212,255,.06));color:#fff;font:inherit;font-weight:600}
.aw-push-btn.ghost{background:rgba(4,14,30,.7);border-color:var(--line,rgba(95,212,255,.16));color:var(--text,#d9ecff)}
.aw-push-btn:disabled{opacity:.6;cursor:wait}
.aw-push-btn:focus-visible{outline:2px solid var(--cy,#5fd4ff);outline-offset:2px}
.aw-push-on{display:inline-flex;align-items:center;gap:6px;color:var(--green,#3ddc97);font-weight:600}
.aw-push-note{display:inline-flex;align-items:center;gap:6px;color:var(--soft,#8ba6c9);font-size:13px}
.aw-push-msg{font-size:13px;color:var(--soft,#8ba6c9)}
`;
