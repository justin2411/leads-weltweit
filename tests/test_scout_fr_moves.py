"""FR-Umzüge laut BODACC aus den DILA-Rohdaten (Quellen-Scout R63, extraktor/sources/fr_bodacc_moves.py).
Erfundene Firmen, example-Domains – keine echten Lead-Daten."""
import datetime as dt
import io
import os
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from extraktor.sources import fr_bodacc_moves as M  # noqa: E402
from lib import premium, release_gate as G  # noqa: E402

TODAY = dt.date(2026, 10, 6)


def avis(n, desc, pm=True, form="Société par actions simplifiée", admin="Président : DURAND Marie",
         act="menuiserie", name="ATELIER LUMIERE", etab=False):
    who = (f"<personneMorale><denomination>{name}</denomination><formeJuridique>{form}</formeJuridique>"
           f"<administration>{admin}</administration></personneMorale>") if pm else \
        "<personnePhysique><nom>DUPONT</nom><prenom>Jean</prenom></personnePhysique>"
    addr = ("<france><numeroVoie>4</numeroVoie><typeVoie>rue</typeVoie><nomVoie>des Tests</nomVoie>"
            "<codePostal>69002</codePostal><ville>Lyon</ville></france>")
    e = ("<etablissementPrincipal><france><numeroVoie>9</numeroVoie><typeVoie>avenue</typeVoie><nomVoie>Exemple"
         "</nomVoie><codePostal>69003</codePostal><ville>Lyon</ville></france></etablissementPrincipal>") if etab else ""
    return (f"<avis><numeroAnnonce>{n}</numeroAnnonce><numeroDepartement>69</numeroDepartement><personnes><personne>"
            f"{who}<numeroImmatriculation><numeroIdentificationRCS>123 456 789</numeroIdentificationRCS>"
            f"<nomGreffeImmat>Lyon</nomGreffeImmat></numeroImmatriculation><activite>{act}</activite>"
            f"<siegeSocial>{addr}</siegeSocial>{e}</personne></personnes>"
            f"<modificationsGenerales><descriptif>{desc}</descriptif></modificationsGenerales></avis>")


def xml(*items):
    return ("<?xml version='1.0' encoding='utf-8'?><RCS-B_REDIFF><parution>20260191</parution>"
            "<dateParution>2026-10-06</dateParution><listeAvis>" + "".join(items) + "</listeAvis></RCS-B_REDIFF>"
            ).encode()


class ParseTest(unittest.TestCase):
    def test_only_company_moves_without_ending(self):
        rows = M.parse(xml(avis(1, "transfert du siège social."),
                           avis(2, "Nouveau siège.", pm=False),
                           avis(3, "Modification de l'administration."),
                           avis(4, "transfert du siège social, dissolution de la société."),
                           avis(5, "transfert de l'établissement principal.", etab=True)))
        self.assertEqual([r["id"] for r in rows], ["B202601911", "B202601915"])
        self.assertEqual(rows[0]["url"], "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:B202601911")
        self.assertEqual(rows[0]["siren"], "123456789")
        self.assertEqual(rows[0]["date"], "2026-10-06")

    def test_candidate(self):
        r = M.parse(xml(avis(1, "transfert du siège social.")))[0]
        c = M.to_candidate(r)
        self.assertEqual((c["source"], c["source_id"]), ("bodacc_move", "123456789"))
        self.assertEqual((c["zip"], c["city"], c["street"]), ("69002", "Lyon", "4 rue des Tests"))
        self.assertEqual(c["person_name"], "Marie Durand")
        self.assertEqual(c["facts"]["signal_type"], "relocation")
        self.assertEqual(c["event_date"], dt.date(2026, 10, 6))

    def test_principal_establishment_uses_its_address(self):
        r = M.parse(xml(avis(5, "transfert de l'établissement principal.", etab=True)))[0]
        c = M.to_candidate(r)
        self.assertEqual((c["zip"], c["facts"]["moved"]), ("69003", "établissement principal"))

    def test_skips_sci_and_holding(self):
        self.assertIsNone(M.to_candidate(M.parse(xml(avis(1, "Nouveau siège.", form="Société Civile Immobilière")))[0]))
        self.assertIsNone(M.to_candidate(M.parse(xml(avis(1, "Nouveau siège.", act="prise de participation")))[0]))

    def test_files_since(self):
        html = ('<a href="RCS-B_BXB20260180.taz">RCS-B_BXB20260180.taz</a>   2026-09-20 07:05  556K\n'
                '<a href="RCS-B_BXB20260191.taz">RCS-B_BXB20260191.taz</a>   2026-10-06 07:05  1.4M\n'
                '<a href="RCS-A_BXA20260191.taz">RCS-A_BXA20260191.taz</a>   2026-10-06 07:00  1.2M\n')
        self.assertEqual(M.files(html, dt.date(2026, 9, 22)), [("RCS-B_BXB20260191.taz", "20260191")])


class DownloadAndMemoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        self.p = [mock.patch.object(M, "CACHE", d / "m.json"), mock.patch.object(M, "SEEN", d / "s.json"),
                  mock.patch.object(M.time, "sleep", lambda s: None)]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in self.p:
            x.stop()
        self.tmp.cleanup()

    def test_download_one_request_per_file_and_robots(self):
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tf:
            data = xml(avis(1, "transfert du siège social."))
            ti = tarfile.TarInfo("RCS-B_BXB20260191.xml")
            ti.size = len(data)
            tf.addfile(ti, io.BytesIO(data))
        index = '<a href="RCS-B_BXB20260191.taz">x</a>   2026-10-06 07:05  1.4M\n'
        calls = []

        def get(url, **kw):
            calls.append(url)
            r = mock.Mock(status_code=404 if url == M.ROBOTS else 200, text=index, content=buf.getvalue())
            r.raise_for_status = lambda: None
            return r
        with mock.patch.object(M.requests, "get", get):
            rows = M.download(log=lambda *a: None, today=TODAY)
        self.assertEqual(len(rows), 1)
        self.assertEqual(calls, [M.ROBOTS, M.BASE, M.BASE + "RCS-B_BXB20260191.taz"])
        # opendatasoft/bodacc.fr-API (robots.txt-Sperre) nie
        self.assertFalse(any("opendatasoft" in u or "bodacc.fr/api" in u for u in calls))

    def test_robots_block_stops(self):
        def get(url, **kw):
            r = mock.Mock(status_code=200, text="User-agent: *\nDisallow: /OPENDATA/\n")
            return r
        with mock.patch.object(M.requests, "get", get):
            self.assertEqual(M.download(log=lambda *a: None, today=TODAY), [])

    def test_memory_processes_each_notice_once(self):
        M.CACHE.write_text(__import__("json").dumps(M.parse(xml(avis(1, "transfert du siège social.")))))
        self.assertEqual(len(M.load(None, log=lambda *a: None)), 1)
        self.assertEqual(M.remember(["B202601911"]), 1)
        self.assertEqual(M.load(None, log=lambda *a: None), [])


class TextsAndGateTest(unittest.TestCase):
    def test_texts_pass_signal_check_premium_and_gate(self):
        from extraktor import sc, segments
        c = M.to_candidate(M.parse(xml(avis(1, "transfert du siège social.")))[0])
        c.update(website="https://atelier-lumiere.example.fr", email="contact@atelier-lumiere.example.fr",
                 phone="+33478000000")
        c["facts"].update(domain="atelier-lumiere.example.fr", checked_on=TODAY,
                          findings=[{"type": "website_outdated", "detail": "jquery1", "value": "1.12.4"}])
        self.assertTrue(segments.fits("S2", c)[0])
        self.assertFalse(segments.fits("S4", c)[0])
        t = segments.texts("S2", c)
        self.assertIn("6 octobre 2026", t["signal"])
        self.assertEqual(sc.run(c, "S2", t, TODAY)["problems"], [])
        from extraktor.store import SOURCE_NAME, signal_type
        src = SOURCE_NAME["bodacc_move"]
        s = premium.score({"signal_type": signal_type("S2", "bodacc_move", "relocation"), "event_date": "2026-10-06",
                           "source_name": src, "source_url": c["source_url"], "details": {},
                           "person_name": c["person_name"], "phone": c["phone"], "email": c["email"]}, TODAY)
        self.assertEqual(s["tier"], "premium")
        it = {"id": "m1", "segment_id": "S2", "country": "FR", "status": "new", "signal_type": "relocation",
              "event_date": "2026-10-06", "source_date": "2026-10-06", "source_name": src,
              "source_url": c["source_url"], "event_summary": t["signal"], "opener": t["opener"],
              "urgency_reason": t["urgency_reason"],
              "company": {"name": c["name"], "country": "FR", "address": "4 rue des Tests, Lyon, 69002",
                          "website": c["website"]}, "contact": {"email": c["email"]}}
        self.assertEqual(G.stage1(it, TODAY), [])
        self.assertEqual(G.stage3(it, {"allowed_status": ("new",)}), [])


if __name__ == "__main__":
    unittest.main()
