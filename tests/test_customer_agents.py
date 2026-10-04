"""Kunden-Agenten (docs/KUNDEN-AGENTEN.md): Identität, Paket-Regel, Schreibregeln, Profil -> Filter, Kundenmails,
Idempotenz (Inhaber 04.10.2026)."""
import datetime as dt
import os
import sys
import tempfile
import unittest
from email.message import EmailMessage
from email.utils import format_datetime
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.pop("ANTHROPIC_API_KEY", None)

import customer_agents as A  # noqa: E402
import deliveries  # noqa: E402
import responder  # noqa: E402
from fakedb import FakeDB  # noqa: E402

NOW = dt.datetime(2026, 10, 20, 12, 0, tzinfo=dt.timezone.utc)


def cust(i, email=None, status="active", country="UK"):
    return {"id": f"c{i}", "company_name": f"Studio {i} Ltd", "country": country,
            "billing_email": email or f"Owner{i}@Studio{i}.co.uk", "status": status, "stripe_customer_id": None,
            "notes": None}


def sub(i, package="pro", weekly=50, status="active", customer=None, country="UK"):
    c = customer or cust(i, country=country)
    return {"id": f"s{i}", "customer_id": c["id"], "segment_id": "S2", "package": package, "status": status,
            "filters": {"country": country, "areas": [], "max_per_week": weekly}, "customers": c}


class PersonaTest(unittest.TestCase):
    def test_file_format(self):
        data = A.load_personas()
        for lang in ("en", "fr"):
            self.assertGreaterEqual(len(data["names"][lang]), 24)
            self.assertEqual(len({A.full_name(n) for n in data["names"][lang]}), len(data["names"][lang]))
        self.assertEqual(len(data["tones"]), 6)
        self.assertIn("AI account manager", data["signature"]["en"])
        self.assertIn("IA", data["signature"]["fr"])
        self.assertIn("KI", data["signature"]["de"])

    def test_deterministic_and_different(self):
        self.assertEqual(A.pick_persona("s1", "en"), A.pick_persona("s1", "en"))
        taken, names = set(), []
        for i in range(20):
            p = A.pick_persona(f"sub-{i}", "en", taken)
            taken.add(A.full_name(p))
            names.append(A.full_name(p))
        self.assertEqual(len(set(names)), 20)  # je Kunde ein anderer Name, solange frei
        fr = A.pick_persona("s1", "fr")
        self.assertEqual(fr["lang"], "fr")
        self.assertIn(A.full_name(fr), {A.full_name(n) for n in A.load_personas()["names"]["fr"]})
        for k in ("first_name", "last_name", "role", "lang", "bio", "tone"):
            self.assertTrue(fr[k])

    def test_all_taken_still_returns_a_name(self):
        names = {A.full_name(n) for n in A.load_personas()["names"]["en"]}
        self.assertIn(A.full_name(A.pick_persona("x", "en", names)), names)

    def test_signature_always_marks_ai(self):
        for lang in ("en", "fr"):
            p = A.pick_persona("s9", lang)
            text = A.with_signature("Hello,\n\nThanks for your reply.\n\nBest regards,\nSomeone", p)
            self.assertTrue(text.endswith(A.signature_text(p)))
            self.assertIn(A.full_name(p), text)
            self.assertEqual(text.count("Best regards"), 1 if lang == "en" else 0)
            self.assertRegex(A.display_from("NextGen Profit <hello@nextgen-profit.de>", p),
                             r'^".+ \((AI|IA)\) \| .+" <hello@nextgen-profit\.de>$')


class PackageTest(unittest.TestCase):
    def test_rule(self):
        self.assertTrue(A.eligible(sub(1, "pro", 50)))
        self.assertTrue(A.eligible(sub(1, "Pro", 0)))
        self.assertFalse(A.eligible(sub(1, "starter", 15)))
        self.assertFalse(A.eligible(sub(1, "starter", 80)))
        self.assertTrue(A.eligible(sub(1, "custom", 50)))
        self.assertFalse(A.eligible(sub(1, "custom", 30)))
        self.assertTrue(A.eligible(sub(1, None, 60)))   # von Hand angelegt (deliveries.py add-customer)
        self.assertFalse(A.eligible(sub(1, None, 15)))
        self.assertFalse(A.eligible(sub(1, "pro", 50, status="cancelled")))
        self.assertFalse(A.eligible(sub(1, "pro", 50, customer=cust(1, status="cancelled"))))
        test = {**cust(1, status="trial"), "stripe_customer_id": "cus_1"}
        self.assertFalse(A.eligible(sub(1, "pro", 50, customer=test)))  # Stripe-Testkauf


class TextTest(unittest.TestCase):
    def test_lint_blocks_prices_contracts_guarantees(self):
        for bad in ("It is €129 a month", "only $249", "129 EUR", "249 per month", "Our price is low", "le prix",
                    "We guarantee results", "garantie", "I can give you a discount", "your contract", "p r i c e",
                    "pri​ce", "Rabatt", "remise de 10"):
            self.assertTrue(A.lint(bad), bad)
        for ok in ("10 leads every Monday, 15 per week", "Your goal for the next 3 months",
                   "Merci ! Je vous envoie 10 pistes de toute la France."):
            self.assertEqual(A.lint(ok), [], ok)

    def test_check_text_length_and_sentences(self):
        self.assertIn("Text fehlt", A.check_text("  "))
        self.assertTrue(any("Wörter" in e for e in A.check_text("Hello, thanks.")))
        self.assertTrue(any("Wörter" in e for e in A.check_text("word " * 130)))
        long = "This is a very long sentence that keeps going " * 4 + "."
        self.assertTrue(any("Satz" in e for e in A.check_text(long + " Short one. " * 5)))
        good = ("Hello,\n\nThank you for your message. I will put companies without a website first. "
                "You told me you want small shops and cafes. I will look for those in your country. "
                "Your next delivery comes on Monday. Please tell me if the leads fit. A short yes or no is fine.")
        self.assertEqual(A.check_text(good), [])

    def test_own_texts_follow_the_rules(self):
        for lang in ("en", "fr"):
            p = A.pick_persona("s1", lang)
            subject, body = A.welcome_text(p, "Justin")
            self.assertEqual(A.check_text(body), [], lang)
            self.assertIn("IA" if lang == "fr" else "AI assistant", body)  # KI-Hinweis in der ersten Mail
            self.assertIn("Justin", body)
            self.assertEqual(body.count("?"), 4)
            self.assertLessEqual(len(subject), 60)
            for n in (2, 4):
                self.assertEqual(A.check_text(A.checkin_text(p, n)[1]), [], (lang, n))

    def test_footer_offers_opt_out_and_keeps_address(self):
        self.assertIn("stop messages", A.agent_footer("en"))
        self.assertIn("stop messages", A.agent_footer("fr"))


class ProfileFilterTest(unittest.TestCase):
    def test_merge(self):
        p = A.merge_profile({"zielgruppe": "Cafés", "notizen": "x"},
                            {"ziele": "5 neue Kunden", "signale": "no_website, website_outdated", "notizen": None,
                             "unbekannt": "y"})
        self.assertEqual(p, {"zielgruppe": "Cafés", "ziele": "5 neue Kunden",
                             "signale": ["no_website", "website_outdated"]})
        self.assertEqual(A.merge_kpis({"abschluesse": 1}, {"gute_leads": 7, "abschluesse": 2, "x": 3, "neg": -1}),
                         {"abschluesse": 2, "gute_leads": 7})

    def test_filters_only_inside_booked_country(self):
        old = {"country": "UK", "areas": [], "max_per_week": 50}
        prof = {"signale": ["no_website", "website_broken", "quatsch"], "branchen": ["Cafe", "Bakery"],
                "groesse": "1-10", "regionen": ["Greater Manchester", "Paris", "Texas"]}
        f = A.filters_from_profile(prof, old, "UK")
        self.assertEqual(f["country"], "UK")
        self.assertEqual(f["max_per_week"], 50)
        self.assertEqual(f["areas"], ["Greater Manchester"])  # nur bekannte Gebiete des gebuchten Landes
        self.assertEqual(f["agent"], {"signals": ["no_website", "broken"], "industries": ["cafe", "bakery"],
                                      "size": "1-10", "regions": ["Greater Manchester"]})
        self.assertEqual(old["areas"], [])  # Eingabe unverändert
        # Kunde nimmt die Regionen zurück: vom Agenten gesetzte Gebiete fallen weg …
        f2 = A.filters_from_profile({"signale": ["no_website"]}, f, "UK")
        self.assertEqual(f2["areas"], [])
        # … vom Inhaber/Formular gesetzte bleiben
        f3 = A.filters_from_profile({}, {"country": "UK", "areas": ["West Yorkshire"]}, "UK")
        self.assertEqual(f3["areas"], ["West Yorkshire"])
        self.assertNotIn("agent", f3)

    def test_priority_sorts_stably_and_excludes_nothing(self):
        def lead(i, st, company=None):
            return {"id": f"l{i}", "segment_id": "S2", "country": "UK", "signal_type": st,
                    "company_id": company or f"co{i}", "event_summary": "e", "watch_companies": {"name": f"N{i}"}}
        leads = [lead(1, "website_outdated"), lead(2, "no_website"), lead(3, "new_incorporation"),
                 lead(4, "no_website")]
        s = {"segment_id": "S2", "filters": {"country": "UK", "max_per_week": 10, "agent": {"signals": ["no_website"]}}}
        got = [l["id"] for l in deliveries.select_leads(leads, s, set(), {})]
        self.assertEqual(got, ["l2", "l4", "l1", "l3"])
        plain = {"segment_id": "S2", "filters": {"country": "UK", "max_per_week": 10}}
        self.assertEqual([l["id"] for l in deliveries.select_leads(leads, plain, set(), {})], ["l1", "l2", "l3", "l4"])
        self.assertEqual(A.lead_priority(lead(5, "x"), {"industries": ["bakery"]}, {"industry": "Bakery shop"}), 1)

    def test_delivery_note_and_text(self):
        p = A.pick_persona("s1", "en")
        note = A.delivery_note({"persona": p, "status": "aktiv", "profile": {"signale": ["no_website"]}},
                               [{"signal_type": "no_website"}])
        self.assertIn("companies without a website", note)
        self.assertIn("AI account manager", note)
        self.assertEqual(A.lint(note), [])
        self.assertEqual(A.delivery_note({"persona": p, "status": "pausiert"}, []), "")
        self.assertEqual(A.delivery_note({"persona": p, "status": "aktiv", "mail_opt_out": True}, []), "")
        _, body = deliveries.delivery_text("en", 5, dt.date(2026, 10, 19), [], "UK", note)
        self.assertIn(note + "\n\nBest regards", body)
        _, body = deliveries.delivery_text("en", 5, dt.date(2026, 10, 19), [], "UK")
        self.assertNotIn("A note from", body)


class MatchTest(unittest.TestCase):
    def test_customer_by_email(self):
        cs = [cust(1), cust(2, email="Team <Hello@Agency.com>")]
        self.assertEqual(A.match_customer("owner1@studio1.co.uk", cs)["id"], "c1")
        self.assertEqual(A.match_customer("HELLO@agency.com", cs)["id"], "c2")
        self.assertIsNone(A.match_customer("other@agency.com", cs))
        self.assertIsNone(A.match_customer("", cs))

    def test_agent_for_customer_prefers_live(self):
        ag = [{"id": "a1", "customer_id": "c1", "status": "pausiert", "created_at": "2026-10-05"},
              {"id": "a2", "customer_id": "c1", "status": "aktiv", "created_at": "2026-10-01"}]
        self.assertEqual(A.agent_for_customer("c1", ag)["id"], "a2")
        self.assertIsNone(A.agent_for_customer("c9", ag))

    def test_topics(self):
        self.assertEqual(A.sensitive_topic("How much is the price for more leads?"), "preis")
        self.assertEqual(A.sensitive_topic("I want to cancel"), "kuendigung")
        self.assertEqual(A.sensitive_topic("Je suis déçu des pistes"), "beschwerde")
        self.assertEqual(A.sensitive_topic("Can we change the contract?"), "vertrag")
        self.assertIsNone(A.sensitive_topic("We mostly want cafes and bakeries, thanks!"))
        self.assertTrue(A.wants_no_agent_mail("stop messages please"))
        self.assertTrue(A.wants_no_agent_mail("Please unsubscribe me"))
        self.assertFalse(A.wants_no_agent_mail("Great leads, more of these"))


def agents_db():
    c1, c2, c3 = cust(1), cust(2), cust(3)
    return FakeDB({"customers": [c1, c2, c3],
                   "subscriptions": [sub(1, "pro", 50, customer=c1), sub(2, "starter", 15, customer=c2),
                                     sub(3, "custom", 80, customer=c3, country="FR")]})


class EnsureTest(unittest.TestCase):
    def test_idempotent_and_pausing(self):
        db = agents_db()
        out = A.ensure(db, now=NOW)
        self.assertEqual(out["neu"], 2)
        rows = db.rows("customer_agents")
        self.assertEqual(sorted(r["subscription_id"] for r in rows), ["s1", "s3"])
        self.assertEqual({r["status"] for r in rows}, {"onboarding"})
        self.assertEqual(len({A.full_name(r["persona"]) for r in rows}), 2)
        self.assertEqual(next(r for r in rows if r["subscription_id"] == "s3")["persona"]["lang"], "fr")
        again = A.ensure(db, now=NOW)
        self.assertEqual(again["neu"], 0)
        self.assertEqual(len(db.rows("customer_agents")), 2)
        # Kündigung -> pausiert (nichts gelöscht), wieder aktiv -> onboarding
        db.tables["subscriptions"][0]["status"] = "cancelled"
        self.assertEqual(A.ensure(db, now=NOW)["pausiert"], 1)
        a1 = next(r for r in db.rows("customer_agents") if r["subscription_id"] == "s1")
        self.assertEqual(a1["status"], "pausiert")
        db.tables["subscriptions"][0]["status"] = "active"
        self.assertEqual(A.ensure(db, now=NOW)["aktiviert"], 1)
        self.assertEqual(a1["status"], "onboarding")
        self.assertEqual(len(db.rows("customer_agents")), 2)

    def test_dry_run_writes_nothing(self):
        db = agents_db()
        self.assertEqual(A.ensure(db, dry=True, now=NOW)["neu"], 2)
        self.assertEqual(db.rows("customer_agents"), [])

    def test_welcome_once(self):
        db = agents_db()
        with mock.patch.object(deliveries, "_resend", return_value="re_1") as send, \
                mock.patch.dict(os.environ, {"MAIL_FROM": "NextGen Profit <hello@nextgen-profit.de>"}):
            A.ensure(db, welcome=True, now=NOW)
            A.ensure(db, welcome=True, now=NOW)
        self.assertEqual(send.call_count, 2)  # je neuer Agent genau eine Begrüßung
        to = sorted(c.args[0][0] for c in send.call_args_list)
        self.assertEqual(to, ["owner1@studio1.co.uk", "owner3@studio3.co.uk"])
        self.assertTrue(all("(AI)" in c.kwargs["sender"] or "(IA)" in c.kwargs["sender"] for c in send.call_args_list))
        out = [m for m in db.rows("customer_agent_messages") if m["direction"] == "out"]
        self.assertEqual(len(out), 2)
        self.assertTrue(all(m["status"] == "gesendet" and m["message_id"] == "re_1" for m in out))

    def test_suppressed_or_opted_out_gets_no_mail(self):
        db = agents_db()
        A.ensure(db, now=NOW)
        a = db.rows("customer_agents")[0]
        c = next(x for x in db.rows("customers") if x["id"] == a["customer_id"])
        with mock.patch.object(deliveries, "_resend") as send:
            self.assertEqual(A.send_agent_mail(db, {**a, "mail_opt_out": True}, c, "Hi", "Hello"), "opt_out")
            db.suppressed.add(c["billing_email"].lower())
            self.assertEqual(A.send_agent_mail(db, a, c, "Hi", "Hello"), "gesperrt")
        send.assert_not_called()


def inbox_db(body="We mostly want cafes, thanks!", subject="Re: your leads"):
    db = agents_db()
    A.ensure(db, now=NOW)
    a1 = next(r for r in db.rows("customer_agents") if r["subscription_id"] == "s1")
    a1.update({"kpis": {}, "mail_opt_out": False})
    db.tables["inbound_replies"] = [
        {"id": "r1", "imap_message_id": "<k1@studio1>", "from_email": "owner1@studio1.co.uk", "subject": subject,
         "body_text": body, "processed_at": dt.datetime.now(dt.timezone.utc).isoformat(), "status": "offen",
         "alert_sent_at": None, "auto_action": "kunde"},
        {"id": "r2", "imap_message_id": "<x@other>", "from_email": "someone@else.com", "subject": "Hi",
         "body_text": "Hello", "processed_at": dt.datetime.now(dt.timezone.utc).isoformat(), "status": "offen"},
        # Starter-Kunde: kein Agent, bleibt beim Antwort-Assistenten
        {"id": "r3", "imap_message_id": "<k2@studio2>", "from_email": "owner2@studio2.co.uk", "subject": "Hi",
         "body_text": "Hello", "processed_at": dt.datetime.now(dt.timezone.utc).isoformat(), "status": "offen"},
    ]
    return db, a1


class InboxTest(unittest.TestCase):
    def test_assigns_once_and_creates_task(self):
        db, a1 = inbox_db()
        with mock.patch.object(responder, "alert_once") as alert:
            self.assertEqual(A.inbox(db)["neu"], 1)
            self.assertEqual(A.inbox(db)["neu"], 0)  # zweiter Lauf: nichts doppelt
        alert.assert_not_called()
        msgs = db.rows("customer_agent_messages")
        self.assertEqual([(m["agent_id"], m["direction"], m["message_id"]) for m in msgs],
                         [(a1["id"], "in", "<k1@studio1>")])
        tasks = db.rows("agent_tasks")
        self.assertEqual(len(tasks), 1)
        self.assertEqual((tasks[0]["kind"], tasks[0]["created_by"], tasks[0]["market"]), ("kunde", "Kunden-Agent", "UK"))
        self.assertIn(a1["id"], tasks[0]["brief"])
        self.assertLessEqual(len(tasks[0]["brief"]), 1000)
        self.assertEqual(a1["kpis"]["rueckmeldungen"], 1)
        self.assertEqual(db.rows("inbound_replies")[0]["status"], "erledigt")
        self.assertEqual(db.rows("inbound_replies")[2]["status"], "offen")

    def test_price_question_goes_to_owner(self):
        db, a1 = inbox_db("What is the price if we want 100 leads a week?")
        with mock.patch.object(responder, "alert_once") as alert:
            self.assertEqual(A.inbox(db)["inhaber"], 1)
        alert.assert_called_once()
        self.assertEqual(alert.call_args.kwargs["kind"], "buy")
        self.assertIn("Preis", alert.call_args.args[2])
        self.assertIn("nichts zusagen", db.rows("agent_tasks")[0]["brief"])
        self.assertEqual(db.rows("inbound_replies")[0]["status"], "offen")  # Inhaber sieht sie im Cockpit

    def test_stop_messages_sets_opt_out(self):
        db, a1 = inbox_db("stop messages please")
        with mock.patch.object(responder, "alert_once"):
            self.assertEqual(A.inbox(db)["opt_out"], 1)
        self.assertTrue(a1["mail_opt_out"])
        self.assertEqual(db.rows("agent_tasks"), [])

    def test_dry_run(self):
        db, _ = inbox_db()
        self.assertEqual(A.inbox(db, dry=True)["neu"], 1)
        self.assertEqual(db.rows("customer_agent_messages"), [])


class ReplyProfileTest(unittest.TestCase):
    def test_reply_checks_then_sends_in_thread(self):
        db, a1 = inbox_db()
        with mock.patch.object(responder, "alert_once"):
            A.inbox(db)
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            f.write("Our price is low.")
        with mock.patch.object(deliveries, "_resend") as send:
            self.assertEqual(A.reply(db, a1["id"], f.name), 2)
        send.assert_not_called()
        good = ("Hello,\n\nThank you for your message. I will put cafes first in your next delivery. "
                "You told me they are your best customers. I will look for new cafes across the UK. "
                "Please tell me if the leads fit. A short yes or no is enough.")
        Path(f.name).write_text(good)
        with mock.patch.object(deliveries, "_resend", return_value="re_9") as send, \
                mock.patch.dict(os.environ, {"MAIL_FROM": "hello@nextgen-profit.de"}):
            self.assertEqual(A.reply(db, a1["id"], f.name), 0)
        os.unlink(f.name)
        self.assertEqual(send.call_args.args[1], "Re: your leads")
        self.assertEqual(send.call_args.kwargs["headers"]["In-Reply-To"], "<k1@studio1>")
        self.assertIn("AI account manager at NextGen Profit", send.call_args.args[2])
        out = [m for m in db.rows("customer_agent_messages") if m["direction"] == "out"]
        self.assertEqual(out[-1]["in_reply_to"], "<k1@studio1>")

    def test_profile_updates_filters(self):
        db, a1 = inbox_db()
        f = A.update_profile(db, a1["id"], {"zielgruppe": "Cafés", "signale": ["no_website"],
                                            "regionen": ["West Yorkshire"], "kpis": {"gute_leads": 4}})
        s1 = next(s for s in db.rows("subscriptions") if s["id"] == "s1")
        self.assertEqual(s1["filters"], f)
        self.assertEqual(s1["filters"]["areas"], ["West Yorkshire"])
        self.assertEqual(s1["filters"]["max_per_week"], 50)
        self.assertEqual(a1["status"], "aktiv")
        self.assertEqual(a1["kpis"]["gute_leads"], 4)
        self.assertEqual(a1["profile"]["zielgruppe"], "Cafés")


class CheckinTest(unittest.TestCase):
    def test_due(self):
        d = lambda days: {"sent_at": (NOW - dt.timedelta(days=days)).isoformat()}  # noqa: E731
        self.assertIsNone(A.checkin_due([d(10)], {}, None, NOW))
        self.assertEqual(A.checkin_due([d(10), d(4)], {}, None, NOW), 2)
        self.assertIsNone(A.checkin_due([d(10), d(1)], {}, None, NOW))  # erst 3 Tage nach der Lieferung
        self.assertIsNone(A.checkin_due([d(10), d(4)], {"checkins": [2]}, None, NOW))
        self.assertIsNone(A.checkin_due([d(10), d(4)], {}, (NOW - dt.timedelta(days=2)).isoformat(), NOW))
        self.assertEqual(A.checkin_due([d(30), d(20), d(10), d(4)], {"checkins": [2]}, None, NOW), 4)
        self.assertIsNone(A.checkin_due([d(40), d(30), d(20), d(10), d(4)], {"checkins": [2, 4]}, None, NOW))

    def test_checkin_sends_once(self):
        db, a1 = inbox_db()
        a1["status"] = "aktiv"
        db.tables["deliveries"] = [{"id": "d1", "subscription_id": "s1", "status": "sent", "sent_at": "2026-10-05T07:00:00+00:00"},
                                   {"id": "d2", "subscription_id": "s1", "status": "sent", "sent_at": "2026-10-12T07:00:00+00:00"}]
        with mock.patch.object(deliveries, "_resend", return_value="re_c") as send, \
                mock.patch.dict(os.environ, {"MAIL_FROM": "hello@nextgen-profit.de"}):
            self.assertEqual(A.checkin(db, now=NOW)["gesendet"], 1)
            self.assertEqual(A.checkin(db, now=NOW)["gesendet"], 0)
        send.assert_called_once()
        self.assertEqual(a1["kpis"]["checkins"], [2])


def mail(frm, subject, body, mid="<k1@studio1>"):
    m = EmailMessage()
    m["From"], m["Subject"], m["Message-ID"] = frm, subject, mid
    m["Date"] = format_datetime(dt.datetime.now(dt.timezone.utc))
    m.set_content(body)
    return m


class ResponderHookTest(unittest.TestCase):
    OWN = {"hello@nextgen-profit.de", "@nextgen-profit.de"}

    def setUp(self):
        responder._CUSTOMER_AGENTS.clear()

    def test_customer_mail_goes_to_agent_not_to_templates(self):
        db = agents_db()
        A.ensure(db, now=NOW)
        msg = mail("Owner1@Studio1.co.uk", "Re: your leads", "Mostly cafes please")
        with mock.patch.object(responder, "send_reply") as send, mock.patch.object(responder, "notify_owner") as note:
            self.assertEqual(responder.handle_message(db, msg, "<k1@studio1>", True, self.OWN), "kunde")
            self.assertEqual(responder.handle_message(db, msg, "<k1@studio1>", True, self.OWN), "done")
        send.assert_not_called()
        note.assert_not_called()
        rows = db.rows("inbound_replies")
        self.assertEqual([(r["auto_action"], r["from_email"]) for r in rows], [("kunde", "owner1@studio1.co.uk")])

    def test_unsubscribe_from_customer_still_suppressed(self):
        db = agents_db()
        A.ensure(db, now=NOW)
        msg = mail("owner1@studio1.co.uk", "unsubscribe", "")
        self.assertIsNone(responder.handle_customer(db, msg, "<u@x>", "owner1@studio1.co.uk", "", True, self.OWN))

    def test_without_agents_table_nothing_changes(self):
        db = FakeDB({"customers": [cust(1)]})
        msg = mail("owner1@studio1.co.uk", "Hi", "Hello")
        self.assertIsNone(responder.handle_customer(db, msg, "<n@x>", "owner1@studio1.co.uk", "Hello", True, self.OWN))


if __name__ == "__main__":
    unittest.main()
