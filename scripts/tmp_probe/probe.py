"""Temporärer Test (wird vor dem PR entfernt). Gibt keine Lead-Daten aus. Ausgabe als Annotation."""
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
    for u in ["https://files.data.gouv.fr/robots.txt", "https://object.files.data.gouv.fr/data-pipeline-open/robots.txt"]:
        r = requests.get(u, headers=H, timeout=60)
        p("===", u, r.status_code, r.text[:300].replace("\n", " | "))
    r = requests.get("https://www.data.gouv.fr/api/1/datasets/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/",
                     headers=H, timeout=60)
    d = r.json()
    p("DS", d.get("title"), d.get("license"))
    for res in d.get("resources", [])[:25]:
        p("  RES", (res.get("title") or "")[:70], res.get("format"), res.get("filesize"), res.get("last_modified"), res.get("url"))
    r = requests.get("https://recherche-entreprises.api.gouv.fr/openapi.json", headers=H, timeout=60)
    p("openapi", r.status_code)
    if r.ok:
        for path, ops in r.json().get("paths", {}).items():
            for op in ops.values():
                p(" PATH", path, ",".join(x.get("name", "") for x in op.get("parameters", [])))
except Exception as e:  # noqa: BLE001
    p("FEHLER", e)
flush()
