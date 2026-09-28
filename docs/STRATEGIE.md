# Strategie: NextGen Profit (Signalwerk)

Stand: 28.09.2026. Diese Datei beschreibt, **was wir verkaufen, an wen, wie wir gewinnen wollen und woran wir es messen**.
Regeln und Grenzen stehen in [`CLAUDE.md`](../CLAUDE.md), Entscheidungen mit Datum in [`ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md),
der Ablauf in [`WORKFLOW.md`](WORKFLOW.md).

## 1. Das Geschäft in einem Satz

Wir liefern Dienstleistern jeden Montag eine Liste von Firmen **aus ihrem Land**, bei denen gerade ein Ereignis einen
Kaufanlass schafft (Neugründung, Stelle seit 30+ Tagen offen, Wachstum, fehlende Website), mit Quelle, Datum,
Dringlichkeit, Kontaktdaten der Firma, Geschäftsführer aus dem Register und einem Einstiegssatz, als Abo.

- **Marke:** NextGen Profit (nextgen-profit.de). Interner Projektname: Signalwerk.
- **Nordstern:** neuer wiederkehrender Monatsumsatz (MRR) pro Woche, bei Kosten nahe null.
- **Richtwert:** 150–400 € pro Kunde und Monat; per Regler auch deutlich mehr (bis 10.000 Leads pro Woche).

## 2. Warum das funktioniert

1. **Anlass statt Adresse:** Eine Liste ohne Grund ist wertlos. Ein Lead mit belegtem Ereignis und Datum gibt dem
   Käufer den Grund für den Anruf, und den ersten Satz dazu.
2. **Öffentliche, belegbare Quellen:** Register (Companies House, US-Handelsregister der Bundesstaaten, RNE/BODACC,
   Handelsregister), amtliche Bekanntmachungen, Karriereseiten und Websites der Firmen. Jede Angabe hat Quelle und Datum.
3. **Exklusivität:** Jeder Lead geht pro Branche an höchstens einen Kunden. Das ist das stärkste Verkaufsargument
   gegenüber Datenbanken.
4. **Keine Software:** PDF-Briefing und Tabelle per Mail. Kein Login, keine Einarbeitung.

## 3. Zielgruppen (Käufer)

| Nr. | Käufer | Stärkstes Signal | Status |
|---|---|---|---|
| S1 | Personalvermittlung / Zeitarbeit | Stelle 30+ Tage offen, neu ausgeschrieben, 3+ Stellen | testing |
| S2 | Webagenturen | Neugründung ohne Website, veraltete / nicht mobile Website | testing |
| S3 | IT-Dienstleister / MSP | Wachstum, IT-Stellen, neuer Standort | testing (Seiten fehlen noch) |
| S4 | Gewerbliche Versicherungsmakler | Neugründung, Expansion, Fuhrpark, Lager | testing |
| S5 | Buchhaltung / Lohn | Neugründung (erste Fristen), Buchhaltungsstellen | testing |
| S9 | Finanz- und Vermögensberater | neuer Geschäftsführer = neuer Privatkunde | testing |
| S6, S7, S10–S12 | Büro/Coworking, Reinigung, Werbetechnik, Kanzleien, Marketing | – | idea |
| S8 | Deutschland | nur Anruflisten und Briefe, **keine Kaltmails** | idea |

Landingpages sind live für S1, S2, S4, S5, S9 in **UK, US, FR** (15 Seiten, jeweils mit eigenem Branchenfilm).

## 4. Märkte

- **Kaltmail erlaubt** (countries.yaml): US, UK, IE, NL, SE, BE, FR. Tageslimits je Land.
- **Nie Kaltmail:** DE, AT, CH, IT, ES, PL, DK.
- **Landesweit statt regional** (Entscheidung 27.09.): Angebot, Probe und Lieferung decken das ganze Land ab; Kunden
  können auf Wunsch Regionen im Formular eingrenzen.
- Ein Käufer bekommt **nur Leads aus seinem eigenen Land**.

## 5. Preise und Pakete

| Paket | UK | US | FR | Umfang |
|---|---|---|---|---|
| Starter | £129 / Monat | $159 / Monat | 149 € / Monat | bis 30 Leads pro Woche |
| Pro | £249 / Monat | $299 / Monat | 289 € / Monat | bis 100 Leads pro Woche, alle Signale |
| Individuell | per Regler | per Regler | per Regler | 150–10.000 Leads pro Woche |

- Individueller Preis = Pro-Preis × (Wochenmenge / 100)^0,75, auf ganze Einheiten gerundet (`app/lib/custom-price.ts`).
  Je mehr Leads, desto günstiger pro Lead. Der Server rechnet selbst und vertraut keinem Preis aus dem Browser.
- Zahlung per Stripe-Abo (live), monatlich. Preise darf das Gehirn testen (Entscheidung 26.09.); bestehende Abos
  behalten ihren Preis.

## 6. Der Verkaufstrichter

```
Kaltmail (Strato, 150/Tag) → persönliche Landingpage (Video, Beispiele) → kostenlose Probe (10 Leads)
  → Nachfrage nach 3 Tagen → Preisseite / Stripe → Danke-Seite + Wunsch-Formular → Willkommensmail
  → erste Lieferung (Vorschau an den Inhaber) → jeden Montag Lieferung
```

Details und Zeiten: [`WORKFLOW.md`](WORKFLOW.md).

## 7. Wo wir stehen (ehrlich, 28.09.2026)

| Kennzahl | Wert |
|---|---|
| Kaltmails gesendet | 140 (26.–27.09.), 45 freigegeben in der Warteschlange; **Versand seit 28.09. auf Wunsch des Inhabers gestoppt** |
| Bounce-Quote (30 Tage) | 3,6 % (5 / 140), 0 Spam-Beschwerden |
| Echte Antworten | 0 (1 Abwesenheitsnotiz) |
| Probe-Anfragen über Website | 1 (Forward Role Recruitment, UK, S1), noch nicht beliefert |
| Zahlende Kunden | **0** (1 Stripe-Testkauf) |
| Lieferfähige Proben | **0 von 15 Seiten**: kein Segment hat 10 vollständige Leads |
| Käufer-Vorrat (geprüfte Firmen) | ca. 530 (UK 388, US 83, FR 63) |

**Engpass Nr. 1 ist die Lieferfähigkeit**, nicht der Versand: Die Vollständigkeitsregel (Telefon + E-Mail +
Geschäftsführer + Website + Adresse) erfüllt heute kein Lead. Die Lead-Suche wird am 28.09. mit dem Inhaber neu aufgebaut.

## 8. Prioritäten (nächste 2 Wochen)

1. **Lead-Suche neu aufbauen**, sodass jede Live-Seite 10 vollständige Leads liefern kann. Entscheidung zur
   Vollständigkeitsregel treffen (E-Mail/Name optional, wenn Website/Adresse/Telefon geprüft?).
   Companies-House-Schlüssel eintragen (kostenlos).
2. **Jede Anfrage bedienen:** Probe innerhalb einer Stunde, Kaufinteresse innerhalb eines Tages.
3. **Zuverlässiger Betrieb:** Tagescheck (täglich) und Wachhund (alle 30 min) grün halten.
4. **Nach dem Kauf:** Mails bei fehlgeschlagener Zahlung und Kündigung, Erinnerung an das Wunsch-Formular,
   erste Lieferung ohne GitHub-Klick freigeben.
5. **Messen:** Auswertung auf „gesendet minus Bounces“ umstellen (Strato liefert kein „zugestellt“).

## 9. Test- und Entscheidungsregeln

Aus CLAUDE.md Abschnitt 5, gemessen 14 Tage nach der letzten Mail eines Experiments:
- **Stoppen:** unter 2 % positive Antworten nach 50 zugestellten Mails, oder Spam-Beschwerden über 0,3 %.
- **Neue Botschaft:** 2–5 % positiv, aber keine Proben → einmal Betreff und Einstieg ändern.
- **Ausbauen:** über 5 % positiv oder mindestens ein zahlender Kunde.
- Probe-Anfragen und Käufe über die Landingpage zählen als positive Antworten.
- Immer nur eine Sache pro Experiment ändern.

## 10. Danach (Phasen)

- **Phase 2 (ab ca. Woche 3):** Gewinner-Segmente mit mehr Volumen, weitere erlaubte Länder (IE, NL), S3-Seiten,
  neue Segmente aus dem Katalog (Kanzleien, Marketing, Reinigung).
- **Phase 3 (ab Monat 2):** Selbstbedienung ausbauen (Filter, Upgrade), Empfehlungen zufriedener Kunden,
  Deutschland über Anruflisten und Briefe.

## 11. Risiken

| Risiko | Gegenmittel |
|---|---|
| Zustellbarkeit (Bounces, Spam) | Notbremse (Bounces > 5 % ab 100 Mails, 1 Beschwerde = Stopp), nur geprüfte Adressen, Sperrliste |
| Rechtsfragen (DSGVO Art. 14 bei Geschäftsführer-Namen, UK PECR) | Inhaber entscheidet, offene Fragen in ENTSCHEIDUNGEN.md |
| Unvollständige Leads | nie unvollständig liefern, lieber ehrlich „noch nicht lieferbar“ |
| Ausfallende Automatik | Wachhund + Tagescheck + Mail an den Inhaber |
