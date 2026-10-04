"""S2 Website-Prüfung (Inhaber 02.10.2026: „sehr alte Websites oder fehlende Sicherheit“) – ohne Netz."""
import datetime as dt
import json
import sys
import unittest
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extraktor import qc, sc, segments, store  # noqa: E402
from extraktor.sources import website_check as wc  # noqa: E402

TODAY = dt.date.today()
PHONE = "+1 214 555 0142"
MOBILE_HTML = ('<html><head><title>Suzys Pizza Plano</title><meta name="viewport" content="width=device-width">'
               '</head><body><h1>Suzys Pizza</h1><p>Call (214) 555-0142</p>' + "<p>Fresh pizza every day.</p>" * 60
               + "<footer>&copy; 2025 Suzys Pizza</footer></body></html>")
OLD_HTML = ('<html><head><title>Suzys Pizza</title><meta name="generator" content="WordPress 4.9.8">'
            '<script src="/wp-includes/js/jquery/jquery.js?ver=1.12.4"></script></head><body><h1>Suzys Pizza</h1>'
            "<p>Call (214) 555-0142</p>" + "<p>Our menu and opening hours.</p>" * 60
            + "<div id=footer>Copyright &copy; 2014 Suzys Pizza. All rights reserved.</div></body></html>")


class Resp:
    def __init__(self, url, text="", status=200, ctype="text/html"):
        self.url, self.text, self.status_code, self.headers = url, text, status, {"content-type": ctype}


def fake_get(table):
    """table: url -> Resp oder Exception (alles andere: Verbindung abgelehnt)."""
    def get(fetcher, url):
        v = table.get(url, requests.ConnectionError("refused"))
        return (None, v) if isinstance(v, Exception) else (v, None)
    return get


def cand(website="http://suzyspizza.com", name="Suzys Pizza", country="US"):
    d = {"id": "08f-abc", "name": name, "phones": [PHONE], "emails": [], "socials": [], "websites": [website],
         "street": "1 Main St", "city": "Plano", "postcode": "75074", "category": "pizza_restaurant",
         "datasets": ["meta"], "updated": [], "confidence": 0.9, "region": "TX"}
    return wc.to_candidate(d, country)


class InspectTests(unittest.TestCase):
    def setUp(self):
        self.orig = wc._get

    def tearDown(self):
        wc._get = self.orig

    def run_with(self, table, c=None):
        wc._get = fake_get(table)
        return wc.inspect(c or cand(), fetcher=None, today=TODAY)

    def test_no_https_when_port_443_refuses_and_http_loads(self):
        r = self.run_with({"http://suzyspizza.com/robots.txt": Resp("http://suzyspizza.com/robots.txt", ""),
                           "http://suzyspizza.com/": Resp("http://suzyspizza.com/", MOBILE_HTML)})
        self.assertEqual([f["detail"] for f in r["findings"]], ["no_https"])
        self.assertIn("phone_on_site", r["belongs"])

    def test_no_finding_when_http_redirects_to_https(self):
        r = self.run_with({"http://suzyspizza.com/robots.txt": Resp("http://suzyspizza.com/robots.txt", ""),
                           "http://suzyspizza.com/": Resp("https://suzys-pizza-plano.com/", MOBILE_HTML)})
        self.assertEqual(r["findings"], [])

    def test_expired_certificate(self):
        err = requests.exceptions.SSLError("certificate verify failed: certificate has expired (_ssl.c:1016)")
        r = self.run_with({"https://suzyspizza.com/robots.txt": err, "https://www.suzyspizza.com/robots.txt": err,
                           "http://suzyspizza.com/robots.txt": Resp("http://suzyspizza.com/robots.txt", ""),
                           "http://suzyspizza.com/": Resp("http://suzyspizza.com/", MOBILE_HTML)})
        self.assertEqual([f["detail"] for f in r["findings"]], ["certificate_expired"])

    def test_missing_intermediate_certificate_is_no_finding(self):
        # Chrome lädt Zwischenzertifikate nach – Python nicht: kein eindeutiger Befund
        err = requests.exceptions.SSLError("certificate verify failed: unable to get local issuer certificate")
        r = self.run_with({"https://suzyspizza.com/robots.txt": err,
                           "http://suzyspizza.com/": Resp("http://suzyspizza.com/", MOBILE_HTML)})
        self.assertEqual(r["findings"], [])
        self.assertEqual(r["note"], "https_unknown")

    def test_valid_cert_on_www_only_is_fine(self):
        err = requests.exceptions.SSLError("Hostname mismatch, certificate is not valid for 'suzyspizza.com'")
        r = self.run_with({"https://suzyspizza.com/robots.txt": err,
                           "https://www.suzyspizza.com/robots.txt": Resp("https://www.suzyspizza.com/robots.txt", ""),
                           "https://www.suzyspizza.com/": Resp("https://www.suzyspizza.com/", MOBILE_HTML)})
        self.assertEqual(r["findings"], [])

    def test_outdated_and_not_mobile(self):
        r = self.run_with({"https://suzyspizza.com/robots.txt": Resp("https://suzyspizza.com/robots.txt", ""),
                           "https://suzyspizza.com/": Resp("https://suzyspizza.com/", OLD_HTML)})
        details = {f["detail"]: f["value"] for f in r["findings"]}
        self.assertEqual(details, {"no_viewport": "", "copyright": "2014", "wordpress": "4.9.8", "jquery1": "1.12.4"})
        self.assertEqual(wc.primary(r["findings"]), "website_not_mobile")

    def test_robots_disallow_means_no_fetch(self):
        r = self.run_with({"https://suzyspizza.com/robots.txt": Resp("https://suzyspizza.com/robots.txt",
                                                                     "User-agent: *\nDisallow: /")})
        self.assertEqual((r["findings"], r["note"]), ([], "robots_denied"))

    def test_page_of_someone_else_gives_no_finding(self):
        other = OLD_HTML.replace("Suzys Pizza", "Joe Plumbing").replace("(214) 555-0142", "(469) 555-0199")
        r = self.run_with({"https://suzyspizza.com/robots.txt": Resp("https://suzyspizza.com/robots.txt", ""),
                           "https://suzyspizza.com/": Resp("https://suzyspizza.com/", other)},
                          c=cand(website="https://pizzaplano.com".replace("pizzaplano", "suzyspizza")))
        self.assertTrue(r["findings"] == [] or "name_in_domain" in r["belongs"])
        c = cand(website="https://joesite.com", name="Bobs Bakery")
        r = self.run_with({"https://joesite.com/robots.txt": Resp("https://joesite.com/robots.txt", ""),
                           "https://joesite.com/": Resp("https://joesite.com/", other)}, c=c)
        self.assertEqual((r["findings"], r["note"]), ([], "page_not_confirmed"))

    def test_parked_and_404_need_name_in_domain(self):
        parked = "<html><body>This domain is for sale! Buy this domain at Sedo.</body></html>"
        r = self.run_with({"https://suzyspizza.com/robots.txt": Resp("https://suzyspizza.com/robots.txt", ""),
                           "https://suzyspizza.com/": Resp("https://suzyspizza.com/", parked)})
        self.assertEqual([f["detail"] for f in r["findings"]], ["parked"])
        c = cand(website="https://xyz-online.com")
        r = self.run_with({"https://xyz-online.com/robots.txt": Resp("https://xyz-online.com/robots.txt", ""),
                           "https://xyz-online.com/": Resp("https://xyz-online.com/", "", status=404)}, c=c)
        self.assertEqual(r["findings"], [])
        err = "<html><head><title>404 Not Found</title></head><body><h1>Not Found</h1></body></html>"
        r = self.run_with({"https://suzyspizza.com/robots.txt": Resp("https://suzyspizza.com/robots.txt", ""),
                           "https://suzyspizza.com/": Resp("https://suzyspizza.com/", err, status=404)})
        self.assertEqual([f["detail"] for f in r["findings"]], ["http_404"])
        # Bot-Sperre mit Fehlercode (Browser sehen die echte Seite): kein Befund
        block = "<html><body><h1>403 Forbidden</h1>Request forbidden by administrative rules.</body></html>"
        r = self.run_with({"https://suzyspizza.com/robots.txt": Resp("https://suzyspizza.com/robots.txt", ""),
                           "https://suzyspizza.com/": Resp("https://suzyspizza.com/", block, status=404)})
        self.assertEqual(r["findings"], [])
        r = self.run_with({"https://suzyspizza.com/robots.txt": Resp("https://suzyspizza.com/robots.txt", ""),
                           "https://suzyspizza.com/": Resp("https://suzyspizza.com/", "", status=403)})
        self.assertEqual(r["findings"], [])  # 403 = Bot-Schutz, kein Befund


class DetectorTests(unittest.TestCase):
    def test_copyright_year(self):
        self.assertEqual(wc.copyright_year("<footer>&copy; 2009 - 2016 Foo Ltd</footer>"), 2016)
        self.assertEqual(wc.copyright_year("<p>Copyright <span>2012</span> Foo</p>"), 2012)
        # Jahr per Skript, Lizenzkommentar einer Bibliothek, gepflegte Seite: kein Befund
        self.assertIsNone(wc.copyright_year("<p>&copy; 2010-<script>document.write(new Date().getFullYear())</script></p>"))
        self.assertIsNone(wc.copyright_year("<script>/*! jQuery v1.11.1 | (c) 2005, 2014 jQuery Foundation */</script>"))
        self.assertIsNone(wc.copyright_year("<p>&copy; 2015 Foo</p><p>Christmas opening hours 2025</p>"))
        self.assertIsNone(wc.copyright_year('<p class="copyright">&copy; 2026 Foo</p>'))
        # Baukasten-Seite mit altem Vermerk, aber aktuellen Jahren in ihren Daten: modern, kein Befund
        self.assertIsNone(wc.copyright_year('<p>&copy;2018&nbsp;BY FOO</p><script>{"published":"2024-05-01"}</script>'))

    def test_generator_and_libraries(self):
        self.assertEqual(wc.generator_finding('<meta name="generator" content="WordPress 4.7.2" />'), ("WordPress", "4.7.2"))
        self.assertIsNone(wc.generator_finding('<meta name="generator" content="WordPress 6.4.1" />'))
        self.assertEqual(wc.generator_finding('<meta name="generator" content="Joomla! 1.5 - Open Source">'), ("Joomla", "1.5"))
        self.assertIsNone(wc.generator_finding('<meta name="generator" content="Joomla! - Open Source Content Management">'))
        self.assertEqual(wc.jquery1('<script src="https://ajax.googleapis.com/ajax/libs/jquery/1.8.3/jquery.min.js">'), "1.8.3")
        self.assertEqual(wc.jquery1('<script type="text/javascript" src="/js/jquery-1.7.1.min.js"></script>'), "1.7.1")
        self.assertIsNone(wc.jquery1('<script src="/js/jquery-3.7.1.min.js"></script><script src="jquery-migrate-1.4.1.js">'))
        self.assertIsNone(wc.jquery1('<!-- <script src="/js/jquery-1.4.2.js"></script> -->'))

    def test_usable_websites(self):
        self.assertTrue(wc.usable("http://www.suzyspizza.com/"))
        self.assertTrue(wc.usable("bell-roofing.co.uk"))
        for bad in ("https://facebook.com/suzys", "https://suzys.wixsite.com/home", "http://blog.hautetfort.com",
                    "https://linktr.ee/suzys", "https://business.site", "https://www.yelp.com/biz/suzys"):
            self.assertFalse(wc.usable(bad), bad)


class LeadTests(unittest.TestCase):
    def finished(self, country="US", findings=None):
        c = cand(country=country)
        if country == "FR":
            c.update(city="Lyon", zip="69003", state="")
        c["website"] = "http://suzyspizza.com"
        c["email"] = "info@suzyspizza.com"
        c["evidence"] = {"mx": True, "website": {"evidence": ["phone_on_site"]}, "site_phones": ["+12145550142"]}
        c["facts"].update(findings=findings or [
            {"type": "no_https", "detail": "no_https", "value": "", "evidence": "x"},
            {"type": "website_outdated", "detail": "copyright", "value": "2014", "evidence": "y"}],
            checked_on=TODAY, domain="suzyspizza.com")
        c["facts"]["signal_type"] = wc.primary(c["facts"]["findings"])
        return c

    def test_texts_pass_signal_control_en_and_fr(self):
        for country in ("US", "FR"):
            c = self.finished(country)
            t = segments.texts("S2", c)
            self.assertEqual(sc.run(c, "S2", t)["status"], "pass", (country, sc.run(c, "S2", t), t))
            for k in ("signal", "company_info", "opener", "urgency_reason"):
                self.assertNotIn(" – ", t[k])
                self.assertNotIn(" - ", t[k])
            self.assertEqual(t["urgency"], "high")
        t = segments.texts("S2", self.finished("US"))
        self.assertIn("Chrome shows ‘Not secure’", t["signal"])
        self.assertIn("2014", t["signal"])
        self.assertIn("checked", t["signal"])
        t = segments.texts("S2", self.finished("FR"))
        self.assertIn("Non sécurisé", t["signal"])
        self.assertIn("vérifié le", t["signal"])

    def test_quality_control_green_with_website_and_email(self):
        c = self.finished()
        self.assertEqual(qc.run(c, "S2")["status"], "green")
        self.assertTrue(segments.fits("S2", c)[0])
        self.assertFalse(segments.fits("S4", c)[0])
        c["facts"]["findings"] = []
        self.assertFalse(segments.fits("S2", c)[0])

    def test_store_keeps_signal_type_and_evidence(self):
        self.assertEqual(store.signal_type("S2", "overture_web", "no_https"), "no_https")
        self.assertEqual(store.signal_type("S2", "overture"), "no_website")
        ev = json.dumps({"findings": [{"type": "no_https"}], "checked_on": TODAY.isoformat()})
        self.assertEqual(store._evidence({"signal_evidence": ev})["checked_on"], TODAY.isoformat())
        self.assertEqual(store._evidence({}), {})

    def test_store_writes_signal_type_and_findings(self):
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from fakedb import FakeDB
        db = FakeDB()
        ev = {"findings": [{"type": "no_https", "detail": "no_https", "value": "", "evidence": "x"}],
              "checked_on": TODAY.isoformat(), "listed_website": "http://suzyspizza.com"}
        row = {"ampel": "green", "segment": "S2", "source": "overture_web", "source_id": "08f-abc",
               "company": "Suzys Pizza", "street": "1 Main St", "city": "Plano", "state": "TX", "zip": "75074",
               "country": "US", "phone": "+12145550142", "email": "info@suzyspizza.com", "phone_type": "landline",
               "email_type": "company_domain", "contact_name": "", "contact_role": "Owner", "qc": "green", "sc": "pass",
               "qc_notes": "", "company_info": "x", "signal": "Suzys Pizza: Chrome shows", "source_url": "u",
               "signal_date": TODAY.isoformat(), "opener": "Hi", "urgency": "high", "urgency_reason": "r",
               "phone_note": "", "website": "http://suzyspizza.com", "signal_type": "no_https",
               "signal_evidence": json.dumps(ev)}
        self.assertEqual(store.store_many(db, [row]), 1)
        self.assertEqual(db.tables["leads"][0]["signal_type"], "no_https")
        filing = [o for o in db.tables["observations"] if o["kind"] == "filing"][0]
        self.assertEqual((filing["key"], filing["details"]["findings"][0]["type"]), ("website_check", "no_https"))
        self.assertEqual(filing["details"]["checked_on"], TODAY.isoformat())

    def test_process_skips_sites_without_finding_and_checks_suppression_only_on_hits(self):
        from collections import Counter
        from extraktor import filters, run
        calls = []

        class G(filters.Guard):
            def problem(self, c):
                calls.append(c["source_id"])
                return None
        orig_inspect, orig_mx = wc.inspect, None
        try:
            wc.inspect = lambda c, f, today=None: {"findings": [], "note": "", "final_url": "", "html": "",
                                                   "belongs": [], "checked_on": TODAY.isoformat()}
            l = run.process(cand(), "S2", None, Counter(), G(None))
            self.assertEqual((l["ampel"], calls), ("skip", []))
            wc.inspect = lambda c, f, today=None: {
                "findings": [{"type": "no_https", "detail": "no_https", "value": "", "evidence": "x"}], "note": "",
                "final_url": "http://suzyspizza.com/", "html": MOBILE_HTML.replace("</footer>", " info@suzyspizza.com</footer>"),
                "belongs": ["phone_on_site"], "checked_on": TODAY.isoformat()}
            import enrich
            orig_mx, enrich.mx_ok = enrich.mx_ok, lambda d: True
            l = run.process(cand(), "S2", None, Counter(), G(None))
            l["ampel"] = run.ampel(l)
            self.assertEqual(calls, ["08f-abc"])
            self.assertEqual((l["ampel"], l["email"], l["website"]), ("green", "info@suzyspizza.com", "http://suzyspizza.com"))
            r = run.row(l)
            self.assertEqual(r["signal_type"], "no_https")
            self.assertEqual(json.loads(r["signal_evidence"])["findings"][0]["detail"], "no_https")
        finally:
            wc.inspect = orig_inspect
            if orig_mx:
                import enrich
                enrich.mx_ok = orig_mx

    def test_hit_without_email_reads_contact_page(self):
        from collections import Counter
        from extraktor import filters, run
        import enrich
        home = MOBILE_HTML.replace("</footer>", '</footer><a href="/contact-us">Contact us</a>')

        class F:
            asked = []

            def get(self, url):
                self.asked.append(url)
                return (url, "<p>Write to bookings@suzyspizza.com</p>") if "contact" in url else None
        orig_inspect, orig_mx = wc.inspect, enrich.mx_ok
        try:
            wc.inspect = lambda c, f, today=None: {
                "findings": [{"type": "website_not_mobile", "detail": "no_viewport", "value": "", "evidence": "x"}],
                "note": "", "final_url": "https://suzyspizza.com/", "html": home, "belongs": ["phone_on_site"],
                "checked_on": TODAY.isoformat()}
            enrich.mx_ok = lambda d: True
            f = F()
            l = run.process(cand(), "S2", f, Counter(), filters.Guard(None))
            self.assertEqual(l["email"], "bookings@suzyspizza.com")
            self.assertEqual(f.asked, ["https://suzyspizza.com/contact-us"])
        finally:
            wc.inspect, enrich.mx_ok = orig_inspect, orig_mx

    def test_lead_werk_runs_website_check_parts(self):
        import yaml
        import werk_plan
        jobs = yaml.safe_load((ROOT / ".github" / "workflows" / "lead-werk.yml").read_text())["jobs"]
        reg = werk_plan.load_lines()
        include = werk_plan.matrix(reg, "lead-werk", werk_plan.counts(reg, None)[0])  # Standardbelegung des Plans
        web = [e for e in include if e["name"].startswith("web-")]
        self.assertEqual({e["name"].rsplit("-", 1)[0]: 0 for e in web}.keys(), {"web-us", "web-uk", "web-fr", "web-north"})
        self.assertGreaterEqual(len(web), 8)  # Inhaber 02.10.2026: „im ganz großen stil“
        for e in web:
            co = e["name"].split("-")[1].upper()
            co = "IE,NL,BE,SE" if co == "NORTH" else co  # Quellen-Scout R19: Website-Prüfung IE/NL/BE/SE
            self.assertIn("--web-check", e["args"])
            self.assertIn(f"--countries {co} ", e["args"] + " ")
            self.assertGreaterEqual(e.get("workers", 16), 32)
            if co == "US":
                self.assertIn("--fmcsa-days 0", e["args"])  # US-Teil lädt keine fremden Quellen
        # Website-Teile zuerst (starten bei max-parallel sofort), US ohne Website nicht gekürzt
        self.assertTrue(all(e["name"].startswith("web-") for e in include[:len(web)]))
        self.assertGreaterEqual(sum(e["name"].startswith(("s2-us-", "web-us-")) for e in include), 18)
        self.assertGreaterEqual(sum(e["name"].startswith("s2-us-") for e in include), 1)  # Neuzugänge im Monatsauszug
        # Gedächtnis aller Teile eines Landes wird geladen (sonst prüft ein Teil Seiten erneut)
        loads = sum("Gedächtnis der Website-Prüfung laden" in (s.get("name") or "") for s in jobs["holen"]["steps"])
        for co in ("us", "uk", "fr", "north"):
            self.assertLessEqual(sum(e["name"].startswith(f"web-{co}-") for e in web), loads, co)
            # auch bei jeder Belegung aus dem Leitstand: nie mehr Teile als geladene Gedächtnis-Teile
            self.assertLessEqual(next(l["max"] for l in reg["lanes"] if l["id"] == f"web-{co}"), loads, co)
        run = next(s["run"] for s in jobs["holen"]["steps"] if s.get("name") == "Leads holen, prüfen, speichern")
        self.assertIn("--workers ${{ matrix.workers || 16 }}", run)

    def test_parts_never_share_a_company(self):
        ids = [f"id-{i}" for i in range(400)]
        parts = [[x for x in ids if wc.in_part(x, (i, 4))] for i in range(4)]
        self.assertEqual(sorted(sum(parts, [])), sorted(ids))
        self.assertTrue(all(len(p) > 50 for p in parts))
        import hashlib
        run_part = lambda x, i, n: int(hashlib.md5(f"overture_web:{x}".encode()).hexdigest(), 16) % n == i  # noqa: E731
        self.assertTrue(all(run_part(x, 2, 4) for x in parts[2]))  # gleiche Aufteilung wie run.py --shard

    def test_seen_memory_merges_all_parts_of_a_country(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            orig = wc.SEEN
            wc.SEEN = Path(d) / "webcheck_seen.json"
            try:
                old = (TODAY - dt.timedelta(days=3)).isoformat()
                (Path(d) / "webcheck_seen_0.json").write_text(json.dumps({"a": old, "b": TODAY.isoformat()}))
                (Path(d) / "webcheck_seen_1.json").write_text(json.dumps({"a": TODAY.isoformat(), "c": old}))
                (Path(d) / "webcheck_seen_2.json").write_text("kaputt")
                self.assertEqual(wc.load_seen(), {"a": TODAY.isoformat(), "b": TODAY.isoformat(), "c": old})
            finally:
                wc.SEEN = orig
                wc._seen.clear()

    def test_seen_memory(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            orig = wc.SEEN
            wc.SEEN = Path(d) / "seen.json"
            try:
                wc.load_seen()
                wc.remember("a")
                wc.remember("old", TODAY - dt.timedelta(days=wc.RECHECK_DAYS + 5))
                wc.save_seen()
                wc.load_seen()
                self.assertEqual(wc.recently_checked(), {"a"})
            finally:
                wc.SEEN = orig
                wc._seen.clear()


class WiderPoolTests(unittest.TestCase):
    """UK/FR zweite Stufe (Scout 04.10.2026): Konfidenz 0,4–0,6 und Einträge ohne Telefon."""

    def write(self, path, rows):
        import duckdb
        con = duckdb.connect()
        con.execute("CREATE TABLE t (id VARCHAR, name VARCHAR, phones VARCHAR[], emails VARCHAR[], socials VARCHAR[], "
                    "websites VARCHAR[], street VARCHAR, city VARCHAR, postcode VARCHAR, region VARCHAR, country VARCHAR, "
                    "category VARCHAR, cat2 VARCHAR, confidence DOUBLE, operating_status VARCHAR, datasets VARCHAR[], "
                    "updated VARCHAR[])")
        for r in rows:
            con.execute("INSERT INTO t VALUES (?, ?, ?, [], [], ?, '1 High St', 'Leeds', 'LS1 1AA', '', 'GB', "
                        "'plumber', '', ?, 'open', ['meta'], [])", r)
        con.execute(f"COPY t TO '{path}' (FORMAT parquet)")

    def test_pool_order_and_tiers(self):
        import tempfile
        from extraktor.sources import overture
        with tempfile.TemporaryDirectory() as d:
            main, nophone = Path(d) / "main.parquet", Path(d) / "nophone.parquet"
            self.write(main, [("hi", "Alpha Plumbing", ["+44 113 496 0000"], ["https://alphaplumbing.co.uk"], 0.9),
                              ("mid", "Beta Joinery", ["+44 113 496 0001"], ["https://betajoinery.co.uk"], 0.5),
                              ("low", "Gamma Roofing", ["+44 113 496 0002"], ["https://gammaroofing.co.uk"], 0.3)])
            self.write(nophone, [("np", "Delta Tiling", None, ["https://deltatiling.co.uk"], 0.8)])
            orig = overture.CACHE_WEB_NOPHONE
            try:
                overture.CACHE_WEB_NOPHONE = nophone
                ids = lambda **k: [r["id"] for r in wc.with_website("UK", 10, log=lambda *_: None, path=main, **k)]  # noqa: E731
                self.assertEqual(ids(), ["hi"])                                  # Standard wie bisher
                self.assertEqual(ids(min_conf=0.4), ["hi", "mid"])               # sichere zuerst
                self.assertEqual(ids(min_conf=0.4, no_phone=True), ["hi", "np", "mid"])
                self.assertEqual(ids(min_conf=0.4, no_phone=True, exclude={"hi"}), ["np", "mid"])
                self.assertEqual(ids(min_conf=0.1), ["hi", "mid"])               # nie unter 0,4
            finally:
                overture.CACHE_WEB_NOPHONE = orig

    def test_low_confidence_needs_a_confirmed_page(self):
        d = {"id": "x", "name": "Beta Joinery", "phones": ["+44 113 496 0001"], "emails": [], "socials": [],
             "websites": ["https://betajoinery.co.uk"], "street": "1 High St", "city": "Leeds", "postcode": "LS1 1AA",
             "category": "carpenter", "datasets": ["meta"], "updated": [], "confidence": 0.5, "region": ""}
        c = wc.to_candidate(d, "UK")
        self.assertEqual(c["facts"]["low_confidence"], 0.5)
        broken = {"findings": [{"type": "website_broken", "detail": "parked"}], "html": "", "belongs": ["name_in_domain"],
                  "note": "", "final_url": ""}
        self.assertEqual(wc.confirmed_only(c, broken)["findings"], [])
        page = {"findings": [{"type": "website_not_mobile", "detail": "no_viewport"}], "html": "<html>", "note": "",
                "belongs": ["name_in_domain"], "final_url": ""}
        self.assertEqual(wc.confirmed_only(c, page)["note"], "low_confidence_unconfirmed")
        page["belongs"] = ["name_on_site", "name_in_domain"]
        self.assertEqual(len(wc.confirmed_only(c, page)["findings"]), 1)
        sure = wc.to_candidate({**d, "confidence": 0.9}, "UK")
        self.assertEqual(wc.confirmed_only(sure, broken), broken)  # sichere Einträge unverändert

    def test_phone_from_own_site_when_listing_has_none(self):
        from collections import Counter
        from extraktor import filters, run
        import enrich
        d = {"id": "np", "name": "Suzys Pizza", "phones": None, "emails": [], "socials": [],
             "websites": ["http://suzyspizza.com"], "street": "1 Main St", "city": "Plano", "postcode": "75074",
             "category": "pizza_restaurant", "datasets": ["meta"], "updated": [], "confidence": 0.9, "region": "TX"}
        c = wc.to_candidate(d, "US")
        self.assertEqual(c["phone"], "")
        orig_inspect, orig_mx = wc.inspect, enrich.mx_ok
        try:
            wc.inspect = lambda c, f, today=None: {
                "findings": [{"type": "no_https", "detail": "no_https", "value": "", "evidence": "x"}], "note": "",
                "final_url": "http://suzyspizza.com/", "html": MOBILE_HTML.replace("</footer>", " info@suzyspizza.com</footer>"),
                "belongs": ["name_on_site"], "checked_on": TODAY.isoformat()}
            enrich.mx_ok = lambda d: True
            l = run.process(c, "S2", None, Counter(), filters.Guard(None))
            self.assertTrue(l["phone"].endswith("2145550142"))
            self.assertEqual(l["evidence"]["phone_from"], "website")
            self.assertEqual(run.ampel(l), "green")
        finally:
            wc.inspect, enrich.mx_ok = orig_inspect, orig_mx

    def test_uk_fr_lanes_use_wider_pool(self):
        import werk_plan
        reg = werk_plan.load_lines()
        for lane in reg["lanes"]:
            wide = "--web-min-conf 0.4 --web-no-phone" in lane.get("args", "")
            self.assertEqual(wide, lane["id"] in ("web-uk", "web-fr"), lane["id"])


if __name__ == "__main__":
    unittest.main()
