"""Datenbank-Last 05.10.2026: Indizes für Landingpage-Beispiele und Dauerprüfung, firma_lage ohne pruef_kpi."""
import re
import unittest
from pathlib import Path

MIG = Path(__file__).resolve().parents[1] / "supabase" / "migrations"


def _newest(name: str) -> str:
    out = ""
    for p in sorted(MIG.glob("*.sql")):
        for m in re.finditer(rf"create or replace function\s+signalwerk\.{name}\s*\(.*?\n\$\$;",
                             p.read_text(encoding="utf-8"), re.S | re.I):
            out = m.group(0)
    return out


class DbLastTest(unittest.TestCase):
    def test_indexes_for_hot_queries(self):
        sql = "\n".join(p.read_text(encoding="utf-8") for p in sorted(MIG.glob("*.sql")))
        # Landingpage: status in ('sample','new') order by event_date desc muss sortiert aus dem Index kommen
        self.assertRegex(sql, r"leads_offen_datum on signalwerk\.leads \(segment_id, country, event_date desc\)\s*"
                              r"where status in \('sample', 'new'\)")
        self.assertIn("leads_offen_premium on signalwerk.leads (segment_id, country, premium_score desc, event_date)", sql)
        self.assertIn("leads_ungeprueft on signalwerk.leads (segment_id, country, id)", sql)

    def test_firma_lage_without_full_pruef_kpi(self):
        fn = _newest("firma_lage")
        self.assertTrue(fn)
        self.assertNotIn("pruef_kpi(", fn)
        # Ausreißer-Regel unverändert wie in pruef_kpi: ab 20 Prüfungen, Fehlerquote über 5 %
        self.assertIn("'ausreisser'", fn)
        self.assertIn("having sum(candidates) >= 20", fn)
        self.assertIn("> 0.05", fn)
        self.assertIn("werk = 'dauerpruefung'", fn)


if __name__ == "__main__":
    unittest.main()
