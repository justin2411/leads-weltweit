"""Neue Mail-Länder FI, SG, HK, MX, BR (Inhaber 04.10.2026: „nimm also auch andere länder mit auf die passend sind“,
Rechts-Tabelle docs/KALTMAIL-RECHT.md). Bedingungen der Tabelle technisch umgesetzt: SG „<ADV>“ am Betreffanfang,
HK Absenderangabe + Abmeldung (auch Chinesisch), BR Portugiesisch, MX Spanisch, FI nur Firmen. Nichts wird gesendet."""
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import drafts  # noqa: E402
import followups  # noqa: E402
import inbox  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from lib.rules import check_prospect, country_rules, is_company_form, lint_draft, load_countries, render_footer  # noqa: E402

CFG = load_countries()
NEW = ("FI", "SG", "HK", "MX", "BR")
NEVER = ("IE", "BE", "AU", "CA", "IL", "IT", "ES")


def prospect(country, name="Pixel Studio", spec="web designer", pid="p1"):
    return {"id": pid, "segment_id": "S2", "country": country, "company_name": name, "specialization": spec}


class CountriesTest(unittest.TestCase):
    def test_new_countries_allowed_carefully(self):
        for co in NEW:
            if co == "HK":  # Inhaber 05.10.2026: „nimm hk raus“
                continue
            r = country_rules(CFG, co)
            self.assertTrue(r["allowed"], co)
            self.assertTrue(r["generic_only"], co)
            self.assertTrue(10 <= r["daily_limit"] <= 20, co)
            self.assertIn("Inhaber-Tabelle 04.10.2026", r["notes"], co)
        self.assertTrue(country_rules(CFG, "FI")["company_forms_only"])
        self.assertIn("berechtigtes Interesse", country_rules(CFG, "BR")["notes"])
        self.assertEqual(country_rules(CFG, "SG")["subject_prefix"], "<ADV> ")

    def test_high_risk_and_conditional_countries_stay_closed(self):
        for co in NEVER + ("NZ", "JP", "DE", "AT", "CH", "PL", "DK", "NL", "ZA", "HK"):
            self.assertFalse(country_rules(CFG, co)["allowed"], co)

    def test_mail_language_matches_countries_yaml(self):
        for co, c in CFG["countries"].items():
            if c.get("allowed"):
                self.assertEqual(drafts.mail_lang(co), c.get("language", "en"), co)

    def test_fi_companies_only(self):
        def chk(form):
            return check_prospect(email="info@pixel.fi", country="FI", website="pixel.fi", legal_form=form,
                                  source_url="https://pixel.fi", size_note="x", cfg=CFG).ok
        self.assertTrue(chk("Oy"))
        self.assertFalse(chk(None))
        self.assertFalse(check_prospect(email="matti@pixel.fi", country="FI", website="pixel.fi", legal_form="Oy",
                                        source_url="https://pixel.fi", size_note="x", cfg=CFG).ok)  # nur allgemein

    def test_legal_forms(self):
        import prospects as P
        self.assertEqual(P.detect_legal_form("FI", "Webtoimisto Oy", "")[0], "Oy")
        self.assertEqual(P.detect_legal_form("FI", "Kopa", "Y-tunnus 1234567-8 · Kopa Oy")[0], "Oy")
        self.assertIsNone(P.detect_legal_form("FI", "Kopa Tmi", "")[0])
        self.assertEqual(P.detect_legal_form("MX", "Estudio S.A. de C.V.", "")[0], "SA de CV")
        self.assertEqual(P.detect_legal_form("BR", "Agência Ltda", "")[0], "Ltda")
        self.assertEqual(P.detect_legal_form("SG", "Nova Pte. Ltd.", "")[0], "Pte Ltd")
        for co, form in (("MX", "SA de CV"), ("MX", "S de RL"), ("BR", "Ltda"), ("SG", "Pte Ltd"), ("HK", "Ltd")):
            self.assertTrue(is_company_form(co, form), (co, form))


class DraftsTest(unittest.TestCase):
    def test_sg_subject_starts_with_adv(self):
        for pid in ("a", "b", "c", "d"):
            s, body, lang = drafts.build(prospect("SG", pid=pid))
            self.assertTrue(s.startswith("<ADV> "), s)
            self.assertLessEqual(len(s), 60)
            self.assertEqual(lang, "en")
            self.assertTrue(lint_draft(s, body, lang).ok, lint_draft(s, body, lang).summary())
        self.assertFalse(drafts.subject_for(prospect("HK"), "en").startswith("<ADV>"))

    def test_br_portuguese_and_mx_spanish(self):
        with mock.patch.dict(os.environ, {"SENDER_NAME": "Justin Koch"}):
            for co, lang, words in (("BR", "pt", ("amostra gratuita", "todo o Brasil", "Posso enviar?")),
                                    ("MX", "es", ("muestra gratuita", "todo México", "¿Se la envío?"))):
                for pid in ("a", "b"):
                    s, body, got = drafts.build(prospect(co, "Agência Pixel Ltda", pid=pid))
                    self.assertEqual(got, lang)
                    for w in words:
                        self.assertIn(w, body)
                    self.assertNotIn("Ltda", body.split("\n")[0])
                    self.assertTrue(lint_draft(s, body, lang).ok, (co, lint_draft(s, body, lang).summary()))
                    self.assertLessEqual(len(s), 60)

    def test_english_countries(self):
        for co, land in (("FI", "Finland"), ("HK", "Hong Kong"), ("SG", "Singapore")):
            s, body, lang = drafts.build(prospect(co))
            self.assertEqual(lang, "en")
            self.assertIn(f"across {land}", body)

    def test_followups_localized(self):
        for co, lang, ask in (("BR", "pt", "Posso enviar?"), ("MX", "es", "¿Se la envío?")):
            body, _ = followups.followup_text(prospect(co), lang)
            self.assertIn(ask, body)
            self.assertTrue(lint_draft("x", body, lang, min_words=30, require_sample=False).ok)
            s = followups.sample_followup_text(prospect(co), lang, "https://www.nextgen-profit.de/x")
            self.assertTrue(lint_draft("x", s, lang, min_words=30, require_sample=False).ok)
            subj, _ = followups.followup_subject(prospect(co), drafts.subject_for(prospect(co), lang), lang)
            self.assertEqual(subj, drafts.subject_for(prospect(co), lang))  # bleibt im Verlauf

    def test_forbidden_words_pt_es(self):
        self.assertFalse(lint_draft("x", "Garantimos resultados. " * 20 + "Posso enviar?", "pt").ok)
        self.assertFalse(lint_draft("x", "Resultados garantizados. " * 20 + "¿Se la envío?", "es").ok)


class FooterTest(unittest.TestCase):
    def footer(self, lang, country, url=None):
        return render_footer(lang, sender_name="NextGen Profit", postal_address="Nikolaistraße 3-7, 04109 Leipzig",
                             company="Pixel", unsubscribe_url=url, country=country)

    def test_footer_language_address_optout(self):
        for lang, co, word in (("pt", "BR", "descadastrar"), ("es", "MX", "baja")):
            f = self.footer(lang, co)
            self.assertIn("Leipzig", f)
            self.assertIn(word, f)
            self.assertIn("https://x/u", self.footer(lang, co, "https://x/u"))

    def test_hk_unsubscribe_also_chinese(self):
        self.assertIn("取消訂閱", self.footer("en", "HK", "https://x/u"))
        self.assertIn("unsubscribe", self.footer("en", "HK"))
        self.assertNotIn("取消", self.footer("en", "SG"))

    def test_own_footer_quoted_is_not_optout_but_words_are(self):
        for lang, co in (("pt", "BR"), ("es", "MX"), ("en", "HK")):
            quoted = "Obrigado, pode enviar.\n\n" + "\n".join("> " + x for x in self.footer(lang, co).splitlines())
            self.assertFalse(inbox.OPTOUT.search(inbox.optout_text(quoted)), (co, inbox.optout_text(quoted)))
        for t in ("Por favor, descadastrar", "baja", "Quiero darme de baja", "取消訂閱", "Não nos envie mais e-mails"):
            self.assertTrue(inbox.OPTOUT.search(t), t)
        self.assertFalse(inbox.OPTOUT.search("Sí, envíela por favor"))

    def test_html_localized(self):
        from lib.html_email import page_button, process_strip, render
        html = render("Olá,\n\nTexto.\n\nAtenciosamente,\nJustin", self.footer("pt", "BR"), "pt",
                      page_button("https://www.nextgen-profit.de/br/x", "pt"), extra=process_strip("pt"))
        for w in ("Ver meus 10 leads gratuitos", "Link seguro", "ENCONTRAMOS"):
            self.assertIn(w, html)
        self.assertIn("ENCONTRAMOS", process_strip("es"))

    def test_html_kein_siegel_ohne_aussteller(self):
        # §7: kein „✓ Certified“ ohne Aussteller (Inhaber 05.10.2026)
        from lib.html_email import render
        for lang, cc in (("en", "US"), ("fr", "FR"), ("pt", "BR"), ("es", "MX")):
            out = render("Hi,\n\nText.\n\nBest,\nJustin", self.footer(lang, cc), lang).lower()
            for w in ("certified", "certifié", "certificado"):
                self.assertNotIn(w, out)


class PipelineTest(unittest.TestCase):
    def test_phone_numbers(self):
        from lib.websites import normalize_phone
        self.assertEqual(normalize_phone("+65 6225 5761", "SG")[0], "+6562255761")
        self.assertEqual(normalize_phone("6225 5761", "SG")[0], "+6562255761")
        self.assertEqual(normalize_phone("+852 2688 6098", "HK")[0], "+85226886098")
        self.assertEqual(normalize_phone("+52 33 3817 1741", "MX")[0], "+523338171741")
        self.assertEqual(normalize_phone("(53) 3307-0710", "BR")[0], "+555333070710")
        self.assertEqual(normalize_phone("040 524 5887", "FI")[0], "+358405245887")
        self.assertEqual(normalize_phone("+44 20 7946 0000", "SG")[1], "foreign")

    def test_postcodes_and_address(self):
        from extraktor import qc
        self.assertTrue(qc.postcode_ok({"country": "BR", "zip": "96015-560"}))
        self.assertTrue(qc.postcode_ok({"country": "SG", "zip": "238801"}))
        self.assertFalse(qc.postcode_ok({"country": "MX", "zip": "12"}))
        self.assertIsNone(qc.postcode_ok({"country": "HK", "zip": ""}))
        c = {"name": "Rings Coffee", "country": "HK", "phone": "+85297983510", "email": "ringscoffee@gmail.com",
             "street": "8 Nga Tsin Long Rd", "city": "Kowloon", "zip": "", "facts": {}, "evidence": {"mx": True}}
        self.assertNotIn("address", qc.run(c, "S2")["missing"])

    def test_overture_groups(self):
        from extraktor import filters
        from extraktor.sources import overture
        for co in NEW:
            self.assertEqual(overture.cache_for(co), overture.CACHE_NEW)
            self.assertIn(co, overture.EMAIL_ONLY)
            self.assertIsNone(filters.pre_filter({"name": "Pixel", "country": co}))
        self.assertIn("bbox.xmin BETWEEN 19.0 AND 31.6", overture.box_where(overture.GROUPS[overture.CACHE_NEW][1]))
        self.assertEqual(overture.box_where((-8.7, 9.6, 41.3, 60.9)).count("OR"), 0)
        d = {"id": "x", "name": "Rings Coffee", "street": "8 Nga Tsin Long Rd", "city": "Kowloon", "postcode": "000000",
             "phones": ["+85297983510"], "emails": [], "socials": [], "category": "cafe", "datasets": [], "updated": []}
        self.assertEqual(overture.to_candidate(d, "HK")["zip"], "")

    def test_kundenwerk_and_delivery(self):
        import kundenwerk as K
        from lib.release_gate import DELIVERY_COUNTRIES
        segs = {"S2": set(NEW)}
        for co in NEW:
            self.assertEqual(K.COUNTRIES[co], co)
            self.assertIn(co, DELIVERY_COUNTRIES)
            self.assertEqual(K.segment_for("web_designer", co, segs), ("S2", co))
            self.assertEqual(K.segment_for("marketing_agency", co, segs), ("S2", co))

    def test_lane(self):
        import json
        lanes = {l["id"]: l for l in json.loads((Path(__file__).resolve().parents[1] / "app/lib/werk-linien.json")
                                                .read_text(encoding="utf-8"))["lanes"]}
        self.assertIn("--countries FI,SG,HK,MX,BR", lanes["s2-neu"]["args"])


class SendCheckTest(unittest.TestCase):
    """Versand prüft die Bedingungen erneut: SG ohne „<ADV>“ und BR/MX in falscher Sprache werden blockiert."""

    def run_send(self, country, subject, language, to):
        import contextlib
        import io
        from test_outreach_send import run_send
        p = {"id": "p1", "company_name": "Pixel", "segment_id": "S2", "country": country, "region": None,
             "legal_form": None}
        m = {"id": "m1", "kind": "initial", "status": "approved", "to_email": to, "prospect_id": "p1",
             "experiment_id": "e1", "subject": subject, "body": "x", "language": language,
             "unsubscribe_token": "tok12345", "approved_at": "2026-10-04", "sent_at": None, "prospects": p,
             "experiments": {"id": "e1", "segment_id": "S2", "variant": "v1"}}
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            return run_send(FakeDB({"messages": [m]}))

    def test_sg_without_adv_blocked(self):
        self.assertIn("<ADV>", self.run_send("SG", "Local businesses across Singapore without a website", "en",
                                              "info@pixel.sg"))
        self.assertNotIn("BLOCKIERT", self.run_send("SG", "<ADV> Local businesses across Singapore without a website",
                                                     "en", "info@pixel.sg"))

    def test_br_mx_language_enforced(self):
        self.assertIn("Mail-Sprache en statt pt", self.run_send("BR", "Empresas no Brasil sem site", "en",
                                                               "contato@pixel.com.br"))
        self.assertNotIn("BLOCKIERT", self.run_send("MX", "Negocios en México sin sitio web", "es",
                                                    "contacto@pixel.mx"))


class FairShareTest(unittest.TestCase):
    """Agent 6 (04.10.2026): MX/BR hatten 0 Leads, weil FI/SG/HK das ganze Zeitfenster der Linie s2-neu verbrauchten
    („S2/MX: Zeitfenster vorbei“). Jetzt bekommt jedes Land seinen Anteil an der Restzeit."""

    def test_fair_deadline(self):
        from extraktor import run
        self.assertEqual(run.fair_deadline(0, 5, now=100.0), 0)  # ohne Frist keine Frist
        self.assertAlmostEqual(run.fair_deadline(100.0 + 75 * 60, 5, now=100.0), 100.0 + 15 * 60)
        self.assertAlmostEqual(run.fair_deadline(500.0, 1, now=100.0), 500.0)  # letzte Branche: ganze Restzeit
        self.assertAlmostEqual(run.fair_deadline(500.0, 3, now=600.0), 600.0)  # abgelaufen bleibt abgelaufen

    def test_every_country_of_the_line_gets_time(self):
        """Jedes Land der Linie s2-neu kommt dran, auch wenn jedes Land seinen ganzen Anteil ausschöpft."""
        import tempfile
        from extraktor import run
        clock = {"t": 1000.0}
        seen = []

        def fake_segment(seg, pool, per, fetcher, shared, guard, workers, max_tries, progress=None, deadline=0):
            seen.append((pool[0]["country"], clock["t"], deadline))
            clock["t"] = deadline  # schöpft seinen Anteil ganz aus (großer Vorrat)
            return []

        def fake_pool(co, limit, stats, known, *_):
            return [{"source": "overture", "source_id": f"{co}{i}", "country": co} for i in range(3)]

        import types
        fake_enrich = types.SimpleNamespace(Fetcher=lambda: types.SimpleNamespace(requests=0))
        # sys.modules unverändert lassen: „enrich“ gibt es zweimal (scripts/ und scripts/extraktor/)
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.dict(sys.modules, {"enrich": fake_enrich}), \
                mock.patch.object(run.time, "monotonic", lambda: clock["t"]), \
                mock.patch.object(run, "load_overture_s2", fake_pool), \
                mock.patch.object(run.segments, "fits", lambda seg, c: (True, "")), \
                mock.patch.object(run, "run_segment", fake_segment):
            run.main(["--segments", "S2", "--countries", "FI,SG,HK,MX,BR", "--fmcsa-days", "0", "--formd-days", "0",
                      "--deadline-min", "75", "--out", d])
        self.assertEqual([c for c, _, _ in seen], ["FI", "SG", "HK", "MX", "BR"])
        end = 1000.0 + 75 * 60
        for c, start, dl in seen:
            self.assertGreater(dl, start, c)  # jedes Land bekommt Zeit
            self.assertLessEqual(dl, end + 1e-6, c)
        self.assertAlmostEqual(seen[0][2] - seen[0][1], 15 * 60)  # 75 min / 5 Länder
        self.assertAlmostEqual(seen[-1][2], end)


if __name__ == "__main__":
    unittest.main()
