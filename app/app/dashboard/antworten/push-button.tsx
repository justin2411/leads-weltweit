"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/app/icons";
import { savePushSubscription, sendTestPush } from "./push-actions";

/**
 * „Alarm aufs Handy“: Mitteilungen erlauben → Web-Push-Abo mit dem öffentlichen VAPID-Schlüssel (kommt als Prop vom
 * Server, nicht aus NEXT_PUBLIC_*) → Abo serverseitig speichern. Service Worker /sw.js nur für /dashboard/.
 * iPhone: Push geht erst, wenn die Seite über „Teilen → Zum Home-Bildschirm“ als App geöffnet wird.
 */
type State = "laden" | "aus" | "an" | "blockiert" | "nicht-moeglich" | "ios-home" | "fehlt";

const RESAVE_MS = 24 * 3600 * 1000;

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const k = sub.options?.applicationServerKey;
  if (!k) return true; // ältere Browser verraten den Schlüssel nicht: Abo behalten
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((x, i) => x === key[i]);
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const kind = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : "Computer";
  return `${kind} ${new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`;
}

function isIosBrowser(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
  return ios && !standalone;
}

function store(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch { return null; }
}

export function PushButton({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<State>("laden");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIosBrowser() ? "ios-home" : "nicht-moeglich");
        return;
      }
      if (!vapidKey) { setState("fehlt"); return; }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/dashboard/", updateViaCache: "none" });
        const sub = await reg.pushManager.getSubscription();
        if (off) return;
        if (Notification.permission === "denied") { setState("blockiert"); return; }
        if (sub && sameKey(sub, keyBytes(vapidKey))) {
          setState("an");
          // Abo einmal am Tag erneut melden (setzt Fehlerzähler zurück, falls der Server es zwischendurch aufgab)
          const last = Number(store("sw-push-saved") ?? 0);
          if (Date.now() - last > RESAVE_MS) {
            const r = await savePushSubscription(sub.toJSON(), deviceLabel()).catch(() => null);
            if (r?.ok) store("sw-push-saved", String(Date.now()));
          }
        } else {
          setState("aus");
        }
      } catch {
        if (!off) setState("nicht-moeglich");
      }
    })();
    return () => { off = true; };
  }, [vapidKey]);

  async function enable() {
    if (!vapidKey) return;
    setBusy(true);
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "blockiert" : "aus"); return; }
      const reg = await navigator.serviceWorker.ready;
      const key = keyBytes(vapidKey);
      const old = await reg.pushManager.getSubscription();
      if (old && !sameKey(old, key)) await old.unsubscribe();
      const sub = (old && sameKey(old, key)) ? old
        : await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const r = await savePushSubscription(sub.toJSON(), deviceLabel());
      setMsg(r.msg);
      if (r.ok) { setState("an"); store("sw-push-saved", String(Date.now())); }
    } catch (e) {
      setMsg(`Nicht möglich: ${String((e as Error)?.message ?? e).slice(0, 100)}`);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg("");
    try {
      const r = await sendTestPush();
      setMsg(r.msg);
    } catch {
      setMsg("Test nicht möglich");
    } finally {
      setBusy(false);
    }
  }

  if (state === "laden") return null;
  return (
    <div className="aw-push" role="group" aria-label="Alarm aufs Handy">
      {state === "an" ? (
        <>
          <span className="aw-push-on"><Icon name="ok-kreis" size={18} /> Alarm an</span>
          <button type="button" className="aw-push-btn ghost" onClick={test} disabled={busy}>
            <Icon name="telefon" size={18} /> Test
          </button>
        </>
      ) : state === "aus" ? (
        <button type="button" className="aw-push-btn" onClick={enable} disabled={busy}>
          <Icon name="telefon" size={18} /> Alarm aufs Handy
        </button>
      ) : (
        <span className="aw-push-note">
          <Icon name={state === "ios-home" ? "info" : "achtung"} size={16} />
          {state === "ios-home" ? "iPhone: erst „Teilen → Zum Home-Bildschirm“, dann dort tippen"
            : state === "blockiert" ? "Mitteilungen blockiert – in den Browser-Einstellungen erlauben"
            : state === "fehlt" ? "Alarm noch nicht eingerichtet (Schlüssel fehlen)"
            : "Dieser Browser kann keine Alarme"}
        </span>
      )}
      {msg && <span className="aw-push-msg" role="status">{msg}</span>}
    </div>
  );
}
