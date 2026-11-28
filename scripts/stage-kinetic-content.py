"""Stage versioned content with the product's packager and exercise the pinned partner catalog."""
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
from zipfile import ZipFile

repo = "styayur/Skimmer-Scraper"
source = os.environ["SOURCE"]
product = Path("product").resolve()
out = Path("receipts")
out.mkdir(exist_ok=True)


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream,"sha256").hexdigest()


def save(path,data):
    path.write_text(json.dumps(data,indent=2)+"\n",encoding="utf-8")


def api(path):
    return json.loads(subprocess.check_output(["gh","api",f"repos/{repo}/{path}"]))


def wait_stage():
    run_id = os.environ["ASSEMBLY_RUN"]
    name = "assembly-prepared-"+source[:7]
    while True:
        run=api(f"actions/runs/{run_id}")
        assert run["head_sha"]==os.environ["ASSEMBLY_RUNNER"] and run["path"]==".github/workflows/kinetic-assembly-ci.yml"
        results=[a for a in api(f"actions/runs/{run_id}/artifacts?per_page=100")["artifacts"] if a["name"]==name]
        if results:
            [a]=results
            assert not a["expired"]
            save(out/"prepared-workflow.json",dict(sourceCommit=source,run=int(run_id),artifactId=a["id"],
                                                    bytes=a["size_in_bytes"],sha256=a["digest"].removeprefix("sha256:")))
            return
        if run["status"]=="completed":
            raise ValueError("The preparation ended without the required artifact")
        time.sleep(35)


def catalog():
    site=Path("site").resolve()
    seal=out/"served-files.json"
    subprocess.run(["node",product/"scripts/qualification/dist-manifest.mjs","--record",site,source,seal],check=True)
    assert json.loads(seal.read_bytes())["treeSha256"]==os.environ["SITE_TREE"]
    handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(site))
    with http.server.ThreadingHTTPServer(("127.0.0.1",0),handler) as server:
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            subprocess.run([sys.executable,product/"scripts/check-partner-catalog.py",
                           f"http://127.0.0.1:{server.server_port}",out/"catalog"],check=True)
        finally:
            server.shutdown()
            thread.join()
    report=json.loads((out/"catalog/catalog.json").read_bytes())
    assert report["build"]==json.loads((site/"build-info.json").read_bytes())


def content():
    stage=Path("stage")
    prep=json.loads((stage/"preparation.json").read_bytes())
    manifest=json.loads((stage/"prepared/release-manifest.json").read_bytes())
    assert prep["sourceCommit"]==manifest["sourceCommit"]==source
    assert sha(stage/"prepared/release-manifest.json")==prep["manifestSha256"]
    high=Path("high")
    high.mkdir()
    original_name="skimmer-scraper-v0.10.0-dragonspine-high.zip"
    high_asset=api("releases/assets/801412869")
    digest="c9542cf5d7791552a90a87f4510b164b82d85f078ef5c861d4d9b513e08176f9"
    assert high_asset["name"]==original_name and high_asset["digest"]=="sha256:"+digest
    subprocess.run(["gh","release","download","v0.10.0","--repo",repo,"--pattern",original_name],check=True)
    original=Path(original_name)
    assert sha(original)==digest
    with ZipFile(original) as archive:
        data=archive.read("world-pack.json")
        pack=json.loads(data)
        (high/"world-pack.json").write_bytes(data)
        for row in pack["files"]:
            name=row["name"]
            assert Path(name).name==name
            with archive.open(name) as src,(high/name).open("xb") as dst:
                shutil.copyfileobj(src,dst)
    forge=Path("forge").resolve()
    subprocess.run(["node",product/"scripts/export-worldforge.mjs","amber",forge,"2"],cwd=product,check=True)
    target=Path("content-build")
    target.mkdir()
    shutil.copyfile(stage/"prepared/release-manifest.json",target/"release-manifest.json")
    for a in manifest["assets"][:2]:
        os.link(stage/"prepared"/a["name"],target/a["name"])
    nsis=next(a for a in manifest["assets"] if a.get("kind")=="windows-nsis")
    subprocess.run([sys.executable,product/"scripts/assemble-dual-release.py",target,stage/"prepared"/nsis["name"],
                    high,stage/"installed","--forge-directory",forge],check=True)
    recorded=json.loads((target/"release-manifest.json").read_bytes())
    selected=[a for a in recorded["assets"] if a.get("kind") in ("world-pack","worldforge-kit","character-radio")]
    assert len(selected)==3
    output=Path("content")
    output.mkdir()
    for a in selected:
        file=target/a["name"]
        assert sha(file)==a["sha256"] and file.stat().st_size==a["bytes"]
        file.rename(output/a["name"])
    save(out/"content-staging.json",dict(sourceCommit=source,version=prep["version"],preparation=prep["manifestSha256"],
         priorHighAsset={"id":high_asset["id"],"sha256":digest},worldPackManifestSha256=sha(high/"world-pack.json"),
         tiles=len(pack["files"]),forgeManifestSha256=sha(forge/"manifest.json"),bakedSha256=sha(forge/"world.glb"),
         assets=selected))
    shutil.copyfile(forge/"manifest.json",out/"forge-manifest.json")
    shutil.copyfile(high/"world-pack.json",out/"high-manifest.json")


{"catalog":catalog,"wait-stage":wait_stage,"content":content}[sys.argv[1]]()
