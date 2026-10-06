"""Actions-Drossel (Inhaber 06.10.2026: „fahr github actions erstmal runter“).

GitHub hat Actions am 06.10.2026 gesperrt (05.10.: 1.697 Läufe, bis zu ~38 gleichzeitig). Zusage an den Support:
höchstens 5 Läufe gleichzeitig im ganzen Repo, kein Selbst-Neustart, Zeitpläne je Ablauf höchstens stündlich,
schwere Werke höchstens alle 3–6 h, Actions nur noch für CI und leichte Zeitpläne – bis die Werke auf einen
eigenen Server ziehen.

Eine Stelle für alle Skripte (wachhund.py, takt.py, werk_belegung.py, werk_takt.py, werk_plan.py):
  - DISPATCH_ERLAUBT = False: kein Skript startet per workflow_dispatch andere Abläufe oder sich selbst
    (Nachfüller, Werk-Takt, Takt-Absicherung, Nachstarts des Wachhunds). Einzige Ausnahme: ein Startwunsch, den der
    Inhaber im Dashboard selbst geklickt hat (start_requests), und nur, solange im Repo weniger als MAX_LAEUFE Läufe
    aktiv sind.
  - MAX_PLAETZE: höchstens so viele Plätze (Matrix-Teile) plant der Autopilot je Werk-Lauf; die Workflows laufen
    zusätzlich mit max-parallel 1–2 und gemeinsamen concurrency-Gruppen (werke, takt, mails-senden, antworten).
Notbremse, Sperrliste, Abmeldung, Prüfregeln, Drei-Stufen-Freigabe und Versandgrenzen bleiben unberührt.
"""
from __future__ import annotations

DISPATCH_ERLAUBT = False
MAX_LAEUFE = 5
MAX_PLAETZE = 5
GRUND = "Actions gedrosselt (Inhaber 06.10.2026) – kein Selbst-/Fremdstart"
