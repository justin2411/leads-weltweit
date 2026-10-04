"""Jeder Einstellungs-Schlüssel der App (app/lib/owner-settings.ts DEFAULTS) muss in der neuesten Schlüsselliste
owner_settings_key_check stehen – sonst scheitert „Übernehmen“ im Regler (Fehler 04.10.2026: slot_plan fehlte)."""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class OwnerSettingsKeysTest(unittest.TestCase):
    def test_app_keys_in_constraint(self):
        ts = (ROOT / "app/lib/owner-settings.ts").read_text()
        block = re.search(r"export const DEFAULTS: OwnerSettings = \{(.*?)\n\};", ts, re.S).group(1)
        flat = block
        while re.search(r"\{[^{}]*\}", flat):  # verschachtelte Werte ({ on: true, locks: {} }) einklappen
            flat = re.sub(r"\{[^{}]*\}", "()", flat)
        app_keys = set(re.findall(r"\b([a-z_]+):", flat))
        latest = None
        for f in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            m = re.findall(r"owner_settings_key_check check \(key in \((.*?)\)\)", f.read_text(), re.S)
            if m:
                latest = m[-1]
        db_keys = set(re.findall(r"'([a-z_]+)'", latest or ""))
        self.assertTrue(app_keys, "keine App-Schlüssel gefunden")
        self.assertEqual(sorted(app_keys - db_keys), [], "Schlüssel fehlen in owner_settings_key_check")


if __name__ == "__main__":
    unittest.main()
