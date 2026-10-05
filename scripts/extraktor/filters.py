"""Sicherheitsfilter vor der (teureren) Anreicherung – billig, früh, streng.

  - Behörden, Schulen, Kirchen, Vereine: keine Käuferziele (keine kleinen Unternehmen)
  - Testeinträge, Platzhalter
  - Sammel-Kontakte: dieselbe E-Mail/Telefonnummer bei vielen Firmen = Anmelde-Dienstleister, nicht die Firma
  - Dubletten im Lauf (gleiche Quelle-ID, gleicher Name+Bundesstaat)
  - Sperrliste (signalwerk.is_suppressed) und schon vorhandene Leads, wenn eine Datenbank angebunden ist
"""
from __future__ import annotations

import re
from collections import Counter

from lib import websites as W
from lib.laender import active

PUBLIC = re.compile(r"\b(county of|city of|town of|village of|state of|department|dept\.? of|school district|"
                    r"public schools?|university|college|church|ministr(y|ies)|parish|diocese|fire (district|"
                    r"department)|police|sheriff|municipal|authority|board of|u\.?s\.? government|federal|"
                    r"association|foundation|non-?profit)\b", re.I)
JUNK = re.compile(r"\b(test|testing|sample|dummy|n/?a|unknown|none)\b", re.I)


def shared_contacts(candidates: list[dict], extra: list[dict] | None = None) -> Counter:
    """Wie viele verschiedene Firmen nutzen dieselbe E-Mail/Telefonnummer? (Schlüssel ('email'|'phone', Wert))
    extra: zusätzliche FMCSA-Rohzeilen (dot_number, phone, cell_phone, email_address) eines längeren Zeitraums."""
    from extraktor.qc import check_phone
    seen: dict[tuple, set] = {}
    for r in extra or []:
        sid = str(r.get("dot_number") or "")
        if r.get("email_address"):
            seen.setdefault(("email", r["email_address"].strip().lower()), set()).add(sid)
        for raw in (r.get("phone"), r.get("cell_phone")):
            e164 = check_phone(raw, r.get("phy_state") or "")["e164"] if raw else None
            if e164:
                seen.setdefault(("phone", e164), set()).add(sid)
    for c in candidates:
        if c.get("email"):
            seen.setdefault(("email", c["email"].lower()), set()).add(c["source_id"])
        for raw in (c.get("phone"), c.get("phone_alt")):
            if raw:
                e164 = check_phone(raw, c.get("state"), c.get("country") or "US")["e164"]
                if e164:
                    seen.setdefault(("phone", e164), set()).add(c["source_id"])
    return Counter({k: len(v) for k, v in seen.items()})


# Länder mit Lead-Quellen; FI/SG/HK/MX/BR neu (Inhaber 04.10.2026, docs/KALTMAIL-RECHT.md)
# HK raus (Inhaber 05.10.2026): zentrale Liste lib/laender.INACTIVE
TARGET_COUNTRIES = active(("US", "UK", "FR", "IE", "NL", "BE", "SE", "FI", "SG", "HK", "MX", "BR"))


def pre_filter(c: dict) -> str | None:
    """Grund zum Aussortieren oder None."""
    if PUBLIC.search(c["name"]) or PUBLIC.search(c.get("legal_name") or ""):
        return "public_or_nonprofit"
    if JUNK.search(c["name"]):
        return "placeholder_name"
    if c.get("country") not in TARGET_COUNTRIES or (c.get("country") == "US" and not c.get("state")):
        return "outside_target_country"
    return None


def dedupe(candidates: list[dict]) -> list[dict]:
    out, ids, names = [], set(), set()
    for c in candidates:
        key = (W.norm(c["name"]), c.get("state"))
        if c["source_id"] in ids or key in names:
            continue
        ids.add(c["source_id"])
        names.add(key)
        out.append(c)
    return out


class Guard:
    """Sperrliste und vorhandene Leads aus der Datenbank (optional: ohne DB nur Hinweis im Ergebnis)."""

    def __init__(self, db=None, preload: tuple[str, ...] = ("overture",)):
        self.db = db
        self.known: set[tuple[str, str]] = set()
        if db is not None:
            self.known = self._load(db, preload)

    @staticmethod
    def _load(db, sources, page: int = 1000) -> set[tuple[str, str]]:
        """Vorab-Liste nur für Quellen, die schon beim Laden aussortieren (Overture): seitenweise über den Index
        (registry_source, registry_id) statt Offset, in 16 Bereichen parallel (Overture-IDs sind UUIDs). Fällt die
        Datenbank aus (57014 unter Last, Lauf 10 am 02.10.2026 brach daran in allen Teilen ab), geht es mit dem
        Teilstand weiter: drop_known gleicht gezielt ab."""
        import time
        from concurrent.futures import ThreadPoolExecutor
        cuts = [""] + list("123456789abcdef") + [None]

        def part(src: str, lo: str, hi: str | None, table: str = "watch_companies", col_src: str = "registry_source",
                 col_id: str = "registry_id") -> list[str]:
            got, last = [], lo  # gt."" auch am Anfang: sonst nutzt Postgres den Teil-Index nicht (1,5 s statt 1 ms)
            while True:
                cond = f'{col_id}.gt."{last}"' + (f',{col_id}.lt."{hi}"' if hi else "")
                q = {"select": col_id, col_src: f"eq.{src}", "and": f"({cond})", "order": col_id, "limit": str(page)}
                rows = None
                for attempt in range(4):
                    try:
                        rows = db.select(table, q)
                        break
                    except RuntimeError as exc:
                        print(f"Vorab-Liste {src}>{last[:8]}: Versuch {attempt + 1} fehlgeschlagen "
                              f"({str(exc)[-120:]})", flush=True)
                        time.sleep(3 * (attempt + 1))
                if rows is None:
                    print(f"Vorab-Liste {src}>{last[:8]}: abgebrochen, Abgleich läuft gezielt weiter", flush=True)
                    return got
                got += [r[col_id] for r in rows]
                if len(rows) < page:
                    return got
                last = rows[-1][col_id]

        known: set[tuple[str, str]] = set()
        with ThreadPoolExecutor(8) as ex:
            for src in sources:
                for ids in ex.map(lambda i: part(src, cuts[i], cuts[i + 1]), range(len(cuts) - 1)):
                    known.update((src, x) for x in ids)
        # kompakter Rohbestand (raw_candidates, seit 04.10.2026): genauso, über den Schlüssel (source, source_id)
        with ThreadPoolExecutor(8) as ex:
            for src in sources:
                for ids in ex.map(lambda i: part(src, cuts[i], cuts[i + 1], "raw_candidates", "source", "source_id"),
                                  range(len(cuts) - 1)):
                    known.update((src, x) for x in ids)
        return known

    def drop_known(self, cands: list[dict], batch: int = 150) -> list[dict]:
        """Schon gespeicherte Firmen gezielt nachschlagen (Index registry_source, registry_id), in kleinen Paketen.
        Die Gesamtliste in __init__ ist bei großen Tabellen unvollständig (02.10.2026: 180.286 von 290.043 geladen),
        das Lead-Werk bearbeitete deshalb gespeicherte Firmen erneut (FR: 2.298 bearbeitet, 0 neu)."""
        import time
        if self.db is None:
            return cands
        todo: dict[str, list[str]] = {}
        for c in cands:
            if (c["source"], c["source_id"]) not in self.known:
                todo.setdefault(c["source"], []).append(str(c["source_id"]))
        for src, ids in todo.items():
            for i in range(0, len(ids), batch):
                part = [x.replace('"', "") for x in ids[i:i + batch]]
                q = {"select": "registry_id", "registry_source": f"eq.{src}",
                     "registry_id": "in.(" + ",".join(f'"{x}"' for x in part) + ")"}
                for attempt in range(5):
                    try:
                        rows = self.db.select("watch_companies", q)
                        break
                    except RuntimeError as exc:  # Zeitüberschreitung unter Last: kurz warten, nochmal
                        if "57014" not in str(exc) or attempt == 4:
                            raise
                        time.sleep(3 * (attempt + 1))
                self.known.update((src, r["registry_id"]) for r in rows)
                # Rohbestand liegt seit 04.10.2026 kompakt in raw_candidates (nicht mehr als Firma): auch dort
                # nachschlagen, sonst würde derselbe unvollständige Kandidat jeden Lauf erneut angereichert
                left = [x for x in part if (src, x) not in self.known]
                if left:
                    try:
                        raw = self.db.select("raw_candidates", {"select": "source_id", "source": f"eq.{src}",
                                                                "source_id": "in.(" + ",".join(f'"{x}"' for x in left) + ")"})
                        self.known.update((src, r["source_id"]) for r in raw)
                    except RuntimeError:
                        pass  # Tabelle fehlt oder Zeitüberschreitung: höchstens doppelte Prüfung, nie doppelte Firma
        return [c for c in cands if (c["source"], c["source_id"]) not in self.known]

    def problem(self, c: dict) -> str | None:
        if self.db is None:
            return None
        if (c["source"], c["source_id"]) in self.known and not c.get("zweitlead"):
            return "already_in_database"
        if c.get("email") and self.db.rpc("is_suppressed", {"p_email": c["email"]}):
            return "suppressed"
        return None
