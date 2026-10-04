"""Temporärer Test (wird vor dem PR entfernt). Gibt keine Lead-Daten aus. Ausgabe als Annotation."""
import sys
import traceback

import requests

H = {"User-Agent": "signalwerk-probe/1.0 (+https://www.nextgen-profit.de)"}
OUT = []
T = "https://tabular-api.data.gouv.fr/api/resources/"


def p(*a):
    OUT.append(" ".join(str(x) for x in a))


def flush():
    text = "\n".join(OUT)
    for i in range(0, min(len(text), 9 * 3800), 3800):
        chunk = text[i:i + 3800].replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        sys.stdout.write(f"::notice title=probe{i // 3800}::{chunk}\n")


try:
    seen = set()
    for q in ["bodacc annonces commerciales", "annonces-commerciales", "bodacc", "sirene unite legale",
              "base sirene", "creations entreprises sirene", "immatriculations rcs"]:
        for page in (1, 2):
            r = requests.get("https://www.data.gouv.fr/api/1/datasets/", params={"q": q, "page_size": 20, "page": page},
                             headers=H, timeout=60)
            for d in r.json().get("data", []):
                if d["id"] in seen:
                    continue
                seen.add(d["id"])
                for res in d.get("resources", []):
                    fmt = (res.get("format") or "").lower()
                    if fmt not in ("csv", "xlsx", "xls", "parquet", "json", "csv.gz"):
                        continue
                    rid = res["id"]
                    pr = requests.get(T + rid + "/data/", params={"page_size": 1}, headers=H, timeout=30)
                    if pr.ok:
                        j = pr.json()
                        p("TAB", q[:12], "|", d["title"][:60], "|", (d.get("organization") or {}).get("name"), "|",
                          (res.get("title") or "")[:50], "|", rid, "| total", (j.get("meta") or {}).get("total"),
                          "| cols", list((j.get("data") or [{}])[0].keys())[:25], "| upd", d.get("last_update", "")[:10])
except Exception:  # noqa: BLE001
    p("FEHLER", traceback.format_exc()[-800:])
p("ENDE", len(seen), "Datensätze geprüft")
flush()
