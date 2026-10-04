import datetime as dt
import json
import sys
import unittest
from unittest import mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import tagescheck as t  # noqa: E402
from fakedb import FakeDB  # noqa: E402


class TagescheckTest(unittest.TestCase):
    def test_subject_reflects_worst(self):
        c = t.Check()
        c.add("Versand", t.OK, "läuft")
        self.assertIn("alles läuft", t.mail(c)[0])
        c.add("Proben", t.WARN, "Hinweis")
        self.assertIn("1 Hinweis", t.mail(c)[0])
        c.add("Website", t.FAIL, "kaputt", "/ → 500")
        subject, body = t.mail(c)
        self.assertIn("1 Problem", subject)
        self.assertLess(body.index("PROBLEME"), body.index("HINWEISE"))
        self.assertEqual(c.worst, t.FAIL)

    def test_richtlinien_bounces_gelb(self):
        db = FakeDB({})
        db.rpc_handlers["bounce_stats"] = lambda a, p: {"gesendet": 100, "bounces": 4,
                                                        "klassen": {"hart": 2, "weich": 1, "richtlinie": 1}}
        c = t.Check()
        t.check_bounce_klassen(c, db)
        self.assertEqual(c.rows[0][1], t.WARN)
        db.rpc_handlers["bounce_stats"] = lambda a, p: {"gesendet": 100, "bounces": 2, "klassen": {"hart": 2}}
        c = t.Check()
        t.check_bounce_klassen(c, db)
        self.assertEqual(c.rows[0][1], t.OK)

    def test_followups_of_resting_branches_are_not_red(self):
        # Nur Fokus-Tests werden gesendet (Inhaber 02.10.2026): liegengebliebene Nachfassmails ruhender Branchen
        # sind Absicht, nicht rot; im Fokus bleiben sie rot (Tagescheck 04.10.2026)
        import datetime as dt
        old = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=40)).isoformat()
        rest = {"id": "f1", "kind": "followup", "status": "approved", "approved_at": old, "prospect_id": "p1",
                "experiments": {"segment_id": "S5"}, "prospects": {"country": "UK"}}
        focus = {**rest, "id": "f2", "experiments": {"segment_id": "S2"}}
        first = {"id": "i1", "kind": "initial", "status": "sent", "sent_at": "2026-01-01T00:00:00+00:00",
                 "prospect_id": "p1", "to_email": "a@b.example", "experiments": {"segment_id": "S2"},
                 "prospects": {"country": "UK"}}
        patches = (mock.patch("lib.fokus.focus_only", return_value=True),
                   mock.patch("lib.fokus.focus_pairs", return_value=[("S2", "UK")]))
        with patches[0], patches[1]:
            c = t.Check()
            t.check_followups(c, FakeDB({"messages": [first, rest]}))
            self.assertEqual(c.rows[0][1], t.OK)
            c = t.Check()
            t.check_followups(c, FakeDB({"messages": [first, rest, focus]}))
            self.assertEqual((c.rows[0][1], c.rows[0][2]), (t.FAIL, "1 Nachfassmails seit über 30 h nicht gesendet"))

    def test_sample_request_owner_informed_is_yellow(self):
        import datetime as dt
        from web_samples import NOTIFIED
        old = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=5)).isoformat()
        req = {"company_name": "A", "segment_id": "S1", "country": "DE", "status": "new", "created_at": old,
               "note": f"{NOTIFIED}; wunsch:x"}
        c = t.Check()
        t.check_web_samples(c, FakeDB({"sample_requests": [req]}))
        self.assertEqual([r[1] for r in c.rows], [t.WARN])
        c = t.Check()
        t.check_web_samples(c, FakeDB({"sample_requests": [req, {**req, "company_name": "B", "note": None}]}))
        self.assertEqual(sorted(r[1] for r in c.rows), sorted([t.FAIL, t.WARN]))

    def test_broken_check_is_reported_not_raised(self):
        c = t.Check()
        c.guard("Kunden", lambda: 1 / 0)
        self.assertEqual(c.rows[0][1], t.FAIL)

    def test_plan_and_brake(self):
        import datetime as dt
        now = dt.datetime.now(dt.timezone.utc)
        old = (now - dt.timedelta(hours=13)).isoformat()
        gb = 1024 ** 3  # wie werk_plan.GB und die Speicher-Seite (Prüfung 04.10.2026)
        rows = [{"werk": "kunden-werk", "at": now.isoformat(), "mode": "autopilot", "bremse": "drossel",
                 "db_bytes": int(6.1 * gb), "plan": {"kunden": 2}},
                {"werk": "lead-werk", "at": old, "mode": "inhaber", "bremse": "aus", "db_bytes": 5_000_000_000,
                 "plan": {"web-us": 3, "web-uk": 1}}]
        c = t.Check()
        t.check_plan(c, FakeDB({"werk_plan_log": rows}))
        got = {(r[0], r[2]): r[1] for r in c.rows}
        self.assertEqual(got[("Speicher", "Datenbank 6.10 GB von 8 GB")], t.FAIL)  # ab Drossel rot
        self.assertEqual(got[("Werke", "kunden-werk: 2 Plätze (Autopilot)")], t.OK)
        self.assertEqual(got[("Werke", "lead-werk: 4 Plätze (deine Belegung)")], t.WARN)  # 13 h ohne Start

    def test_buyers_count_only_mail_ready(self):
        # ok in einem Land ohne Mail-Erlaubnis der Zielgruppe (S1/FR) zählt als „nur Anruf/Brief“ (Prüfung 04.10.2026)
        db = FakeDB({"segments": [{"id": "S1", "email_countries": ["UK", "US"]}, {"id": "S2", "email_countries": ["US"]}],
                     "prospects": [{"id": "a", "check_status": "ok", "segment_id": "S1", "country": "UK"},
                                   {"id": "d", "check_status": "ok", "segment_id": "S1", "country": "FR"},
                                   {"id": "b", "check_status": "call_only", "segment_id": "S2", "country": "US"},
                                   {"id": "c", "check_status": "call_only", "segment_id": "S2", "country": "US"}],
                     "leads": []})
        c = t.Check()
        count = lambda db_, table, params: len(db_.select(table, params))  # noqa: E731 - wie _count (exakte Zahl)
        with mock.patch.object(t, "cfg", return_value="true"), mock.patch.object(t, "_count", side_effect=count), \
                mock.patch("lib.fokus.focus_pairs", return_value=[("S2", "US")]):
            t.check_werke(c, db)
        row = next(r for r in c.rows if r[0] == "Kunden-Werk")
        self.assertEqual(row[2], "1 mail-fähige Käufer")
        self.assertIn("nur Anruf/Brief 3", row[3])
        lead = next(r for r in c.rows if r[0] == "Lead-Werk")
        self.assertEqual(lead[2], "0 Leads im Bestand (vor Freigabe), Fokus S2/US")
        # Nachschub: keine neuen S2-Käufer in 24 h -> gelber Hinweis
        self.assertIn((t.WARN, "S2-Käufer: < 50 neu in 24 h"), [(r[1], r[2]) for r in c.rows])

    def test_werke_timeout_is_not_measurable_not_crash(self):
        db = FakeDB({"segments": [{"id": "S2", "email_countries": ["US"]}], "prospects": [], "leads": []})

        def count(db_, table, params):
            if table == "prospects" and params.get("check_status") == "eq.ok" and "segment_id" in params:
                raise RuntimeError("Supabase GET …: 500 {\"code\":\"57014\"}")
            return len(db_.select(table, params))
        c = t.Check()
        with mock.patch.object(t, "cfg", return_value="true"), mock.patch.object(t, "_count", side_effect=count), \
                mock.patch("lib.fokus.focus_pairs", return_value=[("S2", "US")]):
            c.guard("Werke", lambda: t.check_werke(c, db))
        row = next(r for r in c.rows if r[0] == "Kunden-Werk")
        self.assertIn("unvollständig", row[2])
        self.assertIn("nicht messbar: S2", row[3])
        self.assertNotIn("Prüfung selbst fehlgeschlagen", [r[2] for r in c.rows])

    def test_sample_supply_checks_only_newest_companies_per_page(self):
        leads = [{"id": f"l{i}", "segment_id": "S2", "country": "US", "status": "new", "company_id": f"c{i}"}
                 for i in range(12)]
        leads += [{"id": "x", "segment_id": "S2", "country": "UK", "status": "new", "company_id": "u1"}]
        db = FakeDB({"landing_pages": [{"status": "live", "segment_id": "S2", "country": "US", "slug": "us/web"},
                                       {"status": "live", "segment_id": "S2", "country": "UK", "slug": "uk/web"}],
                     "leads": leads})
        calls = []

        def fake(db_, website_optional=False, only=None):
            calls.append((website_optional, only))
            self.assertIsNotNone(only)  # nie alle Beobachtungen blättern (57014)
            return {k: {} for k in only}
        c = t.Check()
        with mock.patch("deliveries.contact_companies", side_effect=fake):
            t.check_sample_supply(c, db)
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(w for w, _ in calls))  # S2: Website optional
        self.assertEqual(c.rows[0][1:3], (t.WARN, "Probe lieferbar für 1 von 2 Seiten"))
        self.assertIn("uk/web", c.rows[0][3])

    def test_test_purchase_delivery_is_not_waiting(self):
        db = FakeDB({"subscriptions": [{"id": "s1", "customer_id": "k1", "status": "active",
                                        "customers": {"company_name": "Test", "status": "trial",
                                                      "stripe_customer_id": "cus_x"}}],
                     "deliveries": [{"id": "d1", "subscription_id": "s1", "status": "prepared"},
                                    {"id": "d2", "subscription_id": "s1", "status": "approved",
                                     "approved_at": "2026-01-01T00:00:00+00:00"}]})
        c = t.Check()
        t.check_customers(c, db)
        self.assertEqual([r[1] for r in c.rows], [t.OK])
        self.assertIn("1 Stripe-Testkauf", c.rows[0][3])

    def test_mailbox_lamps(self):
        recent = (t.NOW).isoformat()
        msgs = [{"id": f"a{i}", "status": "sent", "sent_at": recent, "sent_from": "NextGen <info@nextgen-profit.de>"}
                for i in range(40)]
        msgs += [{"id": f"b{i}", "status": "sent", "sent_at": recent, "sent_from": "webagency@nextgen-profit.de"}
                 for i in range(40)]
        msgs += [{"id": f"c{i}", "status": "sent", "sent_at": recent, "sent_from": "leads@nextgen-profit.de"}
                 for i in range(10)]
        msgs += [{"id": f"d{i}", "status": "sent", "sent_at": recent, "sent_from": None} for i in range(5)]  # alt: info@
        ev = [{"id": f"e{i}", "type": "bounced", "created_at": recent, "message_id": f"b{i}",
               "messages": {"to_email": f"x{i}@y.com"}} for i in range(3)]          # 3/40 = 7,5 % -> rot
        ev += [{"id": "e9", "type": "bounced", "created_at": recent, "message_id": "c1",
                "messages": {"to_email": "z@y.com"}}]                              # 1/10: zu wenig Mails
        c = t.Check()
        t.check_mailboxes(c, FakeDB({"messages": msgs, "email_events": ev}))
        rows = {r[2].split(":")[0]: r[1] for r in c.rows}
        self.assertEqual(rows, {"info@ (Hauptpostfach)": t.OK, "webagency@nextgen-profit.de": t.FAIL,
                                "leads@nextgen-profit.de": t.OK})
        self.assertIn("bei 45 Mails", next(r[3] for r in c.rows if r[2].startswith("info@")))

    def test_unsubscribe_scanner_suspects(self):
        ev = [{"occurred_at": "2026-10-03T15:30:43+00:00", "message_id": "m1",
               "messages": {"sent_at": "2026-10-03T15:30:29+00:00"}},                   # 14 s -> Verdacht
              {"occurred_at": "2026-10-03T16:10:02Z", "message_id": "m2",
               "messages": {"sent_at": "2026-10-03T15:20:10Z"}},                        # 50 min -> Mensch
              {"occurred_at": "2026-10-03T16:10:02Z", "message_id": None, "messages": None}]  # ohne Mail
        self.assertEqual(t.scanner_suspects(ev), 1)
        c = t.Check()
        t.check_unsubscribes(c, FakeDB({"email_events": [dict(e, type="unsubscribed", created_at=t.NOW.isoformat())
                                                         for e in ev]}))
        self.assertEqual(c.rows[0][1:3], (t.OK, "Abmeldungen in 7 Tagen: 3"))   # nur gezählt, nie rot
        self.assertIn("davon 1 weniger als 60 s", c.rows[0][3])

    def test_kpi_line_counts_funnel_of_one_test(self):
        db = FakeDB({
            "experiments": [{"id": "e1", "segment_id": "S4", "country": "US"},
                            {"id": "e2", "segment_id": "S5", "country": "US"}],
            "messages": [{"id": "m1", "experiment_id": "e1", "status": "sent", "kind": "initial"},
                         {"id": "m2", "experiment_id": "e1", "status": "sent", "kind": "initial"},
                         {"id": "m3", "experiment_id": "e2", "status": "sent", "kind": "initial"},
                         {"id": "m4", "experiment_id": "e1", "status": "approved", "kind": "initial"}],
            "email_events": [{"id": "a", "type": "reply", "dedupe_key": "imap:<x1>", "message_id": "m1"},
                             {"id": "b", "type": "sample_requested", "dedupe_key": "reply:<x1>", "message_id": "m1"},
                             {"id": "c", "type": "auto_reply", "dedupe_key": "imap:<x2>", "message_id": "m2"},
                             {"id": "d", "type": "reply_negative", "dedupe_key": "imap:<x3>", "message_id": "m3"}],
            "sample_requests": [{"id": "s1", "segment_id": "S4", "country": "US"}],
            "subscriptions": [
                {"id": "u1", "segment_id": "S4", "status": "active", "amount_cents": 12900, "currency": "usd",
                 "customers": {"country": "US", "status": "active"}},
                {"id": "u2", "segment_id": "S4", "status": "active", "amount_cents": 12900, "currency": "usd",
                 "customers": {"country": "US", "status": "trial", "stripe_customer_id": "cus_test"}}],
        })
        k = t.kpi_line(db, "S4", "US")
        self.assertEqual((k["sent"], k["replies"], k["positive"], k["samples"], k["customers"]), (2, 1, 1, 1, 1))
        self.assertEqual((k["revenue"], k["currency"]), (129, "$"))

    def test_kpi_counts_only_first_mails_and_ignores_owner_samples(self):
        db = FakeDB({
            "experiments": [{"id": "e1", "segment_id": "S2", "country": "US"}],
            "messages": [{"id": "m1", "experiment_id": "e1", "status": "sent", "kind": "initial"},
                         {"id": "m2", "experiment_id": "e1", "status": "sent", "kind": "followup", "parent_id": "m1"}],
            # Antwort auf die Nachfassmail zählt weiter
            "email_events": [{"id": "a", "type": "reply_positive", "dedupe_key": "imap:<y>", "message_id": "m2"}],
            "sample_requests": [{"id": "s1", "segment_id": "S2", "country": "US", "email": "Chef@Example.com"},
                                {"id": "s2", "segment_id": "S2", "country": "US", "email": "kunde@agentur.com"}],
            "subscriptions": []})
        with mock.patch.dict("os.environ", {"OWNER_EMAIL": "chef@example.com"}):
            k = t.kpi_line(db, "S2", "US")
        self.assertEqual((k["sent"], k["replies"], k["positive"], k["samples"]), (1, 1, 1, 1))


FIX = json.loads((Path(__file__).resolve().parent / "fixtures" / "tagescheck_kurz.json").read_text(encoding="utf-8"))
NOW_FIX = dt.datetime(2026, 10, 4, 17, 37, tzinfo=dt.timezone.utc)


class KurzzeilenTest(unittest.TestCase):
    """Kurzzeilen (04.10.2026): je 1 Zeile, nur Anzeige, nie Einfluss auf die Ampel."""

    def test_zustellung(self):
        line = t.kurz_zustellung(FIX["deliverability_daily"][0], FIX["bounce_stats"])
        self.assertEqual(line, "Zustellbarkeit gelb (04.10.) · Bounce 7 T 3,9 % (10/260) · hart 7, weich 2, Richtlinie 2")
        self.assertEqual(t.kurz_zustellung(None, None), "Zustellbarkeit: noch kein Check")

    def test_stillstand_only_yellow_red(self):
        line = t.kurz_stillstand(FIX["datenfluss"])
        self.assertEqual(line, "Stillstand: Proben gebaut rot (9 h, üblich 1 h) · Mails gesendet gelb (5 h, üblich 1.5 h)")
        self.assertEqual(t.kurz_stillstand([FIX["datenfluss"][0]]), "Stillstand: keiner")
        self.assertEqual(t.kurz_stillstand(None), "Stillstand: nicht messbar")

    def test_trichter_current_week(self):
        line = t.kurz_trichter(FIX["cohort_funnel"], "2026-W40", ["US", "UK", "FR"])
        self.assertEqual(line, "Trichter KW 40 (gesendet→zugestellt→Antwort): US 75→72→1 · UK 79→78→0 · FR 0")

    def test_prognose_honest(self):
        ps = [{"country": "US", "basis": "keine", "currency": "$"}, {"country": "UK", "basis": "kein_versand"},
              {"country": "FR", "basis": "duenn", "currency": "€", "antworten30": {"lo": 1, "mid": 3, "hi": 6},
               "proben30": {"lo": 0.4, "mid": 1, "hi": 2.6}}]
        self.assertEqual(t.kurz_prognose(ps),
                         "Prognose 30 T: US noch keine Basis · UK kein Versand · FR ~0–3 Proben (wenig Daten)")

    def test_vorrat_latest_lead_run_only(self):
        line = t.kurz_vorrat(FIX["werk_plan_log"], t.lane_labels())
        self.assertEqual(line, "Vorrat leer: Website-Prüfung Frankreich, Website-Prüfung UK")
        self.assertEqual(t.kurz_vorrat([], {}), "Vorrat leer: noch kein Plan-Lauf")

    def test_gehirn(self):
        tasks = [{"status": "fertig"}, {"status": "fertig"}, {"status": "laeuft"}]
        line = t.kurz_gehirn(True, ["2026-10-04T15:19:40+00:00", None], "2026-10-04T05:10:00+00:00", tasks, NOW_FIX)
        self.assertEqual(line, "Gehirn: aktiv, zuletzt 04.10. 17:19 · Tagesnotiz 04.10. · 3 Agenten-Aufträge in 24 h (2 fertig)")
        line = t.kurz_gehirn(True, ["2026-10-04T10:00:00+00:00"], None, [], NOW_FIX)
        self.assertTrue(line.startswith("Gehirn: still seit 8 h"))
        self.assertTrue(t.kurz_gehirn(False, [], None, [], NOW_FIX).startswith("Gehirn: abgeschaltet"))

    def test_lines_never_change_traffic_light(self):
        db = FakeDB({"deliverability_daily": FIX["deliverability_daily"], "werk_plan_log": FIX["werk_plan_log"][:1],
                     "settings": [{"brain_enabled": True}], "jarvis_sessions": [], "decisions": [], "agent_tasks": []})
        db.rpc_handlers["bounce_stats"] = lambda a, p: FIX["bounce_stats"]
        db.rpc_handlers["cohort_funnel"] = lambda a, p: 1 / 0  # Fehler -> „nicht messbar“, nie rot
        c = t.Check()
        c.add("Versand", t.OK, "läuft")
        c.ctx["datenfluss"] = FIX["datenfluss"]  # rote Station: Kurzzeile allein ändert die Ampel nicht
        with mock.patch.object(t, "NOW", NOW_FIX), \
                mock.patch("lib.fokus.test_scope", return_value=(["S2"], ["US", "UK", "FR"])), \
                mock.patch("prognose.load", return_value=[{"country": "US", "basis": "keine"}]):
            t.collect_kurz(c, db)
        self.assertEqual(len(c.kurz), 6)
        self.assertEqual(c.kurz[3], "Trichter: nicht messbar")
        self.assertTrue(all(len(k) <= t.KURZ_MAX and "\n" not in k for k in c.kurz))
        self.assertEqual(c.worst, t.OK)
        subject, body = t.mail(c)
        self.assertIn("alles läuft", subject)
        self.assertLess(body.index("KURZ"), body.index("LÄUFT"))
        self.assertNotIn("UTC", body)
        c.add("Website", t.FAIL, "kaputt")
        body = t.mail(c)[1]
        self.assertLess(body.index("PROBLEME"), body.index("KURZ"))


if __name__ == "__main__":
    unittest.main()
