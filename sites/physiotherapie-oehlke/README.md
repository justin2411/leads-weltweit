# Website Mobile Physiotherapie Oehlke

Neugestaltung von physiotherapie-oehlke.de als statische Website (HTML/CSS/JS, keine Abhängigkeiten).
Vorschau: https://physiotherapie-oehlke.nextgen-profit.de

| Pfad | Inhalt |
|---|---|
| `build.py` | erzeugt alle Seiten nach `public/` (Startseite, Navigation, Footer, Seitentypen im Code) |
| `content/pages.json` | Texte der Unterseiten (Leistungen, Orte, Karriere, Impressum, Datenschutz, AGB) aus der bisherigen Website |
| `public/` | fertige Website: HTML, `css/site.css`, `js/site.js`, `assets/` (Bilder als WebP, Schriften lokal) |
| `vercel.json` | Vercel-Projekt `physiotherapie-oehlke` (Root Directory `sites/physiotherapie-oehlke`, kein Build) |

Ändern: `content/pages.json` oder `build.py` bearbeiten → `python3 sites/physiotherapie-oehlke/build.py` → `public/` mit committen.

**Vorschau-Modus:** `DEMO = True` in `build.py` und `X-Robots-Tag` in `vercel.json` halten die Subdomain aus Suchmaschinen
(sonst doppelter Inhalt zur echten Website). Für den Livegang auf der eigenen Domain: `DEMO = False`, Header entfernen.

Kontaktformular: öffnet das E-Mail-Programm mit vorbereiteter Nachricht an info@physiotherapie-oehlke.de (wie bisher, kein Server).
Einrichtung Vercel: Workflow `vercel` mit `befehl=site-setup`, `arg=physiotherapie-oehlke` (Projekt, Subdomain, Deployment aus `main`).
