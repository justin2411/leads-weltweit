"""Quellen-Scout 04.10.2026: S2 UK/FR ohne Website – Overture ab Konfidenz 0,4 (ohne Verdrängung durch Firmen mit
eigener E-Mail-Domain) und das RGE-Verzeichnis der ADEME. Ohne Netz."""
import datetime as dt
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extraktor import qc, sc, segments  # noqa: E402
from extraktor.sources import fr_rge, overture  # noqa: E402

TODAY = dt.date.today()
QUIET = lambda *_: None  # noqa: E731


def parquet(rows) -> Path:
    import duckdb
    path = Path(tempfile.mkdtemp()) / "ov.parquet"
    con = duckdb.connect()
    con.execute("CREATE TABLE t (id VARCHAR, name VARCHAR, phones VARCHAR[], emails VARCHAR[], socials VARCHAR[], "
                "websites VARCHAR[], street VARCHAR, city VARCHAR, postcode VARCHAR, region VARCHAR, "
                "country VARCHAR, category VARCHAR, confidence DOUBLE, operating_status VARCHAR, "
                "datasets VARCHAR[], updated VARCHAR[])")
    for r in rows:
        con.execute("INSERT INTO t VALUES (?, ?, ?, ?, [], [], '1 High St', 'Leeds', 'LS1 1AA', '', 'GB', 'cafe', ?, "
                    "'open', ['meta'], [])", list(r))
    con.execute(f"COPY t TO '{path}' (FORMAT parquet)")
    return path


class OvertureZweiteStufeTests(unittest.TestCase):
    def test_no_website_skips_own_domain_and_respects_min_conf(self):
        path = parquet([
            ("a", "Own Domain Cafe", ["+441130000001"], ["info@owndomaincafe.co.uk"], 0.9),  # verdrängte früher alle
            ("b", "Gmail Cafe", ["+441130000002"], ["gmailcafe@gmail.com"], 0.7),
            ("c", "Mid Cafe", ["+441130000003"], ["midcafe@hotmail.com"], 0.5),
            ("d", "Low Cafe", ["+441130000004"], ["lowcafe@gmail.com"], 0.3),  # unter 0,4: nie
            ("e", "Quiet Cafe", ["+441130000005"], [], 0.8),  # ohne E-Mail: nach denen mit E-Mail
        ])
        with mock.patch.object(overture, "cache_for", return_value=path):
            hi = [r["id"] for r in overture.no_website("UK", 10, log=QUIET)]
            mid = [r["id"] for r in overture.no_website("UK", 10, log=QUIET, min_conf=0.4)]
            low = [r["id"] for r in overture.no_website("UK", 10, log=QUIET, min_conf=0.1)]
            keys = overture.phones("UK")
        self.assertEqual(hi, ["b", "e"])
        self.assertEqual(mid, ["b", "c", "e"])
        self.assertEqual(low, mid)
        self.assertEqual(keys, {f"13000000{i}" for i in range(1, 6)})

    def test_phone_key(self):
        self.assertEqual(overture.phone_key("+33 6 37 51 96 32"), overture.phone_key("06 37 51 96 32"))
        self.assertEqual(overture.phone_key("+441130000001"), "130000001")


def rge_rows():
    base = {"siret": "82454695600023", "nom_entreprise": "EL ARCHITECTURE SARL", "adresse": "4 RUE D'HALLENNES",
            "code_postal": "59320", "commune": "ENGLOS", "telephone": "06 37 51 96 32",
            "email": "e.lannoyarchitecture@gmail.com", "site_internet": "", "domaine": "Architecte",
            "lien_date_debut": "2019-10-16", "lien_date_fin": "2099-01-01"}
    return [base, dict(base, domaine="Isolation des murs"),
            dict(base, siret="48774909500021", site_internet="http://www.enzo-rosso.fr"),  # hat Website
            dict(base, siret="11111111100011", lien_date_fin="2020-01-01"),               # Qualifikation abgelaufen
            dict(base, siret="22222222200022", telephone="")]                              # ohne Telefon


class RgeTests(unittest.TestCase):
    def test_companies_and_candidate(self):
        rows = fr_rge.companies(rge_rows(), today=TODAY)
        self.assertEqual([d["siret"] for d in rows], ["82454695600023"])
        self.assertEqual(rows[0]["domaines"], ["Architecte", "Isolation des murs"])
        c = fr_rge.to_candidate(rows[0], today=TODAY)
        self.assertEqual((c["source"], c["source_id"], c["country"], c["zip"]), ("rge", "82454695600023", "FR", "59320"))
        self.assertEqual(c["name"], "El Architecture SARL")
        self.assertEqual(c["city"], "Englos")
        self.assertEqual(fr_rge.city("SAUVETERRE-DE-BEARN"), "Sauveterre-de-Bearn")
        self.assertEqual(fr_rge.city("LA ROCHE SUR YON"), "La Roche sur Yon")
        self.assertTrue(segments.fits("S2", c)[0])
        c["evidence"] = {"mx": True}
        q = qc.run(c, "S2")
        self.assertEqual(q["status"], "green", q)
        t = segments.texts("S2", c)
        self.assertIn("Aucun site web trouvé", t["signal"])
        self.assertIn("RGE", t["signal"])
        self.assertEqual(sc.run(c, "S2", t)["status"], "pass", t)
        from extraktor.store import EVENT_KEY, SOURCE_NAME, signal_type
        self.assertEqual(signal_type("S2", "rge"), "no_website")
        self.assertIn("RGE", SOURCE_NAME["rge"])
        self.assertEqual(EVENT_KEY["rge"], "no_website")

    def test_rejects_own_domain_found_site_and_other_segments(self):
        d = fr_rge.companies(rge_rows(), today=TODAY)[0]
        self.assertFalse(segments.fits("S2", fr_rge.to_candidate(dict(d, email="contact@el-architecture.fr")))[0])
        c = fr_rge.to_candidate(d, today=TODAY)
        self.assertFalse(segments.fits("S1", c)[0])
        c["website"] = "https://el-architecture.fr"
        self.assertFalse(segments.fits("S2", c)[0])

    def test_load_skips_known_and_overture_phones(self):
        with mock.patch.object(fr_rge, "download", return_value=rge_rows()):
            self.assertEqual(len(fr_rge.load(None, log=QUIET)), 1)
            self.assertEqual(fr_rge.load(None, log=QUIET, exclude={"82454695600023"}), [])
            self.assertEqual(fr_rge.load(None, log=QUIET, skip_phones={overture.phone_key("+33637519632")}), [])


def rge_new_rows(today):
    """Erfundene Firmen (Premium-Jagd 05.10.2026): neue Qualifikation, alte, Zukunft, ADEME-Testeintrag."""
    d = lambda n: (today - dt.timedelta(days=n)).isoformat()  # noqa: E731
    base = {"siret": "90000000100011", "nom_entreprise": "ISOLATION EXEMPLE SAS", "adresse": "1 RUE DE L'EXEMPLE",
            "code_postal": "75012", "commune": "PARIS", "telephone": "01 43 47 28 15",
            "email": "isolation.exemple@gmail.com", "site_internet": "", "domaine": "Isolation des murs",
            "lien_date_debut": d(400), "lien_date_fin": "2099-01-01"}
    return [base, dict(base, domaine="Pompe à chaleur : chauffage", lien_date_debut=d(9)),
            dict(base, siret="90000000200022", nom_entreprise="CHAUFFAGE EXEMPLE SARL", telephone="01 43 47 28 26",
                 lien_date_debut=d(200)),                                                  # nur alte Qualifikation
            dict(base, siret="90000000300033", nom_entreprise="FUTUR EXEMPLE SARL", telephone="01 43 47 28 37",
                 lien_date_debut=d(-10)),                                                  # Start in der Zukunft
            dict(base, siret="31324366900049", nom_entreprise="TEST 1", telephone="01 43 47 28 48",
                 lien_date_debut=d(1))]                                                    # Testeintrag der ADEME


class RgeNeueQualifikationTests(unittest.TestCase):
    def test_fresh_qualification_is_dated_premium_event(self):
        rows = fr_rge.companies(rge_new_rows(TODAY), today=TODAY)
        self.assertEqual(sorted(r["siret"] for r in rows), ["90000000100011", "90000000200022", "90000000300033"])
        by = {r["siret"]: fr_rge.to_candidate(r, today=TODAY) for r in rows}
        c = by["90000000100011"]
        self.assertEqual(c["facts"]["rge_new"]["date"], (TODAY - dt.timedelta(days=9)).isoformat())
        self.assertEqual(c["facts"]["rge_new"]["domaines"], ["Pompe à chaleur : chauffage"])
        self.assertEqual(c["event_date"], TODAY - dt.timedelta(days=9))
        for s in ("90000000200022", "90000000300033"):
            self.assertNotIn("rge_new", by[s]["facts"])
            self.assertEqual(by[s]["event_date"], TODAY)
        t = segments.texts("S2", c)
        self.assertIn("Aucun site web trouvé", t["signal"])
        self.assertIn("nouvelle qualification RGE", t["signal"])
        self.assertEqual(t["signal_date"], c["event_date"])
        c["evidence"] = {"mx": True}
        self.assertEqual(qc.run(c, "S2")["status"], "green")
        self.assertEqual(sc.run(c, "S2", t)["status"], "pass", t)

    def test_new_first_and_premium_on_store(self):
        import json
        from extraktor import run
        from extraktor.store import _premium
        with mock.patch.object(fr_rge, "download", return_value=rge_new_rows(TODAY)):
            got = fr_rge.load(None, log=QUIET)
        self.assertEqual(got[0]["source_id"], "90000000100011")
        new = got[0]
        ev = json.loads(run.dated_event({"facts": new["facts"]}))
        self.assertEqual(ev["dated_event"]["kind"], "rge_qualification")
        self.assertEqual(run.dated_event({"facts": got[1]["facts"]}), "")
        r = {"segment": "S2", "source": "rge", "signal_type": "", "signal_date": new["event_date"].isoformat(),
             "source_url": new["source_url"], "signal_evidence": json.dumps(ev), "contact_name": "",
             "phone": new["phone"], "email": new["email"]}
        p = _premium(r)["premium"]
        self.assertEqual(p["tier"], "premium", p)
        self.assertTrue(any(x.startswith("kombi:") for x in p["reasons"]))
        # ohne Ereignis-Beleg bleibt ein RGE-Lead Standard (Prüfdatum ist kein Ereignis)
        self.assertEqual(_premium(dict(r, signal_evidence=""))["premium"]["tier"], "standard")


if __name__ == "__main__":
    unittest.main()
