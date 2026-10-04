"""Baukasten-Chat: flow_edit.py prüft wie der Baukasten, speichert Test-/Agenten-Flows direkt, Master und angeschlossene
Flows nur als Vorschlag (Inhaber 04.10.2026). Dazu Gleichstand flow_check.py ↔ app/lib/flow.ts."""
import copy
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import flow_edit as FE  # noqa: E402
from fakedb import FakeDB  # noqa: E402
from lib import flow_check as C  # noqa: E402

FX = json.loads((ROOT / "tests" / "fixtures" / "flow_check_cases.json").read_text(encoding="utf-8"))
Q = {"id": "q", "x": 0, "y": 0, "kind": "quelle", "source": "leads", "segment": "S2", "countries": ["US"], "status": ["new"], "size": 1000}
GOOD = {"v": 1, "nodes": [Q, {"id": "f", "x": 200, "y": 0, "kind": "filter", "mode": "alle", "conds": [{"f": "hat_telefon", "op": "ja"}]},
                          {"id": "p", "x": 400, "y": 0, "kind": "pipeline", "name": "Mit Telefon"}],
        "edges": [{"id": "e1", "from": "q", "port": "out", "to": "f"}, {"id": "e2", "from": "f", "port": "out", "to": "p"}]}
OLD = {"v": 1, "nodes": [Q], "edges": []}


def fdb(**over):
    rows = [
        {"id": "t1", "name": "US Test", "kind": "test", "status": "entwurf", "def": OLD, "updated_at": "v1"},
        {"id": "t2", "name": "In Pipeline", "kind": "test", "status": "aktiv", "def": GOOD, "updated_at": "v1"},
        {"id": "m1", "name": "Master-Pipeline", "kind": "master", "status": "aktiv", "def": OLD, "updated_at": "v1"},
        {"id": "a1", "name": "Agent", "kind": "agent", "status": "entwurf", "def": OLD, "updated_at": "v1"},
        {"id": "x1", "name": "Alt", "kind": "test", "status": "archiv", "def": OLD, "updated_at": "v1"},
    ]
    for r in rows:
        r.update(over.get(r["id"], {}))
    return FakeDB({"flows": rows, "owner_log": []})


class CheckParityTest(unittest.TestCase):
    """Gleiche Fehler mit gleichem Wortlaut wie parseFlow/problems in TypeScript (app/lib/flow-check.test.ts)."""

    def test_labels(self):
        self.assertEqual(C.FIELD_LABELS, FX["field_labels"])
        self.assertEqual({k: v[0] for k, v in C.NODE_META.items()}, FX["node_labels"])
        self.assertEqual(set(C.FIELD_LABELS), set(C.FIELDS))

    def test_cases(self):
        for c in FX["cases"]:
            flow, errs = C.parse_flow(copy.deepcopy(c["flow"]))
            self.assertEqual(None if flow else errs, c["parse_errors"], c["name"])
            got = None
            if flow:
                got = [{"nodeId": p["nodeId"], "msg": p["msg"].replace(f"Agent 1 bis {C.AGENT_COUNT}", "Agent 1 bis {AGENT_COUNT}"),
                        "level": p["level"]} for p in C.problems(flow, c["kind"])]
            self.assertEqual(got, c["problems"], c["name"])

    def test_agent_count_from_ts(self):
        src = (ROOT / "app" / "lib" / "agents.ts").read_text(encoding="utf-8")
        self.assertIn(f"export const AGENT_COUNT = {C.AGENT_COUNT};", src)


class ApplyTest(unittest.TestCase):
    def test_test_flow_saved_directly_with_log(self):
        db = fdb()
        res = FE.apply(db, "t1", GOOD, "Filter Telefon ergänzt")
        self.assertEqual(res["modus"], "gespeichert")
        row = db.rows("flows")[0]
        self.assertEqual(row["def"]["nodes"][1]["conds"], [{"f": "hat_telefon", "op": "ja"}])
        self.assertEqual(row["status"], "entwurf")  # nie eigenständig aktivieren
        log = db.rows("owner_log")[0]
        self.assertEqual((log["action"], log["created_by"], log["new_value"]["notiz"]), ("flow:chat", "JARVIS-Chat", "Filter Telefon ergänzt"))

    def test_agent_flow_saved_directly(self):
        db = fdb()
        flow = copy.deepcopy(OLD)
        flow["nodes"].append({"id": "m", "x": 200, "y": 0, "kind": "melden"})
        flow["edges"].append({"id": "e1", "from": "q", "port": "out", "to": "m"})
        self.assertEqual(FE.apply(db, "a1", flow)["modus"], "gespeichert")
        self.assertEqual(len(db.rows("flows")[3]["def"]["nodes"]), 2)

    def test_master_only_proposal(self):
        db = fdb()
        res = FE.apply(db, "m1", GOOD, "Telefon-Pflicht")
        self.assertEqual(res["modus"], "vorschlag")
        row = db.rows("flows")[2]
        self.assertEqual(row["def"], OLD)  # gilt weiter unverändert
        self.assertEqual(row["pending_def"]["nodes"][2]["kind"], "pipeline")
        self.assertEqual(row["pending_note"], "Telefon-Pflicht")
        self.assertEqual(db.rows("owner_log")[0]["action"], "master:chat-vorschlag")

    def test_active_test_flow_only_proposal_and_keeps_pipeline(self):
        db = fdb()
        changed = copy.deepcopy(GOOD)
        changed["nodes"][1]["conds"] = [{"f": "hat_email", "op": "ja"}]
        self.assertEqual(FE.apply(db, "t2", changed)["modus"], "vorschlag")
        self.assertEqual(db.rows("flows")[1]["def"], GOOD)
        no_pipe = {"v": 1, "nodes": [Q, GOOD["nodes"][1]], "edges": [GOOD["edges"][0]]}
        with self.assertRaisesRegex(FE.EditError, "Pipeline-Baustein muss bleiben"):
            FE.apply(db, "t2", no_pipe)

    def test_invalid_graph_rejected_with_reason(self):
        db = fdb()
        bad = copy.deepcopy(GOOD)
        bad["nodes"][1]["conds"] = [{"f": "status", "op": "ist", "v": "new"}]  # Status nicht auf dem Weg zur Pipeline
        with self.assertRaisesRegex(FE.EditError, "„Status“ darf nicht auf dem Weg zur Pipeline stehen"):
            FE.apply(db, "t1", bad)
        with self.assertRaisesRegex(FE.EditError, "Flow ungültig: Baustein 2: Art unbekannt"):
            FE.apply(db, "t1", {"v": 1, "nodes": [Q, {"id": "z", "x": 0, "y": 0, "kind": "zauber"}], "edges": []})
        with self.assertRaisesRegex(FE.EditError, "Master-Pipeline gilt nur für Leads"):
            FE.apply(db, "m1", {"v": 1, "nodes": [{**Q, "source": "kaeufer", "status": ["ok"]}], "edges": []})
        with self.assertRaisesRegex(FE.EditError, "archiviert"):
            FE.apply(db, "x1", GOOD)
        with self.assertRaisesRegex(FE.EditError, "unbekannt"):
            FE.apply(db, "nix", GOOD)
        self.assertEqual(db.rows("flows")[0]["def"], OLD)
        self.assertEqual(db.rows("owner_log"), [])

    def test_conflict_when_owner_saved_meanwhile(self):
        db = fdb()
        with self.assertRaises(FE.Conflict):
            FE.apply(db, "t1", GOOD, version="v0")
        self.assertEqual(db.rows("flows")[0]["def"], OLD)

    def test_unchanged_writes_nothing(self):
        db = fdb()
        self.assertEqual(FE.apply(db, "t2", GOOD)["modus"], "unveraendert")
        self.assertEqual(db.updates, [])


class MainTest(unittest.TestCase):
    def test_cli(self):
        db = fdb()
        with tempfile.TemporaryDirectory() as d, mock.patch.object(FE, "DB", return_value=db), \
                mock.patch("sys.stdout", new_callable=io.StringIO) as out:
            good, bad = Path(d) / "g.json", Path(d) / "b.json"
            good.write_text(json.dumps(GOOD), encoding="utf-8")
            bad.write_text("{kein json", encoding="utf-8")
            self.assertEqual(FE.main(["show", "t1"]), 0)
            shown = json.loads(out.getvalue())
            self.assertEqual((shown["kind"], shown["gilt_fuer_neue_leads"]), ("test", False))
            self.assertEqual(FE.main(["apply", "t1", str(bad)]), 2)
            self.assertEqual(FE.main(["apply", "t1", str(good), "--version", "alt"]), 3)
            self.assertEqual(FE.main(["apply", "t1", str(good), "--notiz", "Telefon"]), 0)
            self.assertEqual(FE.main(["show", "nix"]), 2)
            self.assertEqual(FE.main(["kaputt"]), 1)
        self.assertIn("abgelehnt – kein JSON", out.getvalue())

    def test_probe_counts(self):
        db = fdb()
        rows = [{"id": "r1", "hat_telefon": True}, {"id": "r2", "hat_telefon": False}]
        db.rpc_handlers["flow_lead_rows"] = lambda args, params: rows if params.get("offset") == "0" else []
        res = FE.probe(db, db.rows("flows")[0], GOOD)
        self.assertEqual(res["stichprobe"], 2)
        f = next(b for b in res["bausteine"] if b["id"] == "f")
        self.assertEqual((f["ein"], f["aus"], f["art"]), (2, 1, "Filter"))


if __name__ == "__main__":
    unittest.main()
