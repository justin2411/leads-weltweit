"""Nachfüller der Werke: Belegung lückenlos ≥ MIN_BELEGT (Inhaber 05.10.2026: „mind. 30 gleichzeitig“).

Problem (gemessen 05.10.2026, 01:15 MESZ): nur 12 von 40 GitHub-Jobs belegt. Das Lead-Werk lief als EIN Lauf mit
allen Linien; fertige Teile warteten auf die Nachzügler, erst dann startete der nächste Lauf (Job „weiter“).

Lösung: jede Linie des Lead-Werks läuft als eigener Lauf (lead-werk.yml mit Eingabe `linien`/`teile`) und startet
sofort neu, wenn sie fertig ist – unabhängig von den anderen Linien. Dieser Nachfüller (werk-nachfuellen.yml, von
jedem fertigen Werk-Lauf, vom Wachhund und per Zeitplan angestoßen) startet jede eingeplante Linie, die gerade
nicht läuft. Liegt die Belegung (alle laufenden/wartenden Jobs) danach unter MIN_BELEGT, bekommen die neu
gestarteten Linien mehr Teile (werk_plan.fill_minimum: Premium/Website US/UK/FR, Kunden, Prüfer, Linien mit Vorrat).

Alle Werke (05.10.2026, nachts nur 11 Jobs): Kunden-, Kontakt- und Prüfer-Werk startet der Nachfüller ebenfalls, wenn
sie brach liegen (Plätze im Plan, keine Pause, kein aktiver/wartender Lauf; Kunden-Werk nur mit kunden_suche).
fill_minimum stockt nur NEU gestartete Lead-Linien auf; eine laufende Linie bekommt keinen zweiten Lauf (die
Aufteilung --shard i/k gilt je Lauf, ein zweiter Lauf würde dieselben Teile bearbeiten). Fehlt danach noch etwas bis
MIN_BELEGT, ist das Kunden-Werk der Puffer (Eingabe `teile`, bis max seiner Linie).

Teile-Läufe (05.10.2026, Nacht nur 18–20 Jobs: web-us lief mit 1 von 15 Teilen, galt aber als „belegt“): jede
Lead-Linie hat eine feste Aufteilung --shard i/K (K = max der Linie, werk_plan.lane_k). Gezählt wird je Teil, nicht
je Linie: hat eine laufende Linie freie Teile, startet der Nachfüller sie als weiteren Lauf (Eingabe shards, Titel
„· Teile 3,4,5“, die am längsten nicht gelaufenen zuerst). Der Plan-Job jedes Laufs lässt Teile aus, die ein anderer
Lauf belegt (shards_taken_by_others) – nie zwei Jobs auf demselben Teil. Alte Läufe (ohne „· Teile“) belegen ihre
Linien ganz. Puffer bis MIN_BELEGT ist zuerst die ertragreichste Lead-Linie (Nachrang-Linien des Länder-Vorrangs
ganz zuletzt), erst danach das Kunden-Werk.

Grenzen (nie gelockert): Plätze je Linie höchstens max, alle Jobs zusammen höchstens total_slots - reserve,
Speicher-Bremse aus dem Belegungsplan (stopp = keine Lead-Linie), Schalter config/pipeline.yaml lead_suche und
Pause im Dashboard (owner_settings.werke_paused „lead-werk“; nicht lesbar = nichts starten). Keine doppelte
Bearbeitung: eine Linie läuft nie in zwei Läufen gleichzeitig (Aufteilung --shard i/k bleibt je Lauf konsistent);
das prüft auch der Plan-Job jedes Lead-Werk-Laufs (`lanes_taken_by_others`). Sendet nie, startet nie den Versand.

  python scripts/werk_belegung.py zaehlen            # belegte Jobs anzeigen
  python scripts/werk_belegung.py nachfuellen        # nur anzeigen
  python scripts/werk_belegung.py nachfuellen --apply
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import werk_plan as W  # noqa: E402

ACTIVE_RUN = ("queued", "in_progress", "waiting", "requested", "pending")
ACTIVE_JOB = ("queued", "in_progress", "waiting", "pending")
LEAD_WF = "lead-werk.yml"
NACHFUELLER_WF = "werk-nachfuellen.yml"
TITLE_RE = re.compile(r"Linien?\s+([a-z0-9,\-]+)", re.I)  # run-name „lead-werk · Linie web-us“


# ---------------------------------------------------------------------------------------------- reine Logik
def job_lane(name: str) -> str | None:
    """Linie eines Lead-Werk-Jobs aus seinem Namen („holen (web-us-3, 40, --segments …)“)."""
    m = re.match(r"^holen \(([a-z0-9\-]+?-\d+)[,)]", name or "")
    return W.lane_of("lead-werk", m.group(1)) if m else None


def title_lanes(title: str | None) -> set[str] | None:
    """Linien aus dem Lauf-Titel eines Linien-Laufs, None = Lauf für alle Linien (ohne Eingabe)."""
    m = TITLE_RE.search(title or "")
    return {x for x in m.group(1).split(",") if x} if m else None


def run_claim(run: dict, jobs: list[dict] | None, all_lanes: set[str]) -> tuple[set[str], bool]:
    """Welche Linien belegt ein aktiver Lead-Werk-Lauf? (Linien, geklärt). Linien-Lauf: die Linien im Titel.
    Lauf für alle: die Linien seiner aktiven holen-Jobs; ist sein Plan noch offen, ist er ungeklärt (alle Linien)."""
    lanes = title_lanes(run.get("display_title"))
    if lanes is not None:
        return lanes & all_lanes, True
    if jobs is None:
        return set(all_lanes), False
    plan = next((j for j in jobs if j.get("name") == "plan"), None)
    active = {job_lane(j.get("name", "")) for j in jobs if j.get("status") in ACTIVE_JOB}
    active.discard(None)
    holen = [j for j in jobs if job_lane(j.get("name", ""))]
    if holen or (plan and plan.get("status") == "completed"):
        return active, True
    return set(all_lanes), False


SHARDS_RE = re.compile(r"·\s*Teile\b\s*([\d,]*)")  # Teile-Lauf: „lead-werk · Linie web-us · Teile 3,4,5“


def title_shards(title: str | None) -> tuple[bool, list[int]]:
    """(Teile-Lauf?, Teil-Nummern aus dem Titel). Teile-Läufe nutzen die feste Aufteilung K = max der Linie."""
    m = SHARDS_RE.search(title or "")
    return (True, [int(x) for x in m.group(1).split(",") if x.isdigit()]) if m else (False, [])


def job_part(name: str) -> tuple[str, int] | None:
    """(Linie, Teil-Nummer) eines holen-Jobs („holen (web-us-3, …)“ -> ("web-us", 3))."""
    m = re.match(r"^holen \(([a-z0-9\-]+?)-(\d+)[,)]", name or "")
    return (m.group(1), int(m.group(2))) if m else None


Claims = dict  # {Linie: set(Teil-Nummern) | None}; None = ganze Linie belegt


def _merge(into: Claims, add: Claims) -> None:
    for k, v in add.items():
        if v is None or into.get(k, set()) is None:
            into[k] = None
        else:
            into[k] = set(into.get(k) or set()) | set(v)


def run_shards(run: dict, jobs: list[dict] | None, all_lanes: set[str]) -> tuple[Claims, bool]:
    """Welche Teile belegt ein aktiver Lead-Werk-Lauf? (Ansprüche, geklärt).
    Teile-Lauf (Titel mit „· Teile“, feste Aufteilung): sobald holen-Jobs existieren, genau deren aktive Teile; davor
    die Teile im Titel bzw. – ohne Liste – die ganzen Linien im Titel (ohne Linie: alle). Alter Lauf (Aufteilung
    i/n je Lauf): ganze Linien wie run_claim – seine Teile passen nicht zur festen Aufteilung."""
    title = run.get("display_title")
    new, idx = title_shards(title)
    if not new:
        lanes, ok = run_claim(run, jobs, all_lanes)
        return {k: None for k in lanes}, ok
    lanes = title_lanes(title)
    lanes = (lanes & all_lanes) if lanes is not None else set(all_lanes)
    holen = [j for j in (jobs or []) if job_part(j.get("name", ""))]
    if holen:
        out: Claims = {}
        for j in holen:
            if j.get("status") in ACTIVE_JOB:
                k, i = job_part(j["name"])
                out.setdefault(k, set()).add(i)
        return out, True
    plan = next((j for j in (jobs or []) if j.get("name") == "plan"), None)
    done = bool(plan and plan.get("status") == "completed")
    if idx:
        return {k: set(idx) for k in lanes}, True
    return {k: None for k in lanes}, done and jobs is not None


def shards_taken_by_others(self_id: int, runs: list[dict], jobs_of, all_lanes: set[str]) -> tuple[Claims, bool]:
    """Teile, die ANDERE aktive Läufe belegen (Plan-Job eines Laufs). Ältere Läufe gewinnen (ihre Ansprüche zählen
    immer), jüngere nur mit schon gestarteten holen-Jobs."""
    taken: Claims = {}
    clear = True
    for r in runs:
        rid = int(r.get("id") or 0)
        if rid == int(self_id) or r.get("status") not in ACTIVE_RUN:
            continue
        jobs = jobs_of(rid)
        if rid < int(self_id):
            c, ok = run_shards(r, jobs, all_lanes)
            clear = clear and ok
        else:
            new, _ = title_shards(r.get("display_title"))
            c = {}
            for j in jobs or []:
                p = job_part(j.get("name", ""))
                if p and j.get("status") in ACTIVE_JOB:
                    if new:
                        c.setdefault(p[0], set()).add(p[1])
                    else:
                        c[p[0]] = None
        _merge(taken, c)
    return taken, clear


def shard_last_used(recent: list[dict]) -> dict[tuple[str, int], str]:
    """{(Linie, Teil): letzte Startzeit} aus den Titeln der letzten Teile-Läufe (für die Reihum-Wahl)."""
    out: dict[tuple[str, int], str] = {}
    for r in recent or []:
        new, idx = title_shards(r.get("display_title"))
        t = str(r.get("created_at") or "")
        for k in (title_lanes(r.get("display_title")) or set()) if new else set():
            for i in idx:
                out[(k, i)] = max(out.get((k, i), ""), t)
    return out


def lanes_taken_by_others(self_id: int, runs: list[dict], jobs_of, all_lanes: set[str]) -> tuple[set[str], bool]:
    """Linien, die ein ANDERER aktiver Lauf belegt (für den Plan-Job eines Laufs). Ältere Läufe gewinnen: ihre
    Ansprüche (Titel, offener Plan) zählen immer; jüngere nur mit schon gestarteten Jobs. (belegt, alles geklärt)."""
    taken, clear = set(), True
    for r in runs:
        rid = int(r.get("id") or 0)
        if rid == int(self_id) or r.get("status") not in ACTIVE_RUN:
            continue
        jobs = jobs_of(rid)
        if rid < int(self_id):
            lanes, ok = run_claim(r, jobs, all_lanes)
            taken |= lanes
            clear = clear and ok
        else:
            taken |= {job_lane(j.get("name", "")) for j in (jobs or []) if j.get("status") in ACTIVE_JOB} - {None}
    return taken, clear


def busy_jobs(runs: list[dict], jobs_of) -> int:
    """Belegte Jobs: laufende und wartende Jobs aller aktiven Läufe des Repos."""
    n = 0
    for r in runs:
        if r.get("status") in ACTIVE_RUN:
            n += sum(1 for j in (jobs_of(int(r["id"])) or []) if j.get("status") in ACTIVE_JOB)
    return n


PAUSE_LEER_MIN = 60   # Linie ohne Ertrag (letzter Lauf < KURZ_MIN, 0 grün): frühestens nach 60 min wieder (wie früher je Welle)
KURZ_MIN = 15


def resting(s: dict | None, now) -> bool:
    """Kurz gelaufen ohne grüne Leads und vor weniger als PAUSE_LEER_MIN beendet -> noch nicht neu starten
    (sonst liefe eine erschöpfte Linie alle paar Minuten gegen dieselben Quellen)."""
    if not s or s.get("max_last") is None:
        return False
    return (float(s["max_last"]) < KURZ_MIN and not s.get("green_last")
            and W._hours_since(s.get("last_end"), now) * 60 < PAUSE_LEER_MIN)


NEUSTART_MIN = 20     # Linien-Lauf kürzer als 10 min (Absturz, Linie belegt): dieselbe Linie frühestens 20 min nach Start
KURZLAUF_MIN = 10


def _iso(x):
    try:
        return dt.datetime.fromisoformat(str(x).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def recently_short(lane: str, recent: list[dict], now) -> bool:
    """Lief diese Linie zuletzt als Linien-Lauf nur kurz (< KURZLAUF_MIN) und begann vor < NEUSTART_MIN? Dann nicht
    sofort wieder starten (keine Kette aus Fehlstarts – wie der Schutz im Job „weiter“)."""
    mine = [r for r in recent if lane in (title_lanes(r.get("display_title")) or set())]
    if not mine:
        return False
    r = max(mine, key=lambda x: str(x.get("created_at") or ""))
    st, en = _iso(r.get("run_started_at") or r.get("created_at")), _iso(r.get("updated_at"))
    if st is None or (now - st).total_seconds() / 60 >= NEUSTART_MIN:
        return False
    return r.get("status") == "completed" and en is not None and (en - st).total_seconds() / 60 < KURZLAUF_MIN


def fill_plan(reg: dict, res: dict, stats: dict, busy_lanes, busy: int,
              min_belegt: int = W.MIN_BELEGT, now=None, recent: list[dict] | None = None
              ) -> tuple[dict[str, int], dict[str, str]]:
    """Welche Linien jetzt mit wie vielen Teilen starten. res = werk_plan.decide(…) für das Lead-Werk.
    Alle eingeplanten Linien, die nicht laufen (Rang wie die Mindestbelegung, dann mehr Plätze zuerst); passt nicht
    alles unter total_slots - reserve, werden die letzten gekürzt. Linien, die eben kurz und ohne Ertrag liefen, ruhen
    PAUSE_LEER_MIN. Danach bis min_belegt auffüllen – nur die neu
    gestarteten Linien, nie über max, nie gesperrte/leere/erschöpfte/Nachrang-Linien, nie bei Speicher-Bremse."""
    claims: Claims = busy_lanes if isinstance(busy_lanes, dict) else {k: None for k in busy_lanes}
    cap = int(reg["total_slots"]) - int(reg["reserve"]) - busy
    lanes = {l["id"]: l for l in reg["lanes"] if l["werk"] == "lead-werk"}
    why = dict(res.get("reasons") or {})
    now = now or dt.datetime.now(dt.timezone.utc)
    plan = res.get("plan") or {}
    act = {k: len(claims[k]) for k in claims if claims[k] is not None}  # belegte Teile laufender Teile-Läufe
    free = {k: W.lane_k(lanes[k]) - act.get(k, 0) for k in lanes}
    cand = [k for k, v in plan.items() if v > 0 and k in lanes and claims.get(k, set()) is not None
            and free[k] > 0 and not resting(stats.get(k), now) and not recently_short(k, recent or [], now)]
    np_ = bool(res.get("nur_premium"))
    tier = lambda k: W._min_tier(lanes[k], stats.get(k), np_) or 9  # noqa: E731
    cand.sort(key=lambda k: (tier(k), -int(plan[k]), k))
    start: dict[str, int] = {}
    room = cap
    for k in cand:
        n = min(int(plan[k]) - act.get(k, 0), int(lanes[k]["max"]) - act.get(k, 0), free[k], room)
        if n > 0:
            start[k], room = n, room - n
        if room <= 0:
            break
    if cand and res.get("brake", "aus") not in ("drossel", "ohne-rohbestand", "stopp"):
        # Mindestbelegung: neue UND laufende Linien (freie Teile) auffüllen; Nachrang-Linien (Länder-Vorrang) erst
        # ganz zuletzt – die ertragreichste Linie ist der Puffer, nicht das Kunden-Werk
        tot = {k: act.get(k, 0) + start.get(k, 0) for k in cand}
        tot = {k: v for k, v in tot.items() if v > 0}
        mine = sum(act.get(k, 0) for k in tot)
        nach = set(res.get("nach") or ())
        W.fill_minimum([lanes[k] for k in tot], tot, why, stats, (res.get("autopilot") or {}).get("locks") or {},
                       cap + mine, busy - mine, min_belegt, set(), nach, nur_premium=np_)
        start = {k: tot[k] - act.get(k, 0) for k in tot if tot[k] - act.get(k, 0) > 0}
    return start, {k: why.get(k, "") for k in start}


# Weitere Werke (05.10.2026, Nacht 04:07 MESZ: nur 11 Jobs belegt, kunden/kontakt/pruefer lagen brach – GitHub löste
# ihre Crons nicht aus und der Nachfüller kannte nur Linien des Lead-Werks). Je Werk: (Werk, Linie, Workflow).
OTHER_WERKE = (("kunden-werk", "kunden", "kunden-werk.yml"), ("kontakt-werk", "kontakt", "kontakt-werk.yml"),
               ("pruefer-werk", "pruefer", "pruefer-werk.yml"))
TEILE_INPUT = {"kunden-werk"}  # Workflows mit Eingabe `teile` (Puffer für die Mindestbelegung)
BUFFER = "kunden-werk"        # Lead-Linien laufen nie doppelt (Aufteilung --shard je Lauf) -> Puffer = Kunden-Werk


def other_allowed(werk: str, settings: dict | None, pipeline_txt: str) -> tuple[bool, str]:
    """Darf der Nachfüller dieses Werk starten? Pause im Dashboard (nicht lesbar = nein); Kunden-Werk zusätzlich
    config/pipeline.yaml kunden_suche (ein Dispatch umgeht den Schalter im Workflow, darum hier)."""
    if settings is None:
        return False, "Pause-Schalter nicht lesbar – nicht gestartet"
    if (settings.get("werke_paused") or {}).get(werk):
        return False, "pausiert durch Inhaber"
    if werk == "kunden-werk" and not re.search(r"^kunden_suche:\s*true", pipeline_txt or "", re.M):
        return False, "Kunden-Suche aus (config/pipeline.yaml)"
    return True, ""


def other_plan(werke: list[dict], reg: dict, busy: int, lead_sum: int, min_belegt: int = W.MIN_BELEGT
               ) -> tuple[dict[str, int], dict[str, str]]:
    """Welche weiteren Werke jetzt starten. werke = [{werk, lane, plan, active, ok, why}] (plan = Plätze laut
    werk_plan.decide). Gestartet wird ein Werk nur, wenn erlaubt, kein Lauf aktiv/wartend und plan > 0; nie über
    total_slots - reserve. Liegt die Belegung danach unter min_belegt, bekommt der Puffer (Kunden-Werk, nur wenn er
    ohnehin startet) zusätzliche Teile bis max seiner Linie. Rückgabe ({Werk: Teile}, {Werk: Grund})."""
    lanes = {l["id"]: l for l in reg["lanes"]}
    room = int(reg["total_slots"]) - int(reg["reserve"]) - busy - lead_sum
    start, why = {}, {}
    for w in werke:
        k, n = w["werk"], int(w.get("plan") or 0)
        if not w.get("ok"):
            why[k] = w.get("why") or "nicht erlaubt"
        elif w.get("active"):
            why[k] = "läuft schon oder wartet"
        elif n <= 0:
            why[k] = "0 Plätze im Plan"
        elif room <= 0:
            why[k] = "keine freien Plätze"
        else:
            n = min(n, int(lanes[w["lane"]]["max"]), room)
            start[k], room, why[k] = n, room - n, f"lag brach – {n} Teile laut Plan"
    short = min_belegt - busy - lead_sum - sum(start.values())
    if short > 0 and BUFFER in start:
        lane = next(w["lane"] for w in werke if w["werk"] == BUFFER)
        add = max(0, min(short, int(lanes[lane]["max"]) - start[BUFFER], room))
        if add:
            start[BUFFER] += add
            why[BUFFER] += f" +{add} {W.MIN_WHY}"
    return start, why


def parse_teile(s: str | None) -> dict[str, int]:
    """„web-us:3,s2-ukfr:6“ -> {Linie: Teile}; ungültige Einträge fallen weg."""
    out: dict[str, int] = {}
    for part in (s or "").split(","):
        m = re.fullmatch(r"\s*([a-z0-9\-]+)\s*:\s*(\d+)\s*", part)
        if m:
            out[m.group(1)] = int(m.group(2))
    return out


# ---------------------------------------------------------------------------------------------- GitHub
class GitHub:
    def __init__(self, repo: str | None = None, token: str | None = None):
        import requests
        self.s = requests.Session()
        self.repo = repo or os.environ["GITHUB_REPOSITORY"]
        tok = token or os.environ.get("GH_TOKEN") or os.environ["GITHUB_TOKEN"]
        self.s.headers.update({"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"})
        self._jobs: dict[int, list[dict]] = {}

    def _get(self, path: str, params: dict | None = None) -> dict:
        last = None
        for i in range(3):  # GitHub antwortet unter Last gelegentlich 5xx
            try:
                r = self.s.get(f"https://api.github.com/repos/{self.repo}/{path}", params=params, timeout=30)
                if r.status_code < 500:
                    r.raise_for_status()
                    return r.json()
                last = RuntimeError(f"GitHub {r.status_code}")
            except Exception as e:  # noqa: BLE001
                last = e
            time.sleep(5 * (i + 1))
        raise last  # type: ignore[misc]

    def active_runs(self, workflow: str | None = None) -> list[dict]:
        base = f"actions/workflows/{workflow}/runs" if workflow else "actions/runs"
        out, seen = [], set()
        for st in ("in_progress", "queued", "waiting", "requested", "pending"):
            for r in self._get(base, {"status": st, "per_page": 100}).get("workflow_runs", []):
                if r["id"] not in seen:
                    seen.add(r["id"])
                    out.append(r)
        return out

    def jobs(self, run_id: int, fresh: bool = False) -> list[dict]:
        if fresh or run_id not in self._jobs:
            js: list[dict] = []
            for page in range(1, 4):
                got = self._get(f"actions/runs/{run_id}/jobs", {"per_page": 100, "filter": "latest", "page": page})
                js += got.get("jobs", [])
                if len(js) >= int(got.get("total_count", 0)):
                    break
            self._jobs[run_id] = js
        return self._jobs[run_id]

    def recent_runs(self, n: int = 50) -> list[dict]:
        return self._get(f"actions/workflows/{LEAD_WF}/runs", {"per_page": n}).get("workflow_runs", [])

    def dispatch(self, workflow: str, inputs: dict, ref: str = "main") -> None:
        r = self.s.post(f"https://api.github.com/repos/{self.repo}/actions/workflows/{workflow}/dispatches",
                        json={"ref": ref, "inputs": inputs}, timeout=30)
        if r.status_code >= 300:
            raise RuntimeError(f"GitHub {r.status_code} {r.text[:200]}")


def wait_for_claims(gh: GitHub, self_id: int, all_lanes: set[str], wait_s: int = 150) -> tuple[set[str], bool]:
    """Plan-Job: Linien anderer Läufe; wartet bis zu wait_s, bis ältere Läufe ihren Plan gemacht haben."""
    deadline = time.time() + wait_s
    while True:
        runs = gh.active_runs(LEAD_WF)
        taken, clear = lanes_taken_by_others(self_id, runs, lambda rid: gh.jobs(rid, fresh=True), all_lanes)
        if clear or time.time() >= deadline:
            return taken, clear
        time.sleep(15)


def wait_for_shard_claims(gh: GitHub, self_id: int, all_lanes: set[str], wait_s: int = 150) -> tuple[Claims, bool]:
    """Plan-Job: Teile anderer Läufe; wartet bis zu wait_s, bis ältere Läufe ihre Teile kennen."""
    deadline = time.time() + wait_s
    while True:
        runs = gh.active_runs(LEAD_WF)
        taken, clear = shards_taken_by_others(self_id, runs, lambda rid: gh.jobs(rid, fresh=True), all_lanes)
        if clear or time.time() >= deadline:
            return taken, clear
        time.sleep(15)


def choose_shards(reg: dict, start: dict[str, int], claims: Claims, recent: list[dict]) -> dict[str, list[int]]:
    """Teil-Nummern für die Teile-Läufe des Nachfüllers: freie Teile, die am längsten nicht liefen."""
    return W.pick_shards(reg, start, claims, None, shard_last_used(recent))


# ---------------------------------------------------------------------------------------------- Ablauf
def lead_allowed(settings: dict | None) -> tuple[bool, str]:
    txt = (ROOT / "config" / "pipeline.yaml").read_text(encoding="utf-8")
    if not re.search(r"^lead_suche:\s*true", txt, re.M):
        return False, "Lead-Suche aus (config/pipeline.yaml)"
    if settings is None:
        return False, "Pause-Schalter nicht lesbar – nichts gestartet"
    if (settings.get("werke_paused") or {}).get("lead-werk"):
        return False, "Lead-Werk pausiert durch Inhaber"
    return True, ""


def read_pause(db) -> dict | None:
    if db is None:
        return None
    try:
        rows = db.select("owner_settings", {"select": "key,value", "key": "eq.werke_paused"}) or []
    except BaseException as e:  # noqa: BLE001
        print(f"Pause-Schalter nicht lesbar ({type(e).__name__})", file=sys.stderr)
        return None
    v = next((r.get("value") for r in rows if r.get("key") == "werke_paused"), None)
    return {"werke_paused": v if isinstance(v, dict) else {}}


def cmd_zaehlen(gh: GitHub) -> int:
    runs = gh.active_runs()
    n = busy_jobs(runs, gh.jobs)
    by: dict[str, int] = {}
    for r in runs:
        k = sum(1 for j in gh.jobs(int(r["id"])) if j.get("status") in ACTIVE_JOB)
        if k:
            by[r.get("name", "?")] = by.get(r.get("name", "?"), 0) + k
    print(f"belegt {n} Jobs – " + ", ".join(f"{k} {v}" for k, v in sorted(by.items())))
    return n


def cmd_nachfuellen(gh: GitHub, apply: bool, ref: str = "main") -> int:
    reg = W.load_lines()
    inp = W.read_inputs("lead-werk")
    ok, why = lead_allowed(read_pause(inp.get("db")))
    runs = gh.active_runs()
    busy = busy_jobs(runs, gh.jobs)
    if not ok:
        print(f"belegt {busy} – {why}")
        fill_others(gh, reg, runs, busy, 0, apply, ref)  # Lead-Werk aus: die anderen Werke trotzdem nachfüllen
        return 0
    res = W.decide(reg, "lead-werk", inp)
    all_lanes = {l["id"] for l in reg["lanes"] if l["werk"] == "lead-werk"}
    claims: Claims = {}
    for r in runs:
        if r.get("path", "").endswith(LEAD_WF) or r.get("name") == "lead-werk":
            c, _ = run_shards(r, gh.jobs(int(r["id"])), all_lanes)
            _merge(claims, c)
    recent = gh.recent_runs()
    start, reasons = fill_plan(reg, res, res.get("stats") or {}, claims, busy, recent=recent)
    shards = choose_shards(reg, start, claims, recent)
    start = {k: len(v) for k, v in shards.items()}
    lauf = ", ".join(f"{k} {'ganz' if v is None else len(v)}" for k, v in sorted(claims.items()) if v is None or v)
    print(f"belegt {busy} Jobs, Linien laufen: {lauf or '–'} (Bremse {res['brake']})")
    if not start:
        print("nichts nachzufüllen")
    for k, idx in shards.items():
        print(f"  starte {k}: Teile {','.join(map(str, idx))} von {W.lane_k(next(l for l in reg['lanes'] if l['id'] == k))}"
              f" – {reasons.get(k, '')}")
        if apply:
            try:
                gh.dispatch(LEAD_WF, {"linien": k, "teile": f"{k}:{len(idx)}", "shards": ",".join(map(str, idx))},
                            ref=ref)
            except Exception as e:  # noqa: BLE001
                print(f"  Start {k} fehlgeschlagen: {e}")
    ostart = fill_others(gh, reg, runs, busy, sum(start.values()), apply, ref)
    summ = os.environ.get("GITHUB_STEP_SUMMARY")
    if summ:
        with open(summ, "a", encoding="utf-8") as f:
            f.write(f"Nachfüller: belegt {busy}, gestartet " +
                    (", ".join(f"{k} {n}" for k, n in {**start, **ostart}.items()) or "nichts") + "\n")
    return 0


def fill_others(gh: GitHub, reg: dict, runs: list[dict], busy: int, lead_sum: int, apply: bool,
                ref: str = "main") -> dict[str, int]:
    """Kunden-, Kontakt- und Prüfer-Werk starten, wenn sie brach liegen (Plätze im Plan, keine Pause). Fehler
    beim Lesen eines Werks = dieses Werk nicht starten."""
    txt = (ROOT / "config" / "pipeline.yaml").read_text(encoding="utf-8")
    werke = []
    for werk, lane, wf in OTHER_WERKE:
        w = {"werk": werk, "lane": lane, "wf": wf, "plan": 0, "active": True, "ok": False}
        try:
            inp = W.read_inputs(werk)
            w["ok"], w["why"] = other_allowed(werk, read_pause(inp.get("db")), txt)
            w["plan"] = int(W.decide(reg, werk, inp)["plan"].get(lane, 0))
            w["active"] = any(r.get("status") in ACTIVE_RUN and
                              (r.get("path", "").endswith(wf) or r.get("name") == werk) for r in runs)
        except Exception as e:  # noqa: BLE001
            w["ok"], w["why"] = False, f"nicht lesbar ({type(e).__name__})"
        werke.append(w)
    start, why = other_plan(werke, reg, busy, lead_sum)
    for w in werke:
        k = w["werk"]
        print(f"  {k}: {'starte ' + str(start[k]) + ' Teile – ' if k in start else ''}{why.get(k, '')}")
        if apply and k in start:
            try:
                gh.dispatch(w["wf"], {"teile": f"{w['lane']}:{start[k]}"} if k in TEILE_INPUT else {}, ref=ref)
            except Exception as e:  # noqa: BLE001
                print(f"  Start {k} fehlgeschlagen: {e}")
    return start


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("befehl", choices=["zaehlen", "nachfuellen"])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--ref", default=os.environ.get("GITHUB_REF_NAME") or "main")
    a = ap.parse_args(argv)
    gh = GitHub()
    if a.befehl == "zaehlen":
        cmd_zaehlen(gh)
        return 0
    return cmd_nachfuellen(gh, a.apply, a.ref)


if __name__ == "__main__":
    raise SystemExit(main())
