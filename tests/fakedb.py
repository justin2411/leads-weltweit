"""Kleine Attrappe für lib.db.DB (PostgREST-Filter eq./neq./in./gte./lte./is.null) für Unit-Tests."""
from __future__ import annotations

import copy
import itertools

_ids = itertools.count(1)


def _match(row: dict, key: str, cond) -> bool:
    if key in ("select", "order", "limit", "offset", "or", "on_conflict") or "->" in key:
        return True
    if not isinstance(cond, str):
        return row.get(key) == cond
    val = row.get(key)
    neg = cond.startswith("not.")
    if neg:
        cond = cond[4:]
    op, _, arg = cond.partition(".")
    if op == "eq":
        ok = str(val).lower() == arg.lower() if isinstance(val, bool) else str(val) == arg
    elif op == "neq":
        ok = str(val) != arg
    elif op == "in":
        ok = str(val) in [x.strip().strip('"') for x in arg.strip("()").split(",")]
    elif op == "gte":
        ok = val is not None and str(val) >= arg
    elif op == "lte":
        ok = val is not None and str(val) <= arg
    elif op == "gt":
        ok = val is not None and str(val) > arg
    elif op == "lt":
        ok = val is not None and str(val) < arg
    elif op == "is":
        ok = val is None if arg == "null" else str(val).lower() == arg
    else:
        raise ValueError(f"FakeDB: Operator {op} unbekannt")
    return not ok if neg else ok


class FakeDB:
    def __init__(self, tables: dict[str, list[dict]] | None = None, suppressed: set[str] | None = None):
        self.tables = {k: [dict(r) for r in v] for k, v in (tables or {}).items()}
        self.suppressed = set(suppressed or ())
        self.rpcs: list[tuple[str, dict]] = []
        self.updates: list[tuple[str, dict, dict]] = []
        self.inserts: list[tuple[str, dict]] = []
        self.rpc_handlers: dict = {}

    def select(self, table: str, params: dict | None = None) -> list[dict]:
        params = dict(params or {})
        pool = params.pop("lead_pool_items.pool_id", None)  # Speicher-Filter (lib/pools.restrict, !inner-Einbettung)
        rows = [r for r in self.tables.get(table, []) if all(_match(r, k, v) for k, v in params.items())]
        if pool is not None:
            inside = {i["lead_id"] for i in self.tables.get("lead_pool_items", []) if _match(i, "pool_id", pool)}
            rows = [r for r in rows if r.get("id") in inside]
        if params and params.get("limit"):
            rows = rows[:int(params["limit"])]
        return copy.deepcopy(rows)

    select_all = select

    def insert(self, table: str, rows, *, upsert_on: str | None = None, ignore_duplicates: bool = False) -> list[dict]:
        out = []
        for r in rows if isinstance(rows, list) else [rows]:
            r = {"id": f"id{next(_ids)}", **r}
            t = self.tables.setdefault(table, [])
            if upsert_on:
                keys = upsert_on.split(",")
                old = next((x for x in t if all(x.get(k) == r.get(k) for k in keys)), None)
                if old is not None:
                    if not ignore_duplicates:
                        old.update(r)
                    continue
            t.append(r)
            self.inserts.append((table, r))
            out.append(copy.deepcopy(r))
        return out

    def update(self, table: str, match: dict, values: dict) -> list[dict]:
        self.updates.append((table, match, values))
        out = []
        for r in self.tables.get(table, []):
            if all(str(r.get(k)) == str(v) for k, v in match.items()):
                r.update(values)
                out.append(copy.deepcopy(r))
        return out

    def rpc(self, fn: str, args: dict, params: dict | None = None):
        self.rpcs.append((fn, args))
        if fn in self.rpc_handlers:  # Tests geben Ergebnisse einzelner Funktionen vor
            return self.rpc_handlers[fn](args, params or {})
        if fn == "is_suppressed":
            e = args["p_email"].lower()
            listed = {r["value"] for r in self.tables.get("suppression", [])}
            return bool({e, e.split("@")[-1]} & (self.suppressed | listed))
        if fn == "suppress_email":
            self.suppressed.add(args["p_email"].lower())
        if fn == "lock_sample_request":  # Sperre je Probe-Anfrage (Proben-Vorrat, 03.10.2026)
            for r in self.tables.get("sample_requests", []):
                if r["id"] == args["p_request"] and r.get("status") == "new" and not r.get("claimed_at"):
                    r["claimed_at"] = "jetzt"
                    return True
            return False
        if fn == "claim_sample_stock":  # kein Vorrat in der einfachen Attrappe
            return []
        return None

    def is_suppressed(self, email: str) -> bool:
        return bool(self.rpc("is_suppressed", {"p_email": email}))

    def rows(self, table: str) -> list[dict]:
        return self.tables.get(table, [])
