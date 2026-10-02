"""Region für die Landkarte der Lead-PDF aus Postleitzahl und Ort (Vorlage des Inhabers, 02.10.2026).

Die Datenbank speichert keine Region; die Vorlage setzt den Pin in die Mitte der Region. Namen wie in den
Beispieldaten der Vorlage (UK: 12 Regionen, FR: Regionen, BE: Provinzen französisch, NL: Provincies, IE: County).
Unbekannt -> "" (der Lead steht dann nur in der Liste, nicht auf der Karte).
"""
from __future__ import annotations

import re

_UK = {
    "London": "E EC N NW SE SW W WC BR CR DA EN HA IG KT RM SM TW UB",
    "South East": "BN CT GU HP ME MK OX PO RG RH SL SO TN",
    "South West": "BA BH BS DT EX GL PL SN SP TA TQ TR",
    "East of England": "AL CB CM CO IP LU NR PE SG SS",
    "East Midlands": "DE LE LN NG NN",
    "West Midlands": "B CV DY HR ST TF WR WS WV",
    "Yorkshire and the Humber": "BD DN HD HG HU HX LS S WF YO",
    "North West": "BB BL CA CH CW FY L LA M OL PR SK WA WN",
    "North East": "DH DL NE SR TS",
    "Wales": "CF LD LL NP SA SY",
    "Scotland": "AB DD DG EH FK G HS IV KA KW KY ML PA PH TD ZE",
    "Northern Ireland": "BT",
}
UK_AREA = {a: r for r, areas in _UK.items() for a in areas.split()}

_FR = {
    "Auvergne-Rhône-Alpes": "01 03 07 15 26 38 42 43 63 69 73 74",
    "Bourgogne-Franche-Comté": "21 25 39 58 70 71 89 90",
    "Bretagne": "22 29 35 56",
    "Centre-Val de Loire": "18 28 36 37 41 45",
    "Corse": "20",
    "Grand Est": "08 10 51 52 54 55 57 67 68 88",
    "Hauts-de-France": "02 59 60 62 80",
    "Île-de-France": "75 77 78 91 92 93 94 95",
    "Normandie": "14 27 50 61 76",
    "Nouvelle-Aquitaine": "16 17 19 23 24 33 40 47 64 79 86 87",
    "Occitanie": "09 11 12 30 31 32 34 46 48 65 66 81 82",
    "Pays de la Loire": "44 49 53 72 85",
    "Provence-Alpes-Côte d'Azur": "04 05 06 13 83 84",
}
FR_DEPT = {d: r for r, ds in _FR.items() for d in ds.split()}

# (bis einschließlich, Provinz) – belgische Postleitzahlen sind nach Provinzen vergeben
BE_RANGES = [(1299, "Bruxelles"), (1499, "Brabant wallon"), (1999, "Brabant flamand"), (2999, "Anvers"),
             (3499, "Brabant flamand"), (3999, "Limbourg"), (4999, "Liège"), (5999, "Namur"), (6599, "Hainaut"),
             (6999, "Luxembourg"), (7999, "Hainaut"), (8999, "Flandre-Occidentale"), (9999, "Flandre-Orientale")]

# Niederlande: grobe Zuordnung der vierstelligen Postcodes (reicht für den Pin auf der Karte)
NL_RANGES = [(1299, "Noord-Holland"), (1399, "Flevoland"), (2199, "Noord-Holland"), (3399, "Zuid-Holland"),
             (3999, "Utrecht"), (4199, "Gelderland"), (4299, "Zuid-Holland"), (4599, "Zeeland"),
             (5799, "Noord-Brabant"), (6499, "Limburg"), (7399, "Gelderland"), (7799, "Overijssel"),
             (7999, "Drenthe"), (8199, "Overijssel"), (8399, "Flevoland"), (9299, "Friesland"),
             (9499, "Drenthe"), (9999, "Groningen")]

IE_COUNTIES = ("Carlow Cavan Clare Cork Donegal Dublin Galway Kerry Kildare Kilkenny Laois Leitrim Limerick Longford "
               "Louth Mayo Meath Monaghan Offaly Roscommon Sligo Tipperary Waterford Westmeath Wexford Wicklow").split()


def _range(code: int, table) -> str:
    for upto, name in table:
        if code <= upto:
            return name
    return ""


def region_of(country: str, address: str, city: str = "") -> str:
    cc = (country or "").upper()
    text = f"{address or ''} {city or ''}"
    if cc == "UK":
        m = re.search(r"\b([A-Z]{1,2})\d[A-Z\d]?\s*\d[A-Z]{2}\b", text.upper())
        return UK_AREA.get(m.group(1), "") if m else ""
    if cc == "FR":
        m = re.search(r"\b(\d{5})\b", text)
        return FR_DEPT.get(m.group(1)[:2], "") if m else ""
    if cc == "BE":
        m = re.search(r"\b(\d{4})\b", text)
        return _range(int(m.group(1)), BE_RANGES) if m else ""
    if cc == "NL":
        m = re.search(r"\b(\d{4})\s?[A-Z]{2}\b", text.upper())
        return _range(int(m.group(1)), NL_RANGES) if m else ""
    if cc == "IE":
        low = text.lower()
        return next((c for c in IE_COUNTIES if c.lower() in low), "")
    return ""
