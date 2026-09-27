import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib.contacts import extract_contacts  # noqa: E402


class ContactsTest(unittest.TestCase):
    def test_role_address_only(self):
        page = '<a href="mailto:john.smith@acme.co.uk">John</a> <a href="mailto:info@acme.co.uk">Info</a>'
        self.assertEqual(extract_contacts(page, "https://www.acme.co.uk/")["email"], "info@acme.co.uk")

    def test_personal_and_foreign_rejected(self):
        page = "j.smith@acme.co.uk hello@gmail.com"
        self.assertIsNone(extract_contacts(page, "https://acme.co.uk")["email"])

    def test_phone_from_tel_link(self):
        page = '<a href="tel:+44 20 7946 0000">Call</a>'
        self.assertEqual(extract_contacts(page, "https://acme.co.uk")["phone"], "+442079460000")

    def test_phone_from_text(self):
        page = "<p>Call us: 0161 496 0000</p><p>Founded 2024-08-12</p>"
        self.assertEqual(extract_contacts(page, "https://acme.co.uk")["phone"], "01614960000")

    def test_no_phone_from_dates(self):
        self.assertIsNone(extract_contacts("<p>Registered 12 August 2024, no 12345678</p>", "https://acme.co.uk")["phone"])


class LeadFileTest(unittest.TestCase):
    def test_csv_has_contacts_profile_and_tips(self):
        import csv
        from deliveries import CSV_HEADER, to_csv
        lead = {"watch_companies": {"name": "Acme Ltd", "legal_form": "Ltd", "city": "Leeds", "region": "West Yorkshire"},
                "signal_type": "new_incorporation", "event_summary": "Incorporated", "event_date": "2026-09-01",
                "source_name": "Companies House", "source_url": "https://x", "source_date": "2026-09-02",
                "urgency": "high", "urgency_reason": "new", "opener": "Hello",
                "_phone": "+441130000000", "_email": "info@acme.co.uk", "_website": "https://acme.co.uk",
                "_industry": "Plumbing", "_tip": "Ask about payroll", "_question": "Chosen an accountant yet?"}
        rows = list(csv.reader(to_csv([lead]).decode("utf-8-sig").splitlines()))
        self.assertEqual(rows[0], CSV_HEADER)
        row = dict(zip(rows[0], rows[1]))
        self.assertEqual((row["phone"], row["email"]), ("+441130000000", "info@acme.co.uk"))
        self.assertIn("Leeds", row["company_profile"])
        self.assertIn("registered 2026-09-01", row["company_profile"])
        self.assertEqual(row["question_to_ask"], "Chosen an accountant yet?")


if __name__ == "__main__":
    unittest.main()
