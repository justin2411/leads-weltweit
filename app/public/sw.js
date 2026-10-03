/* Sofort-Alarm (Web-Push) für das Inhaber-Dashboard. Registriert nur mit Scope /dashboard/ (push-button.tsx).
 * Kein Zwischenspeichern von Seiten: nur Benachrichtigungen anzeigen und beim Antippen die passende Seite öffnen. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function safeUrl(u) {
  try {
    const url = new URL(typeof u === "string" && u ? u : "/dashboard/antworten", self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL("/dashboard/antworten", self.location.origin).href;
  } catch (e) {
    return new URL("/dashboard/antworten", self.location.origin).href;
  }
}

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: event.data ? event.data.text() : "" }; }
  const title = String(d.title || "Neue Antwort").slice(0, 80);
  const urgent = d.kind === "buy" || d.kind === "question" || d.kind === "notbremse";
  event.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || "").slice(0, 240),
    icon: "/apple-icon.png",
    badge: "/apple-icon.png",
    tag: String(d.kind || "alarm") + ":" + String(d.ts || Date.now()),
    renotify: true,
    requireInteraction: urgent,
    data: { url: safeUrl(d.url) },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url === target && "focus" in w) return w.focus();
    }
    for (const w of wins) {
      if ("navigate" in w && new URL(w.url).origin === self.location.origin) {
        try { const n = await w.navigate(target); if (n) return n.focus(); } catch (e) { /* weiter mit neuem Fenster */ }
      }
    }
    return self.clients.openWindow(target);
  })());
});
