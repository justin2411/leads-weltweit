"""Beleg-Einstieg im Versand (Auftrag c5da4536): Variante B nennt 2 echte, über die Drei-Stufen-Freigabe freigegebene
Premium-Anlässe aus dem Land des Käufers, die Leads werden danach für genau diesen Käufer reserviert. Auswahl,
Reservierung, Rückgabe und alle Fälle, in denen die Mail unverändert bleibt und nicht zählt."""
import datetime as dt
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import ab as cli  # noqa: E402
import drafts  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from lib import ab  # noqa: E402
from lib.rules import lint_draft  # noqa: E402

TODAY = dt.date(2026, 10, 8)
A_US = ("I'm writing to the team at {firma} directly. I'm Justin, founder of NextGen Profit. We find local businesses "
        "across the US that still have no website, a clear reason for them to talk to a web agency.")
B_US = ("I'm Justin, founder of NextGen Profit. We find local businesses across the US that still have no website, a "
        "clear reason for them to talk to a web agency. {belege}")


def T(**x):
    return {"id": "tb", "step": "mail_einstieg", "segment_id": "S2", "country": "US", "element": "einstieg",
            "status": "laeuft", "salt": "beleg", "min_n": 100, "gestartet": "2026-10-08T00:00:00+00:00",
            "varianten": [{"key": "A", "einstieg": A_US}, {"key": "B", "einstieg": B_US}], **x}


def units(v: str, n: int = 1) -> list[str]:
    ids = (f"{i:08d}-1b2d-4c5e-9f00-112233445566" for i in range(500))
    return [x for x in ids if ab.assign("beleg", x) == v][:n]


def unit(v: str) -> str:
    return units(v)[0]


def lead(i, name, sig="new_incorporation", d="2026-10-02", **x):
    return ({"id": f"l{i}", "company_id": f"c{i}", "segment_id": "S2", "country": "US", "status": "new",
             "premium_score": 80, "premium": {"tier": "premium"}, "signal_type": sig, "event_date": d, **x},
            {"id": f"c{i}", "name": name})


def make_db(leads, frei=3761):
    db = FakeDB({"leads": [l for l, _ in leads], "watch_companies": [c for _, c in leads], "ab_tests": [],
                 "beleg_reservierungen": []})
    db.rpc_handlers["premium_status"] = lambda a, p: [{"segment_id": "S2", "country": "US", "premium_frei": frei},
                                                      {"segment_id": "S2", "country": "UK", "premium_frei": 264}]

    def reservieren(a, p):
        rows = {l["id"]: l for l in db.tables["leads"]}
        if not all(rows[i]["status"] == "new" for i in a["p_lead_ids"]):
            raise RuntimeError("beleg_vergeben")
        for i in a["p_lead_ids"]:
            rows[i]["status"] = "reserved"
            db.tables["beleg_reservierungen"].append({"lead_id": i, "prospect_id": a["p_prospect"],
                                                      "message_id": a["p_message"], "status": "reserviert"})
        return list(a["p_lead_ids"])
    db.rpc_handlers["beleg_reservieren"] = reservieren
    db.rpc_handlers["beleg_freigeben"] = lambda a, p: 0
    db.rpc_handlers["beleg_gesendet"] = lambda a, p: 2
    return db


GOOD = [lead(1, "Blue Ridge Hauling LLC"), lead(2, "Acme Inc", "cert_expiring", "2026-10-04"),
        lead(3, "Cedar Works LLC", "no_website", "2026-10-01"), lead(4, "Delta Freight Inc", "relocation", "2026-10-03")]


class BelegMailTest(unittest.TestCase):
    def setUp(self):
        self.gated: list[list[str]] = []

    def ctx(self, db, live=True, gate=None):
        c = ab.Ctx(tests=[T()])
        c.belege = ab.BelegQuelle(db, live, log=lambda *_: None, today=TODAY,
                                  gate=gate or (lambda cand, cc: self.gated.append([x["id"] for x in cand]) or
                                                [x["id"] for x in cand]))
        return c

    def mail(self, pid):
        p = {"id": pid, "segment_id": "S2", "country": "US", "company_name": "Pixel Studio LLC", "specialization": "",
             "region": ""}
        s, b, lang = drafts.build(p)
        return {"id": f"m-{pid}", "subject": s, "body": b, "language": lang}, p, (lambda s, b: lint_draft(s, b, lang).ok)

    def test_b_bekommt_zwei_freigegebene_belege_und_reserviert(self):
        db = make_db(GOOD)
        c = self.ctx(db)
        m, p, lint = self.mail(unit("B"))
        s, body, marks = c.prepare_message(m, p, "S2", "initial", lint)
        self.assertEqual(marks, {"tb": "B"})
        self.assertIn("Two recent examples: Blue Ridge Hauling LLC (newly registered, no website yet, Oct 2) and Acme "
                      "Inc (security certificate about to expire, Oct 4).", body)
        self.assertNotIn("I'm writing to the team", body)  # B: Einstiegssatz entfällt (Wortgrenze, Vorlage 4a)
        self.assertTrue(lint(s, body))
        self.assertEqual(self.gated, [["l1", "l2", "l3", "l4"]])  # alle Kandidaten durch die Freigabe
        res = [r for r in db.tables["beleg_reservierungen"]]
        self.assertEqual({r["lead_id"] for r in res}, {"l1", "l2"})
        self.assertEqual({r["prospect_id"] for r in res}, {p["id"]})
        self.assertEqual(c.belege.offen, {m["id"]: ["l1", "l2"]})
        c.belege.gesendet(m["id"])
        self.assertIn(("beleg_gesendet", {"p_message": m["id"]}), db.rpcs)
        self.assertEqual(c.belege.offen, {})

    def test_zweiter_kaeufer_bekommt_andere_leads(self):
        db = make_db(GOOD)
        c = self.ctx(db)
        for pid in units("B", 2):
            m, p, lint = self.mail(pid)
            self.assertEqual(c.prepare_message(m, p, "S2", "initial", lint)[2], {"tb": "B"})
        by = {}
        for r in db.tables["beleg_reservierungen"]:
            by.setdefault(r["lead_id"], set()).add(r["prospect_id"])
        self.assertEqual(len(by), 4)
        self.assertTrue(all(len(v) == 1 for v in by.values()))  # nie ein Lead an zwei Käufer

    def test_a_bleibt_heutiger_einstieg_ohne_reservierung(self):
        db = make_db(GOOD)
        c = self.ctx(db)
        m, p, lint = self.mail(unit("A"))
        _, body, marks = c.prepare_message(m, p, "S2", "initial", lint)
        self.assertEqual(marks, {"tb": "A"})
        self.assertIn("I'm writing to the team at Pixel Studio directly.", body)
        self.assertNotIn("examples", body)
        self.assertEqual(db.tables["beleg_reservierungen"], [])

    def test_ohne_genug_belege_unveraendert_und_zaehlt_nicht(self):
        for leads in ([GOOD[0]], [lead(1, "John Smith Trucking"), lead(2, "Jane Doe Cleaning")]):
            db = make_db(leads)
            for v in ("A", "B"):
                m, p, lint = self.mail(unit(v))
                self.assertEqual(self.ctx(db).prepare_message(m, p, "S2", "initial", lint),
                                 (m["subject"], m["body"], {}), (v, leads))
            self.assertEqual(db.tables["beleg_reservierungen"], [])

    def test_freigabe_lehnt_ab(self):
        db = make_db(GOOD)
        c = self.ctx(db, gate=lambda cand, cc: [x["id"] for x in cand if x["id"] in ("l1", "l3")])
        m, p, lint = self.mail(unit("B"))
        _, body, marks = c.prepare_message(m, p, "S2", "initial", lint)
        self.assertEqual(marks, {"tb": "B"})
        self.assertIn("Blue Ridge Hauling LLC", body)
        self.assertIn("Cedar Works LLC", body)
        self.assertNotIn("Acme", body)

    def test_nur_mit_premium_vorrat_400(self):
        db = make_db(GOOD, frei=399)
        for v in ("A", "B"):
            m, p, lint = self.mail(unit(v))
            self.assertEqual(self.ctx(db).prepare_message(m, p, "S2", "initial", lint)[2], {})

    def test_reservierung_scheitert(self):
        db = make_db(GOOD)
        db.rpc_handlers["beleg_reservieren"] = lambda a, p: (_ for _ in ()).throw(RuntimeError("beleg_vergeben"))
        m, p, lint = self.mail(unit("B"))
        self.assertEqual(self.ctx(db).prepare_message(m, p, "S2", "initial", lint), (m["subject"], m["body"], {}))

    def test_ohne_quelle_kein_test(self):
        m, p, lint = self.mail(unit("B"))
        self.assertEqual(ab.Ctx(tests=[T()]).prepare_message(m, p, "S2", "initial", lint),
                         (m["subject"], m["body"], {}))

    def test_probelauf_schreibt_nichts(self):
        db = make_db(GOOD)
        c = self.ctx(db, live=False)
        m, p, lint = self.mail(unit("B"))
        self.assertEqual(c.prepare_message(m, p, "S2", "initial", lint)[2], {"tb": "B"})
        self.assertFalse([f for f, _ in db.rpcs if f.startswith("beleg_")])
        self.assertEqual(db.tables["beleg_reservierungen"], [])

    def test_nicht_gesendet_wird_zurueckgegeben(self):
        db = make_db(GOOD)
        c = self.ctx(db)
        m, p, lint = self.mail(unit("B"))
        c.prepare_message(m, p, "S2", "initial", lint)
        self.assertEqual(c.belege.freigeben_offen(), 1)
        self.assertIn(("beleg_freigeben", {"p_message": m["id"], "p_stunden": ab.BELEG_ALT_STUNDEN}), db.rpcs)
        self.assertEqual(c.belege.offen, {})

    def test_ausserhalb_test_freigabe(self):
        db = make_db(GOOD)
        c = ab.Ctx(tests=[T(country="DE")])
        c.belege = ab.BelegQuelle(db, True, log=lambda *_: None, today=TODAY, gate=lambda cand, cc: [])
        m, p, lint = self.mail(unit("B"))
        self.assertEqual(c.prepare_message(m, {**p, "country": "DE"}, "S2", "initial", lint)[2], {})


class BelegCliTest(unittest.TestCase):
    def db(self, frei_us=3761):
        db = FakeDB({"ab_tests": [], "decisions": [], "jarvis_sessions": [], "jarvis_messages": [],
                     "beleg_reservierungen": []})
        db.rpc_handlers["premium_status"] = lambda a, p: [
            {"segment_id": "S2", "country": "US", "premium_frei": frei_us},
            {"segment_id": "S2", "country": "UK", "premium_frei": 264},
            {"segment_id": "S2", "country": "FR", "premium_frei": 76}]
        return db

    def test_platzhalter_regeln(self):
        db = self.db()
        with self.assertRaises(cli.AbError):  # ohne A (heutiger Einstieg)
            cli.anlegen(db, "mail_einstieg", "US", "einstieg", B_US, "Belege echter Anlässe bringen mehr Antworten")
        with self.assertRaises(cli.AbError):  # Platzhalter zweimal
            cli.anlegen(db, "mail_einstieg", "US", "einstieg", B_US + " {belege}", "Belege bringen mehr Antworten", A_US)
        t = cli.anlegen(db, "mail_einstieg", "US", "einstieg", B_US, "Belege echter Anlässe bringen mehr Antworten", A_US)
        self.assertTrue(ab.is_beleg_test(t))

    def test_start_nur_wo_premium_reicht(self):
        db = self.db()
        uk = cli.anlegen(db, "mail_einstieg", "UK", "einstieg", B_US.replace("US", "UK"), "Belege bringen mehr Antworten",
                         A_US.replace("US", "UK"))
        with self.assertRaisesRegex(cli.AbError, "264 freie Premium-Leads"):
            cli.starten(db, uk["id"])
        us = cli.anlegen(db, "mail_einstieg", "US", "einstieg", B_US, "Belege bringen mehr Antworten", A_US)
        self.assertEqual(cli.starten(db, us["id"])["status"], "laeuft")


if __name__ == "__main__":
    unittest.main()
