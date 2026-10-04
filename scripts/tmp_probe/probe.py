"""Temporärer Test (wird vor dem PR entfernt). Gibt keine Lead-Daten aus. Ausgabe als Annotation."""
import ftplib
import socket
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
    p("DNS", socket.gethostbyname_ex("echanges.dila.gouv.fr"))
    try:
        f = ftplib.FTP("echanges.dila.gouv.fr", timeout=30)
        f.login()
        p("FTP root", f.nlst()[:40])
        p("FTP BODACC", f.nlst("/BODACC")[:40] if "BODACC" in " ".join(f.nlst()) else "-")
    except Exception as e:  # noqa: BLE001
        p("FTP FEHLER", repr(e)[:200])
    for port in (443, 80, 21):
        s = socket.socket()
        s.settimeout(10)
        try:
            s.connect(("echanges.dila.gouv.fr", port))
            p("TCP", port, "offen")
        except Exception as e:  # noqa: BLE001
            p("TCP", port, repr(e)[:80])
        finally:
            s.close()
    for q in ["sirene creations", "nouvelles entreprises immatriculations", "registre national des entreprises",
              "immatriculations entreprises quotidien", "annonces commerciales"]:
        r = requests.get("https://www.data.gouv.fr/api/1/datasets/", params={"q": q, "page_size": 6}, headers=H, timeout=60)
        for d in r.json().get("data", []):
            p("DS", q[:20], "|", d["id"], d["title"][:70], "|", (d.get("organization") or {}).get("name"),
              d.get("license"), d.get("last_update", "")[:10])
except Exception as e:  # noqa: BLE001
    p("FEHLER", e)
flush()
