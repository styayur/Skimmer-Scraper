"""Independently check the raw hosted observations, without running the game."""

import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent / "results"
SOURCE = "c4bc8eac5425197ebb08c937316de415e75b89b1"
CATALOG = "02d807f0ae74a011c45043d0fa0144260c5e36236c2d1695b912e839f9d9dabd"
CELLS = ["-10:-7", "11:-8", "9:10", "-12:9"]
ORDERS = {"forward": CELLS, "reverse": CELLS[::-1]}
DIGESTS = ["collisionSha256", "positionSha256", "indexSha256"]
EQUAL = [
    "id", "worldFingerprint", "chunkFingerprint", "revision", "layout", "origin",
    "positionBytes", "indexBytes", "positionType", "indexType", "triangles", *DIGESTS,
]


def verify_receipt(receipt, seed, mode):
    assert receipt["status"] == "passed" and receipt["failures"] == []
    assert receipt["source"] == receipt["build"]["sourceCommit"] == SOURCE
    assert receipt["catalog"] == receipt["sourceFiles"]["src/world/kinetic/kinetic-flight-modules.r2.json"] == CATALOG
    assert receipt["build"]["dirty"] is False
    assert receipt["seed"] == seed and receipt["mode"] == mode
    assert receipt["park"] == {"x": 96, "z": -96}
    assert [f"{c['x']}:{c['z']}" for c in receipt["cells"]] == CELLS
    measured, all_trips, pair_count, cross_count = [], [], 0, 0
    for name, order in ORDERS.items():
        tour = receipt["orders"][name]
        assert tour["initial"]["seed"] == seed and tour["initial"]["mode"] == mode
        assert not tour["browserErrors"] and any("cityChunk.worker-" in u for u in tour["workers"])
        assert [x["requested"] for x in tour["warm"]] == CELLS
        assert [x["requested"] for x in tour["before"]] == order
        assert [x["requested"] for x in tour["after"]] == order[::-1]
        measured.extend(tour["before"] + tour["after"])
        prior = {}
        leases = set()
        for row in tour["warm"] + tour["alignment"] + tour["before"] + tour["after"]:
            all_trips.append(row)
            active, gone, cell = row["active"], row["evicted"], row["requested"]
            socket = active["socket"]
            assert active["cell"] == gone["cell"] == cell
            assert active["id"] == active["contact"]["chunkId"] == gone["id"] == f"chunk:{cell}:r{active['revision']}"
            assert active["publicState"]["fingerprint"] == active["chunkFingerprint"]
            assert active["publicState"]["state"] == "ACTIVE"
            assert active["publicState"]["revision"] == active["revision"]
            assert active["positionType"] == "Float32Array" and active["positionBytes"] % 12 == 0
            assert active["indexBytes"] == active["triangles"] * 3 * {"Uint16Array": 2, "Uint32Array": 4}[active["indexType"]]
            assert min(active["triangles"], active["positionBytes"]) > 0 and active["workerBuildMs"] >= 0
            assert all(re.fullmatch("[0-9a-f]{64}", active[k]) for k in DIGESTS)
            assert all(not gone[k] for k in ("managed", "indexed", "socketStillExposed", "leaseStillExposed"))
            assert gone["retiredTotal"] > active["retiredTotal"] and gone["disposedGeometryCount"] > active["disposedGeometryCount"]
            assert active["renderOrigin"] != gone["renderOrigin"]
            assert active["cap"] == gone["cap"] == 41
            for record in (active, gone):
                assert 0 < record["active"] == record["bvhs"] <= record["cap"]
            assert socket["lease"] == gone["oldLease"] and socket["lease"] not in leases
            leases.add(socket["lease"])
            x, z = cell.split(":")
            assert socket["id"] == f"kinetic-grid-1-r2.{seed}.N.{x}.{z}"
            assert active["contact"]["logicalSurfaceId"] == f"kinetic-grid-1-r2.{seed}.spine.{x}"
            if mode == "ephemeral":
                assert active["history"]["revision"] == active["revision"]
                assert gone["history"]["revision"] == active["revision"] + 1
                assert gone["history"]["retireCount"] == active["history"]["retireCount"] + 1
                assert 0 < gone["historySize"] <= gone["historyCap"] == 256
            else:
                assert active["revision"] == 0 and active["history"] is None and gone["history"] is None
            if cell in prior:
                old = prior[cell]
                expect = old["evicted"]["history"]["revision"] if mode == "ephemeral" else 0
                assert active["revision"] == expect and active["geometryUuid"] != old["active"]["geometryUuid"]
                assert all((active[k] == old["active"][k]) == (mode == "stable")
                           for k in ("id", "chunkFingerprint", "collisionSha256"))
            prior[cell] = row

        for before in tour["before"]:
            after = next(row for row in tour["after"] if row["requested"] == before["requested"])
            a, b = before["active"], after["active"]
            assert all((a[k] == b[k]) == (mode == "stable") for k in ("id", "chunkFingerprint", "collisionSha256"))
            assert a["worldFingerprint"] == b["worldFingerprint"]
            assert a["socket"]["id"] == b["socket"]["id"] and a["socket"]["position"] == b["socket"]["position"]
            assert a["socket"]["lease"] != b["socket"]["lease"] and a["geometryUuid"] != b["geometryUuid"]
            pair_count += 1
    for phase in ("before", "after"):
        by_order = [{
            row["requested"]: row["active"] for row in receipt["orders"][name][phase]
        } for name in ORDERS]
        for cell in CELLS:
            a, b = (order[cell] for order in by_order)
            assert all(a[k] == b[k] for k in EQUAL), (seed, mode, cell, phase)
            assert a["socket"]["id"] == b["socket"]["id"] and a["socket"]["position"] == b["socket"]["position"]
            cross_count += 1
    assert len(measured) == 16 and pair_count == cross_count == 8
    return {
        "seed": seed, "mode": mode, "measured": len(measured), "actualEvictions": len(all_trips),
        "reloadPairs": pair_count, "crossOrderPairs": cross_count,
        "peakSampledResident": max(r[k]["active"] for r in all_trips for k in ("active", "evicted")),
        "checksOnRunner": receipt["checks"],
    }


if __name__ == "__main__":
    manifest = json.loads((ROOT.parent / "hosted-artifacts.json").read_bytes())
    assert manifest["source"] == SOURCE and manifest["sourceVerifiedByGitHub"]
    files = {Path(row["file"]).name: row for row in manifest["receipts"]}
    assert len(files) == 6
    scripts = None
    for seed in (17, 334458, 4294967295):
        for mode in ("stable", "ephemeral"):
            name = f"{seed}-{mode}.json"
            raw = (ROOT / name).read_bytes()
            archived = files[name]
            assert archived["bytes"] == len(raw) and archived["sha256"] == hashlib.sha256(raw).hexdigest()
            assert archived["conclusion"] == "success"
            receipt = json.loads(raw)
            assert receipt["observer"] == manifest["observer"] and receipt["gitTree"] == manifest["tree"]
            assert manifest["workflow"].endswith("/" + receipt["workflowRun"])
            assert receipt["workflowAttempt"] == str(manifest["attempt"])
            assert scripts is None or receipt["servedScripts"] == scripts
            scripts = receipt["servedScripts"]
            summary = verify_receipt(receipt, seed, mode)
            print(json.dumps({**summary, "receiptSha256": archived["sha256"]}))
