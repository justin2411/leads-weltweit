"""Drei-Stufen-Freigabe (lib/release_gate.py, Inhaber 03.10.2026). Fixtures sind anonymisierte Nachbildungen echter
Fälle aus dem Bestand (erfundene Namen, Nummern aus Testbereichen, example-Domains) – keine echten Lead-Daten."""
import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fakedb import FakeDB  # noqa: E402
from lib import release_gate as G  # noqa: E402

TODAY = dt.date(2026, 10, 3)


def web_lead(**kw):
    """Website-Befund UK (Nachbildung „veraltete Website“, Stand 03.10.2026)."""
    it = {"id": "l1", "company_id": "c1", "segment_id": "S2", "country": "UK", "status": "new",
          "signal_type": "website_outdated", "event_date": "2026-10-03", "source_date": "2026-10-03",
          "source_name": "Website check (company homepage)", "source_url": "https://explore.overturemaps.org/#16/0/0?id=x",
          "event_summary": "Harbour Bakes: the copyright notice on the homepage dates from 2016 (checked 3 October 2026).",
          "opener": "Hi, I noticed the Harbour Bakes website looks a few years old. Would a refresh be useful?",
          "urgency": "medium", "urgency_reason": "An old-looking site makes visitors doubt the business is still active.",
          "company": {"id": "c1", "name": "Harbour Bakes", "country": "UK", "city": "Whitby",
                      "address": "12 Quay Rd, Whitby, YO21 1AB", "website": "https://harbourbakes.example.co.uk",
                      "phone_main": "+441947600000", "industry": "bakery"},
          "contact": {"phone": "01947 600123", "email": "hello@harbourbakes.example.co.uk"},
          "person": {"role": "Owner"}, "quality_blocking": False}
    for k, v in kw.items():
        if k in ("company", "contact", "person"):
            it[k] = {**it[k], **v}
        else:
            it[k] = v
    return it


def no_site_fr(**kw):
    """„pas de site web“ FR (Nachbildung Overture-Lead)."""
    it = web_lead(country="FR", signal_type="no_website", source_name="Overture Maps (business listing)",
                  event_summary="Atelier Lumière n'a pas de site web : l'entreprise est référencée avec un numéro de téléphone "
                                "et une adresse e-mail, mais aucun site propre n'a été trouvé (vérifié le 3 octobre 2026).",
                  opener="Bonjour, je n'ai pas trouvé de site web pour Atelier Lumière – un site simple vous intéresserait-il ?",
                  urgency_reason="Sans site web, l'entreprise est peu visible pour les clients qui la cherchent en ligne.",
                  company={"name": "Atelier Lumière", "country": "FR", "city": "Lyon", "website": None,
                           "address": "4 Rue des Tests, Lyon, 69002", "phone_main": "+33478000000", "industry": "artisan"},
                  contact={"phone": "+33 4 78 00 01 23", "email": "atelier.lumiere@gmail.com"})
    for k, v in kw.items():
        it[k] = {**it[k], **v} if k in ("company", "contact", "person") else v
    return it


def mx_ok(_):
    return True


class Stage1Test(unittest.TestCase):
    def test_valid_web_finding_passes(self):
        self.assertEqual(G.stage1(web_lead(), TODAY), [])

    def test_signal_not_for_segment(self):
        self.assertIn("signal_passt_nicht_zur_zielgruppe:job_open_30d", G.stage1(web_lead(signal_type="job_open_30d"), TODAY))

    def test_too_old_and_future(self):
        self.assertTrue(any(r.startswith("signal_zu_alt") for r in G.stage1(web_lead(event_date="2026-07-01"), TODAY)))
        self.assertIn("signal_datum_in_zukunft", G.stage1(web_lead(event_date="2026-10-09"), TODAY))

    def test_text_names_other_company(self):
        self.assertIn("ereignis_nennt_andere_firma", G.stage1(web_lead(company={"name": "Seaside Fish Bar"}), TODAY))

    def test_text_names_other_domain(self):
        it = web_lead(event_summary="Harbour Bakes: its website otherbakery.co.uk uses an expired certificate (checked 3 October 2026).",
                      signal_type="no_https")
        self.assertIn("befund_nennt_andere_domain", G.stage1(it, TODAY))

    def test_text_does_not_match_signal(self):
        self.assertIn("text_passt_nicht_zum_signal", G.stage1(web_lead(signal_type="website_not_mobile"), TODAY))

    def test_no_website_but_company_has_one(self):
        self.assertIn("hat_website", G.stage1(no_site_fr(company={"website": "https://atelier.example.fr"}), TODAY))

    def test_incorporation_with_website_is_no_s2_trigger(self):
        it = web_lead(signal_type="new_incorporation", source_name="Companies House",
                      event_summary="Harbour Bakes Ltd registered on 20 Sep 2026 (Whitby).", event_date="2026-09-20",
                      company={"name": "Harbour Bakes Ltd"})
        self.assertIn("neugruendung_hat_schon_website", G.stage1(it, TODAY))

    def test_live_recheck_skips_same_day_findings(self):
        self.assertEqual(G.live_recheck(web_lead(), fetcher=None, today=TODAY), ([], False))

    def test_live_recheck_confirms_or_rejects_finding(self):
        from extraktor.sources import website_check as wc
        orig = wc.inspect
        try:
            wc.inspect = lambda c, f, t: {"findings": [{"type": "website_outdated"}], "note": ""}
            self.assertEqual(G.live_recheck(web_lead(event_date="2026-09-30", source_date="2026-09-30"), None, TODAY), ([], True))
            wc.inspect = lambda c, f, t: {"findings": [], "note": ""}
            r, fetched = G.live_recheck(web_lead(event_date="2026-09-30", source_date="2026-09-30"), None, TODAY)
            self.assertTrue(fetched)
            self.assertEqual(r, ["befund_nicht_bestaetigt:seite_in_ordnung"])
        finally:
            wc.inspect = orig


class Stage2Test(unittest.TestCase):
    def test_complete_lead_passes(self):
        self.assertEqual(G.stage2(web_lead(), TODAY, mx_ok), [])
        self.assertEqual(G.stage2(no_site_fr(), TODAY, mx_ok), [])

    def test_postcode_only_address(self):
        # Companies-House-Neugründung: nur Postcode, kein Ort/Straße
        self.assertIn("adresse_unvollstaendig", G.stage2(web_lead(company={"address": "YO21 1AB", "city": ""}), TODAY, mx_ok))

    def test_us_zip_must_match_state(self):
        it = web_lead(country="US", company={"country": "US", "address": "100 Main St, Springfield, IL 10001", "city": "Springfield",
                                             "region": "IL", "website": "https://harbourbakes.example.com"},
                      contact={"phone": "+1 217 555 0100", "email": "hello@harbourbakes.example.com"})
        self.assertIn("plz_passt_nicht_zum_bundesstaat", G.stage2(it, TODAY, mx_ok))

    def test_invalid_phone_and_foreign_number(self):
        r = G.stage2(web_lead(contact={"phone": "+33 1 23 45 67 89"}), TODAY, mx_ok)
        self.assertTrue(any(x.startswith("telefon_ungueltig") for x in r))

    def test_email_checks(self):
        self.assertIn("email_syntax", G.stage2(web_lead(contact={"email": "hello@@x"}), TODAY, mx_ok))
        self.assertIn("email_platzhalter", G.stage2(web_lead(contact={"email": "noreply@harbourbakes.example.co.uk"}), TODAY, mx_ok))
        self.assertIn("email_domain_ohne_mx", G.stage2(web_lead(), TODAY, lambda d: False))
        self.assertIn("email_domain_widerspricht_website", G.stage2(web_lead(contact={"email": "info@othershop.example.com"}), TODAY, mx_ok))

    def test_contact_person_required(self):
        self.assertIn("ansprechperson_fehlt", G.stage2(web_lead(person={"role": "", "name": ""}), TODAY, mx_ok))

    def test_placeholder_and_language(self):
        self.assertIn("einstieg_platzhalter", G.stage2(web_lead(opener="Hi {name}, Harbour Bakes needs a site"), TODAY, mx_ok))
        r = G.stage2(no_site_fr(opener="Hi, I couldn't find a website for Atelier Lumière, would that be useful?"), TODAY, mx_ok)
        self.assertIn("einstieg_nicht_franzoesisch", r)
        r = G.stage2(web_lead(urgency_reason="Sans site web, votre entreprise est peu visible."), TODAY, mx_ok)
        self.assertIn("begruendung_nicht_englisch", r)

    def test_stale_age_claim(self):
        # Nachbildung: „Registered 38 days ago“ gespeichert am 26.09., Ereignis 19.08. -> heute 45 Tage
        it = web_lead(signal_type="new_incorporation", event_date="2026-08-19",
                      urgency_reason="Registered 38 days ago; new companies typically choose their providers in the first weeks.")
        self.assertIn("begruendung_altersangabe_veraltet", G.stage2(it, TODAY, mx_ok))
        it["urgency_reason"] = "Registered 45 days ago; new companies typically choose their providers in the first weeks."
        self.assertNotIn("begruendung_altersangabe_veraltet", G.stage2(it, TODAY, mx_ok))

    def test_quality_blocking(self):
        self.assertIn("qualitaetspruefung_blocking", G.stage2(web_lead(quality_blocking=True), TODAY, mx_ok))

    def test_duplicates(self):
        a = web_lead()
        b = web_lead(id="l2", company_id="c2", company={"id": "c2", "name": "Harbour Bakes Two"},
                     contact={"phone": "01947 600123", "email": "info@harbourbakes2.example.co.uk"})
        self.assertEqual(G.duplicates([a, b]), {"l2": "dublette_tel"})


class Stage3Test(unittest.TestCase):
    ctx = {"allowed_status": ("new",), "country": "UK", "delivered": set(), "other_stock": set(), "suppressed": set()}

    def test_clean_lead_passes(self):
        self.assertEqual(G.stage3(web_lead(), self.ctx), [])

    def test_status_delivery_and_stock(self):
        self.assertIn("schon_vergeben:sample", G.stage3(web_lead(status="sample"), self.ctx))
        self.assertIn("schon_geliefert", G.stage3(web_lead(), {**self.ctx, "delivered": {"l1"}}))
        self.assertIn("in_anderer_probe", G.stage3(web_lead(), {**self.ctx, "other_stock": {"l1"}}))

    def test_country(self):
        self.assertIn("falsches_lieferland", G.stage3(web_lead(), {**self.ctx, "country": "FR"}))
        self.assertIn("lieferland_nicht_erlaubt", G.stage3(web_lead(country="DE"), {**self.ctx, "country": None}))

    def test_suppression_by_domain(self):
        self.assertIn("sperrliste", G.stage3(web_lead(), {**self.ctx, "suppressed": {"harbourbakes.example.co.uk"}}))

    def test_public_chain_sensitive(self):
        self.assertIn("behoerde_oder_verein", G.stage3(web_lead(company={"name": "Whitby Town Council"}), self.ctx))
        self.assertNotIn("behoerde_oder_verein", G.stage3(web_lead(company={"name": "Council Oak Timber"}), self.ctx))
        self.assertIn("konzern_oder_kette", G.stage3(web_lead(company={"name": "Greggs Whitby"}), self.ctx))
        self.assertIn("sensibler_inhalt", G.stage3(web_lead(company={"name": "Bells Chapel Assembly"}), self.ctx))
        self.assertIn("behoerde_oder_verein", G.stage3(web_lead(contact={"email": "info@whitby.gov.uk"}), self.ctx))

    def test_not_sensible_for_web_agencies(self):
        it = no_site_fr(company={"name": "SCI Les Tilleuls"})
        self.assertIn("fuer_webagentur_nicht_sinnvoll", G.stage3(it, {**self.ctx, "country": "FR"}))

    def test_honest_text(self):
        self.assertIn("opener_verbotenes_wort", G.stage3(web_lead(opener="Harbour Bakes: guaranteed more customers!"), self.ctx))
        r = G.stage3(web_lead(urgency_reason="Sites like this lose 7 out of 9 visitors."), self.ctx)
        self.assertIn("urgency_reason_zahl_nicht_belegt:7", r)


class FlowTest(unittest.TestCase):
    def db(self):
        it = web_lead()
        lead = {k: v for k, v in it.items() if k not in ("company", "contact", "person", "quality_blocking")}
        bad = {**lead, "id": "l2", "company_id": "c2", "opener": "Hi {x}"}
        return FakeDB({
            "leads": [lead, bad],
            "watch_companies": [it["company"], {**it["company"], "id": "c2", "name": "Harbour Bakes",
                                                "phone_main": "+441947600999"}],
            "observations": [
                {"company_id": "c1", "kind": "other", "key": "contact", "details": it["contact"]},
                {"company_id": "c1", "kind": "other", "key": "person", "details": {"role": "Owner"}},
                {"company_id": "c2", "kind": "other", "key": "contact", "details": {"phone": "01947 600999", "email": "hi@harbourbakes.example.co.uk"}},
                {"company_id": "c2", "kind": "other", "key": "person", "details": {"role": "Owner"}},
            ],
            "deliveries": [], "sample_stock": [], "suppression": [], "lead_checks": []})

    def test_check_persist_and_hold(self):
        db = self.db()
        vs = G.check(db, ["l1", "l2"], country="UK", live=False, mx=mx_ok, today=TODAY)
        ok = {v.lead_id: v for v in vs}
        self.assertTrue(ok["l1"].ok, ok["l1"].reasons)
        self.assertFalse(ok["l2"].ok)
        self.assertEqual(ok["l2"].stage, 2)  # Platzhalter + Dublette (gleicher Name)
        G.persist(db, vs, "test", log=lambda *a: None)
        st = {l["id"]: l["status"] for l in db.rows("leads")}
        self.assertEqual(st, {"l1": "new", "l2": "held"})
        res = {r["lead_id"]: r["result"] for r in db.rows("lead_checks")}
        self.assertEqual(res, {"l1": "released", "l2": "failed"})

    def test_missing_lead_never_released(self):
        vs = G.check(self.db(), ["l1", "nope"], live=False, mx=mx_ok, today=TODAY)
        self.assertFalse(next(v for v in vs if v.lead_id == "nope").ok)

    def test_stats_rows_funnel(self):
        vs = [G.Verdict("a", True, None, [], country="UK", segment="S2"),
              G.Verdict("b", False, 1, ["s1:signal_zu_alt:50_tage"], country="UK", segment="S2"),
              G.Verdict("c", False, 3, ["s3:sperrliste"], country="UK", segment="S2")]
        row = G.stats_rows(vs)[0]
        self.assertEqual(row["extra"]["stufen"], {"geprueft": 3, "stufe1": 2, "stufe2": 2, "freigegeben": 1})
        self.assertEqual(row["reasons"], {"s1:signal_zu_alt": 1, "s3:sperrliste": 1})


if __name__ == "__main__":
    unittest.main()
