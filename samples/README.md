# Probe-Leads

Ablage: `samples/<Segment>/<Land>/` (z. B. `samples/S1/UK/`), zusätzlich in der Tabelle `signalwerk.leads` (status `sample`).

**Seit 04.10.2026 nur lokal:** `leads*.csv` und `probe-*.html` stehen in `.gitignore` – das Repo ist öffentlich, Lead-Kontaktdaten gehören nicht hinein. Die Quelle der Wahrheit ist die Datenbank.

**Stand 26.09.2026: noch keine Probe-Leads.** Die Umgebung, in der der Code gebaut wurde, durfte keine
externen Seiten abrufen (Companies House, data.ny.gov und Firmenwebsites waren vom Netzwerk gesperrt).
Erfundene oder nicht geprüfte Leads legen wir nicht ab. Ohne echte Probe kein Versand.

So entstehen die ersten Proben, sobald Netzwerk und Datenbank bereitstehen:

- **S1 UK** (Stellen 30+ Tage offen, 3+ Stellen): KMU-Arbeitgeber einer Region in `watch_companies` mit
  `careers_url` eintragen, dann `python scripts/watch.py careers` täglich. Stellen mit `datePosted` älter als
  30 Tage werden sofort Leads, sonst nach 30 Tagen eigener Beobachtung.
- **S2 US** (Neugründungen, veraltete Website): `python scripts/watch.py ny-incorporations --days 45`,
  für Firmen mit Website `python scripts/watch.py websites`, danach `python scripts/watch.py detect`.
