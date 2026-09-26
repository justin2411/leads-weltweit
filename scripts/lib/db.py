"""Kleiner Supabase-Zugriff (PostgREST) auf das Schema `signalwerk`.

Umgebungsvariablen:
  SUPABASE_URL                z. B. https://<ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   Service-Schlüssel (nie committen)

Voraussetzung: `signalwerk` ist in Supabase unter
Project Settings -> API -> Exposed schemas eingetragen.
"""
from __future__ import annotations

import os
from typing import Any

import requests

SCHEMA = "signalwerk"


class DB:
    def __init__(self, url: str | None = None, key: str | None = None, timeout: int = 30):
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

    def _check(self, r: requests.Response) -> Any:
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase {r.request.method} {r.url}: {r.status_code} {r.text}")
        return r.json() if r.text else None

    def select(self, table: str, params: dict | None = None) -> list[dict]:
        return self._check(self.s.get(f"{self.base}/{table}", params=params or {}, timeout=self.timeout))

    def select_all(self, table: str, params: dict | None = None, page: int = 1000) -> list[dict]:
        """Alle Zeilen (PostgREST liefert standardmäßig höchstens 1000 pro Abfrage)."""
        out, offset = [], 0
        base = {k: v for k, v in (params or {}).items() if k != "limit"}
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
        return self._check(self.s.post(f"{self.base}/{table}", json=rows, params=params,
                                       headers=headers, timeout=self.timeout))

    def update(self, table: str, match: dict, values: dict) -> list[dict]:
        params = {k: f"eq.{v}" for k, v in match.items()}
        return self._check(self.s.patch(f"{self.base}/{table}", params=params, json=values,
                                        headers={"Prefer": "return=representation"}, timeout=self.timeout))

    def rpc(self, fn: str, args: dict) -> Any:
        return self._check(self.s.post(f"{self.base}/rpc/{fn}", json=args, timeout=self.timeout))

    def is_suppressed(self, email: str) -> bool:
        return bool(self.rpc("is_suppressed", {"p_email": email}))
