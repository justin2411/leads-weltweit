"""Gestaltete HTML-Version einer Mail (ohne Bilder, ohne externe Ressourcen, ohne Tracking).

Die Wortmarke ist gestalteter Text. Tabellen-Layout und Inline-Styles, damit Outlook, Gmail
und Apple Mail gleich darstellen. Die Text-Version bleibt der Inhalt; HTML ist nur die Optik.
"""
from __future__ import annotations

import html
import os
import re

NAVY = "#0F2A4A"
ORANGE = "#FF7A1A"
INK = "#1D2433"
MUTED = "#667085"
LINE = "#E4E7EC"
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"


def _p(text: str) -> str:
    return (f'<p style="margin:0 0 16px 0;font-family:{FONT};font-size:15px;line-height:24px;color:{INK};">'
            f"{html.escape(text).replace(chr(10), '<br>')}</p>")


def render(body_text: str, footer_text: str, lang: str = "en") -> str:
    """body_text: Text ohne Signatur-Block (Signatur wird aus Umgebung gebaut), footer_text: Pflichtfußzeile."""
    # Text in Absätze; Gruß + Signatur (letzter Absatz) gesondert gestalten
    paras = [p.strip() for p in re.split(r"\n\s*\n", body_text.strip()) if p.strip()]
    closing = paras.pop() if paras else ""
    closing_lines = closing.splitlines()
    bye = closing_lines[0] if closing_lines else ""
    name = os.environ.get("SENDER_NAME") or "Signalwerk"
    company = os.environ.get("SENDER_COMPANY") or "Signalwerk"
    title = os.environ.get("SENDER_TITLE") or ("Fondateur" if lang == "fr" else "Founder")
    tagline = ("Signaux de recrutement et de croissance pour les prestataires B2B" if lang == "fr"
               else "Hiring and growth signals for B2B service firms")
    extras = [x for x in (os.environ.get("SENDER_WEBSITE"), os.environ.get("SENDER_PHONE")) if x]

    wordmark = (f'<span style="font-family:{FONT};font-size:22px;font-weight:800;letter-spacing:-0.4px;color:{NAVY};">'
                f'Signal<span style="color:{ORANGE};">werk</span></span>')
    extras_html = "".join(
        f'<div style="font-family:{FONT};font-size:13px;line-height:20px;color:{MUTED};">{html.escape(x)}</div>'
        for x in extras)
    footer_html = html.escape(footer_text.lstrip("—-").strip()).replace("\n", "<br>")

    return f"""<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title></title></head>
<body style="margin:0;padding:0;background:#F4F5F7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:10px;border:1px solid {LINE};">
<tr><td style="height:4px;background:{NAVY};border-radius:10px 10px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 40px 8px 40px;">{wordmark}</td></tr>
<tr><td style="padding:20px 40px 4px 40px;">
{''.join(_p(p) for p in paras)}
<p style="margin:8px 0 20px 0;font-family:{FONT};font-size:15px;line-height:24px;color:{INK};">{html.escape(bye)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="border-left:3px solid {ORANGE};padding:2px 0 2px 14px;">
<div style="font-family:{FONT};font-size:15px;line-height:22px;font-weight:700;color:{NAVY};">{html.escape(name)}</div>
<div style="font-family:{FONT};font-size:13px;line-height:20px;color:{INK};">{html.escape(title)}, {html.escape(company)}</div>
<div style="font-family:{FONT};font-size:13px;line-height:20px;color:{MUTED};">{html.escape(tagline)}</div>
{extras_html}
</td></tr></table>
</td></tr>
<tr><td style="padding:28px 40px 32px 40px;">
<div style="border-top:1px solid {LINE};padding-top:16px;font-family:{FONT};font-size:11px;line-height:17px;color:{MUTED};">{footer_html}</div>
</td></tr>
</table>
</td></tr></table>
</body></html>"""
