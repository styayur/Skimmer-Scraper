"""Draw two installed Switchyard flights from their published CI telemetry."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image


SOURCE = "67a568705cd0cabe18d467f465ae745e784aa245"
ARCHIVE_COMMIT = "9fde528ae887b944ea54319aff9967928d97b9a3"
RUN = 46142189281
ARCHIVE = f"https://raw.githubusercontent.com/styayur/Skimmer-Scraper/{ARCHIVE_COMMIT}/acceptance/joint-flight/topogenesis/windows-final/{RUN}/raw.zip"
RAW_SHA = "e01ad72577a9e8e84a3228d658e550aabae1e9d71dc305e301716f4916c579f5"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def draw(raw, destination):
    if digest(raw) != RAW_SHA:
        raise ValueError("The telemetry ZIP differs from the published Windows run")
    with ZipFile(io.BytesIO(raw)) as archive:
        flight = json.loads(archive.read("joint-flight.json"))
        package = json.loads(archive.read("package.json"))
        opened = {}
        input_digests = {}
        for label in ("fresh", "reopened"):
            member = label + "-lb.json"
            data = archive.read(member)
            opened[label] = json.loads(data)
            input_digests[member] = digest(data)

    assert package["source"] == flight["runtime"]["app"]["sourceCommit"] == SOURCE
    fresh = opened["fresh"]["trace"]
    reopened = opened["reopened"]["trace"]
    compared = ("time", "phase", "position")
    matched = sum(all(a[key] == b[key] for key in compared) for a, b in zip(fresh, reopened))
    first, second = flight["fresh"]
    for key in opened:
        assert opened[key]["cycles"] == flight[key]
    assert opened["fresh"]["input"] == opened["reopened"]["input"] == flight["input"]

    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.spines.top": False,
                         "axes.spines.right": False, "axes.unicode_minus": False})
    fig, panels = plt.subplots(2, 1, figsize=(10.2, 6.8), sharex=True, sharey=True)
    fig.subplots_adjust(left=0.1, right=0.95, bottom=0.18, top=0.77, hspace=0.48)
    fig.text(0.1, 0.935, "Switchyard flight after import and reopen", fontsize=22, fontweight="bold", color="#172f40")
    fig.text(0.1, 0.890, "Installed Windows client   |   Skimmer v0.11.0   |   Standard virtual gamepad", fontsize=11, color="#465762")
    for axis, (key, title) in zip(panels, [("fresh", "Original import"), ("reopened", "Reopened layout")]):
        report = opened[key]
        times = [s["time"] for s in report["trace"]]
        altitude = [s["position"]["y"] for s in report["trace"]]
        axis.grid(axis="y", color="#d9e0e4", linewidth=0.7)
        axis.set_axisbelow(True)
        axis.plot(times, altitude, color="#204d67", linewidth=2.4, zorder=4)
        for cycle in report["cycles"]:
            axis.axvspan(cycle["firstGlideTime"], cycle["detachingTime"], color="#d7eee3", zorder=1)
            axis.axvline(cycle["releaseTime"], color="#ad4c29", linestyle="--", linewidth=1.3, zorder=3)
        for spine in ("left", "bottom"):
            axis.spines[spine].set_color("#84939b")
        axis.set_title(title, loc="left", fontsize=11, fontweight="bold", color="#172f40", pad=6)
        axis.set_ylabel("Altitude (m)")
        axis.margins(x=0.01, y=0.10)
    panels[-1].set_xlabel("Flight time (s)")
    fig.text(0.1, 0.836, "Blue line  ·  altitude", color="#204d67")
    fig.text(0.35, 0.836, "Green band  ·  gliding", color="#276249")
    fig.text(0.64, 0.836, "Dashed line  ·  release input", color="#9b4020")
    impacts = max(s["impacts"] for s in fresh + reopened)
    fig.text(0.1, 0.081, f"{matched}/{len(fresh)} timestamps, phases and positions matched.  "
             f"Glides {first['glideMeters']:.2f} m and {second['glideMeters']:.2f} m.  Shield impacts {impacts}.", fontsize=10)
    fig.text(0.1, 0.045, f"Measured main {SOURCE[:12]}   |   Windows run {RUN}", fontsize=9, color="#53616b")
    destination.mkdir(parents=True, exist_ok=True)
    image = destination / "visual-comparison.jpg"
    fig.savefig(image, dpi=165, pil_kwargs={"quality": 92, "subsampling": 0})
    plt.close(fig)
    with Image.open(image) as rendered:
        assert rendered.format == "JPEG"
        size = list(rendered.size)
        rendered.verify()
    record = dict(sourceCommit=SOURCE, archiveCommit=ARCHIVE_COMMIT, workflowRun=RUN, originalArchive=ARCHIVE,
                  archiveSha256=RAW_SHA, rawFiles=input_digests, version=flight["runtime"]["app"]["version"],
                  exeSha256=package["exeSha256"], buildRun=package["buildRun"], executedEntrySha256=flight["binary"]["sha256"],
                  input=flight["input"], samples=[len(fresh), len(reopened)], matchedTimePhasePosition=matched,
                  shieldImpacts=impacts, glideMetres=[first["glideMeters"],second["glideMeters"]],
                  plottedCoordinates="Raw flight time in seconds and world-space Y altitude in metres. Shading extends from the first gliding sample to detaching. Dashed lines mark release input.",
                  renderer="Matplotlib "+matplotlib.__version__, pixels=size, jpegSha256=digest(image.read_bytes()))
    (destination/"visual-provenance.json").write_text(json.dumps(record,indent=2)+"\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    if args.archive:
        payload = args.archive.read_bytes()
    else:
        with urlopen(ARCHIVE, timeout=40) as response:
            payload = response.read()
    draw(payload, args.output)
