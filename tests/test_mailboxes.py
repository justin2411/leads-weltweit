"""Mehrere Versand-Postfächer mit eigener Aufwärmphase (Inhaber 01.10.2026: „hochskalieren, Hauptdomain passt“)."""
import datetime as dt
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import mailboxes as mb  # noqa: E402

ENV = {"SMTP_HOST": "smtp.strato.de", "SMTP_PORT": "465", "SMTP_USER": "info@nextgen-profit.de",
       "SMTP_PASSWORD": "x", "MAIL_FROM": "Justin Koch <info@nextgen-profit.de>",
       "SMTP_USER_2": "team@nextgen-profit.de", "SMTP_PASSWORD_2": "y",
       "SMTP_USER_3": "ohne-passwort@nextgen-profit.de"}


class MailboxTests(unittest.TestCase):
    def test_reads_extra_boxes_and_defaults_host(self):
        boxes = mb.mailboxes(ENV)
        self.assertEqual([b["n"] for b in boxes], [1, 2])  # Postfach 3 ohne Passwort zählt nicht
        self.assertEqual(boxes[1]["host"], "smtp.strato.de")
        self.assertEqual(boxes[1]["from"], "team@nextgen-profit.de")
        self.assertEqual(mb.address(boxes[0]["from"]), "info@nextgen-profit.de")

    def test_new_box_warms_up_main_box_keeps_cap(self):
        boxes = mb.mailboxes(ENV)
        d = dt.date(2026, 10, 1)
        with mock.patch.object(mb, "warmup_cap", return_value=150):
            self.assertEqual(mb.box_cap(boxes[0], None, d), 150)
        self.assertEqual(mb.box_cap(boxes[1], None, d), 20)
        self.assertEqual(mb.box_cap(boxes[1], d, d + dt.timedelta(days=8)), 70)
        with mock.patch.object(mb, "box_limit", return_value=120):
            self.assertEqual(mb.box_cap(boxes[1], d, d + dt.timedelta(days=60)), 120)

    def test_pick_spreads_and_stops_when_full(self):
        boxes = mb.mailboxes(ENV)
        caps = {1: 3, 2: 2}
        sent: dict = {}
        order = []
        while (b := mb.pick(boxes, caps, sent)) is not None:
            order.append(b["n"])
            sent[b["n"]] = sent.get(b["n"], 0) + 1
        self.assertEqual(sorted(order), [1, 1, 1, 2, 2])
        self.assertEqual(order[0], 1)

    def test_box_of_maps_old_mails_to_main_box(self):
        boxes = mb.mailboxes(ENV)
        self.assertEqual(mb.box_of(None, boxes), 1)
        self.assertEqual(mb.box_of("TEAM@nextgen-profit.de", boxes), 2)


if __name__ == "__main__":
    unittest.main()
