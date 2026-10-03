#!/usr/bin/env python3
"""Vercel verwalten über die offizielle Schnittstelle – bewusst eingeschränkt (Entscheidung Inhaber 26.09.2026).

  python scripts/vercel_admin.py status                         # Variablen (nur Name/Umgebung, NIE Werte) + Deployments
  python scripts/vercel_admin.py preview-add NAME[,NAME…]       # Variable zusätzlich für Preview freigeben
  python scripts/vercel_admin.py redeploy BRANCH                # letztes Deployment dieses Branches neu bauen
  python scripts/vercel_admin.py site-setup physiotherapie-oehlke # Website aus sites/<name> als eigenes Projekt + Subdomain
  python scripts/vercel_admin.py env-add-vapid                  # Web-Push-Schlüssel anlegen (nur wenn sie fehlen) + Redeploy

Umgebung: VERCEL_TOKEN (GitHub-Secret). Kann nichts löschen, keine Werte lesen oder ändern.
Neue Variablen: nur env-add-vapid legt VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (sensitiv) und VAPID_SUBJECT an
(Inhaber 03.10.2026) – nur wenn sie noch fehlen, nie überschreiben, Schlüssel werden im Runner erzeugt und nie ausgegeben.
Domains: nur site-setup legt die fest eingetragene Subdomain einer Website aus SITES an (Inhaber 03.10.2026) –
bestehende Domains und DNS-Einträge werden nie geändert.
Live-Stripe-Schlüssel dürfen nie in Preview (dort gilt der Testmodus).
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import os
import re
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


VAPID_PAIR = ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY")
VAPID_TARGETS = ("production", "preview")


def vapid_keypair() -> tuple[str, str]:
    """Neues VAPID-Schlüsselpaar (P-256) im Format von web-push: öffentlicher Punkt unkomprimiert, privater Skalar,
    beides Base64url ohne Auffüllzeichen."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    pub = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    priv = key.private_numbers().private_value.to_bytes(32, "big")
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()  # noqa: E731
    return b64(pub), b64(priv)


def create_env(key: str, value: str, typ: str) -> None:
    """Neue Variable für Production und Preview. Ohne upsert: gibt es sie schon, lehnt Vercel ab (nie überschreiben).
    Fehlertexte werden von Werten bereinigt, bevor sie im Log landen."""
    r = requests.post(f"{API}/v10/projects/{PROJECT}/env", params={"teamId": TEAM}, timeout=30,
                      headers={"Authorization": f"Bearer {os.environ['VERCEL_TOKEN']}"},
                      json={"key": key, "value": value, "type": typ, "target": list(VAPID_TARGETS)})
    if r.status_code >= 400:
        raise SystemExit(f"Vercel: {key} nicht angelegt: {r.status_code} {r.text[:300].replace(value, '[Wert]')}")
    print(f"  {key}: angelegt ({typ}, {','.join(VAPID_TARGETS)})")


def ensure_targets(key: str, entries: list[dict]) -> bool:
    """Bestehende Variable zusätzlich für fehlende Umgebungen freigeben (wie preview-add, ohne Wert). True = geändert."""
    plain = [e for e in entries if not e.get("gitBranch")]
    have = set().union(*(set(e.get("target") or []) for e in plain)) if plain else set()
    missing = set(VAPID_TARGETS) - have
    if not plain or not missing:
        print(f"  {key}: existiert bereits ({','.join(sorted(have)) or 'nur Branch'}) – unverändert")
        return False
    e = plain[0]
    target = sorted(set(e.get("target") or []) | missing)
    call("PATCH", f"/v9/projects/{PROJECT}/env/{e['id']}", json={"target": target})
    print(f"  {key}: existiert bereits, jetzt {','.join(target)}")
    return True


def vapid_subject() -> str:
    mail = (os.environ.get("OWNER_EMAIL") or "").strip()
    if not re.fullmatch(r"[^@\s<>\"']+@[^@\s<>\"']+\.[A-Za-z]{2,}", mail):
        mail = "info@nextgen-profit.de"
    return f"mailto:{mail}"


def env_add_vapid() -> None:
    """Idempotent: Web-Push-Schlüssel anlegen, wenn sie fehlen; danach Produktion neu bauen. Liest nie Werte
    (nur Namen, Umgebungen, IDs) und gibt nie Werte aus."""
    by_key: dict[str, list[dict]] = {}
    for e in envs():
        by_key.setdefault(e["key"], []).append(e)
    changed = False
    present = [k for k in VAPID_PAIR if k in by_key]
    if len(present) == 1:
        raise SystemExit(f"Nur {present[0]} existiert – Schlüsselpaar unvollständig, nichts geändert. "
                         "Bitte in Vercel prüfen (das Paar gehört zusammen).")
    if present:
        for k in VAPID_PAIR:
            changed |= ensure_targets(k, by_key[k])
    else:
        pub, priv = vapid_keypair()
        if os.environ.get("GITHUB_ACTIONS") == "true":
            print(f"::add-mask::{priv}")  # GitHub zeigt diese Zeile nicht; Wert wäre in jedem Log geschwärzt
        create_env("VAPID_PUBLIC_KEY", pub, "encrypted")
        create_env("VAPID_PRIVATE_KEY", priv, "sensitive")
        changed = True
    if "VAPID_SUBJECT" in by_key:
        changed |= ensure_targets("VAPID_SUBJECT", by_key["VAPID_SUBJECT"])
    else:
        create_env("VAPID_SUBJECT", vapid_subject(), "encrypted")
        changed = True
    if changed:
        redeploy("main")
    else:
        print("Nichts zu tun – Produktion nicht neu gebaut")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("befehl", choices=["status", "preview-add", "redeploy", "site-setup", "env-add-vapid"])
    ap.add_argument("arg", nargs="?", default="")
    a = ap.parse_args(argv)
    if a.befehl == "status":
        status()
    elif a.befehl == "preview-add":
        preview_add([x.strip() for x in a.arg.split(",") if x.strip()])
    elif a.befehl == "site-setup":
        site_setup(a.arg)
    elif a.befehl == "env-add-vapid":
        env_add_vapid()
    else:
        redeploy(a.arg or "main")
    return 0


if __name__ == "__main__":
    sys.exit(main())
