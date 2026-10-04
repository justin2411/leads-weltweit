"""Temporärer Test (wird vor dem PR entfernt). Gibt keine Lead-Daten aus. Ausgabe als Annotation."""
import subprocess
import sys

OUT = []


def p(*a):
    OUT.append(" ".join(str(x) for x in a))


def flush():
    text = "\n".join(OUT)
    for i in range(0, min(len(text), 9 * 3800), 3800):
        chunk = text[i:i + 3800].replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        sys.stdout.write(f"::notice title=probe{i // 3800}::{chunk}\n")


for args in (["--http1.1"], ["--http1.0"], ["--http2"],
             ["--http1.1", "-H", "Accept: text/html,*/*", "-H", "Accept-Language: fr-FR,fr", "-A",
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36"]):
    for u in ("https://echanges.dila.gouv.fr/robots.txt", "http://echanges.dila.gouv.fr/robots.txt"):
        r = subprocess.run(["curl", "-sS", "-m", "30", "-o", "/tmp/o.txt", "-w", "%{http_code}", *args, u],
                           capture_output=True, text=True)
        body = open("/tmp/o.txt", errors="replace").read()[:500] if r.returncode == 0 else ""
        p(args[0], u, r.returncode, r.stdout, r.stderr[:150], body.replace("\n", " | "))
r = subprocess.run(["curl", "-sv", "-m", "30", "-o", "/dev/null", "https://echanges.dila.gouv.fr/OPENDATA/BODACC/"],
                   capture_output=True, text=True)
p("VERBOSE", r.stderr[-1500:])
flush()
