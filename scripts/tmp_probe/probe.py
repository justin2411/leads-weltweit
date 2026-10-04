"""Temporärer Test (wird vor dem PR entfernt): robots.txt und Verzeichnisse der Ersatzquellen. Gibt keine Lead-Daten aus."""
import re

import requests

H = {"User-Agent": "signalwerk-probe/1.0 (+https://www.nextgen-profit.de)"}


def show(u, n=3000):
    try:
        r = requests.get(u, headers=H, timeout=60)
        print(f"=== {u} -> {r.status_code} {r.headers.get('content-type')}")
        print(r.text[:n])
    except Exception as e:  # noqa: BLE001
        print(f"=== {u} -> FEHLER {e}")


for u in ["https://echanges.dila.gouv.fr/robots.txt", "https://www.data.gouv.fr/robots.txt",
          "https://static.data.gouv.fr/robots.txt", "https://object.files.data.gouv.fr/robots.txt",
          "https://recherche-entreprises.api.gouv.fr/robots.txt", "https://tabular-api.data.gouv.fr/robots.txt",
          "https://www.bodacc.fr/robots.txt"]:
    show(u, 2500)
show("https://echanges.dila.gouv.fr/OPENDATA/", 3000)
show("https://echanges.dila.gouv.fr/OPENDATA/BODACC/", 4000)
r = requests.get("https://echanges.dila.gouv.fr/OPENDATA/BODACC/FluxAnneeCourante/", headers=H, timeout=60)
print("FluxAnneeCourante", r.status_code)
names = re.findall(r'href="([^"]+)"', r.text)
print(len(names), names[:5], names[-40:])
show("https://www.data.gouv.fr/api/1/datasets/?q=bodacc&page_size=5", 6000)
