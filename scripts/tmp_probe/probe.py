"""Temporärer Test (wird vor dem PR entfernt). Gibt keine Lead-Daten aus (nur Datumsverteilungen). Ausgabe als Annotation."""
import collections
import sys
import time
import traceback

import requests

H = {"User-Agent": "signalwerk-probe/1.0 (+https://www.nextgen-profit.de)"}
OUT = []
API = "https://recherche-entreprises.api.gouv.fr/search"


def p(*a):
    OUT.append(" ".join(str(x) for x in a))


def flush():
    text = "\n".join(OUT)
    for i in range(0, min(len(text), 9 * 3800), 3800):
        chunk = text[i:i + 3800].replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        sys.stdout.write(f"::notice title=probe{i // 3800}::{chunk}\n")


try:
    for params in ({"departement": "75", "nature_juridique": "5710"},
                   {"departement": "75", "nature_juridique": "5710", "etat_administratif": "A"},
                   {"code_postal": "69003", "etat_administratif": "A", "sort_by_size": "false"},
                   {"q": "2026", "departement": "75"}):
        dates = []
        tot = None
        for page in (1, 2, 400, 401):
            r = requests.get(API, params={**params, "per_page": 25, "page": page, "minimal": "true"}, headers=H, timeout=60)
            if not r.ok:
                p(params, page, r.status_code, r.text[:200])
                continue
            j = r.json()
            tot = j.get("total_results"), j.get("total_pages")
            dates += [(x.get("date_creation") or "")[:7] for x in j.get("results", [])]
            time.sleep(0.3)
        p(params, "total", tot, "Monate:", collections.Counter(dates).most_common(8))
except Exception:  # noqa: BLE001
    p("FEHLER", traceback.format_exc()[-800:])
flush()
