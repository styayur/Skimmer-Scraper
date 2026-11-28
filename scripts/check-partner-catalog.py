"""Use the browser's actual network to confirm each pinned public partner world."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("url", help="Game build to test")
parser.add_argument("output", type=Path, help="New evidence directory")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
rows = []
build = None
with sync_playwright() as p, p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]) as browser:
    for world in ["relay-district", "contact-deck", "switchyard"]:
        with browser.new_context(locale="en-US", viewport={"width": 1280, "height": 720}) as context:
            page = context.new_page()
            requests = []
            errors = []
            def observe(request):
                target = urlsplit(request.url)
                if target.scheme in ("http", "https") and target.netloc != urlsplit(args.url).netloc:
                    requests.append({"method": request.method, "url": request.url})
            page.on("request", observe)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(args.url.rstrip("/") + "/?catalog=" + world)
            page.wait_for_function("window.__SKIMMER_SCRAPER__?.snapshot().ready")
            page.wait_for_load_state("networkidle")
            if build is None:
                build = page.request.get(args.url.rstrip("/") + "/build-info.json").json()
            assert page.locator("#partner-world-select").input_value() == world and not requests
            page.locator("#partner-world-catalog details > summary").click()
            pin = page.locator("#partner-world-pin").inner_text()
            source, digest = pin.split(" · SHA-256 ")
            if world == "relay-district":
                page.screenshot(path=args.output / "catalog.png")
            page.locator("#partner-world-import").click()
            page.locator("#local-world-config").wait_for(timeout=60000)
            page.locator("#local-world-save").uncheck()
            page.locator("#local-world-apply").click()
            page.wait_for_function("window.__SKIMMER_SCRAPER__.snapshot().localWorld")
            identity = page.evaluate("""() => { const w=window.__SKIMMER_SCRAPER__.snapshot().localWorld.manifest;
                return {sha256:w.id,bytes:w.bytes,collisionTriangles:w.collisionTriangles}; }""")
            assert identity["sha256"] == digest and requests == [{"method": "GET", "url": source}] and not errors
            rows.append({"id": world, "confirmedSource": source, "beforeConfirmation": 0,
                         "requests": requests, **identity, "errors": errors})
    report = {"build": build, "browser": browser.version, "worlds": rows}
    (args.output / "catalog.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
