"""Prüfer-Werk (scripts/pruefer.py): reine Prüfungen ohne Datenbank und Netz."""
import datetime as dt
import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import pruefer as P  # noqa: E402
from lib.release_gate import Verdict  # noqa: E402

TODAY = dt.date(2026, 10, 5)


def lead(**kw):
    base = {"id": "l1", "company_id": "c1", "country": "UK", "segment_id": "S2", "signal_type": "no_website",
            "event_date": "2026-10-03", "source_date": "2026-10-03", "created_at": "2026-10-03T10:00:00+00:00",
            "event_summary": "Acme Plumbing has no website: no own website could be found (checked 3 October 2026).",
            "company": {"id": "c1", "name": "Acme Plumbing", "region": "", "website": None},
            "contact": {"phone": "+442072639163", "email": "info@acme.co.uk"}, "person": {"name": "Jane Doe", "role": "Owner"}}
    base.update(kw)
    return base


class ShardTests(unittest.TestCase):
    def test_ranges_cover_uuid_space_without_overlap(self):
        rs = [P.shard_range(i, 4) for i in range(4)]
        self.assertEqual(rs[0][0], str(uuid.UUID(int=0)))
        self.assertIsNone(rs[-1][1])
        for (lo, hi), (lo2, _) in zip(rs, rs[1:]):
            self.assertEqual(hi, lo2)
            self.assertLess(uuid.UUID(lo).int, uuid.UUID(hi).int)
        self.assertEqual(P.shard_range(0, 1), (str(uuid.UUID(int=0)), None))
        self.assertEqual(P._range("a", None), {"id": "gte.a"})
        self.assertEqual(P._range("a", "b"), {"and": "(id.gte.a,id.lt.b)"})


class CheckTests(unittest.TestCase):
    def test_clean_lead_has_full_points(self):
        hard, hints = P.extra_checks(lead(), TODAY)
        self.assertEqual((hard, hints), ([], []))
        self.assertEqual(P.punkte(True, hints), 100)
        self.assertEqual(P.punkte(False, hints), 0)

    def test_old_incorporation_is_held_young_is_fine(self):
        hard, _ = P.extra_checks(lead(signal_type="new_incorporation", event_date="2026-09-20"), TODAY)
        self.assertEqual(hard, ["s1:anlass_veraltet:gruendung_15_tage"])
        hard, _ = P.extra_checks(lead(signal_type="new_incorporation", event_date="2026-09-21"), TODAY)
        self.assertEqual(hard, [])

    def test_hints_reduce_points_but_never_hold(self):
        it = lead(person={"name": "", "role": "Owner"}, company={"name": "ACME PLUMBING LTD"}, source_date=None,
                  event_summary="ACME PLUMBING LTD has no website (checked 1 October 2026).")
        hard, hints = P.extra_checks(it, TODAY)
        self.assertEqual(hard, [])
        self.assertEqual(set(hints), {"nur_rolle", "schreibweise_gross", "text_datum_abweichend", "beleg_ohne_datum"})
        self.assertEqual(P.punkte(True, hints), 80)
        _, hints = P.extra_checks(lead(event_summary="Acme Plumbing has no website."), TODAY)
        self.assertEqual(hints, ["text_ohne_datum"])

    def test_dates_in_text_en_fr_iso(self):
        self.assertEqual(P.dates_in_text("vérifié le 3 octobre 2026"), [dt.date(2026, 10, 3)])
        self.assertEqual(P.dates_in_text("checked 1st October 2026; 2026-10-02"), [dt.date(2026, 10, 1), dt.date(2026, 10, 2)])
        self.assertEqual(P.dates_in_text("no date"), [])

    def test_name_case_and_cleanup(self):
        self.assertEqual(P.name_case("ACME PLUMBING"), "schreibweise_gross")
        self.assertEqual(P.name_case("acme plumbing"), "schreibweise_klein")
        self.assertIsNone(P.name_case("Acme Plumbing"))
        self.assertIsNone(P.name_case("IBM"))  # kurze Abkürzungen sind keine Schreibfehler
        self.assertEqual(P.clean_name("  Acme   Plumbing "), "Acme Plumbing")
        self.assertIsNone(P.clean_name("Acme Plumbing"))

    def test_phone_fix_only_reformats_valid_numbers(self):
        self.assertEqual(P.phone_fix("020 7263 9163", "", "UK"), "+442072639163")
        self.assertIsNone(P.phone_fix("+442072639163", "", "UK"))  # schon international
        self.assertIsNone(P.phone_fix("12345", "", "UK"))           # ungültig: nur markieren, nicht ändern
        self.assertIsNone(P.phone_fix("", "", "UK"))


class DupTests(unittest.TestCase):
    def test_older_or_taken_lead_of_other_firm_makes_duplicate(self):
        it = lead()
        older = {"id": "l0", "company_id": "c9", "country": "UK", "status": "new", "created_at": "2026-10-01", "via": "telefon"}
        newer = {**older, "id": "l2", "created_at": "2026-10-04"}
        self.assertEqual(P.dup_decide(it, [older]), "s2:dublette_bestand_telefon")
        self.assertIsNone(P.dup_decide(it, [newer]))  # der ältere bleibt frei – genau einer
        self.assertEqual(P.dup_decide(it, [{**newer, "status": "sample", "via": "domain"}]), "s2:dublette_bestand_domain")
        self.assertIsNone(P.dup_decide(it, [{**older, "country": "US"}]))      # anderes Land
        self.assertIsNone(P.dup_decide(it, [{**older, "company_id": "c1"}]))   # dieselbe Firma
        self.assertIsNone(P.dup_decide(it, [{**older, "status": "held"}]))     # zurückgehaltene zählen nicht

    def test_apply_extra_only_makes_stricter(self):
        ok = Verdict("l1", True, None, [], country="UK", segment="S2", status="new")
        bad = Verdict("l2", False, 3, ["s3:sperrliste"], country="UK", segment="S2", status="new")
        items = [lead(), lead(id="l2", signal_type="new_incorporation", event_date="2026-09-01")]
        hints = P.apply_extra([ok, bad], items, TODAY, {"l1": "s2:dublette_bestand_domain"})
        self.assertFalse(ok.ok)
        self.assertEqual((ok.stage, ok.reasons), (2, ["s2:dublette_bestand_domain"]))
        self.assertFalse(bad.ok)
        self.assertEqual(bad.stage, 1)
        self.assertIn("s3:sperrliste", bad.reasons)
        self.assertEqual(set(hints), {"l1", "l2"})
        clean = Verdict("l3", True, None, [], country="UK", segment="S2", status="new")
        P.apply_extra([clean], [lead(id="l3")], TODAY, {})
        self.assertTrue(clean.ok)

    def test_report_and_tagescheck_line(self):
        self.assertIn("Qualität lieferbar 90.0 %", P.report({"geprueft": 10, "bestanden": 9, "gehalten": 1, "punkte": 900}))
        import tagescheck
        self.assertEqual(tagescheck.kurz_pruefer([]), "Prüfer-Werk: in 24 h nichts geprüft")
        line = tagescheck.kurz_pruefer([{"country": "UK", "geprueft_24h": 100, "bestanden_24h": 95, "gehalten_24h": 5, "qualitaet_pct": 95.0},
                                        {"country": "US", "geprueft_24h": 100, "bestanden_24h": 85, "gehalten_24h": 15, "qualitaet_pct": 85.0}])
        self.assertIn("200 geprüft, Qualität lieferbar 90.0 %, 20 gehalten (UK 95 %, US 85 %)", line)


if __name__ == "__main__":
    unittest.main()
