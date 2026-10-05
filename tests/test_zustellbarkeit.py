"""Täglicher Zustellbarkeits-Check (JARVIS-Plan Gruppe E): Bewertung, Blocklisten, Bounces, Lücke, Rot-Meldung."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import dns_check  # noqa: E402
import zustellbarkeit as Z  # noqa: E402
from fakedb import FakeDB  # noqa: E402

NOW = dt.datetime.now(dt.timezone.utc)
ISO = lambda h: (NOW - dt.timedelta(hours=h)).isoformat()  # noqa: E731

GOOD_DNS = {
    ("nextgen-profit.de", "MX"): ["10 smtpin.rzone.de."],
    ("nextgen-profit.de", "TXT"): ["v=spf1 include:smtp.rzone.de ~all"],
    ("_dmarc.nextgen-profit.de", "TXT"): ["v=DMARC1; p=none"],
    ("strato-dkim-0002._domainkey.nextgen-profit.de", "CNAME"): ["strato-dkim-0002._domainkey.strato.de."],
    ("resend._domainkey.nextgen-profit.de", "TXT"): ["p=abc"],
    ("send.nextgen-profit.de", "MX"): ["10 feedback-smtp.resend.com."],
}


def rec(dns):
    return lambda name, rtype: list(dns.get((name, rtype), []))


def resolver(listed=(), refused=()):
    def resolve(name, rtype="A"):
        if name == "smtp.strato.de":
            return ["81.169.145.133"]
        if any(name.endswith(z) for z in refused):
            return ["127.255.255.254"]
        if any(name.startswith(x) for x in listed):
            return ["127.0.0.2"]
        return []
    return resolve


def db_with(sent=100, bounced=1, resend_sent=10, delivered=10):
    ev = [{"id": f"s{i}", "type": "sent", "message_id": f"m{i}", "resend_id": None, "occurred_at": ISO(30)} for i in range(sent)]
    ev += [{"id": f"b{i}", "type": "bounced", "message_id": f"m{i}", "occurred_at": ISO(20),
            "payload": {"bounce": {"status": "5.1.1"}} if i % 2 == 0 else {"refs": []}} for i in range(bounced)]
    ev += [{"id": f"r{i}", "type": "sent", "message_id": None, "resend_id": f"re{i}", "occurred_at": ISO(5)} for i in range(resend_sent)]
    ev += [{"id": f"d{i}", "type": "delivered", "message_id": None, "resend_id": f"re{i}", "occurred_at": ISO(5)} for i in range(delivered)]
    return FakeDB({"email_events": ev, "seed_checks": [], "deliverability_daily": [], "decisions": [],
                   "jarvis_sessions": [{"id": "sg", "title": "Gehirn", "kind": "gehirn"}], "jarvis_messages": []})


class Scanner(unittest.TestCase):
    def test_schnelle_abmeldungen_sind_scanner_und_gelb(self):
        db = db_with()
        sent = NOW - dt.timedelta(hours=3)
        for i in range(5):
            db.tables.setdefault("messages", []).append({"id": f"u{i}", "sent_at": sent.isoformat()})
            delay = dt.timedelta(seconds=20) if i < 4 else dt.timedelta(hours=1)
            db.tables["email_events"].append({"id": f"x{i}", "type": "unsubscribed", "message_id": f"u{i}",
                                              "occurred_at": (sent + delay).isoformat()})
        sc = Z.scanner(db)
        self.assertEqual((sc["abmeldungen_7t"], sc["scanner_7t"], sc["mensch_7t"]), (5, 4, 1))
        row = Z.run(db, env={}, resolve=resolver(), rec=rec(GOOD_DNS))
        self.assertEqual(row["status"], "gelb")
        self.assertIn("Link-Scanner", " ".join(row["gruende"]))
        self.assertEqual(row["bounces"]["scanner"]["scanner_7t"], 4)

    def test_ohne_abmeldungen_still(self):
        self.assertEqual(Z.scanner(db_with())["quote"], None)


class Bewertung(unittest.TestCase):
    def test_gruen_wenn_alles_passt(self):
        db = db_with()
        row = Z.run(db, env={}, resolve=resolver(), rec=rec(GOOD_DNS))
        self.assertEqual(row["status"], "gruen", row["gruende"])
        self.assertEqual(db.rows("deliverability_daily")[0]["status"], "gruen")
        self.assertEqual(row["blocklists"]["ips"], ["81.169.145.133"])
        self.assertEqual(db.rows("decisions"), [])
        self.assertEqual(row["bounces"]["gesendet_7t"], 100)

    def test_rot_bei_blocklisten_treffer_meldet_gehirn_und_decision_einmal(self):
        db = db_with()
        listed = ("133.145.169.81.zen",)
        row = Z.run(db, env={}, resolve=resolver(listed=listed), rec=rec(GOOD_DNS), push=lambda *a: True)
        self.assertEqual(row["status"], "rot")
        self.assertIn("Spamhaus ZEN 81.169.145.133", row["gruende"][0])
        self.assertEqual(len(db.rows("jarvis_messages")), 1)
        self.assertTrue(db.rows("jarvis_messages")[0]["body"].startswith("Aufgefallen: Zustellbarkeit rot"))
        d = db.rows("decisions")
        self.assertEqual(len(d), 1)
        self.assertEqual(d[0]["kurz_titel"], "Zustellbarkeit rot")
        self.assertLessEqual(len(d[0]["kurz_grund"]), 160)
        Z.run(db, env={}, resolve=resolver(listed=listed), rec=rec(GOOD_DNS), push=lambda *a: True)
        self.assertEqual(len(db.rows("decisions")), 1)          # höchstens einmal je Tag
        self.assertEqual(len(db.rows("deliverability_daily")), 1)  # eine Zeile je Tag (upsert)

    def test_rot_ohne_dmarc(self):
        dns = {k: v for k, v in GOOD_DNS.items() if k[0] != "_dmarc.nextgen-profit.de"}
        row = Z.run(db_with(), env={}, resolve=resolver(), rec=rec(dns), apply=False)
        self.assertEqual(row["status"], "rot")
        self.assertIn("DMARC fehlt", row["gruende"])

    def test_abgelehnte_abfrage_ist_kein_treffer(self):
        row = Z.run(db_with(), env={}, resolve=resolver(refused=("spamhaus.org",)), rec=rec(GOOD_DNS), apply=False)
        self.assertEqual(row["status"], "gelb")
        self.assertTrue(any("nicht prüfbar" in g for g in row["gruende"]))

    def test_gelb_bei_bounce_quote_und_luecke(self):
        row = Z.run(db_with(sent=100, bounced=4, resend_sent=10, delivered=5), env={}, resolve=resolver(),
                    rec=rec(GOOD_DNS), apply=False)
        self.assertEqual(row["status"], "gelb")
        self.assertTrue(any(g.startswith("Bounce-Quote") for g in row["gruende"]))
        self.assertEqual(row["luecke"]["fehlt"], 5)
        self.assertEqual(row["bounces"]["gruende"], {"Adresse unbekannt (5.1.x)": 2, "ohne Code": 2})

    def test_wenige_mails_keine_quote_warnung(self):
        row = Z.run(db_with(sent=5, bounced=2), env={}, resolve=resolver(), rec=rec(GOOD_DNS), apply=False)
        self.assertEqual(row["status"], "gruen")


class BounceKlassen(unittest.TestCase):
    STATS = {"klassen": {"hart": 3, "weich": 1, "richtlinie": 1, "unbekannt": 0},
             "postfaecher": [{"box": "info@", "gesendet": 100, "bounces": 5}],
             "quellen": [{"country": "US", "quelle": "Overture", "gesendet": 40, "hart": 3},
                         {"country": "UK", "quelle": "Website", "gesendet": 10, "hart": 2},
                         {"country": "FR", "quelle": "Website", "gesendet": 50, "hart": 1}]}

    def test_richtlinie_gelb_und_vorschlag_je_schlechter_quelle(self):
        db = db_with()
        db.rpc_handlers["bounce_stats"] = lambda a, p: self.STATS
        row = Z.run(db, env={}, resolve=resolver(), rec=rec(GOOD_DNS))
        self.assertEqual(row["status"], "gelb")
        self.assertTrue(any("Richtlinien-Bounces" in g for g in row["gruende"]))
        self.assertEqual(row["bounces"]["klassen"]["hart"], 3)
        d = db.rows("decisions")
        self.assertEqual(len(d), 1)  # nur US/Overture: 7,5 % bei 40 Mails; UK zu wenig Mails, FR 2 %
        self.assertEqual(d[0]["status"], "proposed")
        self.assertIn("US · Overture", d[0]["kurz_titel"])
        self.assertLessEqual(len(d[0]["kurz_titel"]), 60)
        self.assertLessEqual(len(d[0]["kurz_grund"]), 160)
        Z.run(db, env={}, resolve=resolver(), rec=rec(GOOD_DNS))
        self.assertEqual(len(db.rows("decisions")), 1)  # höchstens einmal je Woche

    def test_ohne_funktion_wie_bisher(self):
        row = Z.run(db_with(), env={}, resolve=resolver(), rec=rec(GOOD_DNS), apply=False)
        self.assertNotIn("klassen", row["bounces"])


class Teile(unittest.TestCase):
    def test_classify(self):
        self.assertEqual(Z.classify([]), "frei")
        self.assertEqual(Z.classify(["127.0.0.2"]), "treffer")
        self.assertEqual(Z.classify(["127.255.255.254"]), "unklar")

    def test_sender_hosts_und_ips(self):
        env = {"SMTP_HOST": "smtp.strato.de", "SMTP_HOST_2": "SMTP.strato.de ", "ZUSTELL_IPS": "1.2.3.4, x"}
        self.assertEqual(Z.sender_hosts(env), ["smtp.strato.de"])
        self.assertEqual(Z.sender_ips(env, resolver()), ["1.2.3.4", "81.169.145.133"])
        self.assertEqual(Z.sender_hosts({}), ["smtp.strato.de"])

    def test_seeds_nur_wenn_eingerichtet(self):
        self.assertEqual(Z.seeds(FakeDB({"seed_checks": []}), env={}), {"aktiv": False})
        self.assertTrue(Z.seeds(FakeDB({"seed_checks": []}), env={"SEED_INBOXES": "a@b.de"})["aktiv"])

    def test_due_erst_ab_sechs_und_einmal(self):
        db = FakeDB({"deliverability_daily": []})
        summer_0410 = dt.datetime(2026, 7, 1, 4, 10, tzinfo=dt.timezone.utc)   # 06:10 MESZ
        winter_0410 = dt.datetime(2026, 12, 1, 4, 10, tzinfo=dt.timezone.utc)  # 05:10 MEZ
        self.assertTrue(Z.due(db, summer_0410))
        self.assertFalse(Z.due(db, winter_0410))
        db.tables["deliverability_daily"].append({"day": "2026-07-01"})
        self.assertFalse(Z.due(db, summer_0410 + dt.timedelta(hours=1)))

    def test_dns_check_liefert_checks(self):
        self.assertTrue(all(ok for _, ok, _ in dns_check.checks("nextgen-profit.de", rec(GOOD_DNS))))


if __name__ == "__main__":
    unittest.main()


class AnbieterTabelle(unittest.TestCase):
    def test_je_land_und_anbieter(self):
        mx = {"a.com": ["aspmx.l.google.com"], "b.com": ["mail.b.com"], "c.co.uk": ["x.mail.protection.outlook.com"]}.get
        rows = [{"country": "US", "to_email": "hello@a.com", "hart": True},
                {"country": "US", "to_email": "info@a.com", "hart": False},
                {"country": "US", "to_email": "info@b.com", "hart": False},
                {"country": "UK", "to_email": "info@c.co.uk", "hart": False}]
        t = Z.anbieter_tabelle(rows, mx)
        self.assertEqual(t[0], {"land": "UK", "anbieter": "m365", "gesendet": 1, "hart": 0, "quote_hart": 0.0})
        us = {x["anbieter"]: x for x in t if x["land"] == "US"}
        self.assertEqual((us["google"]["gesendet"], us["google"]["hart"]), (2, 1))
        self.assertEqual(us["klein"]["gesendet"], 1)

    def test_mx_unklar_zaehlt_als_klein(self):
        t = Z.anbieter_tabelle([{"country": "FR", "to_email": "x@d.fr", "hart": False}], lambda d: None)
        self.assertEqual(t[0]["anbieter"], "klein")
