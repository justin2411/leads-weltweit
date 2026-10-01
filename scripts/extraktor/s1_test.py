#!/usr/bin/env python3
"""Kurztest (01.10.2026) der S1-Quellen, die nur von GitHub aus erreichbar sind (Common Crawl, US-Arbeitsministerium).

  python scripts/extraktor/s1_test.py      # druckt eine Zusammenfassung, schreibt out/s1_test/*.json
"""
from __future__ import annotations

import collections
import json
import random
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from extraktor.sources import jobs  # noqa: E402

OUT = Path("out/s1_test")
UA = {"User-Agent": "NextGenProfit lead research info@nextgen-profit.de"}


def common_crawl() -> dict:
    s = requests.Session()
    coll = s.get("https://index.commoncrawl.org/collinfo.json", timeout=60, headers=UA).json()[0]["cdx-api"]
    found = collections.defaultdict(set)
    pats = {"greenhouse": ["boards.greenhouse.io/*", "job-boards.greenhouse.io/*"], "lever": ["jobs.lever.co/*"],
            "ashby": ["jobs.ashbyhq.com/*"], "workable": ["apply.workable.com/*"]}
    for kind, ps in pats.items():
        for p in ps:
            try:
                r = s.get(coll, params={"url": p, "output": "json", "fl": "url", "limit": 15000}, timeout=300, headers=UA)
            except requests.RequestException as exc:
                print(f"CC {p}: {exc}")
                continue
            for line in r.text.splitlines():
                m = re.search(r'"url":\s*"https?://[^/]+/([A-Za-z0-9_-]+)', line)
                if m and m.group(1).lower() not in ("embed", "jobs", "v1", "api", "careers", "j"):
                    found[kind].add(m.group(1).lower())
    res = {k: len(v) for k, v in found.items()}
    print("Common Crawl Boards:", res)
    sample = [(k, slug) for k, v in found.items() for slug in random.sample(sorted(v), min(150, len(v)))]
    sess = requests.Session()

    def check(ks):
        k, slug = ks
        for kind, url in jobs.boards(slug):
            if kind != k:
                continue
            try:
                r = sess.get(url, timeout=15, headers=UA)
                if r.status_code != 200:
                    continue
                js = jobs.parse(kind, r.json())
            except Exception:  # noqa: BLE001
                continue
            out = {}
            for c in ("UK", "FR", "US"):
                out[c] = sum(1 for j in js if jobs.COUNTRY_WORDS[c].search(j.get("locality") or ""))
            return slug, len(js), out
        return slug, 0, {}

    with ThreadPoolExecutor(24) as ex:
        hits = list(ex.map(check, sample))
    by = collections.Counter()
    for slug, n, out in hits:
        for c, m in out.items():
            if m >= 3:
                by[c] += 1
    print(f"Stichprobe {len(sample)} Boards: mit >=3 Stellen in UK/FR/US:", dict(by))
    print("Beispiele:", [h for h in hits if h[1]][:15])
    return {"boards": res, "sample": len(sample), "with3": dict(by)}


def dol() -> dict:
    s = requests.Session()
    r = s.get("https://www.dol.gov/agencies/eta/foreign-labor/performance", timeout=60,
              headers={**UA, "Accept": "text/html"})
    links = re.findall(r'href="([^"]+(?:LCA|PERM)[^"]+\.xlsx)"', r.text)
    print("DOL Seite:", r.status_code, "Dateien:", links[:6])
    return {"status": r.status_code, "files": links[:10]}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    rep = {}
    for name, fn in (("common_crawl", common_crawl), ("dol", dol)):
        try:
            rep[name] = fn()
        except Exception as exc:  # noqa: BLE001
            rep[name] = {"error": f"{type(exc).__name__}: {exc}"[:300]}
            print(name, "FEHLER", rep[name])
    (OUT / "bericht.json").write_text(json.dumps(rep, indent=2), encoding="utf-8")
