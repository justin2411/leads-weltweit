# Erklärvideo (kostenlos, ohne externe Dienste)

1. Text und Szenentexte je Zielgruppe: `segments/<slug>.json` (ehrlich, keine erfundenen Zahlen, keine Garantien).
2. Stimme: `./build.sh <slug>` (Stimme, Bilder, MP4 nach app/public/video/, Eintrag in app/content/videos.json) – Stimme – Kokoro-TTS (Apache-2.0), Modelle aus den Releases von thewh1teagle/kokoro-onnx
   (`kokoro-v1.0.int8.onnx` als `kokoro.onnx`, `voices-v1.0.bin`). Erzeugt `vo_<stimme>.wav` und `timing_<stimme>.json`.
3. Bilder: `node render.mjs stills` (Kontrollbilder) bzw. `node render.mjs video 25` (Einzelbilder, Playwright/Chromium).
   `film.html` rendert jede Szene deterministisch über `render(t)`; Szenen richten sich nach den Satzzeiten.
4. Zusammenfügen: `ffmpeg -framerate 25 -i frames/f%05d.jpg -i vo_bf_emma.wav -af loudnorm=I=-16:TP=-1.5 -ar 48000 -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -shortest out.mp4`

Firmennamen im Video sind erfundene Beispiele und als „Illustrative example(s)“ gekennzeichnet. Keine echten Empfänger zeigen.

## Version 3 (`v3/`): mehr Spannung und Verkauf
Szenen: Stadt → Zoom auf eine neue Firma · Uhr läuft ab (Konkurrenz rückt an) · Marke („gets you there early“) · Radar über den Quellen ·
Lead-Karte mit Einstiegssatz · Qualitätsprüfung (Mindestwert 60, darunter wird nicht geliefert) · Montag-Postfach · Ein-Klick-Probe · Abschluss.
Ton: `v3/mix.py <slug>` legt einen leisen Klangteppich, einen Puls in der Spannungsszene und einen Whoosh unter die Stimme (Stimme −16 LUFS, Teppich deutlich leiser).
Bauen (aus `video/v3`): `python3 ../vo.py segments/<slug>.json` → `node ../render.mjs <slug> video 25` → `python3 mix.py <slug>` → ffmpeg mit `out/<slug>/mix.wav`.
Aussagen nur belegbar: Qualitätswert und Mindestwert 60 (scripts/match.py), Quelle und Datum je Lead, jeder Lead einmal je Abo. Keine Superlative wie „die besten Leads“.

## Version 4 (`v4/`): landesweit, Marke Dunkelblau + Gold
Radar-Film wie v3 (neue Firma → Uhr läuft → Marke → Radar über den Quellen), danach: Signale der Branche · Lead-Karte
(Telefon, E-Mail, Website, Ansprechperson aus dem Register, Adresse, Ereignis mit Datum und Quelle, Priorität) · Vertriebs-Briefing
(warum jetzt, wahrscheinlicher Bedarf, wie gewinnen, Einstiegssatz) · Qualitätswert mindestens 60 · Montag: PDF-Briefing + Tabelle ·
exklusiv eine Firma pro Branche · 10 kostenlose Leads · Abschluss. Keine Regionen: Leads aus dem ganzen Land.
- Inhalte: `v4/segments.py` (Startseite en/fr/de, Branche × UK/US/FR, dazu DE) → `v4/segments/<name>.json`.
- Stimme: `v4/vo.py` – Kokoro (en-gb `bf_emma`, en-us `af_heart`, fr `ff_siwis`), Deutsch lokal mit Piper (`pip install piper-tts`, `PIPER_MODEL`=de_DE-thorsten-high.onnx).
- Bauen: `FFMPEG=… KOKORO_MODEL=… KOKORO_VOICES=… PIPER_MODEL=… v4/all.sh [name …]` (3 parallel, 1280×720, crf 26) →
  `app/public/video/v4-*.mp4/.jpg` und Eintrag in `app/content/videos.json`. Kontrollbilder: `node render.mjs <name> stills` (in `v4/`).
  Musik: `v3/music.py`. Satzlängen: `v4/lengths.py`.
- Telefonnummern im Beispiel stammen aus den für Film/Fiktion reservierten Bereichen; Firmen und Personen sind erfunden.
- Seit v5 nur noch für die Startseiten-Filme (`en:home`, `fr:home`, `de:home`) im Einsatz.

## Version 5 (`v5/`): fünf eigenständige Branchenfilme
Jede Branche hat ein eigenes Konzept, eine eigene Vorlage und eigene Musik. Marke (Dunkelblau + Gold, Inter, Linien-Icons),
Wortmarke oben links, Hinweis „Beispiel“ und die Schlusskarte („10 kostenlose Leads …“ + nextgen-profit.de) kommen aus `v5/lib/`.
- `accountants.html` – „Das erste Jahr einer Firma“: Registerauszug mit Stempel → Jahresleiste, auf der die Fristen des Landes
  aufleuchten (UK VAT/PAYE/Confirmation statement/Accounts; US EIN+Sales tax/Payroll/Annual report/Tax return+1099s;
  FR TVA/DSN/Bilan+liasse/Dépôt des comptes; DE steuerliche Erfassung/USt-Voranmeldung/Lohn/Jahresabschluss) → Kanzlei im
  Mittelpunkt über Jahre → Kassenbuch der Neueintragungen → Montag (PDF + Tabelle).
- `recruitment.html` – „Die Stelle, die nicht verschwindet“: Karriereseite mit Tageszähler 1 → 30 → 45 → neu ausgeschrieben +
  zwei weitere Stellen → leere Stühle, das Telefon klingelt → Beleg-Zeitleiste (zuerst gesehen, neu ausgeschrieben, noch offen,
  Quellenlink, täglich geprüft) → Montagsliste.
- `insurance.html` – „Neue Risiken“: isometrisches Grundstück → Gebäude, Fahrzeuge, Personal, Eröffnung, je mit Schutzschild
  der passenden Versicherung → Kamera zurück: viele neue Firmen → Lead-Karte.
- `advisers.html` – „Der Mensch hinter der Firma“: Registerzeile → Linienporträt (ohne Gesicht) → private Themen im Orbit
  (Gehalt/Dividende, Vorsorge, Absicherung, Nachfolge) → Profilkarte der neuen Geschäftsführung.
- `web.html` – „Der Browser-Test“: Adresszeile → keine Website → Seite wie von 2008 → bricht auf dem Handy → goldener Wisch
  vorher/nachher → Website-Prüfliste mit Kontaktzeile.

Bauen (Umgebung wie v4): `python3 v5/segments.py` → `v5/all.sh [name …]` (Stimme `v4/vo.py`, Bilder `v4/render.mjs`,
Musik `v5/music.py`, Kodierung wie v4: 1280×720, 25 fps, crf 26, faststart, AAC 128k) → `app/public/video/v5-<markt>-<branche>.mp4/.jpg`
und Eintrag in `app/content/videos.json`. Kontrollbilder (in `v5/`): `node ../v4/render.mjs <name> stills 25 0.5`.
Beispiel-Firmen, -Personen, Telefonnummern (Fiktionsbereiche) und Domains sind erfunden und im Bild als Beispiel markiert;
keine Regionen, keine Zahlen über Ergebnisse, keine Garantien.
