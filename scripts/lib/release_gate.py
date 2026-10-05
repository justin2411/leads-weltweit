"""Drei-Stufen-Freigabe (+ Stufe 4 Inhaber-Regeln): jeder Lead wird einzeln geprüft, bevor er an einen Kunden oder
in eine Probe geht.

Inhaber 03.10.2026: „alle leads müssen individuell geprüft werden, es dürfen keine fehler passieren – prüfung immer der
trigger an sich ob er auch wirklich passt, danach ob die lead qualität auch mit infos und texten etc stimmt und
vollständig ist und danach ob er sinnvoll ist es so dem kunden zu übermitteln also ob wir den sicher rausgeben können“.

Zusätzlich zu den Prüfungen beim Erzeugen (extraktor qc/sc, contact_companies, complete_only) – nichts davon ersetzt.

  Stufe 1 – Trigger echt: Signal passt zur Zielgruppe, ist frisch (Altersgrenze wie sc.MAX_AGE_DAYS), der Text
            entspricht Quelle und Firma (Name, Domain, Art des Befunds) und der Befund gilt noch: Website-Befunde und
            „keine Website“ werden live nachgeprüft (Startseite bzw. Website-Suche inkl. E-Mail-Domain), höchstens
            einmal am Tag je Firma (robots.txt, 1 Abruf/s je Domain über enrich.Fetcher). Was heute schon geprüft
            wurde (Befund vom selben Tag), wird nicht erneut abgerufen.
  Stufe 2 – Qualität und Vollständigkeit: Name, Land, vollständige Adresse mit gültiger Postleitzahl, Telefon gültig
            für das Land, E-Mail (Syntax, kein Platzhalter, MX), Ansprechperson oder Rolle, Ereignis-Text,
            Einstiegssatz, Begründung und Verkaufstipp vorhanden, Sprache passt zum Land (FR französisch), keine
            Platzhalter, Altersangaben im Text stimmen heute noch, keine Widersprüche (E-Mail-Domain ≠ Website, Ort ≠
            Adresse, Qualitätsprüfung „blocking“), keine Dubletten (Firma, Name, Telefon, E-Mail) in der Auswahl.
  Stufe 3 – auslieferbar: Status frei (nicht vergeben, an niemanden geliefert, in keiner anderen Probe), nicht auf
            der Sperrliste, Lieferland erlaubt und stimmt, keine Behörde/kein Konzern/keine Kette, keine sensiblen
            Inhalte (Religion, Politik, Gewerkschaft, Erotik, Waffen, Glücksspiel, Cannabis), für die Zielgruppe
            sinnvoll (S2: keine Immobilien-/Beteiligungsgesellschaft), Text ehrlich (keine verbotenen Wörter, jede
            Zahl belegt).

  Stufe 4 – Inhaber-Regeln: aktive Baukasten-Flows mit Pipeline-Baustein (lib/owner_rules.py, signalwerk.flows).
            Jeder Lead im Bereich einer Regel muss ihren Pipeline-Baustein erreichen, sonst „s4:regel:xxxxxxxx“.
            Regeln können nur zusätzlich zurückhalten, nie etwas freigeben, was Stufe 1–3 ablehnen. Umkehrbar:
            Regel lösen/ändern ruft flow_release_held(flow) und gibt ihre zurückgehaltenen Leads wieder frei.
            check(owner_rules=False) lässt Stufe 4 weg (tägliche Stichprobe misst Datenqualität, nicht Vorlieben).

Ergebnis je Lead: Verdict (ok, Stufe, Gründe „s1:…“, „s2:…“, „s3:…“, „s4:…“). persist() schreibt lead_checks und setzt
durchgefallene Leads auf status 'held' (gehen nie raus, nichts gelöscht). Gesendet wird nur, was ok ist. persist()
übernimmt jedes Ergebnis zusätzlich in den Qualitätswert (lib/quality.py, Dauerprüfung scripts/dauerpruefung.py).
"""
from __future__ import annotations

import datetime as dt
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field

from lib.laender import active
from lib.owner_rules import check as owner_check, load_rules

STAGES = {1: "Trigger echt", 2: "Qualität & Vollständigkeit", 3: "auslieferbar", 4: "Inhaber-Regeln"}
WEB_FINDINGS = {"no_https", "website_not_mobile", "website_outdated", "website_broken"}
NO_SITE = {"no_website"}
INCORPORATION = {"new_incorporation"}
# Premium-Anlässe (05.10.2026): Zertifikat läuft ab (Veränderungs-Radar, live nachgeprüft) und Umzug laut BODACC
CERT_EXPIRING = {"cert_expiring"}
RELOCATION = {"relocation"}
WEB_CHECKED = WEB_FINDINGS | CERT_EXPIRING  # Befunde auf der eigenen Website: Website, Domain und Quelle prüfen
SEGMENT_SIGNALS = {"S2": WEB_FINDINGS | NO_SITE | INCORPORATION | CERT_EXPIRING | RELOCATION}
# FI…BR: 04.10.2026; HK raus (Inhaber 05.10.2026): nicht mehr lieferbar (lib/laender.INACTIVE)
DELIVERY_COUNTRIES = active({"US", "UK", "FR", "IE", "NL", "BE", "SE", "FI", "SG", "HK", "MX", "BR"})
NEVER_COUNTRIES = {"DE", "AT", "CH", "IT", "ES", "PL", "DK"}
LANG = {"FR": "fr"}

# Woran man den Befund im Text erkennt (beide Sprachen)
SIGNAL_WORDS = {
    "no_https": r"certificat|certificate|https|not secure|non sécurisé|unencrypted|chiffr|sécuris",
    "website_not_mobile": r"phone|mobile|viewport|téléphone",
    "website_outdated": r"copyright|jquery|wordpress|joomla|flash|old version|ancienne|obsol|dates from|date de",
    "website_broken": r"error|parked|parqué|erreur|404|410|500|default|par défaut|suspend|not published|"
                      r"ne présente|introuvable|not found|domain",
    "no_website": r"no website|no own website|pas de site|aucun site|could not find an own website",
    "new_incorporation": r"registered|incorporated|immatricul|créée|formed",
    "cert_expiring": r"certificat|certificate",
    "relocation": r"transf[eé]r|d[ée]m[ée]nag|moved|relocat|nouvelle adresse|new address|nouveau si[eè]ge",
}
SOURCE_WORDS = {"website": r"website check", "no_website": r"overture|fmcsa|register|registry|companies house"}

DOMAIN_IN_TEXT = re.compile(r"(?<![@\w.])((?:[a-z0-9-]+\.)+(?:com|net|org|co\.uk|org\.uk|uk|fr|us|biz|info|io|co|eu|be|nl|"
                            r"ie|se|shop|store|online|site|pro|app|dev|coffee|cafe|bakery|restaurant))\b")
PLACEHOLDER = re.compile(r"\{|\}|\bNone\b|\bnan\b|\bnull\b|\bundefined\b|\bTODO\b|\bXXX\b|lorem ipsum|\[[a-z_]+\]|, ,|\(\)")
EN_IN_FR = re.compile(r"\b(the|its|has|have|checked|website|homepage|without|would|could|find|registered|business)\b", re.I)
FR_IN_EN = re.compile(r"\b(vérifié|vérifiée|bonjour|félicitations|immatriculée|entreprise|votre|vous|n'a pas|le site|"
                      r"aucun|sécurisé)\b", re.I)
EMAIL_SYNTAX = re.compile(r"^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$")
UK_POSTCODE = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b")
US_ZIP = re.compile(r"\b([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b")
FR_POSTCODE = re.compile(r"\b(\d{5})\b")
DAYS_AGO = re.compile(r"\b(\d+) days? ago\b|\bregistered (\d+) days?\b|\bil y a (\d+) jours?\b", re.I)
GOV_MAIL = re.compile(r"(\.gov|\.gov\.uk|\.gouv\.fr|\.nhs\.uk|\.police\.uk|\.mil|\.edu|\.ac\.uk|\.sch\.uk)$")
# Behörden, Schulen, Kirchen, Vereine (wie extraktor.filters.PUBLIC) + französische Gegenstücke
PUBLIC = re.compile(r"\b(county of|city of|town of|village of|state of|department|dept\.? of|school district|public schools?|"
                    r"university|college|ministr(y|ies)|parish|diocese|fire (district|department)|police|sheriff|municipal|"
                    r"(city|county|borough|district|parish|town|state) council|council of|authority|board of|government|"
                    r"federal|association|foundation|non-?profit|nhs|"
                    r"mairie|préfecture|commune de|conseil (départemental|régional)|lycée|collège|école publique|"
                    r"universit[ée]|minist[eè]re|gendarmerie|h[ôo]pital public|chu\b|caisse primaire)\b", re.I)
# Ketten und Konzerne: sind keine Kunden kleiner Webagenturen (Overture filtert Ketten schon beim Erzeugen)
CHAIN = re.compile(r"\b(mcdonald'?s|starbucks|subway|walmart|target store|costco|tesco|sainsbury'?s|asda|morrisons|"
                   r"waitrose|co-?op food|greggs|costa coffee|pret a manger|kfc|burger king|domino'?s|pizza hut|papa john'?s|"
                   r"7-eleven|cvs|walgreens|home depot|lowe'?s|ikea|amazon|carrefour|leclerc|intermarch[ée]|auchan|"
                   r"lidl|aldi|monoprix|franprix|casino supermarch|super u|hyper u|boulanger|fnac|darty|decathlon|"
                   r"la poste|post office|hsbc|barclays|lloyds|natwest|santander|bnp paribas|cr[ée]dit agricole|"
                   r"soci[ée]t[ée] g[ée]n[ée]rale|banque populaire|caisse d'[ée]pargne|wells fargo|chase bank|"
                   r"bank of america|citibank|h&r block|state farm|allstate|edward jones|re/?max|keller williams|"
                   r"century 21|coldwell banker|orpi|foncia|la for[eê]t|guy hoquet|stéphane plaza)\b", re.I)
# Sensible Inhalte (Art. 9 DSGVO und Ähnliches): nicht als Lead weitergeben
SENSITIVE = re.compile(r"\b(church|chapel|mosque|masjid|synagogue|temple|ministries|gospel|parish|[ée]glise|mosqu[ée]e|"
                       r"paroisse|political|party office|campaign hq|trade union|labou?r union|syndicat|"
                       r"escort|adult (store|shop|entertainment)|sex ?shop|strip club|gentlemen'?s club|erotic|[ée]rotique|"
                       r"cannabis|marijuana|dispensary|cbd shop|gun ?shop|firearms?|armurerie|ammunition|"
                       r"casino|betting|bookmaker|sportsbook|pmu|abortion|rehab(ilitation)? cent(er|re)|addiction)\b", re.I)
# Für Webagenturen (S2) nicht sinnvoll: reine Immobilien-/Beteiligungsgesellschaften ohne Kundengeschäft
NOT_FOR_S2 = re.compile(r"^(sci|scea|sc|sccv|sarl de famille)\b|\bsoci[ée]t[ée] civile\b|\bholdings?\b|"
                        r"\bproperty holdings?\b|\bnominees?\b|\bdormant\b", re.I)


@dataclass
class Verdict:
    lead_id: str
    ok: bool
    stage: int | None = None            # erste nicht bestandene Stufe
    reasons: list[str] = field(default_factory=list)
    rechecked: bool = False
    country: str = ""
    segment: str = ""
    status: str = ""
    # Zeitpunkt des Urteils (nicht des Schreibens): flow_release_stale_held vergleicht ihn mit flows.updated_at –
    # wurde eine Regel nach dem Urteil geändert/gelöst, gibt der Wachhund den Lead an die Freigabe zurück.
    at: str = field(default_factory=lambda: dt.datetime.now(dt.timezone.utc).isoformat())

    def row(self, context: str) -> dict:
        return {"lead_id": self.lead_id, "result": "released" if self.ok else "failed", "failed_stage": self.stage,
                "reasons": self.reasons[:20], "context": context, "rechecked": self.rechecked,
                "checked_at": self.at}


# ---------------------------------------------------------------------------- Hilfen
def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c)).lower()).strip()


def domain_of(url_or_mail: str) -> str:
    s = (url_or_mail or "").strip().lower()
    if "@" in s and "//" not in s:
        s = s.split("@", 1)[1]
    s = re.sub(r"^[a-z]+://", "", s).split("/")[0].split(":")[0]
    return s[4:] if s.startswith("www.") else s


def _date(v) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def _is_freemail(domain: str) -> bool:
    from lib.rules import is_freemail
    return is_freemail(domain)


def postcode_reason(address: str, country: str, region: str = "") -> str | None:
    """None = Adresse vollständig mit gültiger Postleitzahl; sonst Grund."""
    a = (address or "").strip()
    if not a:
        return "adresse_fehlt"
    up = a.upper()
    if country == "UK":
        m = UK_POSTCODE.search(up)
        rest = UK_POSTCODE.sub(" ", up)
    elif country == "US":
        m = US_ZIP.search(up)
        rest = US_ZIP.sub(" ", up)
        if m:
            from extraktor.qc import zip_matches_state
            if zip_matches_state(m.group(2), m.group(1)) is False:
                return "plz_passt_nicht_zum_bundesstaat"
    elif country == "FR":
        m = FR_POSTCODE.search(up)
        rest = FR_POSTCODE.sub(" ", up)
    else:
        m, rest = True, up
    if not m:
        return "postleitzahl_fehlt_oder_ungueltig"
    if len(re.sub(r"[^A-ZÀ-Ý]", "", rest)) < 4:
        return "adresse_unvollstaendig"
    return None


def age_claims_ok(text: str, event_date: dt.date | None, today: dt.date) -> bool:
    """„registered 38 days ago“ / „il y a 3 jours“ muss heute noch stimmen (±1 Tag)."""
    if not event_date:
        return not DAYS_AGO.search(text or "")
    real = (today - event_date).days
    for m in DAYS_AGO.finditer(text or ""):
        n = int(next(g for g in m.groups() if g is not None))
        if abs(n - real) > 1:
            return False
    return True


def _numbers(text: str) -> list[str]:
    return [n.strip(",.") for n in re.findall(r"(?<![A-Za-z0-9])\d[\d,.]*(?![A-Za-z])", text or "")]


# ---------------------------------------------------------------------------- Stufen (rein, ohne Netz)
def stage1(it: dict, today: dt.date, max_age: int | None = None) -> list[str]:
    from extraktor import sc
    out = []
    seg, sig = it.get("segment_id") or "", it.get("signal_type") or ""
    co = it.get("company") or {}
    allowed = SEGMENT_SIGNALS.get(seg)
    if not sig:
        out.append("signal_fehlt")
    elif allowed is not None and sig not in allowed:
        out.append(f"signal_passt_nicht_zur_zielgruppe:{sig}")
    ev = _date(it.get("event_date"))
    limit = max_age or sc.MAX_AGE_BY_SOURCE.get(it.get("source_key") or "", sc.MAX_AGE_DAYS)
    if not ev:
        out.append("signal_ohne_datum")
    else:
        age = (today - ev).days
        if age > limit:
            out.append(f"signal_zu_alt:{age}_tage")
        if age < 0:
            out.append("signal_datum_in_zukunft")
    summary = it.get("event_summary") or ""
    name = co.get("name") or ""
    if not summary.strip():
        out.append("ereignis_text_fehlt")
    elif name and fold(name) not in fold(summary):
        out.append("ereignis_nennt_andere_firma")
    if sig in SIGNAL_WORDS and summary and not re.search(SIGNAL_WORDS[sig], summary, re.I):
        out.append("text_passt_nicht_zum_signal")
    src = (it.get("source_url") or "").strip()
    if not re.match(r"^https?://", src):
        out.append("quelle_fehlt")
    site = co.get("website") or ""
    if sig in WEB_CHECKED:
        if not site:
            out.append("befund_ohne_website")
        elif any(d != domain_of(site) and not domain_of(site).endswith("." + d) for d in DOMAIN_IN_TEXT.findall(summary.lower())):
            # nennt der Befund eine Domain, muss es die geprüfte Website der Firma sein
            out.append("befund_nennt_andere_domain")
        if not re.search(SOURCE_WORDS["website"], it.get("source_name") or "", re.I):
            out.append("quelle_passt_nicht_zum_befund")
    if sig in NO_SITE and site:
        out.append("hat_website")
    if sig in INCORPORATION and site and seg == "S2":
        out.append("neugruendung_hat_schon_website")
    return out


def stage2(it: dict, today: dt.date, mx=None) -> list[str]:
    from extraktor.qc import check_phone
    from lib import playbook
    out = []
    co, ct, pp = it.get("company") or {}, it.get("contact") or {}, it.get("person") or {}
    country = it.get("country") or ""
    name = (co.get("name") or "").strip()
    if len(fold(name)) < 2:
        out.append("firmenname_fehlt")
    elif re.search(r"\b(test|dummy|sample|unknown|n/?a)\b", name, re.I):
        out.append("firmenname_platzhalter")
    if not country or (co.get("country") and co["country"] != country):
        out.append("land_widerspruch")
    pr = postcode_reason(co.get("address") or "", country, co.get("region") or "")
    if pr:
        out.append(pr)
    city = co.get("city") or ""
    if city and co.get("address") and fold(city) not in fold(co["address"]):
        out.append("ort_widerspricht_adresse")
    phone = ct.get("phone") or co.get("phone_main") or ""
    if not phone:
        out.append("telefon_fehlt")
    else:
        ph = check_phone(phone, co.get("region") or "", country)
        if not ph["ok"]:
            out.append(f"telefon_ungueltig:{ph['problem']}")
    email = (ct.get("email") or "").strip().lower()
    if not email:
        out.append("email_fehlt")
    elif not EMAIL_SYNTAX.match(email):
        out.append("email_syntax")
    else:
        from extraktor.qc import DISPOSABLE, PLACEHOLDER_EMAIL
        dom = domain_of(email)
        if PLACEHOLDER_EMAIL.match(email) or dom in DISPOSABLE:
            out.append("email_platzhalter")
        elif mx is not None and not _is_freemail(dom):
            ok = mx(dom)
            if ok is False:
                out.append("email_domain_ohne_mx")
            elif ok is None:
                out.append("email_mx_nicht_pruefbar")
        site = co.get("website") or ""
        if site and not _is_freemail(dom) and dom != domain_of(site) and not domain_of(site).endswith("." + dom) \
                and not dom.endswith("." + domain_of(site)):
            out.append("email_domain_widerspricht_website")
    if not ((pp.get("name") or "").strip() or (pp.get("role") or "").strip()):
        out.append("ansprechperson_fehlt")
    texts = {"ereignis": it.get("event_summary") or "", "einstieg": it.get("opener") or "",
             "begruendung": it.get("urgency_reason") or ""}
    for k, t in texts.items():
        if not t.strip():
            out.append(f"{k}_fehlt")
            continue
        if PLACEHOLDER.search(t):
            out.append(f"{k}_platzhalter")
        rest = re.sub(re.escape(name), " ", t, flags=re.I) if name else t
        if LANG.get(country) == "fr" and len(EN_IN_FR.findall(rest)) >= 2:
            out.append(f"{k}_nicht_franzoesisch")
        if LANG.get(country) != "fr" and FR_IN_EN.search(rest):
            out.append(f"{k}_nicht_englisch")
    if texts["einstieg"] and name and fold(name) not in fold(texts["einstieg"]):
        out.append("einstieg_ohne_firmenname")
    ev = _date(it.get("event_date"))
    for k, t in texts.items():
        if t and not age_claims_ok(t, ev, today):
            out.append(f"{k}_altersangabe_veraltet")
    try:
        b = playbook.briefing(it.get("signal_type") or "", it.get("segment_id"), texts["ereignis"], str(ev or ""),
                              texts["einstieg"], industry=co.get("industry") or "", city=city, country=country)
        if not (b.get("why") and b.get("needs") and b.get("offer") and b.get("ask")):
            out.append("verkaufstipp_fehlt")
    except Exception:  # noqa: BLE001 - ohne Verkaufstipp kein vollständiger Lead
        out.append("verkaufstipp_fehlt")
    if it.get("quality_blocking"):
        out.append("qualitaetspruefung_blocking")
    return out


def stage3(it: dict, ctx: dict) -> list[str]:
    from lib.rules import FORBIDDEN_PATTERNS
    out = []
    co, ct = it.get("company") or {}, it.get("contact") or {}
    country, seg = it.get("country") or "", it.get("segment_id") or ""
    if it.get("status") not in ctx.get("allowed_status", ("new",)):
        out.append(f"schon_vergeben:{it.get('status')}")
    if it["id"] in ctx.get("delivered", set()):
        out.append("schon_geliefert")
    if it["id"] in ctx.get("other_stock", set()):
        out.append("in_anderer_probe")
    if ctx.get("country") and country != ctx["country"]:
        out.append("falsches_lieferland")
    if country in NEVER_COUNTRIES or country not in DELIVERY_COUNTRIES:
        out.append("lieferland_nicht_erlaubt")
    email = (ct.get("email") or "").lower()
    keys = {email, domain_of(email), domain_of(co.get("website") or "")} - {""}
    if keys & ctx.get("suppressed", set()):
        out.append("sperrliste")
    name = co.get("name") or ""
    if PUBLIC.search(name) or GOV_MAIL.search(domain_of(email) or "-") or GOV_MAIL.search(domain_of(co.get("website") or "") or "-"):
        out.append("behoerde_oder_verein")
    if CHAIN.search(name):
        out.append("konzern_oder_kette")
    if SENSITIVE.search(name) or SENSITIVE.search(co.get("industry") or ""):
        out.append("sensibler_inhalt")
    if seg == "S2" and NOT_FOR_S2.search(name.strip()):
        out.append("fuer_webagentur_nicht_sinnvoll")
    lang = LANG.get(country, "en")
    facts = " ".join([name, it.get("event_summary") or "", co.get("address") or "", str(it.get("event_date") or "")])
    allowed = set(_numbers(facts))
    ev = _date(it.get("event_date"))
    for k in ("opener", "urgency_reason", "event_summary"):
        t = it.get(k) or ""
        for pat in FORBIDDEN_PATTERNS.get(lang, []):
            if re.search(pat, t, re.I):
                out.append(f"{k}_verbotenes_wort")
                break
        if k == "event_summary":
            continue
        claimed = {int(next(g for g in m.groups() if g)) for m in DAYS_AGO.finditer(t)}
        for n in _numbers(t):
            if n in allowed or (n.isdigit() and int(n) in claimed and ev):
                continue
            out.append(f"{k}_zahl_nicht_belegt:{n}")
            break
    return out


def duplicates(items: list[dict]) -> dict[str, str]:
    """lead_id -> Grund, für den zweiten und jeden weiteren Lead derselben Firma (ID, Name, Telefon, E-Mail)."""
    from extraktor.qc import check_phone
    seen: dict[str, str] = {}
    out = {}
    for it in items:
        co, ct = it.get("company") or {}, it.get("contact") or {}
        ph = check_phone(ct.get("phone") or co.get("phone_main") or "", co.get("region") or "", it.get("country") or "US")["e164"]
        keys = [f"id:{it.get('company_id')}", f"name:{fold(co.get('name') or '')}",
                f"tel:{ph or ''}", f"mail:{(ct.get('email') or '').lower()}"]
        hit = next((k for k in keys if not k.endswith(":") and k in seen), None)
        if hit:
            out[it["id"]] = f"dublette_{hit.split(':')[0]}"
        for k in keys:
            if not k.endswith(":"):
                seen.setdefault(k, it["id"])
    return out


# ---------------------------------------------------------------------------- Live-Nachprüfung (Netz)
RECHECK_PER_IP = 1.0  # Sekunden Abstand je Server-IP bei der Live-Nachprüfung (zusätzlich zu 1/s je Domain)

def live_recheck(it: dict, fetcher, today: dt.date) -> tuple[list[str], bool]:
    """(Gründe, abgerufen?) – Befund heute noch da? Höchstens einmal am Tag je Firma (Befund von heute = geprüft)."""
    sig = it.get("signal_type") or ""
    co, ct = it.get("company") or {}, it.get("contact") or {}
    checked = _date(it.get("source_date")) or _date(it.get("event_date"))
    if sig in WEB_FINDINGS:
        if checked and checked >= today:
            return [], False
        if it.get("rechecked_today"):
            return [], False
        from extraktor.sources import website_check as wc
        c = {"name": co.get("name") or "", "country": it.get("country") or "", "phone": ct.get("phone") or co.get("phone_main") or "",
             "facts": {"listed_website": co.get("website") or ""}}
        try:
            res = wc.inspect(c, fetcher, today)
        except Exception as exc:  # noqa: BLE001 - nicht prüfbar = nicht freigeben
            return [f"nachpruefung_fehler:{type(exc).__name__}"], True
        types = {f["type"] for f in res.get("findings") or []}
        if sig in types:
            return [], True
        note = (res.get("note") or "seite_in_ordnung").split(" ")[0]
        return [f"befund_nicht_bestaetigt:{note}"], True
    if sig in CERT_EXPIRING:
        # Zertifikat noch nicht erneuert und weiter im Ablauf-Fenster? (ein TLS-Handshake, höchstens 1×/Tag je Firma)
        if (checked and checked >= today) or it.get("rechecked_today"):
            return [], False
        from extraktor.sources import website_check as wc
        from lib import tls_info
        host = wc.host_of(co.get("website") or "")
        if not host:
            return ["befund_ohne_website"], False
        fetcher._throttle("https://" + host + "/")
        cert = tls_info.read(host)
        if cert is None:
            return ["nachpruefung_fehler:zertifikat_nicht_lesbar"], True
        if tls_info.expiring(cert, today) is None:
            return ["befund_nicht_bestaetigt:zertifikat_erneuert_oder_abgelaufen"], True
        return [], True
    if sig in NO_SITE or (sig in INCORPORATION and not co.get("website")):
        if it.get("rechecked_today") or (checked and checked >= today and sig in NO_SITE):
            return [], False
        from lib.site_recheck import _candidate
        from extraktor.enrich import find_site
        cand = _candidate({**co, "country": it.get("country")})
        cand["email"] = ct.get("email") or ""  # eigene E-Mail-Domain zuerst (find_site)
        try:
            r = find_site(cand, fetcher)
        except Exception as exc:  # noqa: BLE001
            return [f"nachpruefung_fehler:{type(exc).__name__}"], True
        site = r.get("site") or {}
        if site.get("verified"):
            it["_found_site"] = site.get("url")
            return ["hat_doch_website"], True
        return [], True
    return [], False


# ---------------------------------------------------------------------------- Laden und Prüfen
LEAD_FIELDS = ("id,segment_id,country,signal_type,event_summary,event_date,source_name,source_url,source_date,urgency,"
               "urgency_reason,opener,status,company_id,observation_ids,created_at")
CO_FIELDS = "id,name,country,city,region,address,website,phone_main,legal_form,industry"


def _chunks(xs: list, n: int = 100):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def load_items(db, lead_ids: list[str]) -> list[dict]:
    """Leads frisch aus der Datenbank (nie mit veralteten Feldern prüfen) samt Firma, Kontakt, Person, Qualität."""
    leads: list[dict] = []
    for part in _chunks(sorted(set(lead_ids))):
        leads += db.select("leads", {"id": f"in.({','.join(part)})", "select": LEAD_FIELDS})
    cids = sorted({l["company_id"] for l in leads if l.get("company_id")})
    cos, contact, person, blocking = {}, {}, {}, set()
    raw: dict[tuple[str, str], dict] = {}  # Rohdaten je Firma und Art (Stufe 4 / Baukasten-Felder)
    for part in _chunks(cids):
        for c in db.select("watch_companies", {"id": f"in.({','.join(part)})", "select": CO_FIELDS}):
            cos[c["id"]] = c
        for o in db.select("observations", {"company_id": f"in.({','.join(part)})", "kind": "eq.other",
                                            "key": "in.(contact,person,quality)", "select": "company_id,key,details"}):
            d = o.get("details") or {}
            raw[(o["company_id"], o["key"])] = d if isinstance(d, dict) else {}
            if o["key"] == "contact" and (d.get("email") or d.get("phone")):
                contact[o["company_id"]] = d
            elif o["key"] == "person" and (d.get("name") or d.get("role")):
                person[o["company_id"]] = d
            elif o["key"] == "quality" and str(d.get("blocking")).lower() == "true":
                blocking.add(o["company_id"])
    checks = {}
    try:
        for part in _chunks([l["id"] for l in leads]):
            for r in db.select("lead_checks", {"lead_id": f"in.({','.join(part)})", "select": "lead_id,rechecked,checked_at"}):
                checks[r["lead_id"]] = r
    except RuntimeError:  # Tabelle (noch) nicht da: dann eben heute nachprüfen
        checks = {}
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    for l in leads:
        cid = l.get("company_id")
        l["company"] = cos.get(cid) or {}
        l["contact"] = contact.get(cid) or {}
        l["person"] = person.get(cid) or {}
        l["quality_blocking"] = cid in blocking
        l["contact_raw"], l["person_raw"], l["quality_raw"] = (raw.get((cid, k)) or {} for k in ("contact", "person", "quality"))
        ch = checks.get(l["id"]) or {}
        l["rechecked_today"] = bool(ch.get("rechecked")) and str(ch.get("checked_at") or "")[:10] == today
        l["source_key"] = "dol_lca" if "LCA" in (l.get("source_name") or "") else ""
    order = {x: i for i, x in enumerate(lead_ids)}
    return sorted(leads, key=lambda l: order.get(l["id"], 10**9))


def load_context(db, items: list[dict], country: str | None, allowed_status=("new",),
                 own_stock: str | None = None, own_delivery: str | None = None) -> dict:
    ids = {it["id"] for it in items}
    delivered = set()
    for d in db.select_all("deliveries", {"select": "id,lead_ids"}):
        if d.get("id") != own_delivery:
            delivered |= set(d.get("lead_ids") or []) & ids
    other = set()
    for s in db.select_all("sample_stock", {"status": "in.(ready,claimed,sent)", "select": "id,lead_ids"}):
        if s.get("id") != own_stock:
            other |= set(s.get("lead_ids") or []) & ids
    keys = set()
    for it in items:
        e = ((it.get("contact") or {}).get("email") or "").lower()
        keys |= {e, domain_of(e), domain_of((it.get("company") or {}).get("website") or "")}
    keys.discard("")
    suppressed = set()
    for part in _chunks(sorted(keys), 80):
        for r in db.select("suppression", {"value": f"in.({','.join(part)})", "select": "value"}):
            suppressed.add(r["value"])
    return {"delivered": delivered, "other_stock": other, "suppressed": suppressed, "country": country,
            "allowed_status": tuple(allowed_status)}


_MX: dict[str, bool | None] = {}


def mx_cached(domain: str) -> bool | None:
    if domain not in _MX:
        from enrich import mx_ok
        r = mx_ok(domain)
        if r is None:
            r = mx_ok(domain)  # einmal wiederholen (DNS-Zeitüberschreitung)
        _MX[domain] = r
    return _MX[domain]


def verdict_of(it: dict, today: dt.date, ctx: dict, dup: str | None, recheck: tuple[list[str], bool] | None, mx,
               rules: list[dict] | None = None) -> Verdict:
    r1 = stage1(it, today) + (recheck[0] if recheck else [])
    r2 = stage2(it, today, mx) + ([dup] if dup else [])
    r3 = stage3(it, ctx)
    r4 = owner_check(rules, it, today) if rules else []  # nur zusätzliche Gründe, nie eine Freigabe
    reasons = [f"s1:{x}" for x in r1] + [f"s2:{x}" for x in r2] + [f"s3:{x}" for x in r3] + [f"s4:{x}" for x in r4]
    stage = 1 if r1 else 2 if r2 else 3 if r3 else 4 if r4 else None
    return Verdict(it["id"], stage is None, stage, reasons, bool(recheck and recheck[1]),
                   it.get("country") or "", it.get("segment_id") or "", it.get("status") or "")


def check(db, lead_ids: list[str], *, country: str | None = None, allowed_status=("new",), own_stock: str | None = None,
          own_delivery: str | None = None, live: bool = True, fetcher=None, today: dt.date | None = None, mx=mx_cached, workers: int = 8,
          items: list[dict] | None = None, owner_rules: bool = True) -> list[Verdict]:
    """Alle Stufen für diese Leads. live=False: ohne Netzabruf (Stufe 1 nur aus den Daten).
    owner_rules=False: ohne Stufe 4 (Inhaber-Regeln); die Regeln werden je Aufruf einmal geladen – erst NACH der
    Live-Nachprüfung, direkt vor dem Urteil, damit eine währenddessen gelöste/geänderte Regel nicht mehr zählt
    (Rest-Fenster bis persist(): Sicherheitsnetz flow_release_stale_held im Wachhund)."""
    today = today or dt.datetime.now(dt.timezone.utc).date()
    items = items if items is not None else load_items(db, lead_ids)
    ctx = load_context(db, items, country, allowed_status, own_stock, own_delivery)
    dups = duplicates(items)
    rechecks: dict[str, tuple[list[str], bool]] = {}
    if live:
        if fetcher is None:
            from enrich import Fetcher
            # 1 Abruf/s auch je Server-IP: geparkte Domains teilen sich wenige Parkdienst-IPs; 8 parallele Abrufe
            # dorthin liefen in Zeitüberschreitungen (befund_nicht_bestaetigt:https_unknown, UK 04.10.2026)
            fetcher = Fetcher(per_ip=RECHECK_PER_IP)
        from concurrent.futures import ThreadPoolExecutor
        # nur nachprüfen, was die Datenprüfung der Stufe 1 besteht (spart Abrufe)
        todo = [it for it in items if not stage1(it, today)]
        with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
            for it, res in zip(todo, ex.map(lambda x: live_recheck(x, fetcher, today), todo)):
                rechecks[it["id"]] = res
    found = {it["id"]: it for it in items}
    rules = load_rules(db) if owner_rules else []
    out = [verdict_of(it, today, ctx, dups.get(it["id"]), rechecks.get(it["id"]), mx, rules) for it in items]
    missing = set(lead_ids) - set(found)
    out += [Verdict(x, False, 3, ["s3:lead_nicht_gefunden"]) for x in sorted(missing)]
    for v in out:  # gefundene Website merken (wie site_recheck.drop_with_site)
        it = found.get(v.lead_id)
        if it is not None and it.get("_found_site"):
            v.found_site = it["_found_site"]  # type: ignore[attr-defined]
            v.company_id = it.get("company_id")  # type: ignore[attr-defined]
    return out


def persist(db, verdicts: list[Verdict], context: str, hold: bool = True, log=print) -> None:
    """lead_checks schreiben; durchgefallene Leads (frei oder reserviert) auf 'held' – sie gehen nie raus."""
    rows = [v.row(context) for v in verdicts if v.lead_id]
    for part in _chunks(rows, 200):
        try:
            db.insert("lead_checks", part, upsert_on="lead_id")
        except Exception as exc:  # noqa: BLE001 - Freigabe gilt nur mit Protokoll: ohne Zeile kein 'released'
            log(f"lead_checks nicht gespeichert: {type(exc).__name__}: {str(exc)[:160]}")
            for v in verdicts:
                if v.lead_id in {r["lead_id"] for r in part}:
                    v.ok = False
    # Qualitätswert (Dauerprüfung, Inhaber 04.10.2026): jede Prüfung zählt – nur Reihenfolge, nie die Freigabe selbst
    from lib.quality import apply_leads
    apply_leads(db, verdicts, log=log)
    if not hold:
        return
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    for v in verdicts:
        if v.ok:
            continue
        try:
            if v.status not in ("new", "reserved"):
                continue  # schon vergebene Leads nicht umstempeln
            if getattr(v, "found_site", None):
                db.update("leads", {"id": v.lead_id, "status": v.status}, {"status": "expired"})
                db.update("watch_companies", {"id": v.company_id}, {"website": v.found_site, "updated_at": now})
            else:
                db.update("leads", {"id": v.lead_id, "status": v.status}, {"status": "held"})
        except Exception as exc:  # noqa: BLE001 - Lead geht trotzdem nicht raus (nicht ok)
            log(f"Status nicht gesetzt ({v.lead_id}): {type(exc).__name__}")


def summary(verdicts: list[Verdict]) -> dict:
    """Trichter: geprüft -> nach Stufe 1 -> nach Stufe 2 -> freigegeben, plus häufigste Gründe."""
    n = len(verdicts)
    f = Counter(v.stage for v in verdicts if not v.ok)
    reasons = Counter(r.split(":")[0] + ":" + r.split(":")[1] for v in verdicts for r in v.reasons)
    return {"geprueft": n, "stufe1": n - f[1], "stufe2": n - f[1] - f[2], "freigegeben": sum(v.ok for v in verdicts),
            "durchgefallen": {"1": f[1], "2": f[2], "3": f[3], "4": f[4]}, "gruende": dict(reasons.most_common(15))}


def stats_rows(verdicts: list[Verdict]) -> list[dict]:
    """run_stats-Zeilen je Zielgruppe/Land: candidates=geprüft, processed=nach Stufe 1, yellow=nach Stufe 2,
    green=freigegeben, red=durchgefallen; extra.stufen für den Trichter im Dashboard."""
    groups: dict[tuple[str, str], list[Verdict]] = {}
    for v in verdicts:
        groups.setdefault((v.segment, v.country), []).append(v)
    out = []
    for (seg, c), vs in sorted(groups.items()):
        s = summary(vs)
        out.append({"segment_id": seg or None, "country": c or None, "candidates": s["geprueft"], "processed": s["stufe1"],
                    "yellow": s["stufe2"], "green": s["freigegeben"], "red": s["geprueft"] - s["freigegeben"],
                    "reasons": s["gruende"],
                    "extra": {"durchgefallen": s["durchgefallen"], "stufen": {"geprueft": s["geprueft"], "stufe1": s["stufe1"], "stufe2": s["stufe2"],
                                         "freigegeben": s["freigegeben"]}}})
    return out


def release(db, leads: list[dict], *, context: str, country: str | None = None, allowed_status=("new",),
            own_stock: str | None = None, own_delivery: str | None = None, live: bool = True, fetcher=None, log=print,
            record_stats: bool = True) -> tuple[list[dict], list[Verdict]]:
    """Bequemer Einstieg für Proben/Lieferungen: (freigegebene Leads in Eingabe-Reihenfolge, alle Urteile)."""
    if not leads:
        return [], []
    vs = check(db, [l["id"] for l in leads], country=country, allowed_status=allowed_status, own_stock=own_stock,
               own_delivery=own_delivery, live=live, fetcher=fetcher)
    persist(db, vs, context, log=log)
    ok = {v.lead_id for v in vs if v.ok}
    for v in vs:
        if not v.ok:
            log(f"  Freigabe: Lead {v.lead_id} Stufe {v.stage} ({STAGES.get(v.stage or 0, '')}): {', '.join(v.reasons[:4])}")
    if record_stats:
        from lib.run_stats import record
        record(db, "freigabe", [{**r, "extra": {**r["extra"], "kontext": context}} for r in stats_rows(vs)], None, log)
    return [l for l in leads if l["id"] in ok], vs
