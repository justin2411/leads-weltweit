"""Website-Analyse (Inhaber 04.10.2026): cookielos, Ereignisse und Web Vitals ohne Kennung, nicht destruktiv."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "supabase" / "migrations" / "20261004234500_signalwerk_web_analytics2.sql").read_text(encoding="utf-8")


def cols(table: str) -> list[str]:
    body = re.search(rf"create table if not exists signalwerk\.{table} \((.*?)\n\);", SQL, re.S).group(1)
    return [ln.split()[0] for ln in body.strip().splitlines() if ln.strip()]


class WebAnalytics2Test(unittest.TestCase):
    def test_ereignisse_und_vitals_ohne_kennung(self):
        for t in ("web_events", "web_vitals"):
            c = cols(t)
            for bad in ("vh", "pv", "ip", "ua", "user_agent"):
                self.assertNotIn(bad, c, t)

    def test_nicht_destruktiv(self):
        low = SQL.lower()
        self.assertNotRegex(low, r"\bdelete\s+from\b|\bdrop\s+(table|column)\b|\btruncate\s+signalwerk")
        self.assertIn("revoke delete, truncate on signalwerk.web_events, signalwerk.web_vitals from service_role", low)
        self.assertIn("add column if not exists browser", low)

    def test_cache_mit_vorzeitraum_und_laendern(self):
        for key in ("'website_analytics'", "'prev'", "'ALL', 'US', 'UK', 'FR'", "percentile_cont(.75)", "isodow"):
            self.assertIn(key, SQL)

    def test_browser_speichert_nichts(self):
        beacon = (ROOT / "app" / "app" / "hit-beacon.tsx").read_text(encoding="utf-8")
        for bad in ("document.cookie", "localStorage", "sessionStorage", "indexedDB", "canvas"):
            self.assertNotIn(bad, beacon)

    def test_wachhund_frischt_auf(self):
        self.assertIn('db.rpc("web_analytics_refresh", {})', (ROOT / "scripts" / "wachhund.py").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
