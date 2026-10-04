# Plan Skalierung: Daten-Archiv und Versand im großen Stil

Inhaber 05.10.2026, ~01:20: „Lass uns das für morgen merken … wir werden uns riesige Mengen an Daten holen und diese bei bestimmten Triggern (Momenten) als Premium-Leads verkaufen.“ und „Können wir noch das E-Mail-Problem zuverlässig lösen, damit wir ohne Probleme auch mehrere tausend Mails am Tag verschicken können?“

Stand: **Plan, noch nichts gekauft oder umgestellt.** Alles, was Geld kostet, startet erst nach dem Ja des Inhabers (CLAUDE.md §2).

## 1. Daten-Archiv: alles sammeln, im richtigen Moment verkaufen

**Idee:** Wir holen uns die kompletten offenen Datensätze (alle Firmen) und speichern sie günstig. Werke beobachten den Bestand. Sobald bei einer Firma ein Anlass eintritt (neue Website, Umzug, Gründung, Wachstum, Stellen), wird sie zum Premium-Lead – frisch, mit Beleg und Datum.

| Speicher | Inhalt | Kosten (ca./Monat) |
|---|---|---|
| Supabase (bleibt) | heiße Daten: Premium-Leads, Käufer, Kunden, Mails | 25 $ (Pro, 8 GB inklusive) |
| **Cloudflare R2 (neu, Archiv)** | alle Firmen aller Quellen als komprimierte Parquet-Dateien, Werke lesen direkt (DuckDB) | 10 GB gratis, dann 0,015 $/GB → 100 GB ≈ 1,50 $, 1 TB ≈ 15 $, Abrufen kostenlos |
| Alternative Backblaze B2 | wie R2 | 1 TB ≈ 6 $, Abrufen kostet extra |

- Größenordnung: Parquet braucht etwa 1/10 des Platzes in Postgres; 1 TB reicht für mehrere hundert Millionen Firmen.
- Quellen in großen Datei-Downloads (kein Abruf Seite für Seite): Overture, OpenStreetMap, Companies House, SIRENE (nur erlaubte Wege), SEC, FMCSA. robots.txt und Quellen-Regeln gelten weiter.
- **Datenschutz:** Firmendaten auf Vorrat sind unproblematisch. Personen aus EU/UK (Einzelunternehmer, Inhaber) erst beim konkreten Anlass anreichern, nicht auf Vorrat (Zweckbindung, Speicherbegrenzung). US unproblematisch.
- **GitHub Enterprise:** 500 Werke gleichzeitig statt 40 (ca. 21 $ je Nutzer/Monat). Lohnt sich, sobald das Archiv steht und die 40 Plätze ständig voll sind.

**Schritte (nach Ja):**
1. Inhaber legt ein kostenloses Cloudflare-Konto an, Claude trägt den R2-Schlüssel als Secret ein (`docs/EINRICHTUNG.md`).
2. Archiv-Werk: Datensätze laden → Parquet → R2, monatlich aktualisieren.
3. Anlass-Werk: Archiv gegen neue Ereignisse abgleichen → Premium-Leads in Supabase.
4. Danach Enterprise prüfen (Engpass in JARVIS).

## 2. Versand: mehrere tausend Mails pro Tag zuverlässig

**Heute:** Strato-SMTP auf der Hauptdomain nextgen-profit.de, 2 Postfächer, je max. 150/Tag, Tagesziel 90–150. Rückläufer zuletzt ~4–6 % (Notbremse ab 5 %).

**Warum das nicht auf tausende skaliert:** Eine einzelne Domain und wenige Postfächer verlieren bei großen Mengen den Ruf. Alle Mails landen im Spam, und die Hauptdomain (Website, Kundenmails) leidet mit.

| Baustein | Was | Kosten (ca.) |
|---|---|---|
| **Adressen vorher prüfen** | Syntax, MX, Wegwerf-/Rollen-Adressen, Catch-all erkennen, Rückläufer-Historie; nur sichere Adressen senden | kostenlos (eigener Code); optional Prüfdienst ~1–5 $ je 1.000 |
| **Zweit-Domains** | 5–10 eigene Versand-Domains (z. B. nextgen-profit.com/-leads.de), Hauptdomain geschützt | ~1–2 € je Domain/Monat |
| **Mehr Postfächer** | 3 Postfächer je Domain, je 30–50 Mails/Tag → 10 Domains × 3 × 40 ≈ 1.200/Tag | ~1–6 € je Postfach/Monat |
| **Aufwärmen** | jedes neue Postfach 2–3 Wochen langsam steigern | kostenlos (haben wir schon) |
| **DNS je Domain** | SPF, DKIM, DMARC, eigene Tracking-freie Links | kostenlos |
| Optional Versand-Werkzeug | Rotation über Postfächer, Warmup (z. B. Instantly/Smartlead) | ~40–100 $/Monat |

- Mehrere tausend Mails am Tag ≈ 30–60 Postfächer auf 10–20 Domains, also etwa **50–250 €/Monat**.
- Resend bleibt für Kaltmails verboten. Die Kaltmail-Regeln (Länder, Sperrliste, Abmeldung, Notbremse, Prüfungen) bleiben unverändert und gelten je Domain und Postfach.
- Entscheidung Inhaber 26.09.2026 „keine Zweitdomain“ müsste dafür geändert werden.
- Grenze nach oben: Es gibt nur so viele mail-fähige Käufer (`check_status = ok`) in erlaubten Ländern. Das Kunden-Werk muss mitwachsen.

**Sofort und kostenlos (ohne Freigabe):** Adressprüfung vor jedem Versand schärfen, damit Rückläufer unter 2 % fallen.

**Braucht Inhaber-Ja:** Zweit-Domains + Postfächer kaufen (Betrag oben), Regel „keine Zweitdomain“ aufheben.

## 3. Technik bereit (05.10.2026)

Inhaber 05.10.2026: „es ist unser Unternehmen Kaltmails zu schicken. Wie können wir es schaffen, möglichst viele zu schicken, wenn das Produkt läuft“. **Nichts eingeschaltet, keine Grenze erhöht, nichts gekauft.**

| Baustein | Stand |
|---|---|
| Beliebig viele Postfächer | Secret `SMTP_BOXES` (JSON-Liste), ohne Code- oder Workflow-Änderung |
| Domain je Postfach | aus der Absenderadresse; Hauptdomain nextgen-profit.de sendet wie heute |
| Freischaltung | neue Domain sendet erst nach grünem `postfach-test` (DNS + Anmeldung + DKIM-Testmail) |
| Tagesmenge je Postfach | eigene Kurve `start`/`schritt`/`limit`, nie über `postfach_tageslimit` |
| Rotation | gleichmäßig nach Anteil der Tagesmenge über alle Postfächer |
| Notbremse | global unverändert; zusätzlich je Postfach und je Domain (über 5 % ab 100 Mails, jede Beschwerde stoppt die Domain sofort) |
| Anzeige | Dashboard Betrieb und Tagescheck: gesendet, Bounces, Beschwerden je Domain |

### Neue Domain in 5 Schritten

1. **Kaufen** (Inhaber, kostet Geld): Domain + Postfächer beim Anbieter, z. B. 3 Postfächer je Domain.
2. **DNS setzen** beim Anbieter: MX, ein SPF-Eintrag, DKIM, DMARC (`v=DMARC1; p=none` reicht für den Start). Prüfen: `python scripts/dns_check.py neue-domain.de`.
3. **Secret `SMTP_BOXES`** in GitHub ergänzen, je Postfach eine Zeile:
   `{"user": "anna@neue-domain.de", "password": "…", "host": "smtp.anbieter.de", "imap_host": "imap.anbieter.de", "start": 20, "schritt": 5, "limit": 40}`
4. **`postfach-test` starten** (GitHub Actions). Grün = Postfach ist freigeschaltet, rot = sendet nicht.
5. **Fertig.** Der Versand nimmt das Postfach beim nächsten Lauf auf und fährt es langsam hoch. Beobachten im Dashboard „Betrieb“ unter Postfächer/Domain.
