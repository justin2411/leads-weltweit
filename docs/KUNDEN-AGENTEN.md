# Kunden-Agenten – persönlicher Ansprechpartner ab Pro

Inhaber 04.10.2026: „jeder kunde [bekommt] seinen eigenen agent ab dem mittleren abo (offiziell ansprechpartner) …
bei jedem kauf ein agent erzeugt … der schlau ist und mit dem kunden kommunizieren kann. er soll sehr einfach
verständlich schreiben und die wünsche und ziele und zielgruppe des kunden aufnehmen und ihm anhand dessen
spezialisiert die leads zur verfügung stellen … im dashboard sehen … zwei hauptfokusthemen sind qualität stetig
verbessern und umsatz für den kunden erzielen … wie ein normaler mitarbeiter verhalten, sich eine identität ausdenken
… schnittstelle zwischen der leadpipeline und dem kunden“. CLAUDE.md gilt immer zuerst.

## Wer bekommt einen Agenten

- Abo-Paket `pro` und `custom` mit mindestens so vielen Leads/Woche wie Pro (50). `starter` nicht.
- Erzeugt beim Kauf (Stripe-Webhook `checkout.session.completed`, nur einmal je Abo, idempotent) und nachträglich
  für bestehende passende Abos (`python scripts/customer_agents.py ensure`). Upgrade auf Pro → Agent entsteht,
  Downgrade/Kündigung → Agent `pausiert` (nichts gelöscht).

## Identität (ehrlich)

- Jeder Agent bekommt eine eigene Identität: Vorname + Nachname passend zu Sprache/Land des Kunden (EN: UK/US/IE,
  FR), Rolle „Ihr Ansprechpartner / Your account manager / Votre interlocuteur“, kurzer Steckbrief (Stil, Stärken).
  Auswahl deterministisch aus festen Namenslisten (`scripts/lib/personas.json`, auch von der App gelesen), je Kunde
  ein anderer Name, solange möglich.
- **Immer als KI erkennbar** (EU-KI-Verordnung Art. 50, Ehrlichkeitsregel CLAUDE.md §2): Signatur
  „<Name> · KI-Ansprechpartner(in) bei NextGen Profit“ bzw. „AI account manager“ / „interlocuteur IA“, und in der
  ersten Mail ein einfacher Satz, dass der Ansprechpartner ein KI-Assistent ist und der Inhaber mitliest.
  Fragt der Kunde „sind Sie ein Mensch?“, antwortet der Agent ehrlich. Nie: echte Person vortäuschen, Foto,
  erfundene Lebensläufe/Referenzen.

## Was der Agent tut

1. **Begrüßung** (gleich nach dem Kauf, in der Willkommensmail bzw. direkt danach, via Resend – Einwilligung liegt
   vor): stellt sich vor und stellt in sehr einfacher Sprache 4 Fragen: Welche Kunden suchen Sie (Branche, Größe)?
   Welche Leistungen verkaufen Sie? Was ist Ihr Ziel in den nächsten 3 Monaten (z. B. Anzahl Neukunden)?
   Welche Signale sind für Sie am wichtigsten? Antwort per Mail genügt; das bestehende Formular `/kunde` bleibt.
2. **Ziele aufnehmen**: Antworten des Kunden (Mail an die Absenderadresse; `antworten.yml` liest die Postfächer und
   erkennt Kunden an `customers.email`) landen in `customer_agent_messages` (in) und als Auftrag in `agent_tasks`
   (kind `kunde`, created_by `Kunden-Agent`). Die stündliche JARVIS-Routine (Claude-Abo, keine API-Kosten)
   bearbeitet ihn: Ziele/Zielgruppe/Wünsche in `customer_agents.profile` schreiben, daraus die Lieferfilter
   (`subscriptions.filters`) ableiten – nur innerhalb des gebuchten Landes/Pakets –, Antwort schreiben.
3. **Spezialisierte Leads**: Wochenlieferung (`scripts/deliveries.py`) nutzt die Filter und Prioritäten aus dem
   Profil (Signale, Branchen, Größe, Regionen auf Wunsch) und bekommt eine kurze persönliche Notiz des Agenten
   („Diese Woche habe ich vor allem … ausgewählt, weil Sie …“). Drei-Stufen-Freigabe und „jeder Lead höchstens
   einmal pro Abo“ gelten unverändert; die erste Lieferung jedes Kunden geht weiter zuerst an den Inhaber.
4. **Ziele: Qualität und Umsatz des Kunden**: fragt nach der 2. und 4. Lieferung kurz nach (passt / passt nicht,
   ein Abschluss?), schreibt das als Kennzahlen ins Profil (`kpis`: Rückmeldungen, gute Leads, Abschlüsse) und
   verbessert die Auswahl. Höchstens 1 eigene Mail pro Woche zusätzlich zur Lieferung, nie Druck.

## Schreibregeln

Sehr einfache Sprache: kurze Sätze, keine Fachwörter, 40–120 Wörter, eine Frage pro Mail wo möglich, Sprache des
Kunden (FR Französisch, sonst Englisch). Nie: Preise/Rabatte/Verträge zusagen, Garantien, erfundene Zahlen,
Druck. Preis-, Vertrags-, Kündigungs- oder Beschwerdefragen → freundlich bestätigen und an den Inhaber melden
(Mail + Push wie Kaufinteresse), Inhaber antwortet. Abmeldung von Agenten-Mails respektieren
(`customer_agents.mail_opt_out`); Lieferungen laufen weiter.

## Daten

- `signalwerk.customer_agents`: id, customer_id, subscription_id (unique), status (`onboarding`, `aktiv`,
  `pausiert`), persona jsonb {first_name, last_name, role, lang, bio, tone}, profile jsonb {zielgruppe, leistungen,
  ziele, signale, regionen, notizen}, kpis jsonb, mail_opt_out bool, last_contact_at, next_checkin_at,
  created_at, updated_at.
- `signalwerk.customer_agent_messages`: id, agent_id, created_at, direction (`in`, `out`, `notiz`), channel
  (`mail`, `dashboard`), subject, body, status (`entwurf`, `gesendet`, `fehler`, `empfangen`), message_id,
  in_reply_to.
- `agent_tasks.kind` um `kunde` erweitert.

## Dashboard

`/dashboard/kunden-agenten`: Karten je Agent (Name, Kunde, Status, Ziele in Stichworten, letzte Nachricht,
Kennzahlen Qualität/Umsatz des Kunden), Detail mit Verlauf, Profil und Knopf „Nachricht an Agent“ (Inhaber gibt
Hinweise, z. B. „mehr Handwerker“), Pausieren. Link aus JARVIS (Agenten-Leiste) und Kunden-Seite.

## Tarifseite

Paket Pro (und individuell ab 50/Woche): Zeile „Persönlicher Ansprechpartner (KI)“ / „Personal AI account manager“
/ „Interlocuteur dédié (IA)“ mit Kurztext „lernt Ihre Ziele und wählt Ihre Leads gezielt aus“.
