"""Kleiner Supabase-Zugriff (PostgREST) auf das Schema `signalwerk`.

Umgebungsvariablen:
  SUPABASE_URL                z. B. https://<ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   Service-Schlüssel (nie committen)

Voraussetzung: `signalwerk` ist in Supabase unter
Project Settings -> API -> Exposed schemas eingetragen.
"""
from __future__ import annotations

import os
import time
from typing import Any

import requests

SCHEMA = "signalwerk"
RETRY_STATUS = {429, 502, 503, 504}
READ_ONLY_RPC = {"is_suppressed", "radar_candidates", "premium_status", "bounce_stats", "flow_lead_rows", "flow_buyer_rows", "pool_counts", "pruef_kpi"}
RETRY_WAIT = (2, 5, 15)  # Sekunden; danach gibt der Aufruf den Fehler weiter


def clean(v: Any) -> Any:
    """Nullzeichen (\\u0000) entfernen: Postgres-Text kann sie nicht speichern, ein einziges in einer Firmen-Website
    ließ sonst das ganze Paket scheitern (Kunden-Werk Teil 2/8, 03.10.2026: „unsupported Unicode escape sequence“)."""
    if isinstance(v, str):
        return v.replace("\x00", "") if "\x00" in v else v
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if isinstance(v, list):
        return [clean(x) for x in v]
    return v


def stable_order(order: str | None) -> str | None:
    """Sortierung fürs Blättern eindeutig machen: ohne `id` als letzten Schlüssel können Zeilen mit gleichem Wert
    (z. B. created_at) zwischen zwei Seiten springen – doppelt oder gar nicht geliefert (Prüfung 04.10.2026)."""
    if not order:
        return order
    cols = [c.strip().split(".")[0] for c in order.split(",") if c.strip()]
    return order if "id" in cols else f"{order},id"


class DB:
    def __init__(self, url: str | None = None, key: str | None = None, timeout: int = 60):
        url = url or os.environ.get("SUPABASE_URL")
        key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise SystemExit("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein")
        self.base = url.rstrip("/") + "/rest/v1"
        self.timeout = timeout
        self.s = requests.Session()
        self.s.headers.update({
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept-Profile": SCHEMA,
            "Content-Profile": SCHEMA,
            "Content-Type": "application/json",
        })

    def _send(self, method: str, url: str, *, safe: bool, **kw) -> requests.Response:
        """Kurze Aussetzer der Datenbank (überlastet, Verbindung abgebrochen, Zeitüberschreitung) abfangen statt
        den Lauf zu beenden. Schreibaufrufe (`safe=False`) werden nur wiederholt, wenn die Datenbank sicher nichts
        gespeichert hat (429/503 abgelehnt) – sonst würde ein zweiter Versuch doppelt schreiben."""
        for wait in RETRY_WAIT + (None,):
            try:
                r = self.s.request(method, url, timeout=self.timeout, **kw)
            except (requests.ConnectionError, requests.Timeout):
                if wait is None or not safe:
                    raise
            else:
                retry = RETRY_STATUS if safe else {429, 503}
                if r.status_code not in retry or wait is None:
                    return r
            time.sleep(wait)
        raise AssertionError("unreachable")

    def _check(self, r: requests.Response) -> Any:
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase {r.request.method} {r.url}: {r.status_code} {r.text}")
        return r.json() if r.text else None

    def select(self, table: str, params: dict | None = None) -> list[dict]:
        return self._check(self._send("GET", f"{self.base}/{table}", safe=True, params=params or {}))

    def select_all(self, table: str, params: dict | None = None, page: int = 1000) -> list[dict]:
        """Alle Zeilen (PostgREST liefert standardmäßig höchstens 1000 pro Abfrage)."""
        out, offset = [], 0
        base = {k: v for k, v in (params or {}).items() if k != "limit"}
        base["order"] = stable_order(base.get("order"))
        if base["order"] is None:
            del base["order"]
        while True:
            rows = self.select(table, {**base, "limit": str(page), "offset": str(offset)})
            out += rows
            if len(rows) < page:
                return out
            offset += page

    def insert(self, table: str, rows: list[dict] | dict, *, upsert_on: str | None = None,
               ignore_duplicates: bool = False) -> list[dict]:
        headers = {"Prefer": "return=representation"}
        params = {}
        if upsert_on:
            res = "ignore-duplicates" if ignore_duplicates else "merge-duplicates"
            headers["Prefer"] += f",resolution={res}"
            params["on_conflict"] = upsert_on
        return self._check(self._send("POST", f"{self.base}/{table}", safe=False, json=clean(rows), params=params,
                                      headers=headers))

    def update(self, table: str, match: dict, values: dict) -> list[dict]:
        params = {k: "is.null" if v is None else f"eq.{v}" for k, v in match.items()}
        return self._check(self._send("PATCH", f"{self.base}/{table}", safe=True, params=params, json=clean(values),
                                      headers={"Prefer": "return=representation"}))

    def rpc(self, fn: str, args: dict, params: dict | None = None) -> Any:
        """params: PostgREST-Parameter auf das Ergebnis (order, limit, offset) – zum Blättern über 1000 Zeilen."""
        return self._check(self._send("POST", f"{self.base}/rpc/{fn}", safe=fn in READ_ONLY_RPC, json=clean(args),
                                      params=params or {}))

    def is_suppressed(self, email: str) -> bool:
        return bool(self.rpc("is_suppressed", {"p_email": email}))
