"""Fetcher: Abstand je Server-IP (Live-Nachprüfung geparkter Domains auf geteilten Parkdienst-IPs)."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from enrich import Fetcher  # noqa: E402
from lib import release_gate as G  # noqa: E402


def test_per_ip_spacing_across_domains(monkeypatch):
    f = Fetcher(per_ip=0.3)
    monkeypatch.setattr(f, "_ip", lambda url: "103.224.182.252")
    t0 = time.monotonic()
    f._throttle("https://a-parked.co.uk/robots.txt")
    f._throttle("https://b-parked.co.uk/robots.txt")
    f._throttle("https://c-parked.co.uk/robots.txt")
    assert time.monotonic() - t0 >= 0.55


def test_without_per_ip_no_dns_and_no_wait(monkeypatch):
    f = Fetcher()
    monkeypatch.setattr(f, "_ip", lambda url: (_ for _ in ()).throw(AssertionError("keine DNS-Abfrage")))
    t0 = time.monotonic()
    f._throttle("https://a.co.uk/")
    f._throttle("https://b.co.uk/")
    assert time.monotonic() - t0 < 0.2


def test_unresolvable_host_does_not_block():
    f = Fetcher(per_ip=5.0)
    f.ips["nicht-da.invalid"] = ""
    t0 = time.monotonic()
    f._throttle("https://nicht-da.invalid/")
    assert time.monotonic() - t0 < 0.2


def test_gate_recheck_is_throttled_per_ip():
    assert G.RECHECK_PER_IP >= 1.0
