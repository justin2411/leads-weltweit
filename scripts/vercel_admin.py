#!/usr/bin/env python3
"""Vercel verwalten über die offizielle Schnittstelle – bewusst eingeschränkt (Entscheidung Inhaber 26.09.2026).

  python scripts/vercel_admin.py status                         # Variablen (nur Name/Umgebung, NIE Werte) + Deployments
  python scripts/vercel_admin.py preview-add NAME[,NAME…]       # Variable zusätzlich für Preview freigeben
  python scripts/vercel_admin.py redeploy BRANCH                # letztes Deployment dieses Branches neu bauen

Umgebung: VERCEL_TOKEN (GitHub-Secret). Kann nichts löschen, keine Werte lesen oder ändern, Domains nicht anfassen.
Live-Stripe-Schlüssel dürfen nie in Preview (dort gilt der Testmodus).
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sys

import requests

PROJECT = "prj_sbykJ2JqNEQUdEyEgsS3eNDHI4xy"
TEAM = "team_RJgJfI8yvA6rtw6YNspZh3c3"
API = "https://api.vercel.com"
NEVER_PREVIEW = {"STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SITE_URL"}


def call(method: str, path: str, **kw) -> dict:
    r = requests.request(method, f"{API}{path}", params={"teamId": TEAM, **kw.pop("params", {})}, timeout=30,
                         headers={"Authorization": f"Bearer {os.environ['VERCEL_TOKEN']}"}, **kw)
    if r.status_code >= 400:
        raise SystemExit(f"Vercel {method} {path}: {r.status_code} {r.text[:300]}")
    return r.json()


def envs() -> list[dict]:
    return call("GET", f"/v10/projects/{PROJECT}/env")["envs"]


def status() -> None:
    print("UMGEBUNGSVARIABLEN (nur Namen und Umgebungen, keine Werte)")
    for e in sorted(envs(), key=lambda e: e["key"]):
        branch = f"  nur Branch {e['gitBranch']}" if e.get("gitBranch") else ""
        print(f"  {e['key']:<28} {','.join(sorted(e.get('target') or [])):<24} {e.get('type', '')}{branch}")
    print("\nLETZTE DEPLOYMENTS")
    for d in call("GET", "/v6/deployments", params={"projectId": PROJECT, "limit": "8"})["deployments"]:
        when = dt.datetime.fromtimestamp(d["created"] / 1000, dt.timezone.utc).strftime("%d.%m. %H:%M UTC")
        meta = d.get("meta") or {}
        print(f"  {when}  {d.get('target') or 'preview':<10} {d.get('state', ''):<8} "
              f"{meta.get('githubCommitRef', '?')}@{(meta.get('githubCommitSha') or '')[:7]}  {d['url']}")


def preview_add(names: list[str]) -> None:
    by_key = {e["key"]: e for e in envs()}
    for n in names:
        if n in NEVER_PREVIEW:
            print(f"  {n}: übersprungen – darf nicht in Preview (Live-Schlüssel bzw. Produktionsadresse)")
            continue
        e = by_key.get(n)
        if not e:
            print(f"  {n}: nicht gefunden")
            continue
        target = sorted(set(e.get("target") or []) | {"preview"})
        call("PATCH", f"/v9/projects/{PROJECT}/env/{e['id']}", json={"target": target})
        print(f"  {n}: jetzt {','.join(target)}")


def redeploy(branch: str) -> None:
    deps = call("GET", "/v6/deployments", params={"projectId": PROJECT, "limit": "30"})["deployments"]
    d = next((d for d in deps if (d.get("meta") or {}).get("githubCommitRef") == branch), None)
    if not d:
        raise SystemExit(f"Kein Deployment für Branch {branch}")
    body = {"name": d["name"], "deploymentId": d["uid"]}
    if d.get("target") == "production":
        body["target"] = "production"
    new = call("POST", "/v13/deployments", json=body)
    print(f"Neu gebaut: {new.get('url')} (aus {d['url']})")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("befehl", choices=["status", "preview-add", "redeploy"])
    ap.add_argument("arg", nargs="?", default="")
    a = ap.parse_args(argv)
    if a.befehl == "status":
        status()
    elif a.befehl == "preview-add":
        preview_add([x.strip() for x in a.arg.split(",") if x.strip()])
    else:
        redeploy(a.arg or "main")
    return 0


if __name__ == "__main__":
    sys.exit(main())
