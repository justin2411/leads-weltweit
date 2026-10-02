"""Landkarten der Landingpages als statische SVG-Dateien (app/public/maps/<name>.svg).

Die Seite bindet die Karte als Bild ein und zeichnet nur die 10 Pins selbst: so steckt der Kartenumriss
(50–95 KB je Land) nicht mehr zweimal im HTML und im Seiten-Payload, und Browser/CDN halten ihn im Cache
(Inhaber 02.10.2026: „die landingpage … braucht noch zu lange“).
Neues Land: Karte als app/content/maps/s2-<land>.json anlegen, dann `python scripts/map_svg.py`.
Farben wie .mapcard in app/lib/landing-css.ts.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC, OUT = ROOT / "app/content/maps", ROOT / "app/public/maps"


def svg(m: dict) -> str:
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{m["viewBox"]}">']
    if m.get("neighbors"):
        parts.append(f'<path fill="#ECE6DA" d="{m["neighbors"]}"/>')
    parts.append(f'<path fill="#E6DCC8" stroke="#fff" stroke-width="1.2" d="{m["land"]}"/>')
    if m.get("borders"):
        parts.append(f'<path fill="none" stroke="#fff" stroke-width="1.3" d="{m["borders"]}"/>')
    return "".join(parts) + "</svg>\n"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for f in sorted(SRC.glob("*.json")):
        (OUT / f"{f.stem}.svg").write_text(svg(json.loads(f.read_text())))
        print(f"{f.stem}.svg")


if __name__ == "__main__":
    main()
