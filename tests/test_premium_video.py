"""Premium-Film „So findet unser Radar Ihren nächsten Kunden“ (video/v12, Inhaber 05.10.2026): nur S2 US/UK/FR,
höchstens 45 s, nur belegte Zahlen aus docs/PREMIUM-WERT.md, „kein Versprechen“, erfundene Beispiele, Link nur in
Probe-Mail und Probe-PDF (Landingpages: A/B „Lohnt sich das?“ läuft, kein zweiter Seitentest)."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib import premium_wert as W  # noqa: E402
from responder import sample_mail, sample_text  # noqa: E402

VIDEOS = json.loads((ROOT / "app" / "content" / "videos.json").read_text(encoding="utf-8"))
SEG = {mk: json.loads((ROOT / "video" / "v12" / "segments" / f"{mk}-radar.json").read_text(encoding="utf-8"))
       for mk in ("us", "uk", "fr")}
DOC = (ROOT / "docs" / "PREMIUM-WERT.md").read_text(encoding="utf-8")
PLANS = [{"key": "starter", "amount_cents": 12900}, {"key": "pro", "amount_cents": 24900}]


class Film(unittest.TestCase):
    def test_eingetragen_klein_und_kurz(self):
        for cc, key in W.VIDEO_KEY.items():
            v = VIDEOS[key]
            self.assertLessEqual(v["seconds"], 45, key)
            f = ROOT / "app" / "public" / v["src"].lstrip("/")
            self.assertTrue(f.is_file(), f)
            self.assertLess(f.stat().st_size, 10 * 1024 * 1024, f)
            self.assertTrue((ROOT / "app" / "public" / v["poster"].lstrip("/")).is_file())

    def test_schluessel_passen(self):
        self.assertEqual({s["key"] for s in SEG.values()}, set(W.VIDEO_KEY.values()))
        self.assertEqual(SEG["fr"]["lang"], "fr")
        self.assertEqual(SEG["us"]["lang"], "en")

    def test_ehrlich(self):
        for mk, s in SEG.items():
            text = " ".join(l["text"] for l in s["script"]).lower() + json.dumps(s["ui"], ensure_ascii=False).lower()
            for bad in ("guarant", "garanti", "exclusive", "exclusiv", "only one", "une seule agence", "will win",
                        "gagnerez", "urgent", "€/lead", "$2", "£2", "129", "249"):
                self.assertNotIn(bad, text, f"{mk}: {bad}")
            self.assertTrue("not a promise" in text or "pas une promesse" in text, mk)
            # landesweit, keine Regionen
            self.assertTrue(any(w in text for w in ("across the us", "across the uk", "partout en france")), mk)
            # Beispiele erfunden: Domains nur .example
            for v in json.dumps(s["ui"]).split('"'):
                if "@" in v or v.endswith((".com", ".co.uk", ".fr")):
                    self.assertTrue(v.endswith(".example"), v)

    def test_zahlen_belegt(self):
        for mk, s in SEG.items():
            for label, wert, quelle, _ in s["ui"]["vals"]:
                self.assertIn(quelle.split(" · ")[0].split(" ")[0], DOC, quelle)
                num = wert.replace("Most under ", "").replace(" à ", "–").replace(" €", "")
                for part in num.split("–"):
                    self.assertTrue(part.replace("$", "").replace(",", ".") in DOC.replace(",", ".")
                                    or part.replace(" ", ".") in DOC, f"{mk}: {wert}")


class Link(unittest.TestCase):
    def test_nur_s2_us_uk_fr(self):
        for cc in ("US", "UK", "FR"):
            v = W.video("S2", cc)
            self.assertTrue(v and v["url"].startswith("https://") and v["url"].endswith(".mp4"), cc)
        self.assertIsNone(W.video("S1", "US"))
        self.assertIsNone(W.video("S2", "IE"))
        self.assertEqual(W.video_zeile("S2", "DE"), "")

    def test_ohne_datei_kein_link(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "content").mkdir()
            (Path(d) / "content" / "videos.json").write_text(json.dumps(VIDEOS))
            with mock.patch.object(W, "APP", Path(d)):
                self.assertIsNone(W.video("S2", "US"))

    def test_probe_mail(self):
        files = [("leads.csv", b"company\n")]
        body, blocks = sample_mail("en", None, list(files), True, "S2", "US")
        line = W.video_zeile("S2", "US")
        self.assertIn(line, body)
        self.assertLess(body.index(line), body.index("Choose your plan"))
        self.assertIn('href="https://', blocks[line])
        body_fr, _ = sample_mail("fr", None, list(files), True, "S2", "FR")
        self.assertIn("Courte vidéo", body_fr)
        body_s1, blocks_s1 = sample_mail("en", None, list(files), True, "S1", "US")
        self.assertNotIn("Short video", body_s1)
        self.assertNotIn("video", " ".join(blocks_s1))

    def test_sample_text_ohne_video_unveraendert(self):
        a = sample_text("en", "the US", True, segment="S2", url="https://x.test/start")
        b = sample_text("en", "the US", True, segment="S2", url="https://x.test/start", video="")
        self.assertEqual(a, b)

    def test_probe_pdf_seite(self):
        for cc in ("US", "UK", "FR"):
            v = W.seite("S2", cc, PLANS)["video"]
            self.assertTrue(v["url"].endswith(".mp4"))
            self.assertIn("radar", v["label"])
        self.assertIsNone(W.seite("S1", "US", PLANS))


if __name__ == "__main__":
    unittest.main()
