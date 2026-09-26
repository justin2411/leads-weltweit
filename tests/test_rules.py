import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib.fetch import extract_job_postings, host_blocked  # noqa: E402
from lib.rules import check_prospect, lint_draft, load_countries, render_footer  # noqa: E402
from lib.signals import detect_incorporation_lead, detect_job_leads, segment_for  # noqa: E402
from lib.site_audit import audit_html  # noqa: E402

CFG = load_countries()

GOOD_BODY = """Hello Northpoint team,

I saw that Northpoint Recruitment places engineering and logistics staff across Greater Manchester.

We track local employers whose job adverts have stayed open for 30 days or longer, or who are hiring for several roles at once. That usually means their own hiring is stuck, which is a natural moment for an agency to offer help.

Each lead names the company, the role, where we found it and when.

Would a free sample of 10 such leads from Greater Manchester be useful to you, with no obligation?

Best regards,
Signalwerk"""


class CheckProspectTest(unittest.TestCase):
    def base(self, **kw):
        args = dict(email="info@northpoint.co.uk", country="UK", website="https://www.northpoint.co.uk",
                    legal_form="Ltd", source_url="https://northpoint.co.uk/contact", size_note="8 staff", cfg=CFG)
        args.update(kw)
        return check_prospect(**args)

    def test_ok(self):
        r = self.base()
        self.assertTrue(r.ok, r.summary())

    def test_forbidden_country(self):
        for c in ("DE", "AT", "CH", "IT", "ES", "PL", "DK", "XX"):
            self.assertFalse(self.base(country=c).ok, c)

    def test_personal_address_in_generic_only_country(self):
        self.assertFalse(self.base(email="john.smith@northpoint.co.uk").ok)

    def test_sole_trader_uk(self):
        self.assertFalse(self.base(legal_form="Sole trader").ok)

    def test_freemail(self):
        self.assertFalse(self.base(email="info@gmail.com").ok)

    def test_suppressed(self):
        self.assertFalse(self.base(suppressed=True).ok)

    def test_us_personal_allowed(self):
        r = self.base(email="jane@acmeweb.com", country="US", website="acmeweb.com", legal_form="LLC")
        self.assertTrue(r.ok, r.summary())


class LintTest(unittest.TestCase):
    def test_good(self):
        r = lint_draft("Stalled hiring at Manchester employers", GOOD_BODY)
        self.assertTrue(r.ok, r.summary())

    def test_fake_reply(self):
        self.assertFalse(lint_draft("Re: your vacancies", GOOD_BODY).ok)

    def test_long_subject_and_emoji(self):
        self.assertFalse(lint_draft("x" * 61, GOOD_BODY).ok)
        self.assertFalse(lint_draft("Hiring leads 🚀", GOOD_BODY).ok)

    def test_guarantee(self):
        self.assertFalse(lint_draft("Leads", GOOD_BODY.replace("no obligation", "guaranteed results")).ok)

    def test_too_short(self):
        self.assertFalse(lint_draft("Leads", "Hi,\n\nWant leads?\n\nThanks").ok)

    def test_needs_question(self):
        self.assertFalse(lint_draft("Leads", GOOD_BODY.replace("no obligation?", "no obligation.")).ok)

    def test_footer_reply_mode(self):
        f = render_footer("en", sender_name="Signalwerk", postal_address="Street 1, Berlin", company="Acme Ltd",
                          unsubscribe_url=None)
        self.assertIn('reply "unsubscribe"', f)
        self.assertIn("Street 1, Berlin", f)

    def test_footer_requires_address(self):
        with self.assertRaises(ValueError):
            render_footer("en", sender_name="X", postal_address="", company="A", unsubscribe_url="u")


class SignalsTest(unittest.TestCase):
    today = dt.date(2026, 9, 26)
    company = {"name": "Acme Ltd", "website": "acme.co.uk"}

    def job(self, title, first_seen, posted_on=None, i="1"):
        return {"id": i, "kind": "job_posting", "title": title, "first_seen": first_seen, "posted_on": posted_on,
                "source_name": "Karriereseite", "source_url": "https://acme.co.uk/careers"}

    def test_job_open_30(self):
        leads = detect_job_leads(self.company, [self.job("Warehouse Operative", "2026-09-20", "2026-07-10")], self.today)
        self.assertEqual(leads[0]["signal_type"], "job_open_30d")
        self.assertEqual(leads[0]["urgency"], "high")
        self.assertEqual(segment_for(leads[0]), "S1")

    def test_job_too_young(self):
        self.assertEqual(detect_job_leads(self.company, [self.job("Driver", "2026-09-10")], self.today), [])

    def test_it_job_goes_to_s3(self):
        leads = detect_job_leads(self.company, [self.job("IT Support Technician", "2026-08-01")], self.today)
        self.assertEqual(segment_for(leads[0]), "S3")

    def test_three_jobs(self):
        obs = [self.job(t, "2026-09-20", i=str(n)) for n, t in enumerate(["A", "B", "C"])]
        leads = detect_job_leads(self.company, obs, self.today)
        self.assertEqual([x["signal_type"] for x in leads], ["jobs_3plus"])

    def test_incorporation(self):
        lead = detect_incorporation_lead({"name": "New Co LLC", "website": None},
                                         {"id": "x", "posted_on": "2026-09-10", "source_name": "NY DOS"}, self.today)
        self.assertEqual(lead["urgency"], "high")
        self.assertIsNone(detect_incorporation_lead({"name": "Old"}, {"posted_on": "2025-01-01"}, self.today))


class FetchAndAuditTest(unittest.TestCase):
    def test_blocked_hosts(self):
        for u in ("https://www.linkedin.com/jobs", "https://uk.indeed.com/x", "https://www.google.com/maps"):
            self.assertTrue(host_blocked(u), u)
        self.assertFalse(host_blocked("https://acme.co.uk/careers"))

    def test_jsonld(self):
        html = """<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
          {"@type":"JobPosting","title":"Forklift Driver","datePosted":"2026-07-01T09:00:00Z",
           "jobLocation":{"address":{"addressLocality":"Leeds"}},"url":"https://acme.co.uk/jobs/1"}]}</script>"""
        jobs = extract_job_postings(html)
        self.assertEqual(jobs[0]["title"], "Forklift Driver")
        self.assertEqual(jobs[0]["date_posted"], "2026-07-01")
        self.assertEqual(jobs[0]["locality"], "Leeds")

    def test_audit(self):
        html = "<html><body><center><font>Hi</font></center> &copy; 2015 Acme <script src='jquery-1.4.2.js'></script></body></html>"
        a = audit_html(html, "http://acme.com", dt.date(2026, 9, 26))
        self.assertGreaterEqual(a["score"], 4, a)
        modern = '<meta name="viewport" content="width=device-width"> © 2026'
        self.assertEqual(audit_html(modern, "https://acme.com", dt.date(2026, 9, 26))["score"], 0)


if __name__ == "__main__":
    unittest.main()
