"""Trägt einen fertigen v12-Film in app/content/videos.json ein: python register.py <name> [<name> ...]

Schlüssel "<land>/<seite>:radar" – die Landingpage nutzt ihn nicht (dort weiter der bisherige Film, weil der A/B-Test
„Lohnt sich das?“ läuft); verlinkt wird er aus Probe-Mail und Probe-PDF (scripts/lib/premium_wert.py video_url)."""
import json
import sys
from pathlib import Path

here = Path(__file__).parent
p = here / "../../app/content/videos.json"
V = json.loads(p.read_text())
for name in sys.argv[1:]:
    d = json.loads((here / f"segments/{name}.json").read_text())
    T = json.loads((here / f"out/{name}/timing.json").read_text())
    V[d["key"]] = {"src": f"/video/{d['file']}.mp4", "poster": f"/video/{d['file']}.jpg", "seconds": round(T["total"])}
    print("eingetragen:", d["key"], d["file"], round(T["total"]), "s")
p.write_text(json.dumps(V, indent=2, ensure_ascii=False) + "\n")
