"""Ablaufdatum des TLS-Zertifikats einer Website lesen (ein TLS-Handshake auf Port 443, keine Seite, kein Schlüssel).

Gelesen wird nur das Zertifikat, das der Server jedem Besucher zeigt (öffentlich). Ohne Prüfung der Kette, damit
auch abgelaufene Zertifikate ihr Datum liefern; ob der Browser warnt, entscheidet weiter website_check.inspect.
Läuft die Verbindung über eine Firma/Umgebung, die TLS aufbricht (eigenes Ausstellerzertifikat, z. B. lokale
Entwicklungsumgebung), gibt es kein Ergebnis – sonst stünde das Datum des Zwischenzertifikats im Lead.
"""
from __future__ import annotations

import datetime as dt
import re
import socket
import ssl

# Aussteller, die TLS-Verbindungen unterwegs aufbrechen (nie das Zertifikat der Website)
INTERCEPT = re.compile(r"egress gateway|anthropic|zscaler|netskope|forcepoint|bluecoat|fortigate|palo alto|"
                       r"mitmproxy|charles proxy|fiddler", re.I)
# Aussteller, die automatisch erneuern (ACME/AutoSSL): ein Ablauf in 30 Tagen ist dort normal, erst kurz vor dem
# Ablauf (AUTO_RENEW_LATE Tage) heißt er „Erneuerung klappt nicht“
AUTO_RENEW = re.compile(r"let'?s encrypt|\bR1[0-4]\b|\bE[5-9]\b|zerossl|google trust services|\bWR\d|\bWE\d|"
                        r"cpanel|sectigo.*domain validation|cloudflare|amazon|buypass", re.I)


def read(host: str, timeout: float = 10.0) -> dict | None:
    """{"not_after", "not_before", "issuer", "days_valid"} oder None (nicht erreichbar, aufgebrochen, unlesbar)."""
    from cryptography import x509
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        with socket.create_connection((host, 443), timeout=timeout) as raw:
            with ctx.wrap_socket(raw, server_hostname=host) as s:
                der = s.getpeercert(True)
    except (OSError, ssl.SSLError, ValueError):
        return None
    if not der:
        return None
    try:
        cert = x509.load_der_x509_certificate(der)
        issuer = cert.issuer.rfc4514_string()
        na = getattr(cert, "not_valid_after_utc", None) or cert.not_valid_after
        nb = getattr(cert, "not_valid_before_utc", None) or cert.not_valid_before
    except Exception:  # noqa: BLE001 - unlesbares Zertifikat = keine Aussage
        return None
    if INTERCEPT.search(issuer):
        return None
    return {"not_after": na.date(), "not_before": nb.date(), "issuer": issuer[:160],
            "days_valid": (na.date() - nb.date()).days}


AUTO_RENEW_LATE = 7
MANUAL_WINDOW = 30


def expiring(cert: dict | None, today: dt.date) -> int | None:
    """Tage bis zum Ablauf, wenn das als Anlass taugt, sonst None.
    Manuell erneuerte (Laufzeit > 100 Tage, kein ACME-Aussteller): höchstens 30 Tage. Automatisch erneuerte
    (Let's Encrypt & Co., 90 Tage): erst ab 7 Tagen – die erneuern normalerweise 30 Tage vorher, so spät heißt es,
    dass die Erneuerung nicht klappt."""
    if not cert:
        return None
    left = (cert["not_after"] - today).days
    if left < 0:
        return None
    auto = cert["days_valid"] <= 100 or bool(AUTO_RENEW.search(cert.get("issuer") or ""))
    return left if left <= (AUTO_RENEW_LATE if auto else MANUAL_WINDOW) else None
