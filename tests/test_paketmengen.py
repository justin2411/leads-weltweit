"""Paketmengen überall gleich: Starter bis 15, Pro bis 40 Leads/Woche (Inhaber 04.10.2026: Pro 249 = 40)."""
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import customer_agents as A  # noqa: E402
from lib.leadreport import PER_WEEK, T2  # noqa: E402

PRO, PRO_PRICE = 40, 249


class PaketmengenTest(unittest.TestCase):
    def test_python(self):
        self.assertEqual(PER_WEEK, {"starter": 15, "pro": PRO})
        self.assertEqual(A.PRO_WEEKLY, PRO)
        for lang, t in T2.items():
            self.assertIn(f" {PRO} ", t["plan_txt"]["pro"], lang)
            self.assertIn(" 15 ", t["plan_txt"]["starter"], lang)

    def test_app(self):
        ts = (ROOT / "app/lib/custom-price.ts").read_text()
        self.assertIn(f"{{ starter: 15, pro: {PRO} }}", ts)
        self.assertIn(f"perWeek: {PRO} }}", (ROOT / "app/lib/owner-settings.ts").read_text())
        page = (ROOT / "app/app/[country]/[segment]/start/page.tsx").read_text()
        self.assertIn(f"Up to {PRO} new leads per week", page)
        self.assertIn(f"Jusqu'à {PRO} nouvelles pistes par semaine", page)

    def test_report_base(self):
        per = round(PRO_PRICE / (PRO * 52 / 12), 2)
        self.assertEqual(per, 1.44)
        for f in sorted((ROOT / "scripts/assets/report/base").glob("*.json")):
            pro = next(p for p in json.loads(f.read_text())["closing"]["plans"] if p.get("name") == "Pro")
            self.assertIn(f"**{PRO}**", pro["text"], f.name)
            self.assertEqual(pro["perLead"], per, f.name)
            self.assertTrue(re.search(r"1[.,]44", pro["perLeadLabel"]), f.name)


if __name__ == "__main__":
    unittest.main()
