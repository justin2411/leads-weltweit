"""Tagescheck: funktioniert der ganze Ablauf? (Inhaber 27.09.2026: „wichtig ist, dass unser Workflow funktioniert
und jeden Tag gecheckt wird, ob alles funktioniert“)

Prüft jeden Kontaktpunkt aus docs/workflow (Versand, Nachfassmails, Antworten, Web-Proben, Website, Kasse,
Lieferungen) und die geplanten GitHub-Läufe. Ergebnis als Mail an OWNER_EMAIL; bei Fehlern endet der Lauf rot.

  python scripts/tagescheck.py            # nur ausgeben
  python scripts/tagescheck.py --send     # zusätzlich Mail an den Inhaber
  python scripts/tagescheck.py --dry-run  # Probelauf: Mail nur ausgeben, nichts senden, keine Meldungen schreiben

Kurzzeilen (04.10.2026, Block „KURZ“ direkt nach den Problemen, je 1 Zeile): Zustellbarkeit, Stillstand, Vorrat leer,
Wochen-Trichter, Prognose 30 Tage, Gehirn. Nur Anzeige – sie ändern nie die Ampel der Mail.
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
    # Versand rund um die Uhr (Inhaber 04.10.2026): stündlich, erwartetes Alter aus dem Versandplan (send_max_age)
    "send.yml": ("Versand Kaltmails (24/7)", 3),
    "taeglich.yml": ("Automatiklauf (Nachfassmails, Entwürfe)", 27),
    # läuft rund um die Uhr alle 10 min, Wachhund startet nach 20 min nach -> 1 h Toleranz (Prüfung 04.10.2026)
    "antworten.yml": ("Antwort-Assistent + Web-Proben (24/7)", 1),
    "proben-vorrat.yml": ("Proben-Vorrat + Web-Proben (24/7)", 3),
    "morgenbericht.yml": ("Morgenbericht", 27),
    "sync.yml": ("Bounces/Ereignisse", 27),
    "kaeufer.yml": ("Käufersuche", 27),
    "kundenlieferung.yml": ("Kundenlieferung (montags)", 24 * 7 + 3),
    "wachhund.yml": ("Wachhund (startet ausgefallene Läufe nach)", 3),
    "agenten-werk.yml": ("Agenten-Werk (Speicher + eigene Agenten)", 3),
    "dauerpruefung.yml": ("Dauerprüfung (Prüf-Agenten ohne Tokens)", 3),
    "pruefer-werk.yml": ("Prüfer-Werk (4 Prüfer, 24/7)", 3),
    "zustellbarkeit.yml": ("Zustellbarkeits-Check (06:10)", 27),
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
        self.kurz: list[str] = []  # Kurzzeilen ohne Status (zählen nie für die Ampel)
        self.geschaeft: list[str] = []  # Geschäftsbericht (Titel + 5 Zeilen, scripts/uebergaben.py bericht), nie ein Status
        self.ctx: dict = {}  # Ergebnisse einzelner Checks für die Kurzzeilen (z. B. Datenfluss)

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
def send_max_age(now: dt.datetime) -> float:
    """Höchstes Alter (h) des letzten send.yml-Laufs: der letzte geplante stündliche Versandstart (rund um die Uhr,
    Inhaber 04.10.2026) muss gelaufen sein."""
    from lib import versandzeit
    due = versandzeit.last_due(now)
    if not due:
        return 24 * 15
    # + 1,5 h: ein von GitHub ausgelassener stündlicher Lauf ist noch kein Fehler (der Wachhund startet ihn nach)
    return (now - due[1]).total_seconds() / 3600 + 1.5


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
        if wf == "send.yml":
            max_h = send_max_age(NOW)
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
    from lib import versandzeit
    aktiv = cfg("versand.yaml", "aktiv") == "true"
    # Versand rund um die Uhr (Inhaber 04.10.2026): „gesendet?“ ab dem ersten Lauf des Tags (00:37 deutscher Zeit)
    day_start = versandzeit.send_day_start(NOW) or (NOW - dt.timedelta(hours=26))
    since26 = min(day_start, NOW - dt.timedelta(hours=26)).isoformat()
    since_label = versandzeit.label(day_start)
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
        c.add("Versand", FAIL, f"Keine Mail seit {since_label} gesendet",
              f"{len(queue)} freigegebene Mails warten")
    else:
        c.add("Versand", OK, f"{len(sent_day)} Mails seit {since_label} gesendet (Versand 24/7)",
              f"{detail}; Warteschlange {len(queue)}")
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
        # Gründe aus der Unzustellbar-Meldung (seit 04.10.2026 gespeichert): 5.1.x = Adresse unbekannt, 5.7.x = abgelehnt
        codes: dict[str, int] = {}
        for e in per.get(b, []):
            st = (((e.get("payload") or {}).get("bounce") or {}).get("status") or "") if isinstance(e.get("payload"), dict) else ""
            if st:
                codes[st] = codes.get(st, 0) + 1
        if codes:
            detail += "; Gründe: " + ", ".join(f"{k} ×{v}" for k, v in sorted(codes.items(), key=lambda x: -x[1]))
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
    check_domains(c, sent, ev)


def check_domains(c: Check, sent: list[dict], ev: list[dict]) -> None:
    """Je Versand-Domain (Auftrag 05.10.2026): gesendet, Bounces, Beschwerden der letzten 14 Tage. Gleiche Schwellen
    wie die Notbremse je Domain (lib.deliverability.scoped_stops): Beschwerde rot, über 5 % ab 100 Mails rot."""
    from lib.deliverability import BOUNCE_STOP, MIN_SAMPLE, count_bounces
    from lib.mailboxes import domain_of
    dom = {m["id"]: domain_of(m.get("sent_from")) or "nextgen-profit.de" for m in sent}
    counts: dict[str, int] = {}
    for d in dom.values():
        counts[d] = counts.get(d, 0) + 1
    per: dict[str, list[dict]] = {}
    for e in ev:
        if e.get("message_id") in dom:
            per.setdefault(dom[e["message_id"]], []).append(e)
    for d, n in sorted(counts.items(), key=lambda x: -x[1]):
        bounced, complained = count_bounces(per.get(d, []))
        rate = bounced / n
        detail = f"{n} gesendet, {bounced} Bounces, {complained} Beschwerden (14 Tage)"
        if complained:
            c.add("Domain", FAIL, f"{d}: Spam-Beschwerde", detail)
        elif n >= MIN_SAMPLE and rate > BOUNCE_STOP:
            c.add("Domain", FAIL, f"{d}: Bounce-Quote {rate:.1%}", detail)
        elif n >= BOX_MIN and rate >= BOX_WARN:
            c.add("Domain", WARN, f"{d}: Bounce-Quote {rate:.1%}", detail)
        else:
            c.add("Domain", OK, f"{d}: {n} gesendet, Bounce {rate:.1%}", detail)


def _resting(m: dict, pairs: set) -> bool:
    """Mail einer ruhenden Branche: Versand nur Fokus-Tests (config/fokus.yaml nur_fokus, Inhaber 02.10.2026) – sie
    bleibt freigegeben liegen, das ist Absicht und kein Fehler (gleiche Regel wie outreach.py send)."""
    seg = (m.get("experiments") or {}).get("segment_id")
    country = (m.get("prospects") or {}).get("country")
    return bool(pairs) and (seg, country) not in pairs


def check_followups(c: Check, db) -> None:
    from followups import NEGATIVE
    from lib.fokus import focus_only, focus_pairs
    pairs = set(focus_pairs()) if focus_only() else set()
    emb = "experiments(segment_id),prospects(country)"
    cutoff = (NOW - dt.timedelta(days=5)).isoformat()   # 4 Tage + 1 Tag Puffer für den Automatiklauf
    initial = db.select_all("messages", {"status": "eq.sent", "kind": "eq.initial", "sent_at": f"lte.{cutoff}",
                                         "select": f"id,prospect_id,to_email,{emb}"})
    initial = [m for m in initial if not _resting(m, pairs)]
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
    stuck_all = db.select_all("messages", {"kind": "neq.initial", "status": "eq.approved",
                                           "approved_at": f"lte.{(NOW - dt.timedelta(hours=30)).isoformat()}",
                                           "select": f"id,{emb}"})
    stuck = [m for m in stuck_all if not _resting(m, pairs)]
    resting = len(stuck_all) - len(stuck)
    note = f"{resting} Nachfassmails ruhender Branchen warten (nur Fokus-Tests werden gesendet)" if resting else ""
    if missing:
        c.add("Nachfass", FAIL, f"{len(missing)} Nachfassmails fehlen", "Erstmail > 5 Tage, keine Antwort, keine Nachfassmail")
    elif stuck:
        c.add("Nachfass", FAIL, f"{len(stuck)} Nachfassmails seit über 30 h nicht gesendet", note)
    else:
        c.add("Nachfass", OK, "Nachfassmails vollständig",
              f"{len(initial)} Erstmails älter als 5 Tage geprüft" + (f"; {note}" if note else ""))


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


SCANNER_S = 60  # Abmeldung so kurz nach dem Versand: vermutlich ein Link-Scanner, kein Mensch


def scanner_suspects(events: list[dict], limit_s: int = SCANNER_S) -> int:
    """Abmeldungen über den Link, die weniger als limit_s Sekunden nach dem Versand kamen (Nachtschicht 04.10.2026,
    Entscheidung E12 offen). Nur gezählt – die Sperre bleibt in jedem Fall bestehen."""
    n = 0
    for e in events:
        sent = (e.get("messages") or {}).get("sent_at")
        if not sent or not e.get("occurred_at"):
            continue
        d = (dt.datetime.fromisoformat(e["occurred_at"].replace("Z", "+00:00"))
             - dt.datetime.fromisoformat(sent.replace("Z", "+00:00"))).total_seconds()
        n += 0 <= d < limit_s
    return n


def check_unsubscribes(c: Check, db) -> None:
    since = (NOW - dt.timedelta(days=7)).isoformat()
    ev = db.select("email_events", {"type": "eq.unsubscribed", "created_at": f"gte.{since}",
                                    "select": "occurred_at,message_id,messages(sent_at)"})
    fast = scanner_suspects(ev)
    detail = (f"davon {fast} weniger als {SCANNER_S} s nach dem Versand (Verdacht Link-Scanner, gesperrt bleibt "
              "trotzdem; Entscheidung E12)") if fast else "keine verdächtig schnelle"
    c.add("Antworten", OK, f"Abmeldungen in 7 Tagen: {len(ev)}", detail)


def check_web_samples(c: Check, db) -> None:
    old = (NOW - dt.timedelta(hours=2)).isoformat()
    waiting = db.select("sample_requests", {"status": "eq.new", "created_at": f"lte.{old}",
                                            "select": "company_name,created_at,segment_id,country,note"})
    # Noch nicht lieferbar (keine 10 vollständigen Leads) und Inhaber schon informiert (web_samples.py): Inhaber-Punkt,
    # kein Fehler der Pipeline – gelb. Rot nur, wenn eine Anfrage liegt, ohne dass jemand Bescheid weiß.
    from web_samples import NOTIFIED
    known = [w for w in waiting if NOTIFIED in (w.get("note") or "")]
    open_ = [w for w in waiting if w not in known]
    fmt = lambda ws: ", ".join(f"{w['company_name']} ({w['segment_id']}/{w['country']}, seit {ago(w['created_at']):.0f} h)"  # noqa: E731
                               for w in ws[:5])
    if open_:
        c.add("Proben", FAIL, f"{len(open_)} Probe-Anfragen von der Website unbeantwortet", fmt(open_))
    if known:
        c.add("Proben", WARN, f"{len(known)} Probe-Anfragen warten auf Leads (Inhaber informiert)",
              fmt(known) + " – noch keine 10 vollständigen Leads; persönlich melden")
    if not waiting:
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


SUPPLY_POOL = 300  # je Live-Seite geprüfte Firmen (wie der Block in responder.regional_sample)


def check_sample_supply(c: Check, db) -> None:
    # gleiche Auswahl wie responder.regional_sample (10 vollständige Leads, je Firma einer), ohne PDF zu bauen.
    # Nur die neuesten Firmen je Seite prüfen – contact_companies ohne only blätterte alle Beobachtungen
    # (Millionen Zeilen) und lief jeden Tag in den Timeout 57014 (Prüfung 04.10.2026).
    from deliveries import contact_companies
    pages = db.select("landing_pages", {"status": "eq.live", "select": "segment_id,country,slug"})
    ready, not_ready = [], []
    for p in pages:
        seg = p["segment_id"]
        rows = db.select("leads", {"segment_id": f"eq.{seg}", "country": f"eq.{p['country']}",
                                   "status": "in.(new,sample)", "company_id": "not.is.null",
                                   "order": "created_at.desc,id", "limit": str(SUPPLY_POOL), "select": "company_id"})
        ids = sorted({r["company_id"] for r in rows if r.get("company_id")})
        companies = set(contact_companies(db, website_optional=(seg == "S2"), only=ids)) if ids else set()
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


def check_pools(c: Check, db) -> None:
    """Speicher, aus denen Proben/Lieferungen kommen (pool_routes, Abo-Speicher): reichen sie für 10 verschiedene,
    vollständige Firmen? Bei gesetztem Speicher gibt es kein Ausweichen auf den Gesamtbestand (lib/pools.py)."""
    from lib.pools import shortfalls
    short = shortfalls(db)
    for s in short:
        c.add("Speicher", WARN, f"Speicher {s['name']} reicht nicht für {s['segment']}/{s['country']}",
              f"{s['firmen']} von 10 vollständigen Firmen mit freien Leads – keine Probe aus diesem Speicher "
              f"({', '.join(s['wer'])}); Speicher füllen oder Zuordnung ändern")


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


def premium_lines(rows: list[dict], focus: set[tuple[str, str]]) -> tuple[str, str, str]:
    """(Status, Titel, Detail) aus signalwerk.premium_status() – nur Fokus-Zielgruppen (Test-Matrix) zählen.
    Inhaber 05.10.2026: „nur noch premium leads“; reicht der Premium-Vorrat nicht für reine Premium-Proben (genau 10),
    füllen Standard-Leads auf – das wird hier gemeldet (gelb), nie rot: Proben gehen weiter raus."""
    rows = [r for r in rows if (r["segment_id"], r["country"]) in focus] if focus else rows
    if not rows:
        return OK, "Premium: keine Live-Seite im Fokus", ""
    small = [r for r in rows if r.get("zu_klein")]
    detail = ", ".join(f"{r['segment_id']}/{r['country']} frei {r['premium_frei']}, Proben 10/10 "
                       f"{r['proben_premium']}/{r['proben']}" for r in rows)
    if small:
        return (WARN, "Premium-Vorrat zu klein: " + ", ".join(f"{r['segment_id']}/{r['country']}" for r in small),
                detail + " – Proben mit Standard-Leads aufgefüllt")
    return OK, f"Premium-Proben bereit ({sum(r['proben_premium'] for r in rows)})", detail


def check_premium(c: Check, db) -> None:
    from lib.fokus import focus_pairs
    st, title, detail = premium_lines(db.rpc("premium_status", {}) or [], set(focus_pairs()))
    c.ctx["premium"] = title
    c.add("Premium", st, title, detail)


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
        missing = [k for k, v in (h.get("variablen") or {}).items() if v == "FEHLT"]  # „optional“ = kein Fehlen
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


def check_zustellbarkeit(c: Check, db) -> None:
    """Ergebnis des täglichen Zustellbarkeits-Checks (scripts/zustellbarkeit.py, 06:10 deutscher Zeit)."""
    rows = db.select("deliverability_daily", {"select": "day,status,gruende", "order": "day.desc", "limit": "1"})
    if not rows:
        c.add("Zustellung", WARN, "Noch kein Zustellbarkeits-Check", "zustellbarkeit.yml läuft täglich 06:10")
        return
    r = rows[0]
    old = r["day"] < (NOW - dt.timedelta(hours=30)).date().isoformat()
    status = {"gruen": OK, "gelb": WARN, "rot": FAIL}.get(r["status"], WARN)
    if old and status == OK:
        status = WARN
    word = {"gruen": "grün", "gelb": "gelb", "rot": "rot"}.get(r["status"], r["status"])
    c.add("Zustellung", status, f"Zustellbarkeit {word} ({r['day']})" + (" – veraltet" if old else ""),
          "; ".join(r.get("gruende") or [])[:200])


def check_bounce_klassen(c: Check, db) -> None:
    """Bounce-Klassen der letzten 7 Tage (signalwerk.bounce_stats, 04.10.2026). Richtlinien-Bounces (Spam,
    Blockliste, Absender abgelehnt) zeigen ein Ruf-Problem des Absenders -> gelb. Nur Anzeige, Versand unverändert."""
    st = db.rpc("bounce_stats", {"p_days": 7})
    if not isinstance(st, dict) or not st.get("gesendet"):
        return
    k = st.get("klassen") or {}
    detail = (f"{st.get('bounces', 0)} von {st['gesendet']} Mails · hart {k.get('hart', 0)}, weich {k.get('weich', 0)}, "
              f"Richtlinie {k.get('richtlinie', 0)}, unbekannt {k.get('unbekannt', 0)} (7 Tage)")
    if k.get("richtlinie"):
        c.add("Zustellung", WARN, f"{k['richtlinie']} Richtlinien-Bounces (Spam/Blockliste)", detail)
    else:
        c.add("Zustellung", OK, "Keine Richtlinien-Bounces", detail)


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
    # Lieferungen an Stripe-Testkäufe sind keine echten Freigaben/Rückstände (Prüfung 04.10.2026)
    test_ids = {s["id"] for s in tests}
    waiting = [d for d in db.select("deliveries", {"status": "eq.prepared", "select": "id,subscription_id,created_at"})
               if d.get("subscription_id") not in test_ids]
    if waiting:
        c.add("Kunden", WARN, f"{len(waiting)} erste Lieferung(en) warten auf deine Freigabe",
              "GitHub → Actions → kundenlieferung → approve")
    # freigegeben, aber seit über einem Tag nicht gesendet (Versandfehler, fehlender Anhang, Lauf ausgefallen)
    stuck = [d for d in db.select("deliveries", {"status": "eq.approved",
                                                 "approved_at": f"lte.{(NOW - dt.timedelta(days=1)).isoformat()}",
                                                 "select": "id,subscription_id,approved_at"})
             if d.get("subscription_id") not in test_ids]
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
    lines = [f"Tagescheck vom {_berlin(NOW.isoformat())} Uhr (deutsche Zeit)", ""]
    if c.geschaeft:  # Firma (Inhaber 04.10.2026): Geschäftsbericht ganz oben, je Zeile eine Zahl
        lines += [c.geschaeft[0].upper()] + [f"  · {z}" for z in c.geschaeft[1:]] + [""]
    for title, rows in (("PROBLEME", fails), ("KURZ", None), ("HINWEISE", warns),
                        ("LÄUFT", [r for r in c.rows if r[1] == OK])):
        if rows is None:  # Kurzzeilen direkt nach den Problemen (Wichtigstes oben)
            if c.kurz:
                lines += ["KURZ"] + [f"  · {k}" for k in c.kurz] + [""]
            continue
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


def _safe_count(db, table: str, params: dict) -> int | None:
    """Wie _count, aber eine Zeitüberschreitung (57014) macht nur diese Zahl „nicht messbar“ statt den ganzen
    Check abzubrechen (Prüfung 04.10.2026)."""
    try:
        return _count(db, table, params)
    except (requests.RequestException, RuntimeError) as e:
        print(f"Zählung {table} {params} nicht messbar: {type(e).__name__}: {str(e)[:120]}")
        return None


def _fmt(n: int | None) -> str:
    return "nicht messbar" if n is None else str(n)


BUYERS_NEW_MIN = 50  # neue mail-fähige Fokus-Käufer je 24 h, darunter gelb (Prüfung 04.10.2026)


def check_werke(c: Check, db) -> None:
    """Lead-Werk und Kunden-Werk: was in 24 h dazukam (Zahlen für die Tagesmail)."""
    from lib.fokus import focus_pairs
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24)).isoformat()
    focus = focus_pairs()
    if cfg("pipeline.yaml", "lead_suche") == "true":
        per, unknown = [], []
        for seg in ("S1", "S2", "S4", "S5", "S9"):
            for co in ("US", "UK", "FR"):
                n = _safe_count(db, "leads", {"segment_id": f"eq.{seg}", "country": f"eq.{co}",
                                              "created_at": f"gte.{since}"})
                if n is None:
                    unknown.append(f"{seg}/{co}")
                elif n:
                    per.append(f"{seg}/{co} {n}")
        # Bestand nur im Fokus und ausdrücklich vor der Drei-Stufen-Freigabe – nicht „lieferbar“ (Prüfung 04.10.2026)
        stock = [_safe_count(db, "leads", {"segment_id": f"eq.{s}", "country": f"eq.{co}", "status": "eq.new"})
                 for s, co in focus]
        total = None if None in stock else sum(stock)
        label = ", ".join(f"{s}/{co}" for s, co in focus) or "alle"
        detail = ("neu in 24 h: " + ", ".join(per)) if per else "in 24 h keine neuen Leads"
        if unknown:
            detail += "; nicht messbar: " + ", ".join(unknown)
        c.add("Lead-Werk", OK if per else WARN, f"{_fmt(total)} Leads im Bestand (vor Freigabe), Fokus {label}", detail)
    if cfg("pipeline.yaml", "kunden_suche") != "true":
        return
    # Käufer = nur mail-fähige: check_status ok in den Mail-Ländern der Zielgruppe (Inhaber 02.10.2026, wie
    # app/lib/storage.ts); „nur Anruf/Brief“ getrennt und so benannt
    segs = {r["id"]: sorted(r.get("email_countries") or []) for r in db.select("segments",
                                                                                {"select": "id,email_countries"})}
    mail, unknown = 0, []
    for seg, countries in sorted(segs.items()):
        if not countries:
            continue
        n = _safe_count(db, "prospects", {"check_status": "eq.ok", "segment_id": f"eq.{seg}",
                                          "country": f"in.({','.join(countries)})"})
        if n is None:
            unknown.append(seg)
        else:
            mail += n
    ok_all = _safe_count(db, "prospects", {"check_status": "eq.ok"})
    call = _safe_count(db, "prospects", {"check_status": "eq.call_only"})
    new = _safe_count(db, "prospects", {"check_status": "in.(ok,call_only)", "checked_at": f"gte.{since}"})
    call_total = None if call is None or ok_all is None or unknown else call + ok_all - mail
    stock = None if call is None or ok_all is None else ok_all + call
    detail = (f"getrennt: nur Anruf/Brief {_fmt(call_total)}; Bestand gesamt {_fmt(stock)} von 1.000.000; "
              f"neu in 24 h: {_fmt(new)}")
    if unknown:
        detail += "; nicht messbar: " + ", ".join(unknown)
    title = f"{mail} mail-fähige Käufer" + (" (unvollständig)" if unknown else "")
    c.add("Kunden-Werk", OK if new or (stock or 0) >= 1_000_000 else WARN, title, detail)
    # Nachschub im Fokus: neue mail-fähige Käufer je Fokus-Zielgruppe in 24 h (Prüfung 04.10.2026)
    for seg in sorted({s for s, _ in focus}):
        countries = segs.get(seg) or []
        if not countries:
            continue
        n = _safe_count(db, "prospects", {"check_status": "eq.ok", "segment_id": f"eq.{seg}",
                                          "country": f"in.({','.join(countries)})", "checked_at": f"gte.{since}"})
        if n is not None and n < BUYERS_NEW_MIN:
            c.add("Kunden-Werk", WARN, f"{seg}-Käufer: < {BUYERS_NEW_MIN} neu in 24 h",
                  f"{n} neue mail-fähige Käufer ({', '.join(countries)}) – Kunden-Werk/Quellen prüfen")


def _berlin(ts: str) -> str:
    """Uhrzeit für den Inhaber in deutscher Zeit (Inhaber 03.10.2026), z. B. „04.10. 02:26“."""
    from zoneinfo import ZoneInfo
    t = dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(ZoneInfo("Europe/Berlin"))
    return t.strftime("%d.%m. %H:%M")


def check_plan(c: Check, db) -> None:
    """Autopilot und Speicher-Bremse (werk_plan_log, Nachtschicht 04.10.2026): letzte Verteilung je Werk und
    Datenbankgröße. Rot ab Bremsstufe „drossel“ (6 GB; Prüfung 04.10.2026: die Datenbank wächst ~1,3 GB/Tag, 8 GB
    kosten extra), gelb bei „hinweis“ oder wenn ein Werk seit 12 h keinen Plan-Job hatte. GB = 1024³ Byte wie
    werk_plan.py und die Speicher-Seite."""
    from werk_plan import GB
    rows = db.select("werk_plan_log", {"select": "werk,at,mode,bremse,db_bytes,plan", "order": "at.desc", "limit": "40"})
    if not rows:
        c.add("Werke", WARN, "Noch keine Belegung protokolliert", "werk_plan_log leer – Plan-Job prüfen")
        return
    last = rows[0]
    gb = (last.get("db_bytes") or 0) / GB
    level = last.get("bremse") or "aus"
    text = {"aus": "aus", "hinweis": "Hinweis (ab 5,5 GB)", "drossel": "Drossel: höchstens 8 Lead-Plätze (ab 6 GB)",
            "ohne-rohbestand": "nur grüne Leads, kein Rohbestand (ab 7 GB)",
            "stopp": "Lead-Werk gestoppt (ab 7,5 GB) – bitte über Aufräumen entscheiden"}.get(level, level)
    status = FAIL if level in ("drossel", "ohne-rohbestand", "stopp") else WARN if level == "hinweis" else OK
    c.add("Speicher", status, f"Datenbank {gb:.2f} GB von 8 GB" if gb else "Datenbankgröße unbekannt",
          f"Speicher-Bremse: {text}")
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
    sent_msgs = []
    if exps:
        sent_msgs = db.select_all("messages", {"experiment_id": f"in.({','.join(exps)})", "status": "eq.sent",
                                               "select": "id,kind"})
    # Antworten über alle gesendeten Mails zuordnen, gezählt werden aber nur Erstmails (Prüfung 04.10.2026)
    msgs = {m["id"] for m in sent_msgs}
    sent = sum((m.get("kind") or "initial") == "initial" for m in sent_msgs)
    events = db.select_all("email_events", {"type": "in.(reply,reply_positive,sample_requested,reply_negative,"
                                                    "unsubscribed,auto_reply)",
                                            "select": "id,type,dedupe_key,message_id"})
    replies = [e for e in distinct_replies(events) if e.get("message_id") in msgs and e["type"] != "auto_reply"]
    positive = sum(e["type"] in ("reply_positive", "sample_requested") for e in replies)
    # Proben-Anfragen des Inhabers selbst (Test der Seite) zählen nicht (Prüfung 04.10.2026)
    owner = (os.environ.get("OWNER_EMAIL") or "").strip().lower()
    samples = sum((r.get("email") or "").strip().lower() != owner or not owner
                  for r in db.select("sample_requests", {"segment_id": f"eq.{seg}", "country": f"eq.{country}",
                                                         "select": "id,email"}))
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


def check_datenfluss(c: Check, db, apply: bool = True) -> None:
    """Datenfluss steht still (JARVIS-Plan C3): je Station der Kette Zuwachs im üblichen Intervall × 3? Meldet zugleich
    in JARVIS (Vorschlag) und im Gehirn-Chat – höchstens 1× je 6 h je Station (scripts/datenfluss.py)."""
    import datenfluss
    res = datenfluss.stillstand(db, apply=apply)
    c.ctx["datenfluss"] = res
    for a in res:
        if a["stufe"] in ("gelb", "rot"):
            c.add("Datenfluss", FAIL if a["stufe"] == "rot" else WARN, f"{a['name']} steht still",
                  f"seit {a['still_h']:.0f} h kein Zuwachs, üblich alle {a['intervall_h']:g} h")
        elif a["stufe"] == "ok":
            c.add("Datenfluss", OK, f"{a['name']} fließt", f"zuletzt vor {a['still_h']:g} h")
        else:
            c.add("Datenfluss", OK, f"{a['name']}: {a.get('grund', '')}")


# ---------------------------------------------------------------------------
# Kurzzeilen (04.10.2026): je höchstens 1 Zeile, nur Anzeige. Sie setzen nie einen Status – die Ampel der Mail
# bleibt bei den Regeln der Checks oben. Fehlt eine Zahl, steht „nicht messbar“ statt eines Fehlers.
KURZ_MAX = 160
GEHIRN_STILL_H = 3  # länger ohne Lebenszeichen der stündlichen Gehirn-Routine -> „still seit … h“


def _pct(x: float) -> str:
    return f"{x * 100:.1f} %".replace(".", ",")


def _cut(text: str) -> str:
    return text if len(text) <= KURZ_MAX else text[:KURZ_MAX - 1] + "…"


def kurz_zustellung(row: dict | None, stats: dict | None) -> str:
    """Ampel aus deliverability_daily, Bounce-Quote 7 T und Bounce-Klassen (bounce_stats)."""
    if not row:
        out = "Zustellbarkeit: noch kein Check"
    else:
        word = {"gruen": "grün", "gelb": "gelb", "rot": "rot"}.get(row.get("status"), str(row.get("status")))
        day = str(row.get("day") or "")
        out = f"Zustellbarkeit {word}" + (f" ({day[8:10]}.{day[5:7]}.)" if len(day) >= 10 else "")
        b = row.get("bounces") or {}
        sent = int(b.get("gesendet_7t") or 0)
        if sent:
            n = int(b.get("bounces_7t") or 0)
            q = b.get("quote")
            out += f" · Bounce 7 T {_pct(float(q) if q is not None else n / sent)} ({n}/{sent})"
    if isinstance(stats, dict) and stats.get("gesendet"):
        k = stats.get("klassen") or {}
        out += f" · hart {k.get('hart', 0)}, weich {k.get('weich', 0)}, Richtlinie {k.get('richtlinie', 0)}"
    return _cut(out)


def kurz_stillstand(res: list[dict] | None) -> str:
    """Nur gelbe/rote Stationen aus datenfluss.stillstand (rote zuerst)."""
    if res is None:
        return "Stillstand: nicht messbar"
    bad = sorted((a for a in res if a.get("stufe") in ("rot", "gelb")), key=lambda a: a["stufe"] != "rot")
    if not bad:
        return "Stillstand: keiner"
    return _cut("Stillstand: " + " · ".join(
        f"{a['name']} {a['stufe']} ({a.get('still_h') or 0:.0f} h, üblich {a.get('intervall_h') or 0:g} h)"
        for a in bad))


def kurz_trichter(rows: list[dict] | None, week: str, countries: list[str]) -> str:
    """Trichter der aktuellen Versandwoche je Land (cohort_funnel): gesendet→zugestellt→Antwort."""
    kw = f"KW {int(week.split('W')[-1])}" if "W" in week else week
    if rows is None:
        return f"Trichter {kw}: nicht messbar"
    by = {r.get("country"): r for r in rows if r.get("week") == week}
    parts = [f"{co} {int(r.get('sent') or 0)}→{int(r.get('delivered') or 0)}→{int(r.get('replies') or 0)}"
             if (r := by.get(co)) else f"{co} 0" for co in countries]
    return _cut(f"Trichter {kw} (gesendet→zugestellt→Antwort): " + (" · ".join(parts) or "kein Testland"))


def kurz_prognose(ps: list[dict] | None) -> str:
    """Prognose 30 Tage je Land (scripts/prognose.py); ohne Antworten ehrlich „noch keine Basis“."""
    if ps is None:
        return "Prognose 30 T: nicht messbar"
    from lib.prognose import fmt_range
    parts = []
    for p in ps:
        co, cur = p.get("country"), p.get("currency") or ""
        if p.get("basis") == "kein_versand":
            part = f"{co} kein Versand"
        elif p.get("basis") == "keine" or not p.get("antworten30"):
            part = f"{co} noch keine Basis"
        elif p.get("umsatz30"):
            part = f"{co} {fmt_range(p['umsatz30'], ' ' + cur)}/Mon."
        elif p.get("proben30"):
            part = f"{co} ~{fmt_range(p['proben30'])} Proben"
        else:
            part = f"{co} ~{fmt_range(p['antworten30'])} Antworten"
        parts.append(part + (" (wenig Daten)" if p.get("basis") == "duenn" else ""))
    return _cut("Prognose 30 T: " + (" · ".join(parts) if parts else "kein Testland"))


def lane_labels() -> dict[str, str]:
    """Namen der Linien (app/lib/werk-linien.json), z. B. web-uk -> „Website-Prüfung UK“."""
    import json
    try:
        lanes = json.loads((ROOT / "app" / "lib" / "werk-linien.json").read_text(encoding="utf-8")).get("lanes") or []
    except (OSError, ValueError):
        return {}
    return {x["id"]: x.get("label") or x["id"] for x in lanes if x.get("id")}


def kurz_vorrat(rows: list[dict] | None, labels: dict[str, str]) -> str:
    """Lead-Linien, die der letzte Plan-Lauf des Lead-Werks als „Vorrat leer“ führt (werk_plan_log.reasons)."""
    from werk_plan import EMPTY_WHY
    rows = sorted((r for r in rows or [] if r.get("werk") == "lead-werk"), key=lambda r: r.get("at") or "", reverse=True)
    if not rows:
        return "Vorrat leer: noch kein Plan-Lauf"
    reasons = rows[0].get("reasons") if isinstance(rows[0].get("reasons"), dict) else {}
    empty = [labels.get(k, k) for k, why in sorted(reasons.items()) if str(why or "").startswith(EMPTY_WHY)]
    return _cut("Vorrat leer: " + (", ".join(empty) if empty else "keine Lead-Linie"))


def kurz_gehirn(enabled: bool | None, last_at: list[str | None], note_at: str | None, tasks: list[dict],
                now: dt.datetime | None = None) -> str:
    """Gehirn aktiv? Letztes Lebenszeichen (Gehirn-Chat, Notizen), letzte Tagesnotiz, Agenten-Aufträge in 24 h."""
    now = now or NOW
    if enabled is False:
        head = "Gehirn: abgeschaltet (Not-Aus)"
    else:
        ts = [dt.datetime.fromisoformat(x.replace("Z", "+00:00")) for x in last_at if x]
        if not ts:
            head = "Gehirn: kein Lebenszeichen"
        else:
            last = max(ts)
            h = (now - last).total_seconds() / 3600
            head = (f"Gehirn: still seit {h:.0f} h" if h > GEHIRN_STILL_H else "Gehirn: aktiv") \
                + f", zuletzt {_berlin(last.isoformat())}"
    note = f"Tagesnotiz {_berlin(note_at)[:6]}" if note_at else "keine Tagesnotiz"
    done = sum(t.get("status") == "fertig" for t in tasks)
    return _cut(f"{head} · {note} · {len(tasks)} Agenten-Aufträge in 24 h ({done} fertig)")


def kurz_pruefung(kpi: dict | None) -> str:
    """Dauerprüfung (Prüf-Agenten ohne Tokens) der letzten 24 h: geprüft, gehalten, Ausreißer."""
    if not kpi or not kpi.get("letzter_lauf"):
        return "Dauerprüfung: noch kein Lauf"
    tage = kpi.get("tage") or []
    last = max((t.get("tag") for t in tage), default=None)
    agg: dict[str, list[int]] = {}
    for t in tage:
        if t.get("tag") == last:
            a = agg.setdefault(t.get("art") or "lead", [0, 0])
            a[0] += int(t.get("geprueft") or 0)
            a[1] += int(t.get("geprueft") or 0) - int(t.get("bestanden") or 0)
    parts = [f"{'Leads' if k == 'lead' else 'Käufer'} {v[0]} geprüft, {v[1]} abweichend" for k, v in sorted(agg.items(), reverse=True)]
    out = kpi.get("ausreisser") or []
    tail = f" · Ausreißer: {', '.join(str(o.get('segment_id')) + '/' + str(o.get('country')) for o in out[:3])}" if out else ""
    return _cut("Dauerprüfung heute: " + ("; ".join(parts) or "nichts geprüft") + tail)


def kurz_pruefer(rows: list[dict] | None) -> str:
    """Prüfer-Werk der letzten 24 h (View signalwerk.pruefer_kpi): geprüft, Qualität lieferbar %, gehalten je Land."""
    rows = [r for r in (rows or []) if int(r.get("geprueft_24h") or 0) > 0]
    if not rows:
        return "Prüfer-Werk: in 24 h nichts geprüft"
    n = sum(int(r["geprueft_24h"]) for r in rows)
    ok = sum(int(r.get("bestanden_24h") or 0) for r in rows)
    held = sum(int(r.get("gehalten_24h") or 0) for r in rows)
    per = ", ".join(f"{r['country']} {float(r['qualitaet_pct']):.0f} %" for r in sorted(rows, key=lambda x: x["country"])
                    if r.get("qualitaet_pct") is not None)
    return _cut(f"Prüfer-Werk 24 h: {n} geprüft, Qualität lieferbar {100 * ok / n:.1f} %, {held} gehalten"
                + (f" ({per})" if per else ""))


def collect_kurz(c: Check, db) -> None:
    """Füllt c.kurz in fester Reihenfolge (Wichtigstes oben). Jede Zeile einzeln abgesichert, nie ein Status."""
    from zoneinfo import ZoneInfo

    def line(label: str, fn) -> None:
        try:
            text = fn()
        except Exception as e:  # noqa: BLE001 - eine fehlende Zahl darf die Mail nie rot machen
            print(f"Kurzzeile {label} nicht messbar: {type(e).__name__}: {str(e)[:120]}")
            text = f"{label}: nicht messbar"
        c.kurz.append(text)
        print(f"[·] Kurz       {text}")

    def zustellung():
        rows = db.select("deliverability_daily", {"select": "day,status,bounces", "order": "day.desc", "limit": "1"})
        try:
            st = db.rpc("bounce_stats", {"p_days": 7})
        except Exception:  # noqa: BLE001 - Klassen fehlen dann nur
            st = None
        return kurz_zustellung(rows[0] if rows else None, st)

    def trichter():
        from lib.fokus import test_scope
        segs, countries = test_scope()
        week = NOW.astimezone(ZoneInfo("Europe/Berlin")).strftime("%G-W%V")
        parts = []
        for seg in segs:
            rows = db.rpc("cohort_funnel", {"p_segment": seg, "p_countries": countries, "p_weeks": 1})
            t = kurz_trichter(rows if isinstance(rows, list) else None, week, countries)
            parts.append(t if len(segs) == 1 else f"{seg} {t}")
        return _cut(" | ".join(parts) or "Trichter: kein Testland")

    def prognose():
        import prognose as pg
        from lib.fokus import test_scope
        segs, countries = test_scope()
        return _cut(" | ".join(kurz_prognose(pg.load(db, s, countries)) for s in segs) or "Prognose 30 T: kein Testland")

    def vorrat():
        rows = db.select("werk_plan_log", {"select": "werk,at,reasons", "werk": "eq.lead-werk",
                                           "order": "at.desc", "limit": "1"})
        return kurz_vorrat(rows, lane_labels())

    def gehirn():
        st = db.select("settings", {"select": "brain_enabled", "limit": "1"})
        enabled = st[0].get("brain_enabled") if st else None
        last = []
        sess = db.select("jarvis_sessions", {"select": "id", "kind": "eq.gehirn"})
        if sess:
            m = db.select("jarvis_messages", {"select": "created_at", "role": "eq.jarvis",
                                              "session_id": f"in.({','.join(str(s['id']) for s in sess)})",
                                              "order": "created_at.desc", "limit": "1"})
            last.append(m[0]["created_at"] if m else None)
        d = db.select("decisions", {"select": "created_at", "type": "in.(daily_note,note)",
                                    "order": "created_at.desc", "limit": "1"})
        last.append(d[0]["created_at"] if d else None)
        note = db.select("decisions", {"select": "created_at", "type": "eq.daily_note",
                                       "order": "created_at.desc", "limit": "1"})
        since = (NOW - dt.timedelta(hours=24)).isoformat()
        tasks = db.select("agent_tasks", {"select": "id,status", "created_at": f"gte.{since}"})
        return kurz_gehirn(enabled, last, note[0]["created_at"] if note else None, tasks)

    line("Zustellbarkeit", zustellung)
    line("Stillstand", lambda: kurz_stillstand(c.ctx.get("datenfluss")))
    line("Vorrat leer", vorrat)
    line("Trichter", trichter)
    line("Prognose 30 T", prognose)
    line("Gehirn", gehirn)
    line("Dauerprüfung", lambda: kurz_pruefung(db.rpc("pruef_kpi", {"p_days": 1})))
    line("Prüfer-Werk", lambda: kurz_pruefer(db.select("pruefer_kpi", {"select": "*"})))


def collect_geschaeft(c: Check, db) -> None:
    """Geschäftsbericht der Firma (Titel ≤ 60 + 5 Zeilen, je 1 Zahl) aus signalwerk.firma_lage; Fehler = keine Zeilen."""
    try:
        import uebergaben
        from lib.fokus import test_scope
        segs, countries = test_scope()
        b = uebergaben.bericht(db.rpc("firma_lage", {"p_segment": segs[0] if segs else "S2", "p_countries": countries}) or {})
        c.geschaeft = [b["titel"], *b["zeilen"]]
        print(f"[·] Geschäft   {' · '.join(c.geschaeft)}")
    except Exception as e:  # noqa: BLE001 - der Bericht darf den Tagescheck nie stören
        print(f"Geschäftsbericht nicht messbar: {type(e).__name__}: {str(e)[:120]}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--send", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="Probelauf: keine Mail, keine Datenfluss-Meldungen")
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
    c.guard("Antworten", lambda: check_unsubscribes(c, db))
    c.guard("Proben", lambda: check_web_samples(c, db))
    c.guard("Proben", lambda: check_sample_supply(c, db))
    c.guard("Proben", lambda: check_sample_stock(c, db))
    c.guard("Premium", lambda: check_premium(c, db))
    c.guard("Speicher", lambda: check_pools(c, db))
    c.guard("Freigabe", lambda: check_release_gate(c, db))
    c.guard("Website", lambda: check_website(c, db))
    c.guard("Zustellung", lambda: check_zustellbarkeit(c, db))
    c.guard("Zustellung", lambda: check_bounce_klassen(c, db))
    c.guard("Kunden", lambda: check_customers(c, db))
    c.guard("Werke", lambda: check_werke(c, db))
    c.guard("Werke", lambda: check_plan(c, db))
    c.guard("Datenfluss", lambda: check_datenfluss(c, db, apply=not args.dry_run))
    c.guard("Kennzahl", lambda: check_kpi(c, db))
    collect_kurz(c, db)  # nur Anzeige, nie ein Status
    collect_geschaeft(c, db)  # nur Anzeige, nie ein Status
    subject, body = mail(c)
    print("\n" + subject)
    if args.dry_run:
        print("\n" + body + "\n\nProbelauf: keine Mail gesendet.")
        return 1 if c.worst == FAIL else 0
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
