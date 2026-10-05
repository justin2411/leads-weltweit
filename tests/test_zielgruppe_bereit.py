"""Bereitschaft neue Zielgruppe (Inhaber 05.10.2026, docs/ABLAUFPLAN-NEUE-ZIELGRUPPE.md): vier Tore, nur lesen."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import zielgruppe_bereit as Z  # noqa: E402
from lib.kurz import GRUND_MAX, TITEL_MAX, mit_kurz  # noqa: E402

HEUTE = dt.date(2026, 10, 5)


def _wert(row: dict, key: str):
    if "->>" in key:
        col, sub = key.split("->>")
        return (row.get(col) or {}).get(sub)
    if "." in key:
        col, sub = key.split(".", 1)
        return (row.get(col) or {}).get(sub)
    return row.get(key)


def _passt(row: dict, key: str, cond: str) -> bool:
    op, _, arg = cond.partition(".")
    v = _wert(row, key)
    if op == "eq":
        return str(v) == arg
    if op == "gte":
        return v is not None and (v >= int(arg) if isinstance(v, int) else str(v) >= arg)
    raise AssertionError(f"Operator {op} unbekannt")


class FakeAbfrage:
    """Attrappe der Datenbank (PostgREST-Filter eq./gte., eingebettete lead_checks, premium->>tier), nur lesen."""

    def __init__(self, tables: dict, timeout: set | None = None):
        self.tables = tables
        self.timeout = timeout or set()
        self.calls: list[tuple[str, dict, bool]] = []

    def __call__(self, table, params, zaehlen=False):
        self.calls.append((table, dict(params), zaehlen))
        if zaehlen and table in self.timeout:
            return [], None
        rows = [r for r in self.tables.get(table, [])
                if all(_passt(r, k, v) for k, v in params.items() if k not in ("select", "limit", "order"))]
        total = len(rows)
        rows = rows[: int(params.get("limit") or 1000)]
        return rows, (total if zaehlen else None)


def lead(i, company, seg="S5", land="US", premium=True, released=True, status="new", tage=3):
    return {"id": i, "company_id": company, "segment_id": seg, "country": land, "status": status,
            "premium_score": 80 if premium else 40, "premium": {"tier": "premium" if premium else "standard"},
            "event_date": (HEUTE - dt.timedelta(days=tage)).isoformat(),
            "lead_checks": {"result": "released" if released else "failed"}}


def tabellen(n_premium=60, n_kaeufer=250):
    leads = [lead(i, f"c{i}") for i in range(n_premium)]
    leads += [lead(1000 + i, f"c{i}") for i in range(5)]                         # zweiter Lead derselben Firma
    leads += [lead(2000 + i, f"x{i}", released=False) for i in range(30)]         # Freigabe nicht bestanden
    leads += [lead(3000 + i, f"o{i}", tage=20) for i in range(30)]                # zu alt für Premium
    leads += [lead(4000 + i, f"s{i}", status="sample") for i in range(30)]        # schon vergeben
    leads += [lead(5000 + i, f"u{i}", land="UK") for i in range(30)]              # anderes Land
    pros = [{"id": i, "check_status": "ok", "segment_id": "S5", "country": "US"} for i in range(n_kaeufer)]
    pros += [{"id": 9000 + i, "check_status": "call_only", "segment_id": "S5", "country": "US"} for i in range(500)]
    return {"leads": leads, "prospects": pros,
            "segments": [{"id": "S5", "name": "Buchhaltung und Lohnabrechnung", "status": "testing",
                          "email_countries": ["US", "UK"]}],
            "landing_pages": [{"slug": "us/accountants", "status": "review", "segment_id": "S5", "country": "US"}],
            "experiments": [{"id": 7, "variant": "v1", "status": "paused", "segment_id": "S5", "country": "US"}],
            "sample_stock": []}


LAND_OK = {"ok": True, "gruende": [], "nur_firmen": False, "tageslimit": 260}


class ZaehlenTest(unittest.TestCase):
    def test_tore_zaehlen_nur_premium_freigegeben_frisch_frei(self):
        fa = FakeAbfrage(tabellen())
        z = Z.zaehlen(fa, "S5", "US", HEUTE)
        self.assertEqual(z["premium"]["firmen"], 60)       # Firmen, nicht Leads; ohne alt/failed/sample/UK
        self.assertEqual(z["freigegeben"]["firmen"], 90)   # + 30 alte, aber freigegebene Firmen
        self.assertEqual(z["kaeufer_ok"], 250)             # call_only zählt nicht (Inhaber 02.10.2026)
        self.assertEqual(z["seite"]["status"], "review")
        # nur Lesezugriffe über die Abfrage, Premium mit Freigabe-Filter
        p = next(c[1] for c in fa.calls if c[0] == "leads" and "premium->>tier" in c[1])
        self.assertEqual(p["lead_checks.result"], "eq.released")
        self.assertEqual(p["event_date"], "gte.2026-09-21")
        self.assertIn("lead_checks!inner", p["select"])

    def test_zeitueberschreitung_beim_zaehlen_faellt_auf_zeilen_zurueck(self):
        fa = FakeAbfrage(tabellen(n_kaeufer=250), timeout={"prospects"})
        z = Z.zaehlen(fa, "S5", "US", HEUTE)
        self.assertEqual(z["kaeufer_ok"], 250)
        self.assertFalse(z["kaeufer_mindestens"])

    def test_bereit_wenn_alle_tore_gruen(self):
        e = Z.bewerten("S5", "US", Z.zaehlen(FakeAbfrage(tabellen()), "S5", "US", HEUTE), LAND_OK,
                       {"im_fokus": False, "test_freigabe": False})
        self.assertTrue(e["bereit"])
        self.assertIn("Klick des Inhabers", e["versand"])
        self.assertEqual(e["info"]["vorschau"][0].split("/", 3)[-1], "us/accountants?vorschau=1")
        self.assertIn("/start?vorschau=1", e["info"]["vorschau"][1])
        self.assertIn("S5/US: bereit (4/4)", Z.zeile(e))

    def test_nicht_bereit_mit_zu_wenig_premium_und_kaeufern(self):
        z = Z.zaehlen(FakeAbfrage(tabellen(n_premium=12, n_kaeufer=150)), "S5", "US", HEUTE)
        e = Z.bewerten("S5", "US", z, LAND_OK)
        self.assertFalse(e["bereit"])
        self.assertFalse(e["tore"]["premium"]["ok"])
        self.assertFalse(e["tore"]["kaeufer"]["ok"])
        self.assertTrue(e["tore"]["probe"]["ok"])
        zeile = Z.zeile(e)
        self.assertIn("nicht bereit (2/4)", zeile)
        self.assertIn("Premium-Leads 12/50 fehlt", zeile)

    def test_probe_braucht_zehn_verschiedene_firmen(self):
        t = tabellen(n_premium=0)
        t["leads"] = [lead(i, f"c{i % 9}") for i in range(40)]  # 40 Leads, nur 9 Firmen
        e = Z.bewerten("S5", "US", Z.zaehlen(FakeAbfrage(t), "S5", "US", HEUTE), LAND_OK)
        self.assertFalse(e["tore"]["probe"]["ok"])
        self.assertEqual(e["tore"]["probe"]["ist"], 9)


class LandTest(unittest.TestCase):
    def test_echte_dateien(self):
        self.assertTrue(Z.land_pruefen("US")["ok"])
        self.assertTrue(Z.land_pruefen("SE")["ok"])
        for land in ("DE", "IE", "NL", "BE", "AU", "CA", "IL", "HK"):
            with self.subTest(land):
                self.assertFalse(Z.land_pruefen(land)["ok"])

    def test_strengere_regel_gilt(self):
        cfg = {"countries": {"XX": {"allowed": True}, "US": {"allowed": False}}}
        recht = {"US": {"firmen": "Ja", "risiko": "gering", "stand": "aktiv"},
                 "AU": {"firmen": "bedingt", "risiko": "hoch", "stand": "nie"}}
        self.assertFalse(Z.land_pruefen("US", cfg, recht)["ok"])            # countries.yaml sperrt
        self.assertFalse(Z.land_pruefen("XX", cfg, recht)["ok"])            # nicht in der Rechts-Tabelle
        g = Z.land_pruefen("AU", {"countries": {"AU": {"allowed": True}}}, recht)["gruende"]
        self.assertTrue(any("hoch" in x for x in g))
        self.assertTrue(Z.land_pruefen("US", {"countries": {"US": {"allowed": True}}}, recht)["ok"])

    def test_rechts_tabelle_vollstaendig_gelesen(self):
        t = Z.recht_tabelle()
        self.assertGreaterEqual(len(t), 20)
        self.assertEqual(t["UK"]["firmen"], "Ja")
        self.assertIn("nie", t["IE"]["stand"])


class AntragTest(unittest.TestCase):
    def test_antrag_kurz_und_nur_bei_gruen(self):
        e = Z.bewerten("S5", "US", Z.zaehlen(FakeAbfrage(tabellen()), "S5", "US", HEUTE), LAND_OK)
        a = mit_kurz(Z.antrag(e))
        self.assertLessEqual(len(a["kurz_titel"]), TITEL_MAX)
        self.assertLessEqual(len(a["kurz_grund"]), GRUND_MAX)
        self.assertTrue(a["kurz_titel"].startswith("Freigabe nötig"))
        self.assertEqual((a["status"], a["needs_owner"], a["type"]), ("proposed", True, "segment"))
        self.assertEqual(a["metrics"]["freigabe"], "zielgruppe")
        self.assertFalse(a["subject"].lower().startswith("vorschlag"))  # kein Agenten-Auto-Umsetzen
        e2 = Z.bewerten("S5", "US", Z.zaehlen(FakeAbfrage(tabellen(n_premium=3)), "S5", "US", HEUTE), LAND_OK)
        with self.assertRaises(ValueError):
            Z.antrag(e2)

    def test_eingabe_ungueltig(self):
        self.assertEqual(Z.main(["5", "USA"]), 2)


class DokumenteTest(unittest.TestCase):
    ROOT = Path(__file__).resolve().parents[1]

    def test_werkzeugkasten_pfade_existieren(self):
        import re
        text = (self.ROOT / "docs" / "WERKZEUGKASTEN.md").read_text(encoding="utf-8")
        pfade = set(re.findall(r"`((?:docs|scripts|config|app|video|drafts|samples|tests|supabase|\.claude|\.github)"
                               r"/[^`*<>{} ]+|[A-Z]+\.md|countries\.yaml)`", text))
        self.assertGreater(len(pfade), 60)
        fehlt = sorted(p for p in pfade if not (self.ROOT / p).exists())
        self.assertEqual(fehlt, [], "Pfade im Werkzeugkasten fehlen")

    def test_alle_md_dateien_im_werkzeugkasten(self):
        text = (self.ROOT / "docs" / "WERKZEUGKASTEN.md").read_text(encoding="utf-8")
        import subprocess
        try:  # nur Dateien im Repo (keine Caches wie .pytest_cache)
            mds = subprocess.run(["git", "ls-files", "*.md"], cwd=self.ROOT, capture_output=True, text=True,
                                 check=True).stdout.split()
        except (OSError, subprocess.CalledProcessError):
            self.skipTest("git nicht verfügbar")
        fehlt = [m for m in mds if f"`{m}`" not in text]
        self.assertEqual(fehlt, [], "MD-Dateien fehlen im Werkzeugkasten")

    def test_ablaufplan_verlinkt(self):
        for f in ("docs/GEHIRN-SITZUNG.md", "docs/JARVIS.md", "docs/WERKZEUGKASTEN.md"):
            with self.subTest(f):
                self.assertIn("ABLAUFPLAN-NEUE-ZIELGRUPPE.md", (self.ROOT / f).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
