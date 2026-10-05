"""Premium-Bewertung (lib/premium.py) und Veränderungs-Radar (lib/radar.py, lib/tls_info.py).
Erfundene Firmen, example-Domains – keine echten Lead-Daten. (FR-Umzüge ruhen: BODACC per robots.txt gesperrt.)"""
import datetime as dt
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import premium, radar, release_gate as G, tls_info  # noqa: E402

TODAY = dt.date(2026, 10, 5)


class PremiumTest(unittest.TestCase):
    def base(self, **kw):
        lead = {"signal_type": "relocation", "event_date": "2026-09-30", "source_name": "BODACC (Bulletin officiel) – transfert",
                "source_url": "https://www.bodacc.fr/x", "details": {}, "person_name": "Marie Durand",
                "phone": "+33100000000", "email": "contact@example.fr"}
        lead.update(kw)
        return lead

    def test_fresh_dated_event_with_person_is_premium(self):
        s = premium.score(self.base(), TODAY)
        self.assertEqual(s["tier"], "premium")
        self.assertEqual(s["score"], 35 + 10 + 15 + 15)

    def test_combo_adds_points(self):
        s = premium.score(self.base(details={"findings": [{"type": "website_outdated"}]}), TODAY)
        self.assertIn("kombi:website_outdated", s["reasons"])
        self.assertEqual(s["score"], 100)

    def test_static_website_state_is_never_premium(self):
        """Prüfdatum eines Website-Zustands ist kein Ereignisdatum – auch mit allem anderen nur standard."""
        s = premium.score(self.base(signal_type="website_outdated", event_date="2026-10-05",
                                    source_name="Website check (company homepage)",
                                    details={"findings": [{"type": "website_outdated"}, {"type": "no_https"}]}), TODAY)
        self.assertEqual(s["tier"], "standard")
        self.assertNotIn("frisch_0_tage", s["reasons"])

    def test_old_event_is_standard(self):
        s = premium.score(self.base(event_date="2026-08-01"), TODAY)
        self.assertEqual(s["tier"], "standard")

    def test_mid_fresh_needs_combo(self):
        mid = self.base(event_date="2026-09-15", person_name="")
        self.assertEqual(premium.score(mid, TODAY)["tier"], "standard")  # 20 + 10 + 15 = 45
        mid["details"] = {"findings": [{"type": "no_https"}]}
        s = premium.score(mid, TODAY)
        # + 25 = 70 Punkte, aber 15–30 Tage alt: nur Reihenfolge, nie Premium (Premium = frisch ≤ 14 Tage)
        self.assertEqual((s["score"], s["tier"]), (70, "standard"))
        mid["event_date"] = (TODAY - __import__("datetime").timedelta(days=premium.PREMIUM_MAX_AGE)).isoformat()
        self.assertEqual(premium.score(mid, TODAY)["tier"], "premium")  # 35 + 25 + 10 + 15 = 85

    def test_registry_no_website_is_combo(self):
        s = premium.score(self.base(signal_type="no_website", source_name="FMCSA Company Census (US DOT)"), TODAY)
        self.assertIn("kombi:no_website", s["reasons"])
        overture = premium.score(self.base(signal_type="no_website", source_name="Overture Maps (business listing)"), TODAY)
        self.assertEqual(overture["tier"], "standard")

    def test_no_contact_lowers_score(self):
        self.assertEqual(premium.score(self.base(email=""), TODAY)["score"], 60)

    def test_sort_key_premium_first(self):
        rows = [{"id": "a", "premium_score": 40, "premium": {"tier": "standard"}},
                {"id": "b"},
                {"id": "c", "premium_score": 85, "premium": {"tier": "premium"}, "event_date": dt.date.today().isoformat()}]
        self.assertEqual([r["id"] for r in sorted(rows, key=premium.sort_key)], ["c", "a", "b"])


class TlsTest(unittest.TestCase):
    def cert(self, left, valid=365, issuer="CN=Example CA,O=Example Trust"):
        na = TODAY + dt.timedelta(days=left)
        return {"not_after": na, "not_before": na - dt.timedelta(days=valid), "issuer": issuer, "days_valid": valid}

    def test_manual_cert_window_30_days(self):
        self.assertEqual(tls_info.expiring(self.cert(20), TODAY), 20)
        self.assertIsNone(tls_info.expiring(self.cert(45), TODAY))

    def test_auto_renewing_cert_only_late(self):
        le = "CN=R11,O=Let's Encrypt,C=US"
        self.assertIsNone(tls_info.expiring(self.cert(20, 90, le), TODAY))  # erneuert normalerweise noch
        self.assertEqual(tls_info.expiring(self.cert(5, 90, le), TODAY), 5)

    def test_expired_is_not_expiring(self):
        self.assertIsNone(tls_info.expiring(self.cert(-1), TODAY))

    def test_intercepted_connection_gives_nothing(self):
        self.assertTrue(tls_info.INTERCEPT.search("CN=Egress Gateway SDS Issuing CA (production),O=Anthropic"))


def row(**kw):
    r = {"company_id": "c1", "name": "Harbour Bakes", "country": "UK", "website": "https://harbourbakes.example.co.uk",
         "phone_main": "+441947600000", "lead_id": "l1", "lead_signal": "website_outdated",
         "lead_checked": "2026-10-02", "lead_details": {"findings": [{"type": "website_outdated", "detail": "jquery1"}]},
         "radar": None, "radar_first": None, "radar_last": None,
         "contact": {"phone": "+441947600123", "email": "hello@harbourbakes.example.co.uk"}, "person": {"name": "Ann Lee"}}
    r.update(kw)
    return r


def res(findings=(), html="<html><body>Harbour Bakes</body></html>", final="https://harbourbakes.example.co.uk/"):
    return {"findings": list(findings), "html": html, "belongs": ["name_on_site"] if html else [], "final_url": final,
            "note": ""}


BROKEN = {"type": "website_broken", "detail": "parked", "value": "", "evidence": "parked"}
EXPIRED = {"type": "no_https", "detail": "certificate_expired", "value": "", "evidence": "expired"}


class RadarDetectTest(unittest.TestCase):
    def cert(self, left, valid=365):
        na = TODAY + dt.timedelta(days=left)
        return {"not_after": na, "not_before": na - dt.timedelta(days=valid), "issuer": "CN=Example CA", "days_valid": valid}

    def test_page_to_broken_is_event_with_dates(self):
        ev = radar.detect(row(), res([BROKEN], html=""), None, TODAY)
        self.assertEqual(ev["signal_type"], "website_broken")
        self.assertEqual(ev["event_date"], TODAY)
        self.assertEqual(ev["last_ok"], dt.date(2026, 10, 2))
        self.assertIn("website_outdated", ev["also"])

    def test_already_broken_is_no_event(self):
        r = row(radar={"state": "broken", "checked_on": "2026-10-03"})
        self.assertIsNone(radar.detect(r, res([BROKEN], html=""), None, TODAY))

    def test_unchanged_page_without_cert_issue_is_no_event(self):
        self.assertIsNone(radar.detect(row(), res([{"type": "website_outdated", "detail": "jquery1"}]),
                                       self.cert(200), TODAY))

    def test_cert_expiring_event(self):
        ev = radar.detect(row(), res(), self.cert(12), TODAY)
        self.assertEqual(ev["signal_type"], "cert_expiring")
        self.assertEqual(ev["days_left"], 12)
        self.assertEqual(ev["key"], f"expiring:{TODAY + dt.timedelta(days=12)}")

    def test_cert_expiring_not_twice(self):
        na = TODAY + dt.timedelta(days=12)
        r = row(radar={"state": "page", "checked_on": "2026-10-03", "events": [{"type": "cert_expiring", "key": f"expiring:{na}"}]})
        self.assertIsNone(radar.detect(r, res(), self.cert(12), TODAY))

    def test_cert_expired_needs_browser_warning_and_date(self):
        ev = radar.detect(row(), res([EXPIRED], final="http://harbourbakes.example.co.uk/"), self.cert(-6), TODAY)
        self.assertEqual(ev["signal_type"], "no_https")
        self.assertEqual(ev["event_date"], TODAY - dt.timedelta(days=6))
        # ohne bestätigte Browser-Warnung kein Ereignis
        self.assertIsNone(radar.detect(row(), res(final="http://harbourbakes.example.co.uk/"), self.cert(-6), TODAY))
        # zu lange her
        self.assertIsNone(radar.detect(row(), res([EXPIRED]), self.cert(-60), TODAY))

    def test_unknown_keeps_last_state(self):
        r = row(radar={"state": "page", "checked_on": "2026-10-03", "events": []})
        st = radar.radar_details(r, {"res": {"findings": [], "html": "", "belongs": [], "note": "home_unreachable"},
                                     "cert": None, "event": None}, TODAY)
        self.assertEqual(st["state"], "page")
        self.assertEqual(st["checked_on"], "2026-10-03")


class RadarLeadPassesGateTest(unittest.TestCase):
    """Texte der Radar-Leads bestehen die Datenprüfungen der Freigabe (Stufe 1 ohne Netz, Stufe 3)."""

    def item(self, country="UK", **ev_kw):
        r = row(country=country)
        if country == "FR":
            r.update(name="Atelier Lumière", website="https://atelier-lumiere.example.fr")
        ev = {"signal_type": "cert_expiring", "detail": "cert_expiring", "event_date": TODAY,
              "not_after": TODAY + dt.timedelta(days=12), "days_left": 12, "key": "k", "findings": [], "also": []}
        ev.update(ev_kw)
        obs, lead = radar.lead_row(r, ev, {"res": res(final=r["website"] + "/"), "cert": None, "event": ev}, TODAY)
        addr = "12 Quay Rd, Whitby, YO21 1AB" if country == "UK" else "4 Rue des Tests, 69002 Lyon"
        return {**lead, "id": "n1", "company": {"name": r["name"], "country": country, "city": "", "address": addr,
                                                 "website": r["website"]}, "contact": r["contact"], "person": r["person"]}

    def test_cert_expiring_en_fr(self):
        for co in ("UK", "US", "FR"):
            it = self.item(co)
            self.assertEqual(G.stage1(it, TODAY), [], co)
            self.assertEqual(G.stage3(it, {"allowed_status": ("new",)}), [], co)

    def test_broken_and_expired(self):
        it = self.item(signal_type="website_broken", detail="parked", last_ok=dt.date(2026, 10, 2))
        self.assertEqual(G.stage1(it, TODAY), [])
        self.assertEqual(G.stage3(it, {"allowed_status": ("new",)}), [])
        it = self.item("FR", signal_type="no_https", detail="certificate_expired", event_date=TODAY - dt.timedelta(days=4),
                       not_after=TODAY - dt.timedelta(days=4))
        self.assertEqual(G.stage1(it, TODAY), [])
        self.assertEqual(G.stage3(it, {"allowed_status": ("new",)}), [])

    def test_radar_lead_premium_combo(self):
        it = self.item(also=["website_outdated"])
        self.assertEqual(it["premium"]["tier"], "premium")

    def test_live_recheck_cert(self):
        it = self.item()
        it["source_date"] = "2026-10-04"  # gestern geprüft -> heute nachprüfen
        fetcher = mock.Mock()
        fresh = {"not_after": TODAY + dt.timedelta(days=11), "not_before": TODAY - dt.timedelta(days=354),
                 "issuer": "CN=Example CA", "days_valid": 365}
        with mock.patch.object(tls_info, "read", return_value=fresh):
            self.assertEqual(G.live_recheck(it, fetcher, TODAY), ([], True))
        renewed = {**fresh, "not_after": TODAY + dt.timedelta(days=365)}
        with mock.patch.object(tls_info, "read", return_value=renewed):
            reasons, _ = G.live_recheck(it, fetcher, TODAY)
            self.assertTrue(reasons[0].startswith("befund_nicht_bestaetigt"))
        with mock.patch.object(tls_info, "read", return_value=None):
            reasons, _ = G.live_recheck(it, fetcher, TODAY)
            self.assertTrue(reasons[0].startswith("nachpruefung_fehler"))


class RadarAlsoWishTest(unittest.TestCase):
    """Radar-Ereignis + am selben Tag bestätigter Befund „veraltet“/„nicht mobil“ -> passt zum Wunsch (Scout 05.10.2026)."""

    def ev(self, findings):
        return {"signal_type": "cert_expiring", "not_after": dt.date(2026, 10, 20), "days_left": 15,
                "findings": findings, "event_date": dt.date(2026, 10, 20)}

    def test_also_sentence_and_wish_match(self):
        from lib.wishes import matches, signal_types
        f = [{"type": "website_not_mobile", "detail": "no_viewport", "value": ""},
             {"type": "website_outdated", "detail": "copyright", "value": "2014"}]
        for cc in ("UK", "FR"):
            t = radar.texts({"name": "Example Ltd", "country": cc}, self.ev(f), "example.com", TODAY)
            lead = {"signal_type": "cert_expiring", "event_summary": t["event_summary"]}
            self.assertTrue(matches("not_mobile", lead), cc)
            self.assertTrue(matches("website_outdated", lead), cc)
            self.assertTrue(matches("security", lead), cc)
        self.assertIn("cert_expiring", signal_types(["website_outdated"]))

    def test_no_also_finding_no_wish_match(self):
        from lib.wishes import matches
        t = radar.texts({"name": "Example Ltd", "country": "UK"}, self.ev([]), "example.com", TODAY)
        self.assertNotIn("same check", t["event_summary"])
        lead = {"signal_type": "cert_expiring", "event_summary": t["event_summary"]}
        self.assertFalse(matches("not_mobile", lead))
        self.assertFalse(matches("website_outdated", lead))
        # nur der Zusatzsatz zählt, nicht ein zufälliges Wort im Text
        self.assertFalse(matches("website_outdated", {"signal_type": "no_https",
                                                      "event_summary": "Old version Ltd: certificate expired."}))


class RadarBelegTest(unittest.TestCase):
    """Premium-Labor 05.10.2026: jeder Kombi-Zustand steht mit Prüfdatum im Lead-Text (Beleg) – auch HTTPS und
    kaputte Seite, auch aus einer früheren Prüfung; ohne Datum zählt ein früherer Zustand nicht für Kombi."""

    def ev(self, sig="cert_expiring", findings=(), also=()):
        return {"signal_type": sig, "not_after": dt.date(2026, 10, 20), "days_left": 15, "findings": list(findings),
                "also": list(also), "event_date": dt.date(2026, 10, 20), "detail": "http_404",
                "last_ok": dt.date(2026, 10, 3)}

    def test_same_check_has_date_for_every_state(self):
        f = [{"type": "no_https", "detail": "redirects_to_http", "value": ""}]
        t = radar.texts({"name": "Example Ltd", "country": "UK"}, self.ev(findings=f), "example.com", TODAY)
        self.assertIn("The same check on 5 October 2026 also found that Chrome shows", t["event_summary"])
        t = radar.texts({"name": "Exemple", "country": "FR"}, self.ev(findings=f), "example.fr", TODAY)
        self.assertIn("Le même contrôle du 5 octobre 2026 a aussi relevé que", t["event_summary"])

    def test_event_itself_is_not_repeated(self):
        f = [{"type": "no_https", "detail": "certificate_expired", "value": ""}]
        ev = self.ev("no_https", findings=f, also=["no_https"])
        t = radar.texts({"name": "Example Ltd", "country": "US"}, ev, "example.com", TODAY)
        self.assertNotIn("also found", t["event_summary"])
        self.assertNotIn("earlier check", t["event_summary"])

    def test_earlier_state_with_date_and_wish(self):
        from lib.wishes import matches
        row = {"name": "Example Inc", "country": "US", "lead_checked": "2026-09-28"}
        ev = self.ev(also=["website_not_mobile", "website_outdated"])
        t = radar.texts(row, ev, "example.com", TODAY)
        self.assertIn("Our earlier check on September 28, 2026 found that the homepage was not built for phones",
                      t["event_summary"])
        lead = {"signal_type": "cert_expiring", "event_summary": t["event_summary"]}
        self.assertTrue(matches("not_mobile", lead))
        self.assertTrue(matches("website_outdated", lead))
        self.assertEqual(radar._dated_also(ev, row), ["website_not_mobile", "website_outdated"])

    def test_earlier_state_without_date_not_counted(self):
        row = {"name": "Example Ltd", "country": "UK"}
        ev = self.ev(also=["website_not_mobile"])
        t = radar.texts(row, ev, "example.com", TODAY)
        self.assertNotIn("earlier check", t["event_summary"])
        self.assertEqual(radar._dated_also(ev, row), [])

    def test_broken_event_names_earlier_state(self):
        row = {"name": "Example Ltd", "country": "UK", "lead_checked": "2026-10-02"}
        f = [{"type": "website_broken", "detail": "http_404", "value": "404"}]
        ev = self.ev("website_broken", findings=f, also=["no_https"])
        t = radar.texts(row, ev, "example.com", TODAY)
        self.assertIn("Our earlier check on 2 October 2026 found that the site had no working HTTPS encryption",
                      t["event_summary"])

    def test_pdf_why_keeps_dated_state(self):
        from lib.leadreport import _short_why
        f = [{"type": "website_not_mobile", "detail": "no_viewport", "value": ""}]
        t = radar.texts({"name": "Example Ltd", "country": "UK"}, self.ev(findings=f), "example.com", TODAY)
        why = _short_why(t["event_summary"], "Example Ltd", "")
        self.assertIn("The same check on 5 October 2026 also found that the homepage is not built for phones", why)


if __name__ == "__main__":
    unittest.main()
