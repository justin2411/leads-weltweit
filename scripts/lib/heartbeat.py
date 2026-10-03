"""Lebenszeichen laufender Werke für das Dashboard (Inhaber 03.10.2026: „sodass ich sehe wenn sie aktiv sind“).

Ein Hintergrund-Faden schreibt alle INTERVAL Sekunden eine Zeile je Werk und Teil in signalwerk.werk_heartbeat
(beat_at, bisherige Zähler). Das Dashboard zeigt „läuft“, solange das letzte Lebenszeichen jünger als ~5 min ist.
Fehler beim Schreiben halten ein Werk nie an.

    with Heartbeat(db, "lead-werk", "web-us-3") as hb:
        ...
        hb.update(processed=120, green=14)
"""
from __future__ import annotations

import datetime as dt
import os
import threading

INTERVAL = 120


class Heartbeat:
    def __init__(self, db, werk: str, part: str | None = None, interval: int = INTERVAL):
        self.db, self.werk = db, werk
        self.part = (part or os.environ.get("RUN_PART") or "main")[:120]
        self.interval = interval
        self.counts = {"processed": 0, "green": 0}
        self.note = None
        self.started = dt.datetime.now(dt.timezone.utc).isoformat()
        self._stop = threading.Event()
        self._t: threading.Thread | None = None

    def update(self, **kw) -> None:
        for k, v in kw.items():
            if k == "note":
                self.note = str(v)[:200]
            elif k in self.counts:
                self.counts[k] = int(v)

    def beat(self, note: str | None = None) -> None:
        if self.db is None:
            return
        try:
            self.db.insert("werk_heartbeat", {"werk": self.werk, "part": self.part, "run_id": os.environ.get("GITHUB_RUN_ID"),
                                              "started_at": self.started,
                                              "beat_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                                              **self.counts, "note": note or self.note}, upsert_on="werk,part")
        except Exception:  # noqa: BLE001 - Lebenszeichen dürfen nie ein Werk anhalten
            pass

    def _loop(self) -> None:
        while not self._stop.wait(self.interval):
            self.beat()

    def __enter__(self):
        self.beat("gestartet")
        self._t = threading.Thread(target=self._loop, daemon=True)
        self._t.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self.beat("fertig" if exc[0] is None else f"abgebrochen: {getattr(exc[0], '__name__', exc[0])}")
        return False
