"""Recompute frozen geometry and report platform rounding on derived floating-point values."""
import json
import math
from pathlib import Path

from geometry import HERE, PLAN, inspect

TOLERANCE_M = 5e-12


def verify(expected, observed, path, differences):
    if isinstance(expected, dict):
        assert isinstance(observed,dict) and expected.keys() == observed.keys(), path
        for key in expected:
            verify(expected[key],observed[key],f"{path}.{key}",differences)
    elif isinstance(expected, list):
        assert isinstance(observed,list) and len(expected) == len(observed), path
        for i,(a,b) in enumerate(zip(expected,observed,strict=True)):
            verify(a,b,f"{path}[{i}]",differences)
    elif isinstance(expected, float) and isinstance(observed, float) and expected != observed:
        delta = abs(expected-observed)
        differences.append(dict(path=path,registered=expected,observed=observed,absoluteDelta=delta))
        assert math.isfinite(delta) and delta <= TOLERANCE_M, (path,expected,observed)
    else:
        assert expected == observed and type(expected) is type(observed), (path,expected,observed)


if __name__ == "__main__":
    old = json.loads((HERE/"geometry.json").read_bytes())
    new = [inspect(c) for c in PLAN["cases"]]
    differences = []
    try:
        verify(old,new,"geometry",differences)
    finally:
        result = {"absoluteToleranceForDerivedFloats":TOLERANCE_M,"differences":differences,
                  "maxAbsoluteDelta":max((d["absoluteDelta"] for d in differences),default=0)}
        Path("preflight-float-check.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
        print(f'{len(differences)} different derived floats, largest delta {result["maxAbsoluteDelta"]:.17g}')
