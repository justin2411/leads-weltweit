"""Temporärer Test (wird vor dem PR entfernt): robots.txt und Verzeichnisse der Ersatzquellen. Gibt keine Lead-Daten aus.
Ausgabe als Annotation (Logs sind über die API nicht lesbar)."""
import re
import sys

import requests

H = {"User-Agent": "signalwerk-probe/1.0 (+https://www.nextgen-profit.de)"}
OUT = []


def p(*a):
    OUT.append(" ".join(str(x) for x in a))


def show(u, n=3000):
    try:
        r = requests.get(u, headers=H, timeout=60)
        p(f"=== {u} -> {r.status_code} {r.headers.get('content-type')}")
        p(r.text[:n])
        return r
    except Exception as e:  # noqa: BLE001
        p(f"=== {u} -> FEHLER {e}")


def flush():
    text = "\n".join(OUT)
    for i in range(0, min(len(text), 9 * 20000), 20000):
        chunk = text[i:i + 20000].replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        sys.stdout.write(f"::notice title=probe{i // 20000}::{chunk}\n")


try:
    for u in ["https://echanges.dila.gouv.fr/robots.txt", "https://www.data.gouv.fr/robots.txt",
              "https://static.data.gouv.fr/robots.txt", "https://object.files.data.gouv.fr/robots.txt",
              "https://recherche-entreprises.api.gouv.fr/robots.txt", "https://tabular-api.data.gouv.fr/robots.txt"]:
        show(u, 1500)
    show("https://echanges.dila.gouv.fr/OPENDATA/", 1500)
    show("https://echanges.dila.gouv.fr/OPENDATA/BODACC/", 2500)
    r = show("https://echanges.dila.gouv.fr/OPENDATA/BODACC/FluxAnneeCourante/", 300)
    if r is not None:
        names = re.findall(r'href="([^"]+)"', r.text)
        p(len(names), names[:5], names[-40:])
    r = requests.get("https://www.data.gouv.fr/api/1/datasets/?q=bodacc&page_size=6", headers=H, timeout=60)
    for d in r.json().get("data", []):
        p("DS", d["id"], d["title"], (d.get("organization") or {}).get("name"), d.get("license"))
        for res in d.get("resources", [])[:6]:
            p("   RES", res.get("title"), res.get("format"), res.get("url"))
except Exception as e:  # noqa: BLE001
    p("FEHLER", e)
flush()
