"""Kunden-Werk: Rechtsform für Käufer in BE/SE/IE/NL über EU VIES und KVK Open Dataset (04.10.2026)."""
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import kundenwerk as K  # noqa: E402
from extraktor.sources import eu_registers as EU  # noqa: E402
from lib import regnum  # noqa: E402
from lib.rules import is_company_form  # noqa: E402


class Resp:
    def __init__(self, status, payload):
        self.status_code, self._p = status, payload
        self.ok = status < 400
        self.text = str(payload)

    def json(self):
        return self._p


class Session:
    def __init__(self, *answers):
        self.answers, self.urls = list(answers), []

    def get(self, url, **kw):
        self.urls.append(url)
        return self.answers.pop(0)


class NumbersTests(unittest.TestCase):
    def test_be_enterprise_number_with_checksum(self):
        t = regnum.plain_text("<p>BTW BE 0403.170.701</p><p>Ondernemingsnummer: 0756 997 205</p><p>BE0123456789</p>")
        self.assertEqual(regnum.be_numbers(t), ["0403170701", "0756997205"])  # letzte: Prüfziffer falsch
        self.assertEqual(regnum.be_numbers("Tel 0475 123 456"), [])  # ohne BTW/KBO kein Treffer

    def test_se_orgnr_luhn_as_vies_number(self):
        self.assertEqual(regnum.se_numbers("Org.nr: 556036-0793"), ["556036079301"])
        self.assertEqual(regnum.se_numbers("Org.nr: 556036-0794"), [])

    def test_ie_vat_and_nl_kvk(self):
        self.assertEqual(regnum.ie_vats("VAT No: IE 6388047V"), ["6388047V"])
        self.assertEqual(regnum.ie_vats("Phone 6388047"), [])
        self.assertEqual(regnum.nl_kvks("KvK-nummer: 60385898 · BTW NL001234567B01"), ["60385898"])
        self.assertEqual(regnum.nl_kvks("Bel 06 12345678"), [])
        self.assertEqual(regnum.numbers_for("NL", "KvK 60385898"), ["60385898"])
        self.assertEqual(regnum.numbers_for("US", "KvK 60385898"), [])
        self.assertEqual(regnum.fi_numbers("Y-tunnus: 0112038-9"), ["01120389"])
        self.assertEqual(regnum.fi_numbers("Y-tunnus: 0112038-8"), [])


class ViesTests(unittest.TestCase):
    def test_form_from_registered_name(self):
        cases = {("BE", "BV TENDER EXPERTS"): "BV", ("BE", "SRL ANAGRAMME"): "SRL", ("BE", "NV BBC Communication"): "NV",
                 ("BE", "Entelec Control Systems BVBA"): "BVBA", ("BE", "Botten, Thierry"): None,
                 ("BE", "Comm.V DigiStef"): None, ("BE", "VOF Ontwerp Marloes"): None,
                 ("BE", "GmbH INTEC SOFTWARE ENGINEERING"): None,
                 ("SE", "Perfect Day Media AB"): "AB", ("SE", "SAAB AKTIEBOLAG"): "AB", ("SE", "AB Volvo (publ)"): "AB",
                 ("SE", "Anna Andersson"): None, ("IE", "CASTLE33 DIGITAL LIMITED"): "Ltd",
                 ("IE", "AZETS AUDIT SERVICES IRELAND LTD"): "Ltd", ("IE", "---"): None, ("NL", "X BV"): None,
                 ("FI", "Nokia Oyj"): "Oyj", ("FI", "Pikseli Oy"): "Oy", ("FI", "Matti Meikäläinen"): None}
        for (cc, name), want in cases.items():
            got = EU.form_from_name(cc, name)
            self.assertEqual(got, want, (cc, name))
            if got:  # jede erkannte Form ist laut unveränderter Prüfregel eine Kapitalgesellschaft
                self.assertTrue(is_company_form(cc, got), (cc, got))

    def test_vies_answer(self):
        s = Session(Resp(200, {"isValid": True, "userError": "VALID", "name": "SRL TRIPTYQUE"}))
        self.assertEqual(EU.vies("BE", "0479075674", s), {"valid": True, "name": "SRL TRIPTYQUE", "form": "SRL"})
        s = Session(Resp(200, {"isValid": False, "userError": "INVALID", "name": "---"}))
        self.assertEqual(EU.vies("BE", "0479075674", s), {"valid": False, "name": "", "form": None})
        with mock.patch.object(EU.time, "sleep"):
            s = Session(*[Resp(200, {"isValid": False, "userError": "MS_UNAVAILABLE"})] * 3)
            self.assertIsNone(EU.vies("SE", "556036079301", s))  # Störung: später erneut

    def test_kvk_only_bv_nv(self):
        s = Session(Resp(200, {"actief": "J", "rechtsvormCode": "BV"}))
        self.assertEqual(EU.kvk("60385898", s), {"active": True, "form": "BV"})
        s = Session(Resp(200, {"actief": "J", "rechtsvormCode": "BV", "insolventieCode": "FAIL"}))
        self.assertEqual(EU.kvk("60385898", s), {"active": False, "form": "BV"})
        s = Session(Resp(404, {"fout": [{"code": "IPD0015"}]}))
        self.assertEqual(EU.kvk("69599084", s), {"active": None, "form": None})  # eenmanszaak/VOF
        self.assertIsNone(EU.kvk("1", Session(Resp(429, {}))))  # Grenze: nächster Lauf


class RecheckTests(unittest.TestCase):
    def test_verify_vies_needs_company_form(self):
        rows = {1: {"country": "BE"}, 2: {"country": "BE"}, 3: {"country": "SE"}, 4: {"country": "UK"}}
        found = {1: ["0756997205"], 2: ["0884369190"], 3: ["556863000701"], 4: ["01234567"]}
        names = {"0756997205": "BV TENDER EXPERTS", "0884369190": "Botten, Thierry", "556863000701": "Perfect Day Media AB"}

        class F:
            def api(self, host, interval, fn, cc, n, session):
                return {"valid": True, "name": names[n], "form": EU.form_from_name(cc, names[n])}

        got = K.verify_vies(found, rows, F())
        self.assertEqual(sorted(got), [1, 3])
        self.assertEqual(got[1]["form"], "BV")
        self.assertIn("EU VIES", got[1]["note"])
        self.assertEqual(got[3]["form"], "AB")

    def test_kvk_queue_spacing_and_deadline(self):
        calls = []

        def fake(n, session):
            calls.append((n, time.monotonic()))
            return {"active": n != "2", "form": "BV"} if n != "3" else {"active": None, "form": None}

        with mock.patch.object(EU, "kvk", fake), mock.patch.object(EU, "KVK_INTERVAL", 0.05):
            q = K.KvkQueue(deadline=0, max_lookups=3, log=lambda *a: None)
            for i, n in enumerate(["1", "2", "3", "4"]):
                q.put(i, [n])
            hits = q.finish(time.monotonic() + 5)
        self.assertEqual([c[0] for c in calls], ["1", "2", "3"])  # höchstens max_lookups
        self.assertGreaterEqual(calls[1][1] - calls[0][1], 0.045)  # Abstand eingehalten
        self.assertEqual(sorted(hits), [0])  # 2 nicht aktiv, 3 keine BV/NV
        self.assertEqual(q.asked, {0, 1, 2})  # 4 nicht gefragt -> nächster Lauf
        with mock.patch.object(EU, "kvk", fake), mock.patch.object(EU, "KVK_INTERVAL", 61):
            q = K.KvkQueue(deadline=time.monotonic() + 10, max_lookups=5, log=lambda *a: None)
            q.put(0, ["1"])
            self.assertEqual(q.finish(time.monotonic() + 2), {})  # Zeitfenster zu kurz für eine Abfrage

    def test_recheck_rows_caps_and_generic_only(self):
        seen = []

        class DB:
            def select(self, table, q):
                seen.append(q)
                return [{"id": len(seen) * 100 + k} for k in range(int(q["limit"]))]

        cfg = {"countries": {"NL": {"allowed": True, "generic_only": True, "company_forms_only": True},
                             "XX": {"allowed": True, "generic_only": False, "company_forms_only": True},
                             "BE": {"allowed": False, "generic_only": True, "company_forms_only": True},
                             "US": {"allowed": True, "generic_only": False, "company_forms_only": False}}}
        rows = K.recheck_rows(DB(), [("S2", "NL"), ("S2", "US"), ("S2", "BE"), ("S2", "XX")], 100, cfg, caps={"NL": 9})
        # US braucht keine Rechtsform, BE ist kein Mail-Land
        self.assertEqual([q["country"] for q in seen], ["eq.NL", "eq.XX"])
        self.assertEqual(seen[0]["limit"], "9")
        self.assertEqual(seen[0]["email_is_generic"], "is.true")
        self.assertNotIn("email_is_generic", seen[1])
        self.assertEqual(seen[1]["limit"], "91")  # was NL nicht braucht, bekommt das nächste Paar
        self.assertEqual(len(rows), 100)

    def test_default_pairs_cover_mail_countries(self):
        pairs = {p for p in K.RECHECK_PAIRS.split(",")}
        self.assertTrue({"S2:NL", "S2:SE", "S2:FI", "S2:UK", "S2:FR", "S1:UK"} <= pairs)
        self.assertFalse({"S2:BE", "S2:IE"} & pairs)  # seit 04.10.2026 nie Mail-Länder
        self.assertTrue(K.RECHECK_PAIRS.startswith("S2:NL"))  # NL zuerst: KVK-Abfragen laufen im Hintergrund


if __name__ == "__main__":
    unittest.main()
