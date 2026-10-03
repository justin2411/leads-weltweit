import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from lib import regnum  # noqa: E402


def test_fr_siren_from_mentions_legales():
    html = """<footer><p>SAS au capital de 1&nbsp;000 € – RCS Lyon 851 563 056 – SIRET : 85156305600012</p>
              <p>TVA intracommunautaire FR12 498218023</p><script>var x="RCS 123456789";</script></footer>"""
    text = regnum.plain_text(html)
    assert regnum.fr_sirens(text) == ["851563056", "498218023"]


def test_fr_siren_needs_valid_checksum_and_context():
    assert regnum.fr_sirens("RCS Paris 123 456 788") == []  # Prüfziffer falsch
    assert regnum.fr_sirens("Téléphone 851 563 056") == []  # ohne SIREN/SIRET/RCS/TVA kein Treffer


def test_uk_company_numbers():
    text = regnum.plain_text("""<p>Registered in England &amp; Wales No. 6249424.</p>
        <p>Company Reg No: SC248807</p><p>VAT Reg. No. 123 4567 89</p><p>Call 01234 567890</p>""")
    assert regnum.uk_numbers(text) == ["06249424", "SC248807"]


def test_uk_number_without_context_ignored():
    assert regnum.uk_numbers("Phone 01234567 or 07700900123") == []
