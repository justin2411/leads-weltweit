# Kaltmail-Recht je Land (Inhaber 04.10.2026, nach Anwaltsberatung)

Vorgabe des Inhabers, Verantwortung beim Inhaber. Technisch umgesetzt in `countries.yaml`; es gilt immer die
strengere Regel (Tabelle oder `countries.yaml`). Sperrliste, Notbremse, Abmeldelink und Pflichtfußzeile gelten überall.
Einzelunternehmer bekommen keine automatische Nachfassmail, nur nach eigener Antwort.

| Land | Einzelunternehmer ohne Einwilligung | Firmen ohne Einwilligung | Bedingung | Risiko | Stand bei uns |
|---|---|---|---|---|---|
| USA | Ja | Ja | Opt-out, Postanschrift, Werbekennzeichnung | gering | aktiv |
| Singapur | Ja | Ja | „<ADV>“ im Betreff, Opt-out | gering | noch nicht bearbeitet |
| Hongkong | Ja | Ja | Absenderangabe, Opt-out | gering | noch nicht bearbeitet |
| Brasilien | eher ja | eher ja | berechtigtes Interesse, Opt-out | gering bis mittel | noch nicht bearbeitet |
| Mexiko | eher ja | eher ja | Opt-out, Absenderangaben | gering | noch nicht bearbeitet |
| Frankreich | Ja, berufsbezogen | Ja, berufsbezogen | Bezug zum Beruf, Herkunft der Daten nennen, Opt-out | mittel, eher bei Masse | aktiv |
| Australien | bedingt | bedingt | nur veröffentlichte Adresse, kein Werbeverbot, berufsbezogen | hoch (ACMA aktiv) | **nie** |
| Neuseeland | bedingt | bedingt | wie Australien | mittel | gesperrt |
| Kanada | bedingt | bedingt | wie Australien, sauber dokumentieren | sehr hoch (bis 10 Mio. CAD) | **nie** |
| Japan | bedingt | bedingt | geschäftlich veröffentlicht | mittel | gesperrt |
| Israel | nur einmalige Anfrage | nur einmalige Anfrage | nur Frage, ob Werbung gewünscht | hoch (pro Mail) | **nie** |
| UK | Nein | Ja | Opt-out bei Ltd/PLC/LLP | mittel (ICO) | aktiv, nur Firmen |
| Irland | Nein | Ja | Geschäftsadresse, Opt-out | sehr hoch (Straftat, pro Mail) | **nie** (Risiko sehr hoch) |
| Schweden | Nein | Ja | Opt-out | gering bis mittel | aktiv, nur Firmen |
| Finnland | Nein | Ja | Opt-out | gering bis mittel | noch nicht bearbeitet |
| Belgien | Nein | nur info@-Adressen | unpersönliche Adresse | mittel bis hoch | **nie** (Risiko hoch) |
| Deutschland | Nein | Nein | – | Abmahnung | gesperrt |
| Niederlande | Nein | Nein | – | ACM-Bußgeld | gesperrt (seit 04.10.2026) |
| Österreich | Nein | Nein | – | Verwaltungsstrafe | gesperrt |
| Schweiz | Nein | Nein | gilt für Massenwerbung | mittel | gesperrt |
| Italien | Nein | Nein | – | hoch | **nie** |
| Spanien | Nein | Nein | – | hoch | **nie** |
| Polen | Nein | Nein | – | mittel | gesperrt |
| Dänemark | Nein | Nein | – | mittel | gesperrt |
| Südafrika | Nein | Nein | – | mittel | gesperrt |

**Risiko hoch oder sehr hoch (Inhaber 04.10.2026: „bei sehr hoch oder hoch machen wir bitte nie etwas“):** nie freischalten – IE, BE, AU, CA, IL, IT, ES (in `countries.yaml` `never: true` bzw. gesperrt).

**Neue Länder:** Nur „Ja“-Länder darf der Quellen-Scout nach den zwei Tests (≥ 10 grüne Leads und Käufer im Land,
erlaubte Quelle) mit `allowed: true` freischalten; die Bedingung der Spalte muss technisch umgesetzt sein (z. B. SG
„<ADV>“ im Betreff). „Bedingt“-Länder nur, wenn die Bedingung je Adresse nachweisbar ist und der Inhaber zustimmt.
