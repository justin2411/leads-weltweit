"""Tagescheck: funktioniert der ganze Ablauf? (Inhaber 27.09.2026: „wichtig ist, dass unser Workflow funktioniert
und jeden Tag gecheckt wird, ob alles funktioniert“)

Prüft jeden Kontaktpunkt aus docs/workflow (Versand, Nachfassmails, Antworten, Web-Proben, Website, Kasse,
Lieferungen) und die geplanten GitHub-Läufe. Ergebnis als Mail an OWNER_EMAIL; bei Fehlern endet der Lauf rot.

  python scripts/tagescheck.py            # nur ausgeben
  python scripts/tagescheck.py --send     # zusätzlich Mail an den Inhaber
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[1]
NOW = dt.datetime.now(dt.timezone.utc)
OK, WARN, FAIL = "ok", "warn", "fail"
ICON = {OK: "✓", WARN: "!", FAIL: "✗"}

# Geplante Läufe: Datei -> (Name, höchstes erlaubtes Alter des letzten Laufs in Stunden)
WORKFLOWS = {
    "send.yml": ("Versand Kaltmails", 27),
    "taeglich.yml": ("Automatiklauf (Nachfassmails, Entwürfe)", 27),
    "antworten.yml": ("Antwort-Assistent + Web-Proben (24/7)", 2),  # läuft rund um die Uhr alle 10 min
    "proben-vorrat.yml": ("Proben-Vorrat + Web-Proben (24/7)", 3),
    "morgenbericht.yml": ("Morgenbericht", 27),
    "sync.yml": ("Bounces/Ereignisse", 27),
    "kaeufer.yml": ("Käufersuche", 27),
    "kundenlieferung.yml": ("Kundenlieferung (montags)", 24 * 7 + 3),
    "wachhund.yml": ("Wachhund (startet ausgefallene Läufe nach)", 3),
}


def cfg(name: str, key: str) -> str | None:
    try:
        m = re.search(rf"^{key}:\s*(\S+)", (ROOT / "config" / name).read_text(), re.M)
        return m.group(1).strip('"') if m else None
    except OSError:
        return None


def ago(ts: str) -> float:
    return (NOW - dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))).total_seconds() / 3600


class Check:
    def __init__(self):
        self.rows: list[tuple[str, str, str, str]] = []  # (bereich, status, titel, detail)

    def add(self, area: str, status: str, title: str, detail: str = "") -> None:
        self.rows.append((area, status, title, detail))
        print(f"[{ICON[status]}] {area:<10} {title}" + (f" – {detail}" if detail else ""))

    def guard(self, area: str, fn) -> None:
        """Ein kaputter Einzelcheck darf den Rest nicht verhindern."""
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            self.add(area, FAIL, "Prüfung selbst fehlgeschlagen", f"{type(e).__name__}: {str(e)[:200]}")

    @property
    def worst(self) -> str:
        s = {r[1] for r in self.rows}
        return FAIL if FAIL in s else WARN if WARN in s else OK


# ---------------------------------------------------------------------------
def check_workflows(c: Check) -> None:
    repo, token = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_TOKEN")
    if not (repo and token):
        c.add("Abläufe", WARN, "GitHub-Läufe nicht geprüft", "GITHUB_REPOSITORY/GITHUB_TOKEN fehlen (nur in Actions)")
        return
    wanted = dict(WORKFLOWS)
    if cfg("pipeline.yaml", "lead_suche") == "true":
        wanted["anreichern.yml"] = ("Anreicherung", 12)
        wanted["lead-werk.yml"] = ("Lead-Werk", 9)
    if cfg("pipeline.yaml", "kunden_suche") == "true":
        wanted["kunden-werk.yml"] = ("Kunden-Werk", 6)
    h = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    for wf, (name, max_h) in wanted.items():
        r = requests.get(f"https://api.github.com/repos/{repo}/actions/workflows/{wf}/runs",
                         params={"per_page": 5, "branch": "main"}, headers=h, timeout=30)
        r.raise_for_status()
        all_runs = r.json().get("workflow_runs", [])
        runs = [x for x in all_runs if x["status"] == "completed"]
        running = [x for x in all_runs if x["status"] != "completed" and ago(x["created_at"]) < 4]
        if running:
            c.add("Abläufe", OK, f"{name}", f"läuft gerade (gestartet vor {ago(running[0]['created_at']) * 60:.0f} min)")
            continue
        if not runs:
            # wöchentliche Läufe (Kundenlieferung) sind nach dem Einrichten erst am nächsten Montag dran
            c.add("Abläufe", WARN if max_h > 48 else FAIL, f"{name}: noch nie gelaufen")
            continue
        last = runs[0]
        age = ago(last["updated_at"])
        link = last["html_url"]
        if last["conclusion"] not in ("success", "skipped"):
            c.add("Abläufe", FAIL, f"{name}: letzter Lauf {last['conclusion']}", f"vor {age:.0f} h · {link}")
        elif age > max_h:
            c.add("Abläufe", FAIL, f"{name}: seit {age:.0f} h kein Lauf", f"erwartet alle {max_h} h · {link}")
        else:
            c.add("Abläufe", OK, f"{name}", f"zuletzt vor {age:.0f} h erfolgreich")


def check_sending(c: Check, db) -> None:
    from lib.deliverability import BOUNCE_STOP, MIN_SAMPLE, count_bounces, emergency_stop, window_start
    aktiv = cfg("versand.yaml", "aktiv") == "true"
    since26 = (NOW - dt.timedelta(hours=26)).isoformat()
    since30 = window_start(NOW).isoformat()  # Notbremse-Fenster wie beim Versand (notbremse_ab)
    sent_day = db.select("messages", {"status": "eq.sent", "sent_at": f"gte.{since26}", "select": "id,kind"})
    queue = db.select("messages", {"status": "eq.approved", "select": "id,kind"})
    sent30 = db.select_all("messages", {"status": "eq.sent", "sent_at": f"gte.{since30}", "select": "id"})
    ev = db.select_all("email_events", {"created_at": f"gte.{since30}", "type": "in.(bounced,complained)",
                                        "select": "message_id,type,payload,messages(to_email)"})
    for e in ev:
        e["to_email"] = (e.get("messages") or {}).get("to_email")
    bounced, complained = count_bounces(ev)  # gleiche Zählung wie der Versand (je Adresse, Inhaber 03.10.2026)
    stop = emergency_stop(len(sent30), bounced, complained)
    kinds = {}
    for m in sent_day:
        kinds[m.get("kind") or "initial"] = kinds.get(m.get("kind") or "initial", 0) + 1
    detail = ", ".join(f"{v} {k}" for k, v in sorted(kinds.items())) or "keine"
    if not aktiv:
        c.add("Versand", WARN, "Versand ist ausgeschaltet", "config/versand.yaml: aktiv: false")
    elif stop:
        c.add("Versand", FAIL, "Notbremse aktiv", stop)
    elif queue and not sent_day:
        c.add("Versand", FAIL, "Keine Mail in 26 h gesendet", f"{len(queue)} freigegebene Mails warten")
    else:
        c.add("Versand", OK, f"{len(sent_day)} Mails in 26 h gesendet", f"{detail}; Warteschlange {len(queue)}")
    if not stop and len(sent30):
        rate = bounced / len(sent30)
        if rate > BOUNCE_STOP * 0.8:
            note = "" if len(sent30) >= MIN_SAMPLE else f" (Notbremse greift ab {MIN_SAMPLE} Mails)"
            c.add("Versand", WARN, f"Bounce-Quote {rate:.1%} nahe an der Grenze {BOUNCE_STOP:.0%}",
                  f"{bounced}/{len(sent30)} in 30 Tagen{note}")
        else:
            c.add("Versand", OK, f"Bounce-Quote {rate:.1%}", f"{bounced}/{len(sent30)} in 30 Tagen, "
                                                               f"{complained} Beschwerden")
    if aktiv and not queue:
        c.add("Versand", WARN, "Keine freigegebenen Mails mehr in der Warteschlange",
              "Käufervorrat oder Entwürfe prüfen")


BOX_WARN, BOX_FAIL, BOX_MIN = 0.03, 0.05, 30


def check_mailboxes(c: Check, db) -> None:
    """Bounce-Quote je Versand-Postfach, 14 Tage (Nachtschicht 04.10.2026). Seit alle Postfächer gelesen werden
    (lib/imap_boxes.py), kommen Rückläufer an Postfach 2/3 an; ein schlechtes Postfach fällt so auf, bevor es die
    gemeinsame Notbremse auslöst. Gelb ab 3 %, rot ab 5 %, erst ab 30 Mails je Postfach (sonst Zufall)."""
    from lib.deliverability import count_bounces
    from lib.mailboxes import address
    since = (NOW - dt.timedelta(days=14)).isoformat()
    sent = db.select_all("messages", {"status": "eq.sent", "sent_at": f"gte.{since}", "select": "id,sent_from"})
    if not sent:
        return
    def box_name(sent_from: str | None) -> str:
        # Mails ohne Absender-Eintrag kamen vor dem Mehrfach-Versand aus dem Hauptpostfach (wie Dashboard isMainBox)
        a = address(sent_from or "")
        return "info@ (Hauptpostfach)" if not a or a.startswith("info@") else a
    box = {m["id"]: box_name(m.get("sent_from")) for m in sent}
    ev = db.select_all("email_events", {"created_at": f"gte.{since}", "type": "in.(bounced,complained)",
                                        "select": "message_id,type,payload,messages(to_email)"})
    per: dict[str, list[dict]] = {}
    for e in ev:
        if e.get("message_id") in box:
            e["to_email"] = (e.get("messages") or {}).get("to_email")
            per.setdefault(box[e["message_id"]], []).append(e)
    counts: dict[str, int] = {}
    for b in box.values():
        counts[b] = counts.get(b, 0) + 1
    for b, n in sorted(counts.items(), key=lambda x: -x[1]):
        bounced, complained = count_bounces(per.get(b, []))
        rate = bounced / n
        detail = f"{bounced} Bounces, {complained} Beschwerden bei {n} Mails (14 Tage)"
        if complained:
            c.add("Postfach", FAIL, f"{b}: Spam-Beschwerde", detail)
        elif n < BOX_MIN:
            c.add("Postfach", OK, f"{b}: {rate:.1%} Bounces", f"{detail} – noch zu wenig für eine Aussage")
        elif rate >= BOX_FAIL:
            c.add("Postfach", FAIL, f"{b}: Bounce-Quote {rate:.1%}", f"{detail} – Adressqualität/Absender prüfen")
        elif rate >= BOX_WARN:
            c.add("Postfach", WARN, f"{b}: Bounce-Quote {rate:.1%}", detail)
        else:
            c.add("Postfach", OK, f"{b}: Bounce-Quote {rate:.1%}", detail)


def check_followups(c: Check, db) -> None:
    from followups import NEGATIVE
    cutoff = (NOW - dt.timedelta(days=5)).isoformat()   # 4 Tage + 1 Tag Puffer für den Automatiklauf
    initial = db.select_all("messages", {"status": "eq.sent", "kind": "eq.initial", "sent_at": f"lte.{cutoff}",
                                         "select": "id,prospect_id,to_email"})
    if not initial:
        c.add("Nachfass", OK, "Noch keine Erstmail älter als 5 Tage")
        return
    followed = {m["prospect_id"] for m in db.select_all("messages", {"kind": "neq.initial", "select": "prospect_id"})}
    ids = [m["id"] for m in initial]
    neg = set()
    for i in range(0, len(ids), 100):
        for e in db.select("email_events", {"message_id": f"in.({','.join(ids[i:i + 100])})", "select": "message_id,type"}):
            if e["type"] in NEGATIVE:
                neg.add(e["message_id"])
    missing = [m for m in initial if m["prospect_id"] not in followed and m["id"] not in neg]
    # gesperrte Adressen bekommen zu Recht keine Nachfassmail
    missing = [m for m in missing if not db.rpc("is_suppressed", {"p_email": m["to_email"]})]
    stuck = db.select("messages", {"kind": "neq.initial", "status": "eq.approved", "approved_at": f"lte.{(NOW - dt.timedelta(hours=30)).isoformat()}",
                                   "select": "id"})
    if missing:
        c.add("Nachfass", FAIL, f"{len(missing)} Nachfassmails fehlen", "Erstmail > 5 Tage, keine Antwort, keine Nachfassmail")
    elif stuck:
        c.add("Nachfass", FAIL, f"{len(stuck)} Nachfassmails seit über 30 h nicht gesendet")
    else:
        c.add("Nachfass", OK, "Nachfassmails vollständig", f"{len(initial)} Erstmails älter als 5 Tage geprüft")


def check_replies(c: Check, db) -> None:
    since = (NOW - dt.timedelta(hours=26)).isoformat()
    from lib.stats import count_by_type, distinct_replies
    ev = db.select("email_events", {"created_at": f"gte.{since}",
                                    "type": "in.(reply,reply_positive,reply_negative,sample_requested,auto_reply,"
                                            "unsubscribed)",
                                    "select": "id,type,message_id,dedupe_key"})
    # je eingehender Mail nur einmal (inbox.py 'reply' + responder.py genauer Typ zur selben Mail)
    counts = count_by_type(distinct_replies(ev))
    names = {"reply_positive": "Kaufinteresse", "sample_requested": "Probe gesendet", "reply_negative": "Absage",
             "reply": "sonstige", "auto_reply": "Abwesenheit", "unsubscribed": "Abmeldung"}
    detail = ", ".join(f"{v} {names.get(k, k)}" for k, v in counts.items()) or "keine"
    status = WARN if counts.get("reply_positive") else OK
    c.add("Antworten", status, f"Antworten in 26 h: {sum(counts.values())}",
          detail + (" – bitte persönlich antworten" if status == WARN else ""))


def check_web_samples(c: Check, db) -> None:
    old = (NOW - dt.timedelta(hours=2)).isoformat()
    waiting = db.select("sample_requests", {"status": "eq.new", "created_at": f"lte.{old}",
                                            "select": "company_name,created_at,segment_id,country"})
    if waiting:
        names = ", ".join(f"{w['company_name']} ({w['segment_id']}/{w['country']}, seit {ago(w['created_at']):.0f} h)"
                          for w in waiting[:5])
        c.add("Proben", FAIL, f"{len(waiting)} Probe-Anfragen von der Website unbeantwortet", names)
    else:
        c.add("Proben", OK, "Alle Probe-Anfragen von der Website beantwortet")


def check_release_gate(c: Check, db) -> None:
    """Drei-Stufen-Freigabe: Fehlerquote der täglichen Stichprobe je Land (über 2 % gelb, über 5 % rot) und
    pausierte Werke (Inhaber 03.10.2026)."""
    import datetime as _dt
    from freigabe import LIMIT_RED, LIMIT_YELLOW
    since = (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(hours=30)).isoformat()
    rows = db.select("run_stats", {"werk": "eq.stichprobe", "finished_at": f"gte.{since}", "order": "finished_at.desc",
                                   "select": "country,candidates,green,reasons,finished_at"})
    seen = {}
    for r in rows:
        seen.setdefault(r["country"], r)
    if not seen:
        c.add("Freigabe", WARN, "Keine Freigabe-Stichprobe in den letzten 30 h", "freigabe-stichprobe.yml prüfen")
    for co, r in sorted(seen.items()):
        n = int(r.get("candidates") or 0)
        rate = (n - int(r.get("green") or 0)) / n if n else None
        top = ", ".join(f"{k} {v}" for k, v in sorted((r.get("reasons") or {}).items(), key=lambda x: -x[1])[:3])
        if rate is None:
            c.add("Freigabe", WARN, f"Stichprobe {co}: keine freien Leads geprüft")
        elif rate > LIMIT_RED:
            c.add("Freigabe", FAIL, f"Stichprobe {co}: Fehlerquote {rate:.1%} ({n} geprüft)", top)
        elif rate > LIMIT_YELLOW:
            c.add("Freigabe", WARN, f"Stichprobe {co}: Fehlerquote {rate:.1%} ({n} geprüft)", top)
        else:
            c.add("Freigabe", OK, f"Stichprobe {co}: Fehlerquote {rate:.1%} ({n} geprüft)")
    from lib.owner_settings import load
    paused = load(db).get("werke_paused") or {}
    for k, v in sorted(paused.items() if isinstance(paused, dict) else []):
        c.add("Werke", WARN, f"{k} pausiert durch Inhaber", f"seit {v}")


def check_sample_supply(c: Check, db) -> None:
    # gleiche Auswahl wie responder.regional_sample (10 vollständige Leads, je Firma einer), ohne PDF zu bauen
    from deliveries import contact_companies
    pages = db.select("landing_pages", {"status": "eq.live", "select": "segment_id,country,slug"})
    known = {False: set(contact_companies(db)), True: set(contact_companies(db, website_optional=True))}
    ready, not_ready = [], []
    for p in pages:
        ok = known[p["segment_id"] == "S2"]
        companies = set()
        for i in range(0, len(sorted(ok)), 100):
            ids = sorted(ok)[i:i + 100]
            for l in db.select("leads", {"segment_id": f"eq.{p['segment_id']}", "country": f"eq.{p['country']}",
                                         "status": "in.(new,sample)", "company_id": f"in.({','.join(ids)})",
                                         "select": "company_id"}):
                companies.add(l["company_id"])
        (ready if len(companies) >= 10 else not_ready).append(p["slug"])
    if not pages:
        c.add("Proben", WARN, "Keine Live-Seiten")
    elif not ready:
        c.add("Proben", FAIL, "Keine Zielgruppe kann eine Probe liefern",
              f"0 von {len(pages)} Seiten haben 10 vollständige Leads – jedes „Ja“ läuft ins Leere")
    elif not_ready:
        c.add("Proben", WARN, f"Probe lieferbar für {len(ready)} von {len(pages)} Seiten",
              "nicht lieferbar: " + ", ".join(not_ready))
    else:
        c.add("Proben", OK, f"Probe lieferbar für alle {len(pages)} Seiten")


def check_sample_stock(c: Check, db) -> None:
    """Fertige Proben im Vorrat je Zielgruppe/Land (Sofortversand nach dem Klick, Inhaber 03.10.2026)."""
    from sample_stock import inventory, live_pages, settings, targets
    from lib.fokus import focus_pairs
    inv = inventory(db)
    from lib.owner_settings import load as load_owner_settings
    want = targets(live_pages(db), settings(), focus_pairs(), load_owner_settings(db)["sample_targets"])
    rows = [f"{s}/{cc} {inv.get(f'{s}/{cc}', 0)}/{t}" for (s, cc), t in want.items()]
    empty = [f"{s}/{cc}" for (s, cc) in want if not inv.get(f"{s}/{cc}")]
    since = (NOW - dt.timedelta(hours=24)).isoformat()
    sent = len(db.select("sample_stock", {"status": "eq.sent", "sent_at": f"gte.{since}", "select": "id"}))
    focus_empty = [k for k in empty if tuple(k.split("/")) in focus_pairs()]
    status = FAIL if focus_empty else WARN if empty else OK
    c.add("Proben", status, f"Vorrat: {sum(inv.values())} fertige Proben (Soll {sum(want.values())}), "
          f"{sent} in 24 h sofort gesendet",
          "je Zielgruppe/Land: " + ", ".join(rows) + (f"; leer: {', '.join(empty)}" if empty else ""))


def check_website(c: Check, db) -> None:
    base = (os.environ.get("SITE_URL") or "https://www.nextgen-profit.de").rstrip("/")
    s = requests.Session()
    s.headers["User-Agent"] = "NextGenProfit-Tagescheck/1.0"
    bad = []
    pages = db.select("landing_pages", {"status": "eq.live", "select": "slug"})
    urls = ["/", "/fr", "/de", "/impressum", "/privacy"] + [f"/{p['slug']}" for p in pages]
    urls += [f"/{p['slug']}/start" for p in pages[:3]]
    for u in urls:
        try:
            r = s.get(base + u, timeout=30)
            if r.status_code != 200:
                bad.append(f"{u} → {r.status_code}")
        except requests.RequestException as e:
            bad.append(f"{u} → {type(e).__name__}")
    if bad:
        c.add("Website", FAIL, f"{len(bad)} von {len(urls)} Seiten fehlerhaft", "; ".join(bad[:8]))
    else:
        c.add("Website", OK, f"Alle {len(urls)} Seiten erreichbar")
    try:
        h = s.get(base + "/api/health?stripe=1", timeout=40).json()
        missing = [k for k, v in (h.get("variablen") or {}).items() if v != "gesetzt"]
        live = ((h.get("stripe") or {}).get("live")) or {}
        if isinstance(live, dict) and live.get("fehler"):
            c.add("Kasse", FAIL, "Stripe live meldet einen Fehler", live["fehler"][:200])
        elif live == "aus":
            c.add("Kasse", WARN, "Stripe live ist aus", "Kasse zeigt nur „per Mail starten“")
        elif isinstance(live, dict) and not live.get("zahlungen"):
            c.add("Kasse", FAIL, "Stripe-Konto nimmt keine Zahlungen an", f"offene Angaben: {live.get('offen')}")
        else:
            c.add("Kasse", OK, "Stripe live nimmt Zahlungen an", f"Deployment {h.get('commit')}")
        if missing:
            c.add("Website", WARN, "Umgebungsvariablen fehlen in Vercel", ", ".join(missing))
    except (requests.RequestException, ValueError) as e:
        c.add("Kasse", FAIL, "/api/health nicht lesbar", type(e).__name__)


def check_customers(c: Check, db) -> None:
    from deliveries import is_test_customer
    subs = db.select("subscriptions", {"select": "id,customer_id,status,first_delivery_approved,created_at,"
                                                 "customers(company_name,status,stripe_customer_id,notes)"})
    tests = [s for s in subs if is_test_customer(s.get("customers") or {})]
    subs = [s for s in subs if s not in tests]  # Käufe im Stripe-Testmodus zählen nicht als Kunden
    active = [s for s in subs if s["status"] == "active"]
    past_due = [s for s in subs if s["status"] == "past_due"]
    if past_due:
        c.add("Kunden", FAIL, f"{len(past_due)} Abo(s) mit fehlgeschlagener Zahlung",
              ", ".join((s.get("customers") or {}).get("company_name") or "?" for s in past_due))
    waiting = db.select("deliveries", {"status": "eq.prepared", "select": "id,subscription_id,created_at"})
    if waiting:
        c.add("Kunden", WARN, f"{len(waiting)} erste Lieferung(en) warten auf deine Freigabe",
              "GitHub → Actions → kundenlieferung → approve")
    # freigegeben, aber seit über einem Tag nicht gesendet (Versandfehler, fehlender Anhang, Lauf ausgefallen)
    stuck = db.select("deliveries", {"status": "eq.approved", "approved_at": f"lte.{(NOW - dt.timedelta(days=1)).isoformat()}",
                                     "select": "id,subscription_id,approved_at"})
    if stuck:
        c.add("Kunden", FAIL, f"{len(stuck)} freigegebene Lieferung(en) seit über einem Tag nicht gesendet",
              "kundenlieferung-Lauf und Meldungen prüfen")
    # letzte Lieferung eines laufenden Abos ohne Leads
    empty = []
    for s in active:
        if not s.get("first_delivery_approved"):
            continue
        last = db.select("deliveries", {"subscription_id": f"eq.{s['id']}", "order": "period_start.desc", "limit": "1",
                                        "select": "lead_ids,period_start"})
        if last and not (last[0].get("lead_ids") or []):
            empty.append((s.get("customers") or {}).get("company_name") or "?")
    if empty:
        c.add("Kunden", WARN, f"{len(empty)} Kunde(n) bekamen zuletzt 0 Leads", ", ".join(empty))
    # Montag nach der Lieferung: jedes freigegebene aktive Abo muss diese Woche eine Lieferung haben
    monday = (NOW - dt.timedelta(days=NOW.weekday())).date()
    if NOW.weekday() == 0 and NOW.hour >= 9:
        done = {d["subscription_id"] for d in db.select("deliveries", {"period_start": f"gte.{monday.isoformat()}",
                                                                        "select": "subscription_id"})}
        late = [s for s in active if s.get("first_delivery_approved") and s["id"] not in done]
        if late:
            c.add("Kunden", FAIL, f"{len(late)} Kunde(n) ohne Lieferung diese Woche")
    no_filter = []
    for s in active:
        f = db.select("customer_filters", {"customer_id": f"eq.{s['customer_id']}",
                                           "select": "signals,industries,regions,exclusions"})
        if not f or not any(f[0].get(k) for k in ("signals", "industries", "regions", "exclusions")):
            no_filter.append((s.get("customers") or {}).get("company_name") or "?")
    detail = f"{len(active)} aktiv" + (f"; ohne Wunsch-Formular: {', '.join(no_filter)}" if no_filter else "") \
        + (f"; {len(tests)} Stripe-Testkauf/-käufe nicht mitgezählt" if tests else "")
    c.add("Kunden", OK if not past_due else WARN, "Abos", detail)


# ---------------------------------------------------------------------------
def mail(c: Check) -> tuple[str, str]:
    fails = [r for r in c.rows if r[1] == FAIL]
    warns = [r for r in c.rows if r[1] == WARN]
    if fails:
        subject = f"Tagescheck {NOW:%d.%m.}: {len(fails)} Problem(e)"
    elif warns:
        subject = f"Tagescheck {NOW:%d.%m.}: läuft, {len(warns)} Hinweis(e)"
    else:
        subject = f"Tagescheck {NOW:%d.%m.}: alles läuft"
    lines = [f"Tagescheck vom {NOW:%d.%m.%Y, %H:%M} UTC", ""]
    for title, rows in (("PROBLEME", fails), ("HINWEISE", warns), ("LÄUFT", [r for r in c.rows if r[1] == OK])):
        if rows:
            lines.append(title)
            lines += [f"  {ICON[s]} {a}: {t}" + (f"\n      {d}" if d else "") for a, s, t, d in rows]
            lines.append("")
    run = os.environ.get("GITHUB_RUN_URL")
    if run:
        lines.append(f"Lauf: {run}")
    return subject, "\n".join(lines)


def _count(db, table: str, params: dict) -> int:
    r = db.s.get(f"{db.base}/{table}", params={**params, "select": "id", "limit": "1"},
                 headers={"Prefer": "count=exact"}, timeout=db.timeout)
    r.raise_for_status()
    return int((r.headers.get("content-range") or "*/0").split("/")[-1] or 0)


def check_werke(c: Check, db) -> None:
    """Lead-Werk und Kunden-Werk: was in 24 h dazukam (Zahlen für die Tagesmail)."""
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24)).isoformat()
    per = []
    for seg in ("S1", "S2", "S4", "S5", "S9"):
        for co in ("US", "UK", "FR"):
            n = _count(db, "leads", {"segment_id": f"eq.{seg}", "country": f"eq.{co}", "created_at": f"gte.{since}"})
            if n:
                per.append(f"{seg}/{co} {n}")
    total = _count(db, "leads", {"status": "eq.new"})
    if cfg("pipeline.yaml", "lead_suche") == "true":
        c.add("Lead-Werk", OK if per else WARN, f"{total} lieferbare Leads im Bestand",
              ("neu in 24 h: " + ", ".join(per)) if per else "in 24 h keine neuen Leads")
    ok = _count(db, "prospects", {"check_status": "eq.ok"})
    call = _count(db, "prospects", {"check_status": "eq.call_only"})
    new = _count(db, "prospects", {"check_status": "in.(ok,call_only)", "checked_at": f"gte.{since}"})
    if cfg("pipeline.yaml", "kunden_suche") == "true":
        # Käufer = nur mail-fähige (Inhaber 02.10.2026); „nur Anruf/Brief“ getrennt und so benannt
        c.add("Kunden-Werk", OK if new or ok + call >= 1_000_000 else WARN,
              f"{ok} mail-fähige Käufer",
              f"getrennt: nur Anruf/Brief {call}; Bestand gesamt {ok + call} von 1.000.000; neu in 24 h: {new}")


def _berlin(ts: str) -> str:
    """Uhrzeit für den Inhaber in deutscher Zeit (Inhaber 03.10.2026), z. B. „04.10. 02:26“."""
    from zoneinfo import ZoneInfo
    t = dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(ZoneInfo("Europe/Berlin"))
    return t.strftime("%d.%m. %H:%M")


def check_plan(c: Check, db) -> None:
    """Autopilot und Speicher-Bremse (werk_plan_log, Nachtschicht 04.10.2026): letzte Verteilung je Werk und
    Datenbankgröße. Gelb ab Bremsstufe „drossel“ (6 GB) oder wenn ein Werk seit 12 h keinen Plan-Job hatte."""
    rows = db.select("werk_plan_log", {"select": "werk,at,mode,bremse,db_bytes,plan", "order": "at.desc", "limit": "40"})
    if not rows:
        c.add("Werke", WARN, "Noch keine Belegung protokolliert", "werk_plan_log leer – Plan-Job prüfen")
        return
    last = rows[0]
    gb = (last.get("db_bytes") or 0) / 1e9
    level = last.get("bremse") or "aus"
    text = {"aus": "aus", "hinweis": "Hinweis ab 5,5 GB", "drossel": "Drossel: höchstens 8 Lead-Plätze",
            "ohne-rohbestand": "nur grüne Leads, kein Rohbestand"}.get(level, level)
    c.add("Speicher", WARN if level in ("drossel", "ohne-rohbestand") else OK,
          f"Datenbank {gb:.2f} GB von 8 GB" if gb else "Datenbankgröße unbekannt", f"Speicher-Bremse: {text}")
    now = dt.datetime.now(dt.timezone.utc)
    for werk in ("lead-werk", "kunden-werk"):
        r = next((x for x in rows if x["werk"] == werk), None)
        if not r:
            continue
        age_h = (now - dt.datetime.fromisoformat(r["at"].replace("Z", "+00:00"))).total_seconds() / 3600
        slots = sum(int(v or 0) for v in (r.get("plan") or {}).values())
        mode = {"autopilot": "Autopilot", "inhaber": "deine Belegung", "standard": "Standard"}.get(r["mode"], r["mode"])
        c.add("Werke", WARN if age_h > 12 else OK, f"{werk}: {slots} Plätze ({mode})",
              f"zuletzt verteilt {_berlin(r['at'])}" + (f" – seit {age_h:.0f} h kein Start" if age_h > 12 else ""))


def kpi_line(db, seg: str, country: str) -> dict:
    """Trichter eines Tests: Erstmails → Antworten (positiv) → Proben → Kunden → Umsatz pro Monat."""
    from deliveries import is_test_customer
    from lib.stats import distinct_replies
    exps = [e["id"] for e in db.select("experiments", {"segment_id": f"eq.{seg}", "country": f"eq.{country}",
                                                        "select": "id"})]
    msgs = set()
    if exps:
        msgs = {m["id"] for m in db.select_all("messages", {"experiment_id": f"in.({','.join(exps)})",
                                                            "status": "eq.sent", "select": "id,kind"})}
    sent = len(msgs)
    events = db.select_all("email_events", {"type": "in.(reply,reply_positive,sample_requested,reply_negative,"
                                                    "unsubscribed,auto_reply)",
                                            "select": "id,type,dedupe_key,message_id"})
    replies = [e for e in distinct_replies(events) if e.get("message_id") in msgs and e["type"] != "auto_reply"]
    positive = sum(e["type"] in ("reply_positive", "sample_requested") for e in replies)
    samples = len(db.select("sample_requests", {"segment_id": f"eq.{seg}", "country": f"eq.{country}", "select": "id"}))
    subs = [s for s in db.select("subscriptions", {"segment_id": f"eq.{seg}", "status": "eq.active",
                                                   "select": "id,amount_cents,price_eur_month,currency,"
                                                             "customers(country,status,stripe_customer_id,notes)"})
            if (s.get("customers") or {}).get("country") == country and not is_test_customer(s.get("customers") or {})]
    revenue = sum((s.get("amount_cents") or 0) / 100 or float(s.get("price_eur_month") or 0) for s in subs)
    cur = {"gbp": "£", "usd": "$"}.get(((subs[0].get("currency") or "") if subs else "").lower(),
                                       {"UK": "£", "US": "$"}.get(country, "€"))
    return {"sent": sent, "replies": len(replies), "positive": positive, "samples": samples,
            "customers": len(subs), "revenue": revenue, "currency": cur}


def check_kpi(c: Check, db) -> None:
    """Kennzahl-Zeile je Fokus-Test (config/fokus.yaml), damit sofort sichtbar ist, wo Umsatz entsteht."""
    from lib.fokus import focus_pairs
    for seg, country in focus_pairs():
        k = kpi_line(db, seg, country)
        c.add("Kennzahl", OK, f"{seg}/{country}: {k['sent']} Mails → {k['replies']} Antworten ({k['positive']} positiv)"
              f" → {k['samples']} Proben → {k['customers']} Kunden → {k['revenue']:.0f} {k['currency']}/Monat")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--send", action="store_true")
    args = ap.parse_args(argv)
    from lib.db import DB
    from lib.owner_settings import stop_if_paused
    db = DB()
    if stop_if_paused(db, "tagescheck"):
        return 0
    c = Check()
    c.guard("Abläufe", lambda: check_workflows(c))
    c.guard("Versand", lambda: check_sending(c, db))
    c.guard("Postfach", lambda: check_mailboxes(c, db))
    c.guard("Nachfass", lambda: check_followups(c, db))
    c.guard("Antworten", lambda: check_replies(c, db))
    c.guard("Proben", lambda: check_web_samples(c, db))
    c.guard("Proben", lambda: check_sample_supply(c, db))
    c.guard("Proben", lambda: check_sample_stock(c, db))
    c.guard("Freigabe", lambda: check_release_gate(c, db))
    c.guard("Website", lambda: check_website(c, db))
    c.guard("Kunden", lambda: check_customers(c, db))
    c.guard("Werke", lambda: check_werke(c, db))
    c.guard("Werke", lambda: check_plan(c, db))
    c.guard("Kennzahl", lambda: check_kpi(c, db))
    subject, body = mail(c)
    print("\n" + subject)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        Path(summary).write_text(f"## {subject}\n\n```\n{body}\n```\n", encoding="utf-8")
    if args.send:
        owner = os.environ.get("OWNER_EMAIL")
        if owner and os.environ.get("RESEND_API_KEY") and os.environ.get("MAIL_FROM"):
            r = requests.post("https://api.resend.com/emails", timeout=30,
                              headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
                              json={"from": os.environ["MAIL_FROM"], "to": [owner], "subject": subject, "text": body})
            r.raise_for_status()
            print(f"Mail an den Inhaber gesendet: {subject}")
        else:
            print("WARNUNG: OWNER_EMAIL/RESEND_API_KEY/MAIL_FROM fehlen – keine Mail")
    return 1 if c.worst == FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
