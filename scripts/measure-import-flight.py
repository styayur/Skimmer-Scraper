"""Run a finite local GLB through the browser world library and fixed-step game."""
import argparse
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("world", type=Path)
parser.add_argument("report", type=Path)
parser.add_argument("--url", default="http://127.0.0.1:4173")
parser.add_argument("--boost", action="store_true")
parser.add_argument("--browser", help="Chromium executable override")
args = parser.parse_args()
digest = hashlib.sha256(args.world.read_bytes()).hexdigest()
report = dict(format="flight-diagnostic-1", sha256=digest, boost=args.boost,
              input="emulated standard gamepad LB", fixedHz=120, sampleMs=64, trace=[], errors=[])
game = "window.__SKIMMER_SCRAPER__"
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser, args=["--use-angle=swiftshader",
        "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
    try:
        context = browser.new_context(locale="zh-CN", viewport=dict(width=640, height=360))
        page = context.new_page()
        page.on("pageerror", lambda e: report["errors"].append(str(e)))
        pad_script = """window.pilotButtons = Array.from({length:17}, () => ({pressed:false,value:0}));
          Object.defineProperty(navigator,'getGamepads',{value:()=>[{index:0,id:'Research pad',
            connected:true,mapping:'standard',axes:[0,0,0,0],buttons:window.pilotButtons}]});"""
        page.add_init_script(pad_script)
        page.goto(args.url + "/?seed=334458&gen=2")
        page.wait_for_load_state("networkidle")
        report["build"] = page.request.get(args.url + "/build-info.json").json()
        report["browser"] = browser.version
        def ready():
            page.wait_for_function(game + "?.snapshot().ready", timeout=90000)
        def library():
            if not page.locator("#world-panel").is_visible():
                page.keyboard.press("g")
            panel = page.locator("#local-world-library")
            if not panel.evaluate("e=>e.open"):
                panel.locator(":scope > summary").click()
        def button(index, pressed):
            page.evaluate("([i,p])=>window.pilotButtons[i]={pressed:p,value:Number(p)}", [index, pressed])
        def sample():
            row = page.evaluate("""() => {
              const s=window.__SKIMMER_SCRAPER__.snapshot();
              return {time:s.runTime,position:s.position,speed:s.speed,phase:s.glide.phase,
                normal:s.glide.normal,clearance:s.surfaceDistance,impacts:s.shieldImpacts,mode:s.mode,
                deployed:s.companions.filter(a=>a.deployed && !a.uncovered).length};
            }""")
            report["trace"].append(row)
            return row
        ready()
        library()
        page.locator("#local-world-file").set_input_files(args.world)
        page.locator("#local-world-analyze").click()
        page.locator("#local-world-apply").click()
        page.wait_for_function(game + ".snapshot().localWorld")
        def identity():
            return page.evaluate("""() => {
              const w=window.__SKIMMER_SCRAPER__.snapshot().localWorld;
              return {id:w.manifest.id,spawn:w.spawn,variant:w.manifest.variant?.seed||0,
                bounds:w.manifest.bounds,collisionTriangles:w.manifest.collisionTriangles};
            }""")
        report["imported"] = identity()
        library()
        page.locator("#local-world-keep").click()
        page.wait_for_function("Object.values(sessionStorage).some(v=>v.includes('\"replay\":true'))")
        page.reload()
        ready()
        page.wait_for_function(game + ".snapshot().localWorld")
        report["replayed"] = identity()
        assert report["imported"] == report["replayed"]
        assert report["imported"]["id"] == digest
        # Install the controlled clock before the game schedules its first frame.
        # Reopen the kept world in a fresh tab sharing the same IndexedDB.
        flight_page = page.context.new_page()
        page.close()
        page = flight_page
        page.on("pageerror", lambda e: report["errors"].append(str(e)))
        page.add_init_script(pad_script)
        page.clock.install()
        page.goto(args.url + "/?seed=334458&gen=2")
        ready()
        library()
        page.locator("#local-world-load").click()
        page.locator("#local-world-apply").click()
        page.wait_for_function(game + ".snapshot().localWorld")
        assert identity() == report["imported"]
        page.clock.pause_at(page.evaluate("Date.now()+1000"))
        page.locator("#start-button").focus()
        page.keyboard.press("Enter")
        page.evaluate("document.activeElement.blur()")
        sample()
        if args.boost:
            button(7, True)
        for tick in range(64):
            if tick in (4, 48):
                button(4, True)
            if tick in (5, 49):
                button(4, False)
            page.clock.run_for(64)
            sample()
        assert report["trace"][-1]["time"] - report["trace"][0]["time"] > 4
        assert any(r["phase"] != "FLIGHT" for r in report["trace"]), "LB input never reached controller"
        page.clock.resume()
        page.screenshot(path=str(args.report.with_suffix(".png")))
        library()
        page.locator("#local-world-builtin").click()
        page.wait_for_function(game + ".snapshot().localWorld === null")
        report["returnedToBuiltin"] = True
        phases = {r["phase"] for r in report["trace"]}
        report["outcome"] = ("impact" if report["trace"][-1]["impacts"] else
                             "capture-missed" if not phases.intersection({"REDIRECT","GLIDING","ATTACHING"}) else
                             "contact-lost" if report["trace"][48]["phase"] != "GLIDING" else
                             "detach-missed" if "DETACHING" not in phases else "glide-and-release")
    finally:
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        browser.close()
print(args.report, report.get("outcome"))

