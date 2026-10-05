#!/usr/bin/env python3
"""Premium-Radar FR: öffentliche Aufträge (DECP, Zuschlag ≤ 14 Tage) bei FR-S2-Firmen im Bestand + heute bestätigter
Website-Zustand -> datierte Premium-Leads. Einmal am Tag (Job fr-decp im Lead-Werk). Sendet nichts.
Details: scripts/lib/fr_decp_radar.py.

  python scripts/fr_decp_radar.py            # zählen, nichts schreiben
  python scripts/fr_decp_radar.py --apply    # Leads schreiben
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="neue Leads speichern")
    args = ap.parse_args(argv)
    from enrich import Fetcher
    from lib.db import DB
    from lib.owner_settings import stop_if_paused
    from lib import fr_decp_radar
    db = DB()
    if args.apply and stop_if_paused(db, "lead-werk"):
        return 0
    try:
        rep = fr_decp_radar.run(db, Fetcher(), apply=args.apply)
    except Exception as exc:  # noqa: BLE001
        rep = {"fehler": type(exc).__name__}
    print(json.dumps(rep, ensure_ascii=False, sort_keys=True))
    return 0 if "fehler" not in rep else 1


if __name__ == "__main__":
    sys.exit(main())
