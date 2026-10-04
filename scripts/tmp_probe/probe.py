"""Temporärer Test (wird vor dem PR entfernt). Gibt keine Lead-Daten aus. Ausgabe als Annotation."""
import re
import sys

import requests

H = {"User-Agent": "signalwerk-probe/1.0 (+https://www.nextgen-profit.de)"}
OUT = []


def p(*a):
    OUT.append(" ".join(str(x) for x in a))


def flush():
    text = "\n".join(OUT)
    for i in range(0, min(len(text), 9 * 3800), 3800):
        chunk = text[i:i + 3800].replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        sys.stdout.write(f"::notice title=probe{i // 3800}::{chunk}\n")


try:
    for u in ["https://www.data.gouv.fr/robots.txt", "https://static.data.gouv.fr/robots.txt"]:
        r = requests.get(u, headers=H, timeout=60)
        p("===", u, r.status_code, " | ".join(ln for ln in r.text.splitlines() if not re.search(r"/(en|fr|es)/", ln)))
    for u in ["https://echanges.dila.gouv.fr/robots.txt", "http://echanges.dila.gouv.fr/robots.txt",
              "https://echanges.dila.gouv.fr/OPENDATA/BODACC/", "http://echanges.dila.gouv.fr/OPENDATA/BODACC/"]:
        for ua in (H["User-Agent"], "Mozilla/5.0 (X11; Linux x86_64) signalwerk"):
            try:
                r = requests.get(u, headers={"User-Agent": ua}, timeout=30)
                p("===", u, ua[:12], r.status_code, r.text[:400].replace("\n", " "))
            except Exception as e:  # noqa: BLE001
                p("===", u, ua[:12], "FEHLER", str(e)[:120])
    r = requests.get("https://www.data.gouv.fr/api/1/datasets/?q=bodacc&page_size=6", headers=H, timeout=60)
    for d in r.json().get("data", []):
        p("DS", d["id"], d["title"][:80], (d.get("organization") or {}).get("name"), d.get("license"))
        for res in d.get("resources", [])[:5]:
            p("   RES", (res.get("title") or "")[:60], res.get("format"), res.get("url"))
except Exception as e:  # noqa: BLE001
    p("FEHLER", e)
flush()
