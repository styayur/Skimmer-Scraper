"""Verify the published input and asset commitment for a sealed holdout."""
import hashlib
import json


def read_sealed_holdout(path, commitment_path, matrix):
    commitment = json.loads(commitment_path.read_bytes())
    frozen = json.loads(path.read_bytes())
    canonical = (json.dumps(frozen, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    if hashlib.sha256(canonical).hexdigest() != commitment["sha256"]:
        raise ValueError("Holdout differs from the published commitment")
    rows = frozen["cases"]
    used = {row[1] for key in ("baselines", "pairedProbes", "development", "holdout") for row in matrix[key]}
    assets = {}
    if commitment["format"] == "skimmer-holdout-commitment-2":
        previous = json.loads((commitment_path.parent / "second-holdout.json").read_bytes())
        used.update(row[1] for row in previous["cases"])
        assets = {row[1]: asset for row, asset in zip(rows, frozen["assets"], strict=True)}
    seeds = {row[1] for row in rows}
    if (frozen["columns"] != matrix["columns"] or frozen["ruleRevision"] != 2
            or frozen["producerCommit"] != commitment["producerCommit"] or frozen["producerCommit"] != matrix["producerRevisions"][2]
            or len(rows) != commitment["cases"] or len(seeds) != len(rows) or seeds & used):
        raise ValueError("Holdout does not match the frozen input contract")
    return rows, assets
