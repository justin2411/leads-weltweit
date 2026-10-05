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
        self.assertEqual(boxes[1]["from"], "Justin Koch <team@nextgen-profit.de>")
        self.assertEqual(mb.address(boxes[0]["from"]), "info@nextgen-profit.de")

    def test_all_boxes_send_with_main_display_name(self):
        # Prüfung 04.10.2026: Postfach 2/3 gingen ohne Anzeigenamen raus; jetzt alle wie das Hauptpostfach
        env = {**ENV, "MAIL_FROM": "NextGen Profit <info@nextgen-profit.de>",
               "SMTP_FROM_2": "leads@nextgen-profit.de", "SMTP_USER_3": "webagency@nextgen-profit.de",
               "SMTP_PASSWORD_3": "z"}
        boxes = mb.mailboxes(env)
        self.assertEqual([b["from"] for b in boxes], ["NextGen Profit <info@nextgen-profit.de>",
                                                      "NextGen Profit <leads@nextgen-profit.de>",
                                                      "NextGen Profit <webagency@nextgen-profit.de>"])
        # Adresse und Zuordnung gesendeter Mails bleiben gleich (auch alte sent_from ohne Namen)
        self.assertEqual(mb.box_of("leads@nextgen-profit.de", boxes), 2)
        self.assertEqual(mb.box_of("NextGen Profit <webagency@nextgen-profit.de>", boxes), 3)
        # eigener Name bleibt; ohne Namen im Hauptpostfach: Marke
        env2 = {**env, "SMTP_FROM_2": "Team <leads@nextgen-profit.de>", "MAIL_FROM": "info@nextgen-profit.de"}
        boxes = mb.mailboxes(env2)
        self.assertEqual(boxes[0]["from"], "NextGen Profit <info@nextgen-profit.de>")
        self.assertEqual(boxes[1]["from"], "Team <leads@nextgen-profit.de>")

    def test_new_box_warms_up_main_box_keeps_cap(self):
        boxes = mb.mailboxes(ENV)
        d = dt.date(2026, 10, 1)
        with mock.patch.object(mb, "warmup_cap", return_value=150):
            self.assertEqual(mb.box_cap(boxes[0], None, d), 150)
        cfg = {"postfach_start": "60", "postfach_schritt": "15", "postfach_tageslimit": "150"}
        with mock.patch.object(mb, "_cfg", side_effect=cfg.get):
            # Inhaber 03.10.2026: Start 60, jeden Tag höher bis 150
            self.assertEqual(mb.box_cap(boxes[1], None, d), 60)
            self.assertEqual(mb.box_cap(boxes[1], d, d + dt.timedelta(days=1)), 75)
            self.assertEqual(mb.box_cap(boxes[1], d, d + dt.timedelta(days=6)), 150)
            self.assertEqual(mb.box_cap(boxes[1], d, d + dt.timedelta(days=30)), 150)
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

    def test_pick_for_prefers_parent_box_only_with_room(self):
        # Nachfassmail vom Postfach der Erstmail – aber nie über dessen Tagesmenge oder bei Notbremse (cap 0)
        boxes = mb.mailboxes(ENV)
        b2 = boxes[1]["from"]
        self.assertEqual(mb.pick_for(boxes, {1: 3, 2: 2}, {}, b2)["n"], 2)
        self.assertEqual(mb.pick_for(boxes, {1: 3, 2: 2}, {2: 2}, b2)["n"], 1)
        self.assertEqual(mb.pick_for(boxes, {1: 3, 2: 0}, {}, b2)["n"], 1)
        self.assertIsNone(mb.pick_for(boxes, {1: 0, 2: 0}, {}, b2))
        self.assertEqual(mb.pick_for(boxes, {1: 3, 2: 2}, {}, None)["n"], mb.pick(boxes, {1: 3, 2: 2}, {})["n"])

    def test_box_of_maps_old_mails_to_main_box(self):
        boxes = mb.mailboxes(ENV)
        self.assertEqual(mb.box_of(None, boxes), 1)
        self.assertEqual(mb.box_of("TEAM@nextgen-profit.de", boxes), 2)


if __name__ == "__main__":
    unittest.main()
