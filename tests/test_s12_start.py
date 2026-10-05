"""Startpaket Marketing-/SEO-Agenturen S12 (Inhaber 05.10.2026: „starte gerne automatisch neue branchen die getestet
werden“): S12 nutzt den S2-Lead-Bestand, Kaltmail 1:1 nach docs/KALTMAIL-VORLAGE.md, nichts geht ohne Freigabe raus."""
import datetime as dt
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib.leadsegment import LEAD_SEGMENT, buyers_of, lead_segment, shares_leads  # noqa: E402
from lib.rules import lint_draft  # noqa: E402


class LeadSegmentTest(unittest.TestCase):
    def test_s12_reads_s2(self):
        self.assertEqual(lead_segment("S12"), "S2")
        self.assertEqual(lead_segment("s12"), "S2")
        self.assertEqual(lead_segment("S2"), "S2")
        self.assertEqual(lead_segment("S4"), "S4")
        self.assertTrue(shares_leads("S12"))
        self.assertFalse(shares_leads("S2"))
        self.assertEqual(buyers_of("S2"), {"S2", "S12"})

    def test_app_mirror_matches(self):
        ts = (ROOT / "app" / "lib" / "lead-segment.ts").read_text(encoding="utf-8")
        m = re.search(r"LEAD_SEGMENT: Record<string, string> = \{([^}]*)\}", ts)
        pairs = dict(re.findall(r"(S\d+):\s*\"(S\d+)\"", m.group(1)))
        self.assertEqual(pairs, LEAD_SEGMENT)

    def test_readiness_counts_s2_leads(self):
        import zielgruppe_bereit as Z
        p = Z.lead_params("S12", "US", True, dt.date(2026, 10, 5))
        self.assertEqual(p["segment_id"], "eq.S2")
        self.assertEqual(p["lead_checks.result"], "eq.released")  # Drei-Stufen-Freigabe bleibt Pflicht

    def test_delivery_takes_s2_leads_for_s12_subscription(self):
        from deliveries import select_leads
        lead = {"id": "l1", "segment_id": "S2", "country": "US", "signal_type": "no_website", "company_id": "c1",
                "event_summary": "e", "event_date": "2026-10-01", "source_name": "s", "source_url": "u",
                "source_date": "2026-10-01", "urgency": "high", "urgency_reason": "r", "opener": "o",
                "watch_companies": {"name": "Acme LLC", "address": "1 Main St", "city": "Austin", "region": "Texas"}}
        sub = {"segment_id": "S12", "filters": {"country": "US", "areas": [], "max_per_week": 5}}
        self.assertEqual([l["id"] for l in select_leads([lead], sub, set(), {})], ["l1"])
        # schon vergebene Leads (Lieferung an S2- oder S12-Käufer) nie ein zweites Mal
        self.assertEqual(select_leads([lead], sub, {"l1"}, {}), [])
        # fremde Branchen nicht
        self.assertEqual(select_leads([{**lead, "segment_id": "S4"}], sub, set(), {}), [])

    def test_report_website_optional_like_s2(self):
        from lib.leadreport import complete_only
        csv = ("phone,email,website,address,contact_name\n+1 555,a@b.com,,1 Main St,Owner\n").encode()
        self.assertIn(b"a@b.com", complete_only(csv, "S12"))
        self.assertNotIn(b"a@b.com", complete_only(csv, "S4"))


class S12MailTest(unittest.TestCase):
    def _build(self, country, name):
        from drafts import build
        p = {"segment_id": "S12", "country": country, "company_name": name, "specialization": "marketing agency",
             "id": "x"}
        return build(p, sender="Justin")

    def test_mail_follows_template_and_lints(self):
        for cc, name in (("US", "Harbor Lane Marketing LLC"), ("UK", "Brightside Digital Marketing Ltd")):
            subject, body, lang = self._build(cc, name)
            self.assertEqual(lang, "en")
            self.assertLessEqual(len(subject), 60)
            self.assertIn(f"across the {cc}", subject)
            self.assertTrue(lint_draft(subject, body, lang).ok, lint_draft(subject, body, lang).summary())
            self.assertIn("a clear reason for them to talk to a marketing agency.", body)
            self.assertIn("Every Monday you get a short PDF briefing and a spreadsheet", body)
            self.assertIn(f"free sample of 10 current leads from across the {cc}. Shall I send it over?", body)
            self.assertTrue(body.startswith("Hi "))
            # keine Exklusivitätszusage, keine Orte
            self.assertNotIn("only", body.lower().split("best regards")[0])
            self.assertNotRegex(body, r"Austin|London|Manchester")

    def test_followup_mentions_s12_signal(self):
        from followups import followup_text
        body, _ = followup_text({"segment_id": "S12", "country": "US", "company_name": "Harbor Lane Marketing LLC"},
                                "en")
        self.assertIn("no website or a weak one", body)

    def test_salesplay_has_marketing_pitch(self):
        play = json.loads((ROOT / "scripts" / "lib" / "salesplay.json").read_text(encoding="utf-8"))
        self.assertIn("S12", play)
        for grp in ("construction", "retail", "hospitality", "transport", "property", "tech", "professional",
                    "health", "services"):
            self.assertEqual(len(play["S12"][grp]["needs"]), 3)


class S12PageTest(unittest.TestCase):
    def test_page_content_and_wording(self):
        data = json.loads((ROOT / "app" / "content" / "pages" / "marketing-agencies.json").read_text(encoding="utf-8"))
        self.assertEqual(data["segment_id"], "S12")
        text = json.dumps(data["en"])
        self.assertIn("{land}", text)  # landesweit
        self.assertNotRegex(text, r"(?i)guarantee|\{region\}|\{ort\}")

    def test_focus_unchanged(self):
        from lib.fokus import focus_pairs, test_allowed
        self.assertNotIn(("S12", "US"), focus_pairs())
        self.assertNotIn(("S12", "UK"), focus_pairs())
        self.assertFalse(test_allowed("S12", "US"))


if __name__ == "__main__":
    unittest.main()
