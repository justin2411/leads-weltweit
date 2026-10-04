"""Migrationen: jede security-definer-Funktion im Schema signalwerk ist für public/anon/authenticated gesperrt
(Prüfung 04.10.2026 – mark_sample_stock_checked und discard_sample_stock hatten kein revoke)."""
import re
import unittest
from pathlib import Path

MIG = Path(__file__).resolve().parents[1] / "supabase" / "migrations"


def _sql() -> str:
    return "\n".join(p.read_text(encoding="utf-8") for p in sorted(MIG.glob("*.sql")))


class MigrationRightsTest(unittest.TestCase):
    def test_security_definer_revoked(self):
        sql = _sql()
        definer = set()
        for m in re.finditer(r"create or replace function\s+(signalwerk\.\w+)\s*\((.*?)\$\w*\$", sql, re.S | re.I):
            if "security definer" in m.group(2).lower():
                definer.add(m.group(1))
        self.assertIn("signalwerk.discard_sample_stock", definer)
        revoked = set(re.findall(r"revoke (?:all|execute) on function\s+(signalwerk\.\w+)\s*\([^;]*from public",
                                 sql, re.I))
        self.assertEqual(sorted(definer - revoked), [])

    def test_sample_stock_helpers_service_role_only(self):
        sql = _sql()
        for sig in ("signalwerk.mark_sample_stock_checked(uuid)", "signalwerk.discard_sample_stock(uuid, text)"):
            self.assertIn(f"revoke all on function {sig} from public, anon, authenticated;", sql)
            self.assertIn(f"grant execute on function {sig} to service_role;", sql)

    def test_newest_definitions_exclude_owner_tests_and_count_used_buyers(self):
        """Neueste Fassung je Funktion: Testproben raus, Vorrat 'ready' mit 26-h-Freigabe, Käufer 'used'."""
        newest = {}
        for p in sorted(MIG.glob("*.sql")):
            for m in re.finditer(r"create or replace function\s+signalwerk\.(\w+)\s*\(.*?\n\$\$;",
                                 p.read_text(encoding="utf-8"), re.S | re.I):
                newest[m.group(1)] = m.group(0)
        self.assertEqual(newest["dashboard_daily"].count("not r.is_test"), 2)
        self.assertIn("not r.is_test", newest["dashboard_list"])
        self.assertIn("is_test", newest["dashboard_live"])
        self.assertIn("gate_checked_at >= now() - interval '26 hours'", newest["dashboard_live"])
        self.assertIn("as used", newest["dashboard_storage"])


if __name__ == "__main__":
    unittest.main()
