# Extraktor: Lead-Beschaffung (Stand 01.10.2026)

Eigener Bereich nur für das Beschaffen von Leads (Inhaber 01.10.2026: „bau einmal alles … wichtig ist, dass wir die
Leads kostenfrei bekommen und nur für das jeweilige Anreichern eventuell Geld ausgeben“).
Code: `scripts/extraktor/`, Workflow: `.github/workflows/extraktor.yml`, Tests: `tests/test_extraktor.py`.

## Ablauf

```
Quelle (amtlich, kostenlos) ─► Sicherheitsfilter ─► Branche zuordnen ─► Anreicherung (kostenlos)
   ─► Texte aus Fakten ─► Kontrolle 1: Qualität ─► Kontrolle 2: Signal ─► Ampel ─► CSV / Datenbank
```

| Schritt | Datei | Was passiert |
|---|---|---|
| Quellen | `sources/fmcsa.py`, `sources/formd.py` | FMCSA-Neuzugänge (Transport/Fuhrpark) und SEC-Form-D-Kapitalmeldungen der letzten Tage |
| Sicherheitsfilter | `filters.py` | Behörden/Vereine raus, Platzhalter raus, Dubletten raus, Sammel-Kontakte von Anmelde-Dienstleistern erkennen, Sperrliste und vorhandene Leads (mit `--db`) |
| Branche | `segments.fits` | feste Regel je Branche (siehe unten), mit Begründung |
| Anreicherung | `enrich.py` | Website aus der eigenen E-Mail-Domain oder aus dem Firmennamen, nur wenn die Seite die Firma belegt (Name, Ort, Telefon aus der Quelle, PLZ, Ansprechperson); E-Mail/Telefon von der eigenen Website; MX-Prüfung |
| Texte | `segments.texts` | Signal, Firmeninfo, Einstiegssatz, Dringlichkeit – nur aus den Fakten dieses Leads |
| Kontrolle 1 | `qc.py` | Telefon (gültig, kein Muster, Vorwahl ↔ Bundesstaat), E-Mail (Syntax, MX, keine Wegwerf-/Dienstleister-Adresse, Domain = Website), Ansprechperson (echter Vor- und Nachname, keine Firma/Rolle, Namenslexikon), Adresse (PLZ passt zum Bundesstaat), Website geprüft |
| Kontrolle 2 | `sc.py` | Branchenregel erfüllt, Signal höchstens 45 Tage alt, **jede Zahl im Text steht in den Fakten**, Ort im Text = Adresse, Firmenname im Text, keine verbotenen Wörter, kein Text doppelt im Lauf |
| Ausgabe | `run.py` | `leads_gruen.csv` (lieferbar), `leads_alle.csv` (alle mit Gründen), `bericht.json` (Trichter) |
| Datenbank | `store.py` | grüne Leads in `watch_companies`, `observations`, `leads` (nur mit `--apply`) |

**Ampel:** grün = Kontrolle 1 grün **und** Kontrolle 2 bestanden → lieferbar. Gelb = Pflichtangabe fehlt → anreichern.
Rot = falsch oder widersprüchlich → nie liefern.

## Quellen und Branchen

| Branche | Quelle | Regel | Signal |
|---|---|---|---|
| S4 Versicherungsmakler | FMCSA | neuer Carrier mit eigenen Fahrzeugen (for-hire oder Werksverkehr), ≤ 100 Fahrzeuge, eigene E-Mail-Domain | neue USDOT-Registrierung mit Fahrzeugen, Fahrern, Ladung |
| S2 Webagenturen | FMCSA | neue Firma ohne Website (Freemail-Adresse, keine Website unter dem Namen gefunden) | neu registriert, keine Website |
| S1 Personalvermittlung | SEC Form D | operative US-Firma, mind. $1M eingesammelt | Kapitalrunde (Betrag, Investoren, Datum) |
| S5 Buchhaltung/Lohn | SEC Form D | junge Firma (≤ 3 Jahre), kleiner Umsatz, < $5M | erste Kapitalaufnahme |
| S9 Finanzberater | SEC Form D | namentlich genannte Geschäftsführung, mind. $250k | Geschäftsführer einer frisch finanzierten Firma |

Form D: Fonds, Immobilien-Zweckgesellschaften, Banken und Änderungsmeldungen fallen raus. Mit `distinct` (Standard)
steht jede Form-D-Firma nur in einer Branche (S1 vor S5 vor S9).

## Kosten

Alle Quellen und Prüfungen sind kostenlos (amtliche offene Schnittstellen, DNS, die Websites der Firmen selbst).
Kostenpflichtige Anreicherung (z. B. E-Mail-Finder) ist vorbereitet (`enrich.PAID_ENRICHERS`), aber leer – nur nach Ja
des Inhabers.

## Bedienung

```bash
python scripts/extraktor/run.py --segments S1,S2,S4,S5,S9 --per 100 --out out/extraktor
python scripts/extraktor/run.py --segments S4 --per 20 --fmcsa-days 14 --out /tmp/x     # klein
python scripts/extraktor/store.py out/extraktor/leads_alle.csv            # Probelauf Datenbank
python scripts/extraktor/store.py out/extraktor/leads_alle.csv --apply    # grüne Leads speichern
```

GitHub: Actions → `extraktor` → Run workflow (Branchen, Menge, Tage). Ergebnis als Artefakt `extraktor-leads`.

## Regeln, die gelten

- Nur amtliche/offene Quellen und die Firmenwebsites; keine Plattformen (`lib.fetch.BLOCKED_HOSTS`), robots.txt,
  höchstens 1 Abruf pro Sekunde je Domain, SEC höchstens ~5 Abrufe pro Sekunde mit Absenderkennung.
- Kontaktdaten: alles, was die Quelle zu Firma und Inhaber/Officer veröffentlicht, auch Handy und Freemail
  (Inhaber 01.10.2026).
- Widersprüchliche Daten (PLZ ↔ Bundesstaat, E-Mail-Domain ↔ Website, Sammel-Kontakt) → rot, nie liefern.
- Texte nennen nur Zahlen, die in den Fakten stehen; keine Garantien, kein Druck.
