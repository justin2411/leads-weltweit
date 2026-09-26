import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
os.environ.pop("ANTHROPIC_API_KEY", None)

import responder as r  # noqa: E402


class ResponderTest(unittest.TestCase):
    def act(self, text):
        return r.decide(r.classify(text))

    def test_rules(self):
        self.assertEqual(self.act("Yes please, send it over"), "sample")
        self.assertEqual(self.act("How much does this cost per month?"), "owner")
        self.assertEqual(self.act("Please remove us from your list"), "suppress")
        self.assertEqual(self.act("No thanks, not interested"), "suppress")
        self.assertEqual(self.act("I am out of the office until Monday"), "ignore")
        self.assertEqual(self.act("Hmm, who are you?"), "owner")
        # Antwort über den Button
        import os as _os
        from lib.html_email import cta_button
        from urllib.parse import unquote
        _os.environ["REPLY_TO"] = "info@example.com"
        for lang in ("en", "fr"):
            html = cta_button("Northpoint Recruitment Ltd", "Greater Manchester", lang)
            body = unquote(html.split("body=")[1].split('"')[0])
            self.assertEqual(self.act(body), "sample", body)

    def test_decide_faq(self):
        self.assertEqual(r.decide({"intent": "question", "faq": ["sources"], "needs_owner": False}), "faq")
        self.assertEqual(r.decide({"intent": "question", "faq": ["none"], "needs_owner": False}), "owner")
        self.assertEqual(r.decide({"intent": "sample", "faq": [], "needs_owner": True}), "sample_owner")

    def test_sample_text_needs_files(self):
        self.assertIsNone(r.sample_text("en", "Leeds", False))
        self.assertIsNone(r.sample_text("fr", "Lyon", False))


class AutoReplyTest(unittest.TestCase):
    def test_holiday_notice_is_out_of_office(self):
        import os
        from responder import classify, decide
        os.environ.pop("ANTHROPIC_API_KEY", None)
        text = ("Thank you for your email. In observance of the Sukkos Holiday, our office will be closed until "
                "Monday, October 5. During that time I will not have access to my email but will respond upon my "
                "return on Monday, October 5.")
        c = classify(text)
        self.assertEqual(c["intent"], "out_of_office")
        self.assertEqual(decide(c), "ignore")

    def test_headers(self):
        from email.message import EmailMessage
        from responder import is_auto_reply
        m = EmailMessage()
        m["Subject"] = "Re: Leads for Brooklyn"
        self.assertFalse(is_auto_reply(m))
        m["Auto-Submitted"] = "auto-replied"
        self.assertTrue(is_auto_reply(m))
        m2 = EmailMessage()
        m2["Subject"] = "Automatic reply: Leads for Brooklyn"
        self.assertTrue(is_auto_reply(m2))


if __name__ == "__main__":
    unittest.main()
