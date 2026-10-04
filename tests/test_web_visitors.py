"""Eindeutige Website-Besucher (Inhaber 04.10.2026): nur Hash speichern, Tages-Salz verwerfen, JARVIS-Linie
Landingpage → Tarif → Stripe → Danke aus website_refresh()."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIG = ROOT / "supabase" / "migrations"


def _newest(name: str) -> str:
    found = ""
    for p in sorted(MIG.glob("*.sql")):
        for m in re.finditer(rf"create or replace function\s+signalwerk\.{name}\s*\(.*?(?:\n|end )\$\$;",
                             p.read_text(encoding="utf-8"), re.S | re.I):
            found = m.group(0)
    return found


class WebVisitorsTest(unittest.TestCase):
    def setUp(self):
        self.sql = (MIG / "20261004200000_signalwerk_web_visitors.sql").read_text(encoding="utf-8")

    def test_nur_hash_keine_ip_kein_user_agent(self):
        table = re.search(r"create table if not exists signalwerk\.web_visitors \((.*?)\n\);", self.sql, re.S).group(1)
        cols = [ln.split()[0] for ln in table.strip().splitlines() if ln.strip() and not ln.strip().startswith("primary")]
        self.assertEqual(cols, ["day", "page", "slug", "vh", "n", "first_at", "last_at"])
        self.assertIn("vh ~ '^[0-9a-f]{64}$'", table)

    def test_salz_wird_am_neuen_tag_verworfen(self):
        fn = _newest("web_salt_today")
        self.assertIn("set salt = null", fn)
        self.assertIn("where day < d", fn)
        self.assertNotIn("delete", self.sql.lower())  # nichts löschen

    def test_refresh_liefert_die_vier_stationen(self):
        fn = _newest("website_refresh")
        for key in ("land_60m", "land_24h", "land_30d", "tarif_24h", "co_24h", "co_30d", "buy_24h", "buy_30d"):
            self.assertIn(f"'{key}'", fn)
        self.assertIn("count(distinct (day, vh))", fn)
        self.assertIn("type = 'checkout_started'", fn)

    def test_route_blendet_inhaber_und_vorschau_aus(self):
        route = (ROOT / "app" / "app" / "api" / "events" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("await isOwner()", route)
        self.assertIn("isPreviewRef(", route)
        self.assertNotRegex(route, r"insert\(\{[^}]*\bip\b")
        checkout = (ROOT / "app" / "app" / "api" / "checkout" / "route.ts").read_text(encoding="utf-8")
        self.assertIn('if (mode === "live" && !(await isOwner().catch(() => false))) {\n    await recordEvent(v.id, "checkout_started");', checkout)


if __name__ == "__main__":
    unittest.main()
