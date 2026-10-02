"""Gestaltete HTML-Version einer Mail (ohne Bilder, ohne externe Ressourcen, ohne Tracking).

Die Wortmarke ist gestalteter Text. Tabellen-Layout und Inline-Styles, damit Outlook, Gmail
und Apple Mail gleich darstellen. Die Text-Version bleibt der Inhalt; HTML ist nur die Optik.
"""
from __future__ import annotations

import html
import os
import re

NAVY = "#0B1428"      # wie die Website
ORANGE = "#B8914F"    # Gold (Akzent, auf Weiß lesbar)
GOLD = "#D8BD8A"      # helles Gold auf Dunkelblau
SIGN = "'Snell Roundhand','Segoe Script','Brush Script MT','Lucida Handwriting',cursive"


def site_url() -> str:
    return (os.environ.get("SENDER_WEBSITE") or os.environ.get("SITE_URL") or "https://www.nextgen-profit.de").rstrip("/")


def site_label() -> str:
    return re.sub(r"^https?://(www\.)?", "", site_url())
INK = "#1D2433"
MUTED = "#667085"
LINE = "#E4E7EC"
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"


# Schlüsselstellen fett (nur im HTML, die Textversion bleibt schlicht): zum schnellen Überfliegen
BOLD = [
    "leads you can turn into revenue", "every Monday", "one agency only", "one web agency only", "one broker only",
    "one practice only", "one advice firm only", "one IT firm only", "one firm only",
    "pistes qui se transforment en chiffre d'affaires", "chaque lundi", "une seule agence de votre secteur",
    "une seule entreprise de votre secteur",
    "a real need for your service right now", "My tip:", "reserved for your firm",
    "un besoin concret de votre service", "Mon conseil :", "réservée à votre entreprise",
]


def _bold(escaped: str) -> str:
    done: list[tuple[int, int]] = []
    for phrase in sorted(BOLD, key=len, reverse=True):
        e = html.escape(phrase, quote=False)
        i = escaped.find(e)
        if i < 0 or any(a <= i < b or a < i + len(e) <= b for a, b in done):
            continue
        done.append((i, i + len(e)))
    for a, b in sorted(done, reverse=True):
        escaped = f"{escaped[:a]}<strong style=\"color:{NAVY};\">{escaped[a:b]}</strong>{escaped[b:]}"
    return escaped


def _p(text: str) -> str:
    return (f'<p style="margin:0 0 16px 0;font-family:{FONT};font-size:15px;line-height:24px;color:{INK};">'
            f"{_bold(html.escape(text, quote=False)).replace(chr(10), '<br>')}</p>")


def cta_button(company: str, region: str | None, lang: str) -> str:
    """Button, der eine fertige Antwort-Mail öffnet (mailto an REPLY_TO). Kein Weblink, kein Tracking."""
    from urllib.parse import quote
    to = (os.environ.get("REPLY_TO") or os.environ.get("MAIL_FROM") or "").split("<")[-1].strip("> ")
    if not to:
        return ""
    first = (os.environ.get("SENDER_NAME") or "").split(" ")[0]
    area = region or ""
    if lang == "fr":
        label = "Oui, envoyez-moi l'échantillon"
        subj = f"Demande d'échantillon : 10 pistes{' pour ' + area if area else ''}"
        body = (f"Bonjour{' ' + first if first else ''},\n\n"
                f"Merci pour votre message. Nous serions heureux de recevoir l'échantillon gratuit de 10 pistes"
                f"{' pour ' + area if area else ''}.\n\n"
                f"Société : {company}\n"
                f"Zone couverte : {area or '(à compléter)'}\n"
                f"Nos prestations : \n\n"
                f"Vous pouvez envoyer l'échantillon à cette adresse.\n\n"
                f"Bien cordialement\n")
    else:
        label = "Yes, send my free sample"
        subj = f"Sample request: 10 leads{' for ' + area if area else ''}"
        body = (f"Dear {first or 'team'},\n\n"
                f"Thank you for your email. We would be glad to receive the free sample of 10 leads"
                f"{' for ' + area if area else ''}.\n\n"
                f"Company: {company}\n"
                f"Area we cover: {area or '(please add)'}\n"
                f"Our services: \n\n"
                f"Please send the sample to this email address.\n\n"
                f"Kind regards\n")
    href = f"mailto:{to}?subject={quote(subj)}&body={quote(body)}"
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px 0;"><tr>'
            f'<td style="background:{GOLD};border-radius:99px;">'
            f'<a href="{html.escape(href)}" style="display:inline-block;padding:13px 26px;font-family:{FONT};'
            f'font-size:15px;font-weight:500;color:{NAVY};text-decoration:none;white-space:nowrap;">{html.escape(label)}</a>'
            f'</td></tr></table>')


def page_button(url: str, lang: str) -> str:
    """Knopf zur persönlichen Seite (dort: Video, Beispiel-Leads, Probe mit einem Klick)."""
    label = "Voir mes pistes gratuites" if lang == "fr" else "See my free leads"
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px 0;"><tr>'
            f'<td style="background:{GOLD};border-radius:99px;">'
            f'<a href="{html.escape(url)}" style="display:inline-block;padding:13px 26px;font-family:{FONT};'
            f'font-size:15px;font-weight:500;color:{NAVY};text-decoration:none;white-space:nowrap;">{html.escape(label)} &rarr;</a>'
            f'</td></tr></table>')


def render(body_text: str, footer_text: str, lang: str = "en", cta: str = "",
           signer: tuple[str, str] | None = None, blocks: dict[str, str] | None = None) -> str:
    """body_text: Text ohne Signatur-Block (Signatur wird aus Umgebung gebaut), footer_text: Pflichtfußzeile.
    blocks: Absatz-Text -> fertiges HTML (z. B. Vorschau-Tabelle der Probe statt der Textliste)."""
    # Text in Absätze; Gruß + Signatur (letzter Absatz) gesondert gestalten
    paras = [p.strip() for p in re.split(r"\n\s*\n", body_text.strip()) if p.strip()]
    closing = paras.pop() if paras else ""
    closing_lines = closing.splitlines()
    bye = closing_lines[0] if closing_lines else ""
    from lib.rules import brand
    company = brand()
    name = os.environ.get("SENDER_NAME") or company
    title = os.environ.get("SENDER_TITLE") or ("Fondateur" if lang == "fr" else "Founder")
    if signer:
        name, title = signer
    tagline = ("Pistes exclusives au bon moment pour les prestataires B2B" if lang == "fr"
               else "Exclusive trigger leads for B2B service firms")
    phone = os.environ.get("SENDER_PHONE")
    url, label = site_url(), site_label()
    has_person = name != company
    parts = company.split(" ", 1)
    head, tail = (parts[0], " " + parts[1]) if len(parts) == 2 else (company, "")
    wordmark = (f'<span style="font-family:{FONT};font-size:22px;font-weight:800;letter-spacing:-0.4px;color:#FFFFFF;">'
                f'{html.escape(head)}<span style="color:{GOLD};">{html.escape(tail)}</span></span>')
    # Vertrauens-Etikett im Kopf (Inhaber 02.10.2026: „nimm certified“, „doch das haben wir“ – „echtes Prüfsiegel“)
    trust = "Certifié" if lang == "fr" else "Certified"
    footer_html = html.escape(footer_text.lstrip("—-").strip()).replace("\n", "<br>")
    link = lambda text, size=13, color=ORANGE: (f'<a href="{html.escape(url)}" style="font-family:{FONT};font-size:{size}px;'
                                                f'color:{color};text-decoration:none;font-weight:600;">{html.escape(text)}</a>')
    script = (f'<div style="font-family:{SIGN};font-size:30px;line-height:36px;color:{NAVY};margin:0 0 4px 0;">'
              f'{html.escape(name)}</div>') if has_person else ""

    return f"""<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title></title></head>
<body style="margin:0;padding:0;background:#EEF0F4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF0F4;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;">
<tr><td style="background:{NAVY};padding:22px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td>{wordmark}</td>
<td align="right" style="white-space:nowrap;"><span style="display:inline-block;border:1px solid {GOLD};border-radius:99px;padding:5px 12px;font-family:{FONT};font-size:12px;font-weight:600;letter-spacing:0.3px;color:{GOLD};">&#10003; {html.escape(trust)}</span></td>
</tr></table></td></tr>
<tr><td style="height:3px;background:{GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:32px 40px 8px 40px;">
{''.join((blocks or {}).get(p) or _p(p) for p in paras)}
{cta}
<p style="margin:8px 0 14px 0;font-family:{FONT};font-size:15px;line-height:24px;color:{INK};">{html.escape(bye)}</p>
{script}
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="border-left:3px solid {GOLD};padding:2px 0 2px 14px;">
{f'<div style="font-family:{FONT};font-size:14px;line-height:21px;font-weight:700;color:{NAVY};">{html.escape(title)}, {html.escape(company)}</div>' if has_person else f'<div style="font-family:{FONT};font-size:14px;line-height:21px;font-weight:700;color:{NAVY};">{html.escape(company)}</div>'}
<div style="font-family:{FONT};font-size:13px;line-height:20px;color:{MUTED};">{html.escape(tagline)}</div>
<div style="margin-top:2px;">{link(label)}{f'<span style="font-family:{FONT};font-size:13px;color:{MUTED};"> · {html.escape(phone)}</span>' if phone else ''}</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:28px 40px 30px 40px;">
<div style="border-top:1px solid {LINE};padding-top:16px;font-family:{FONT};font-size:11px;line-height:17px;color:{MUTED};">{footer_html}</div>
</td></tr>
</table>
</td></tr></table>
</body></html>"""


def sample_preview(rows: list[dict], lang: str = "en") -> tuple[str, str]:
    """Vorschau der ersten Probe-Leads: (Text-Absatz, gestaltete HTML-Tabelle). Nur Firmendaten."""
    rows = rows[:3]
    if not rows:
        return "", ""
    fr = lang == "fr"
    head = "Aperçu des premières pistes :" if fr else "A preview of the first entries:"
    lines = [head]
    for r in rows:
        meta = ", ".join(x for x in (r.get("date"), r.get("source")) if x)
        where = f", {r['location']}" if r.get("location") else ""
        lines.append(f"• {r['company']}{where}: {r['event']}" + (f" ({meta})" if meta else ""))
    text = "\n".join(lines)
    cells = []
    for i, r in enumerate(rows):
        border = "" if i == len(rows) - 1 else f"border-bottom:1px solid {LINE};"
        meta = " · ".join(html.escape(x) for x in (r.get("date"), r.get("source")) if x)
        cells.append(
            f'<tr><td style="padding:14px 18px;{border}">'
            f'<div style="font-family:{FONT};font-size:14px;line-height:20px;font-weight:700;color:{NAVY};">'
            f'{html.escape(r["company"])}<span style="font-weight:400;color:{MUTED};">'
            f'{html.escape(", " + r["location"]) if r.get("location") else ""}</span></div>'
            f'<div style="font-family:{FONT};font-size:14px;line-height:21px;color:{INK};margin-top:2px;">{html.escape(r["event"])}</div>'
            f'<div style="font-family:{FONT};font-size:12px;line-height:18px;color:{MUTED};margin-top:4px;">{meta}</div>'
            f"</td></tr>")
    label = "Aperçu" if fr else "Preview"
    table = (f'<p style="margin:0 0 8px 0;font-family:{FONT};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;'
             f'font-weight:700;color:{ORANGE};">{label}</p>'
             f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;'
             f'border:1px solid {LINE};border-radius:8px;background:#FAFBFC;">{"".join(cells)}</table>')
    return text, table


def preview_rows(files: list[tuple[str, bytes]]) -> list[dict]:
    """Erste Zeilen aus der Probe-CSV lesen (Spalten company, location, event, event_date, source)."""
    import csv
    import io
    if not files:
        return []
    out = []
    data = next((b for n, b in files if n.endswith(".csv")), b"")
    for r in csv.DictReader(io.StringIO(data.decode("utf-8-sig", "replace"))):
        ev = re.sub(r"\s*[–—]\s*", ", ", (r.get("event") or "").split(". ")[0].rstrip("."))
        ev = ev.split(" (")[0]
        name = r.get("company") or ""
        if ev.upper().startswith(name.upper()):
            ev = ev[len(name):].strip()
            ev = ev[:1].upper() + ev[1:]
        ev = re.sub(r"^[Rr]egistered on .*$", "Newly registered", ev)
        d = r.get("event_date") or ""
        if re.match(r"^\d{4}-\d{2}-\d{2}$", d):
            import datetime as _dt
            d = _dt.date.fromisoformat(d).strftime("%-d %b %Y")
        if name.isupper():
            name = re.sub(r"\bLlp\b", "LLP", name.title())
        out.append({"company": name, "location": (r.get("location") or "").split(",")[0].strip().title(),
                    "event": ev[:140], "date": d, "source": re.sub(r"^Karriereseite\b", "Careers page", re.sub(r"\s*\(.*\)$", "", r.get("source") or ""))})
        if len(out) >= 3:
            break
    return out
