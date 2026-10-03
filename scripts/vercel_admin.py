#!/usr/bin/env python3
"""Vercel verwalten über die offizielle Schnittstelle – bewusst eingeschränkt (Entscheidung Inhaber 26.09.2026).

  python scripts/vercel_admin.py status                         # Variablen (nur Name/Umgebung, NIE Werte) + Deployments
  python scripts/vercel_admin.py preview-add NAME[,NAME…]       # Variable zusätzlich für Preview freigeben
  python scripts/vercel_admin.py redeploy BRANCH                # letztes Deployment dieses Branches neu bauen
  python scripts/vercel_admin.py site-setup physiotherapie-oehlke # Website aus sites/<name> als eigenes Projekt + Subdomain

Umgebung: VERCEL_TOKEN (GitHub-Secret). Kann nichts löschen, keine Werte lesen oder ändern.
Domains: nur site-setup legt die fest eingetragene Subdomain einer Website aus SITES an (Inhaber 03.10.2026) –
bestehende Domains und DNS-Einträge werden nie geändert.
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
REPO = "justin2411/leads-weltweit"
APEX = "nextgen-profit.de"
# Statische Websites im Ordner sites/<name>: eigenes (kostenloses) Vercel-Projekt mit genau dieser Subdomain.
SITES = {
    "physiotherapie-oehlke": {"root": "sites/physiotherapie-oehlke", "domain": "physiotherapie-oehlke.nextgen-profit.de"},
}


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
    domains()


def domains() -> None:
    """Nur lesen: Domains dieses Projekts und aller Projekte im Team (wer bedient welche Adresse?)."""
    print("\nDOMAINS DIESES PROJEKTS")
    for d in call("GET", f"/v9/projects/{PROJECT}/domains")["domains"]:
        extra = f" -> leitet um auf {d['redirect']}" if d.get("redirect") else ""
        print(f"  {d['name']:<32} verifiziert={d.get('verified')}{extra}")
    print("\nALLE PROJEKTE IM TEAM (Produktionsadressen)")
    for p in call("GET", "/v9/projects", params={"limit": "50"})["projects"]:
        try:
            names = [d["name"] for d in call("GET", f"/v9/projects/{p['id']}/domains")["domains"]]
        except SystemExit:
            names = []
        print(f"  {p['name']:<28} {p['id']}  {', '.join(names) or '-'}")


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


def site_setup(name: str) -> None:
    """Idempotent: Projekt anlegen (falls fehlt), Subdomain verbinden, Produktion aus main bauen. Löscht und ändert nichts Bestehendes."""
    if name not in SITES:
        raise SystemExit(f"Unbekannte Website {name!r} – erlaubt: {', '.join(SITES)}")
    cfg = SITES[name]
    try:
        proj = call("GET", f"/v9/projects/{name}")
        print(f"Projekt {name} existiert: {proj['id']}")
    except SystemExit:
        proj = call("POST", "/v11/projects", json={
            "name": name, "framework": None, "rootDirectory": cfg["root"],
            "gitRepository": {"type": "github", "repo": REPO}})
        print(f"Projekt {name} angelegt: {proj['id']}")
    if proj.get("rootDirectory") != cfg["root"]:
        raise SystemExit(f"Projekt {name} hat Root Directory {proj.get('rootDirectory')!r} statt {cfg['root']!r} – bitte prüfen")

    have = {d["name"] for d in call("GET", f"/v9/projects/{proj['id']}/domains")["domains"]}
    if cfg["domain"] not in have:
        call("POST", f"/v10/projects/{proj['id']}/domains", json={"name": cfg["domain"]})
        print(f"Domain {cfg['domain']} hinzugefügt")
    dom = call("GET", f"/v9/projects/{proj['id']}/domains/{cfg['domain']}")
    conf = call("GET", f"/v6/domains/{cfg['domain']}/config")
    print(f"Domain verifiziert={dom.get('verified')} falsch_konfiguriert={conf.get('misconfigured')}")
    if conf.get("misconfigured"):
        # Nur wenn nötig: genau einen CNAME für diese Subdomain anlegen. Bestehende Einträge bleiben unberührt.
        sub = cfg["domain"][: -len(APEX) - 1]
        recs = call("GET", f"/v4/domains/{APEX}/records", params={"limit": "100"}).get("records", [])
        if any(r.get("name") == sub for r in recs):
            print(f"DNS-Eintrag für {sub} existiert bereits – nicht verändert")
        else:
            call("POST", f"/v2/domains/{APEX}/records", json={"name": sub, "type": "CNAME", "value": "cname.vercel-dns.com", "ttl": 60})
            print(f"DNS: CNAME {sub} -> cname.vercel-dns.com angelegt")

    link = proj.get("link") or call("GET", f"/v9/projects/{proj['id']}").get("link") or {}
    if not link.get("repoId"):
        raise SystemExit("Projekt ist nicht mit GitHub verbunden – Vercel-GitHub-App braucht Zugriff auf das Repo")
    dep = call("POST", "/v13/deployments", json={
        "name": name, "project": proj["id"], "target": "production",
        "gitSource": {"type": "github", "repoId": link["repoId"], "ref": "main"}})
    print(f"Produktions-Deployment gestartet: https://{dep.get('url')} → https://{cfg['domain']}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("befehl", choices=["status", "preview-add", "redeploy", "site-setup"])
    ap.add_argument("arg", nargs="?", default="")
    a = ap.parse_args(argv)
    if a.befehl == "status":
        status()
    elif a.befehl == "preview-add":
        preview_add([x.strip() for x in a.arg.split(",") if x.strip()])
    elif a.befehl == "site-setup":
        site_setup(a.arg)
    else:
        redeploy(a.arg or "main")
    return 0


if __name__ == "__main__":
    sys.exit(main())
