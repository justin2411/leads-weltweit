"""Trägt einen fertigen v5-Film in app/content/videos.json ein: python register.py <name> [<name> ...]"""
import json, sys
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
