"""Bind a collected run and its comparison to the independently staged official distribution."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile


def read(path):
    return json.loads(path.read_bytes())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def manifest(path):
    return {name:value for value,name in (line.split("  ",1) for line in path.read_text().splitlines())}


def yn(value):
    return "是" if value else "否"


parser=argparse.ArgumentParser(description=__doc__)
for arg in ("results","previous","archive","independent"):
    parser.add_argument(arg,type=Path)
parser.add_argument("--directed-receipt")
args=parser.parse_args()
dest=args.results
target=read(dest/"target.json")
runtime=read(dest/"runtime.json")
flight=read(dest/"measurement.json")
hosted=read(dest/"hosted-run.json")
previous=read(args.previous/"runtime.json")["controller"]
comparison_file="compare-"+previous[:8]+".json"
delta=read(dest/comparison_file)
seal=read(args.independent/"served-files.json")
archive_receipt=read(args.independent/"archive-receipt.json")
source=target["source"]
assert delta["previous"]["source"]==previous and delta["candidate"]["source"]==source
assert archive_receipt["head"]==seal["source"]==source and archive_receipt["id"]==target["artifactId"]
assert archive_receipt["run"]==target["mainRunId"] and archive_receipt["bytes"]==args.archive.stat().st_size
assert digest(args.archive.read_bytes())==archive_receipt["sha256"]==target["archiveSha256"]
with zipfile.ZipFile(args.archive) as z:
    files={name:digest(z.read(name)) for name in z.namelist() if not name.endswith("/")}
    build=json.loads(z.read("build-info.json"))
assert build["sourceCommit"]==source and not build["dirty"] and build["toolchain"]["platform"]=="linux"
assert files==seal["files"]==manifest(dest/"SHA256SUMS") and len(files)==runtime["files"]
assert files[runtime["entry"]["url"].lstrip("/")]==target["entrySha256"]==runtime["entry"]["sha256"]
assert digest(json.dumps(seal["files"],separators=(",",":"),ensure_ascii=False).encode())==seal["treeSha256"]
for name in ("archive-receipt.json","served-files.json"):
    shutil.copyfile(args.independent/name,dest/name)
source_tree=subprocess.check_output(["git","rev-parse",source+"^{tree}"],text=True).strip()
source_changes=subprocess.check_output(["git","diff","--name-only",previous,source],text=True).splitlines()
old_files=manifest(args.previous/"SHA256SUMS")
distribution={"source":source,"tree":source_tree,"previous":previous,"sourceChangedFiles":source_changes,
              "entry":runtime["entry"],"toolchain":build["toolchain"],"sourceWebFiles":len(files),
              "archiveSha256":target["archiveSha256"],"servedTreeSha256":seal["treeSha256"],
              "hostedManifestSha256":runtime["sha256sums"],
              "sameBytesAtSamePath":sum(old_files.get(k)==v for k,v in files.items()),
              "changedAtSamePath":{k:[old_files[k],files[k]] for k in sorted(old_files.keys()&files.keys()) if old_files[k]!=files[k]},
              "addedPaths":sorted(files.keys()-old_files.keys()),"removedPaths":sorted(old_files.keys()-files.keys())}
(dest/"staged-distribution.json").write_bytes((json.dumps(distribution,indent=2)+"\n").encode())
inputs=read(Path(__file__).parent/"inputs.json")
assert digest((Path(__file__).parent/"inputs.zip").read_bytes())==inputs["inputZipSha256"]
dbase="https://github.com/styayur/Skimmer-Scraper"
observed=[r for r in flight["cases"] if r["status"]=="measured"]
attempts=[a for p in sorted(dest.glob("shard-*.json")) for r in read(p)["cases"] for a in r["attempts"]]
matched={r["case"]:r for r in delta["cases"]}
n_samples=sum(r.get("samples",0) for r in delta["cases"])
assert delta["measured"]==flight["measured"]+len(flight["shipped"])
panels=("development","holdout","second-holdout","third-holdout")
doc=[f"# 正式 Web {source[:8]} 的固定输入重播",
     f'合并源码 `{source}`，Git 树 `{source_tree}`。托管 runner 完成矩阵 {flight["measured"]}/{flight["assigned"]} 条，其中 {flight["met"]} 条达到原登记门槛，另完成历史默认入口 {len(flight["shipped"])}/5 条。'
     f' [正式构建]({dbase}/actions/runs/{target["mainRunId"]}) · [托管重播]({hosted["html_url"]}) · [逐案指标](measurement.json)',
     f'官方主分支产物 {target["artifactId"]} 为 {archive_receipt["bytes"]:,} 字节，ZIP SHA-256 `{target["archiveSha256"]}`。'
     f'页面实际加载 `{runtime["entry"]["url"]}`，{runtime["entry"]["bytes"]:,} 字节，SHA-256 `{runtime["entry"]["sha256"]}`。'
     f'独立归档、暂存站点与托管服务的 {len(files)} 个文件哈希逐一相符，站点树为 `{seal["treeSha256"]}`。'
     ' [归档收据](archive-receipt.json) · [逐文件封印](served-files.json) · [与上一版的构建对照](staged-distribution.json)',
     f'与 `{previous[:8]}` 直接配对的 {delta["measured"]}/{delta["expected"]} 条飞行包含 {n_samples:,} 个同步采样时刻。'
     f'{delta["identicalTraces"]} 条完整轨迹、{delta["identicalMetrics"]} 组指标逐项相同。矩阵记录了 {len(attempts)} 次飞行尝试。每份新报告均核对 GLB 哈希、保存与重开布局、实际加载的 JS 入口、模拟时钟和按键时序。'
     f' [逐案差异]({comparison_file}) · [上一版永久收据](https://github.com/styayur/Skimmer-Scraper/blob/c67d8f87e5b920019a7d46a3b1b0ec9ba0608882/acceptance/final-web-011/results/main-ac943acd/README.md)',
     "## 冻结矩阵"]
gate=Counter(r["disposition"] for r in observed)
passes=Counter(r["disposition"] for r in observed if r["met"])
doc.append("，".join(f'{key} 为 {passes[key]}/{gate[key]}' for key in ("must-succeed","must-reject","may-reject"))+
           f'。矩阵共 {sum(r["shieldImpacts"] for r in observed)} 次护盾受击，{sum(r["sampledHullIntrusion"] for r in observed)} 条出现采样机身侵入。')
for panel in panels:
    rows=[r for r in flight["cases"] if r["case"].startswith(panel+"/")]
    doc.append(f'### {panel} · {sum(r.get("met",False) for r in rows)}/{len(rows)}')
    table=["| 案例与原始轨迹 | 登记门槛 | 观测结果 | 达标 | 主动释放 | 护盾受击 | 最长采样滑行，米 |",
           "|---|---|---|---|---|---:|---:|"]
    for row in rows:
        k=row["case"]
        if row["status"]!="measured":
            table.append(f"| {Path(k).stem} | — | 未测 | — | — | — | — |")
            continue
        table.append(f'| [{Path(k).stem}]({k}) | {row["disposition"]} | {row["outcome"]} | {yn(row["met"])} | {yn(row["activeRelease"])} | {row["shieldImpacts"]} | {row["longestGlideM"]:.3f} |')
    doc.append("\n".join(table))
for row in observed:
    if row["met"]: continue
    k=row["case"]; report=read(dest/k); edge=report["trace"][report["releaseTick"]]
    doc.append(f'保留未达标案例 `{Path(k).stem}`。释放采样时刻 {edge["time"]:.4f} 秒，状态 `{edge["phase"]}`，最终判定 `{row["outcome"]}`。'
               f'上一版结果为 `{matched[k]["previousOutcome"]}`。 [完整飞行]({k})')
doc.append("## 五个历史默认入口")
table=["| 历史资产 | 默认捕获 | 主动释放 | 护盾受击 | 最长采样滑行，米 | 读回结果 |","|---|---|---|---:|---:|---|"]
names={"contact":"Contact Deck","district":"Relay District","canopy":"Canopy","caldera":"Caldera","lattice":"Lattice"}
for s in flight["shipped"]:
    n=s["name"]; row=s["final"]
    table.append(f'| [{names[n]}](shipped/{n}.json) | {yn(row["capture"])} | {yn(row["activeRelease"])} | {row["shieldImpacts"]} | {row["glideMetres"]:.3f} | {row["outcome"]} |')
doc.extend(["\n".join(table),"五份原始导出使用默认出生点，中性巡航、三名僚机，LB 在第 4 和 48 个 64 ms 输入区间触发。每份诊断由生产方读取器验算。[五份读回](shipped/readback.json)"])
if (dest/"shipped/producer-readback.json").is_file():
    doc.append("归档下载后，又由 V2Wpro v0.4 的原版读取器核对全部五份报告的入口、世界指纹、结果、护盾和距离。[生产方完整读回](shipped/producer-readback.json)")
if args.directed_receipt:
    doc.append(f'同一产物的三个预登记手动入口另有独立结果，单独计数。[定向重播收据]({args.directed_receipt})')
doc.extend(["## 测量范围",
    f'Chromium 153.0.8010.12 使用 SwiftShader，640 × 360，游戏固定 120 Hz。实飞通过浏览器模拟的标准映射手柄送入 LB，原诊断按 64 ms 采样。'
    f'输入归档 SHA-256 `{inputs["inputZipSha256"]}`，测量脚本 `{inputs["harness"]}`。实体手柄、无线链路和设备映射属于单独的硬件验证。'
    ' [冻结输入](../../inputs.json) · [托管子任务与归档](hosted-run.json) · [首组 20 条](compare-development-holdout.json) · [第二组 8 条](compare-second-holdout.json) · [第三组 6 条](compare-third-holdout.json)'])
if (dest/"artifact-members.json").is_file():
    members=read(dest/"artifact-members.json")
    doc.append(f'{len(members["artifacts"])} 个托管 ZIP 中的 {members["totalMembers"]} 个文件均核对了原始字节。重复的轨迹在索引中指向同一份 Git 副本。[逐成员路径及 SHA-256](artifact-members.json)')
(dest/"README.md").write_bytes(("\n\n".join(doc)+"\n").encode())
