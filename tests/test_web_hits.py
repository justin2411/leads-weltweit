"""Website-Trichter (Inhaber 04.10.2026): Startseite → Landingpage → Tarif → Stripe → Danke in signalwerk.web_hits.
Nur Tages-Hash, keine IP/kein User-Agent, keine Löschrechte; Kennzahlen vorgerechnet in dashboard_cache."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "supabase" / "migrations" / "20261004230000_signalwerk_web_hits.sql").read_text(encoding="utf-8")


class WebHitsTest(unittest.TestCase):
    def test_spalten_ohne_ip_und_user_agent(self):
        table = re.search(r"create table if not exists signalwerk\.web_hits \((.*?)\n\);", SQL, re.S).group(1)
        cols = [ln.split()[0] for ln in table.strip().splitlines() if ln.strip()]
        self.assertEqual(cols, ["id", "pv", "day", "vh", "stage", "country", "slug", "device", "src", "ref",
                                "dwell_s", "scroll", "created_at", "ended_at"])
        self.assertIn("vh ~ '^[0-9a-f]{64}$'", table)
        for bad in ("ip", "user_agent", "ua", "email", "url", "path"):
            self.assertNotIn(bad, cols)

    def test_nicht_destruktiv(self):
        low = SQL.lower()
        self.assertNotRegex(low, r"\bdelete\s+from\b|\bdrop\s+table\b|\btruncate\s+signalwerk")
        self.assertIn("revoke delete, truncate on signalwerk.web_hits from service_role", low)
        self.assertIn("enable row level security", low)

    def test_kennzahlen_und_cache(self):
        for key in ("'uv'", "'v'", "'b'", "'dw'", "'dn'", "'nx'", "'refs'", "'tot'", "'start_60m'", "'website_funnel'"):
            self.assertIn(key, SQL)
        self.assertIn("vis.n_all = 1 and vs.mx < 10", SQL)  # Absprung: 1 Aufruf am Tag und < 10 s

    def test_app_erfasst_alle_stufen(self):
        app = ROOT / "app" / "app"
        self.assertIn('<HitBeacon stage="start" />', (app / "home.tsx").read_text(encoding="utf-8"))
        self.assertIn('stage="tarif"', (app / "[country]" / "[segment]" / "start" / "page.tsx").read_text(encoding="utf-8"))
        danke = (app / "danke" / "page.tsx").read_text(encoding="utf-8")
        self.assertIn('found.mode === "live"', danke)
        self.assertIn("!demo", danke)
        checkout = (app / "api" / "checkout" / "route.ts").read_text(encoding="utf-8")
        self.assertIn('stage: "stripe"', checkout)
        beacon = (app / "hit-beacon.tsx").read_text(encoding="utf-8")
        self.assertNotIn("document.cookie", beacon)
        self.assertNotIn("localStorage", beacon)

    def test_wachhund_frischt_auf(self):
        self.assertIn('db.rpc("web_funnel_refresh", {})', (ROOT / "scripts" / "wachhund.py").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
