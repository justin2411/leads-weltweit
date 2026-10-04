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
    import re
    B = "https://object.files.data.gouv.fr/data-pipeline-open/"
    def ls(prefix):
        r = requests.get(B, params={"list-type": "2", "prefix": prefix, "delimiter": "/", "max-keys": "1000"}, headers=H, timeout=60)
        pre = re.findall(r"<Prefix>([^<]*)</Prefix>", r.text)
        keys = re.findall(r"<Key>([^<]*)</Key><LastModified>([^<]*)</LastModified><ETag>[^<]*</ETag><Size>(\d+)", r.text)
        return r.status_code, pre, keys, r.text[:300]
    for pre in ["", "prod/", "siren/", "insee/", "prod/insee/", "prod/rne/", "rne/"]:
        st, prefs, keys, raw = ls(pre)
        p("LS", repr(pre), st, prefs[:30], [(k, s) for k, _, s in keys[-8:]], "" if (prefs or keys) else raw.replace("\n", " "))
except Exception as e:  # noqa: BLE001
    p("FEHLER", e)
flush()
