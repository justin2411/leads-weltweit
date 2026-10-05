#!/usr/bin/env python3
"""Premium-Radar UK: Eigentümerwechsel (Companies House PSC) und neue Abfall-Beförderer (Environment Agency) bei
UK-S2-Firmen im Bestand -> datierte Premium-Leads. Einmal am Tag (Job uk-psc im Lead-Werk), der Bestand wird einmal
geladen. Sendet nichts. Details: scripts/lib/uk_psc_radar.py, scripts/lib/uk_ea_radar.py.

  python scripts/uk_psc_radar.py            # zählen, nichts schreiben
  python scripts/uk_psc_radar.py --apply    # Leads schreiben
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
    from lib import uk_ea_radar, uk_psc_radar
    db = DB()
    if args.apply and stop_if_paused(db, "lead-werk"):
        return 0
    comps = uk_psc_radar.uk_companies(db)
    fetcher = Fetcher()
    rep = {}
    for name, mod in (("psc", uk_psc_radar), ("ea", uk_ea_radar)):
        try:  # eine Quelle darf die andere nicht aufhalten
            rep[name] = mod.run(db, fetcher, apply=args.apply, comps=comps)
        except Exception as exc:  # noqa: BLE001
            rep[name] = {"fehler": type(exc).__name__}
    print(json.dumps(rep, ensure_ascii=False, sort_keys=True))
    return 0 if all("fehler" not in r for r in rep.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
