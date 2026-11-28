"""Run a finite local GLB through the browser world library and fixed-step game."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("world", type=Path)
parser.add_argument("report", type=Path)
parser.add_argument("--url", default="http://127.0.0.1:4173")
parser.add_argument("--release-tick", type=int, default=48)
parser.add_argument("--film", action="store_true", help="Save a WebP recording of the controlled frames")
parser.add_argument("--orders", action="store_true", help="Send a local three-wingmate mission")
parser.add_argument("--gpu", action="store_true", help="Measure 120 uninterrupted animation frames on the default renderer")
parser.add_argument("--boost", action="store_true")
parser.add_argument("--browser", help="Chromium executable override")
parser.add_argument("--case", type=json.loads, help="Frozen experiment row as JSON; record flight-diagnostic-2")
parser.add_argument("--screenshot", action="store_true", help="Also save a PNG for a matrix case")
args = parser.parse_args()
if not 8 <= args.release_tick <= 128:
    parser.error("release tick must be between 8 and 128")
frames = []
digest = hashlib.sha256(args.world.read_bytes()).hexdigest()
report = dict(format="flight-diagnostic-1", sha256=digest, boost=args.boost,
              input="emulated standard gamepad LB", fixedHz=120, sampleMs=64, trace=[], errors=[])
case = args.case
approach = case.get("approach", "entry") if case else "entry"
wingmates = case.get("wingmates", 3) if case else 3
if case:
    from flight_bench_metrics import summarize
    report.update(format="flight-diagnostic-2", experiment=case,
                  schedule=dict(captureTick=4, releaseTick=args.release_tick, releasePulse=approach != "open-air",
                                postReleaseTicks=16, yawAxis=0.45 if approach == "yaw" else 0, wingmates=wingmates))
game = "window.__SKIMMER_SCRAPER__"
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser, headless=not args.gpu, args=(["--use-angle=d3d11","--disable-software-rasterizer"] if args.gpu else ["--use-angle=swiftshader"]) + [
        "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
    try:
        context = browser.new_context(locale="zh-CN", viewport=dict(width=640, height=360))
        page = context.new_page()
        page.on("pageerror", lambda e: report["errors"].append(str(e)))
        pad_script = """window.pilotButtons = Array.from({length:17}, () => ({pressed:false,value:0}));
          Object.defineProperty(navigator,'getGamepads',{value:()=>[{index:0,id:'Research pad',
            connected:true,mapping:'standard',axes:window.pilotAxes,buttons:window.pilotButtons}]});
          window.pilotAxes=[0,0,0,0];"""
        page.add_init_script(pad_script)
        script_responses = {}
        if case:
            page.on("response", lambda r: script_responses.update({r.url: r}) if r.request.resource_type == "script" else None)
        page.goto(args.url + "/?seed=334458&gen=2")
        page.wait_for_load_state("networkidle")
        report["build"] = page.request.get(args.url + "/build-info.json").json()
        report["browser"] = browser.version
        if case:
            entry = page.locator('script[type=module][src]').first.evaluate("e=>e.src")
            code = script_responses[entry].body()
            report["binary"] = dict(url=urlsplit(entry).path, sha256=hashlib.sha256(code).hexdigest(), bytes=len(code))
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
            if case:
                row.update(page.evaluate("""() => { const g=window.__SKIMMER_SCRAPER__, s=g.snapshot();
                  return {velocity:s.velocity,solidDistance:g.surface(s.position,90)?.distance ?? null}; }"""))
            return row
        ready()
        library()
        page.locator("#local-world-file").set_input_files(args.world)
        page.locator("#local-world-analyze").click()
        if approach == "open-air":
            panel = page.locator(".world-import-transform").first
            panel.locator(":scope > summary").click()
            page.locator("#local-world-manual").check()
            for field, value in [("x","0"), ("y","1000"), ("z","0"), ("spawnYaw","90")]:
                page.locator(f'#local-world-config [name="{field}"]').fill(value)
        page.locator("#local-world-apply").click()
        page.wait_for_function(game + ".snapshot().localWorld")
        def identity():
            return page.evaluate("""() => {
              const w=window.__SKIMMER_SCRAPER__.snapshot().localWorld;
              return {id:w.manifest.id,spawn:w.spawn,variant:w.manifest.variant?.seed||0,
                bounds:w.manifest.bounds,collisionTriangles:w.manifest.collisionTriangles};
            }""")
        report["imported"] = identity()
        if case:
            report["world"] = dict(sha256=digest, bytes=args.world.stat().st_size,
                                   layoutSeed=page.locator("#world-seed-input").input_value())
        library()
        page.locator("#local-world-keep").click()
        page.wait_for_function("Object.values(sessionStorage).some(v=>v.includes('\"replay\":true'))")
        page.reload()
        ready()
        page.wait_for_function(game + ".snapshot().localWorld")
        report["replayed"] = identity()
        if case:
            assert page.locator("#world-seed-input").input_value() == report["world"]["layoutSeed"]
        assert report["imported"] == report["replayed"]
        assert report["imported"]["id"] == digest
        if args.gpu:
            page.locator("#start-button").click()
            page.wait_for_function(game + ".snapshot().mode === 'running'")
            report["frameSample"] = page.evaluate("""async () => {
              const gl=document.querySelector('canvas').getContext('webgl2');
              const ext=gl.getExtension('WEBGL_debug_renderer_info');
              const times=[];
              for(let i=0;i<151;i++) times.push(await new Promise(requestAnimationFrame));
              const ms=times.slice(31).map((t,i)=>t-times[i+30]).sort((a,b)=>a-b);
              return {renderer:ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
                width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,frames:ms.length,
                p50:ms[59],p95:ms[113],p99:ms[118]};
            }""")
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
        if wingmates != 3:
            page.locator("#rules-open").click()
            page.locator("#companion-count").select_option(str(wingmates))
            page.locator("#rules-close").click()
        library()
        page.locator("#local-world-load").click()
        page.locator("#local-world-apply").click()
        page.wait_for_function(game + ".snapshot().localWorld")
        assert identity() == report["imported"]
        if case:
            assert page.locator("#world-seed-input").input_value() == report["world"]["layoutSeed"]
            assert page.evaluate(game + ".snapshot().companionSettings.count") == wingmates
        page.clock.pause_at(page.evaluate("Date.now()+1000"))
        page.locator("#start-button").focus()
        page.keyboard.press("Enter")
        page.evaluate("document.activeElement.blur()")
        sample()
        if args.boost:
            button(7, True)
        if approach == "yaw":
            page.evaluate("window.pilotAxes[2]=0.45")
        report["releaseTick"] = args.release_tick
        for tick in range(args.release_tick + 16):
            if tick == 4 and approach == "yaw":
                page.evaluate("window.pilotAxes[2]=0")
            if tick == 4 or (tick == args.release_tick and approach != "open-air"):
                button(4, True)
            if tick in (5, args.release_tick+1):
                button(4, False)
            page.clock.run_for(64)
            sample()
            if args.film and tick % 3 == 0:
                from io import BytesIO
                from PIL import Image
                frames.append(Image.open(BytesIO(page.screenshot())).convert("RGB"))
        if frames:
            frames[0].save(args.report.with_suffix(".webp"),save_all=True,append_images=frames[1:],
                           duration=192,loop=0,quality=76)
        assert report["trace"][-1]["time"] - report["trace"][0]["time"] > (args.release_tick + 15) * 0.064
        assert any(r["phase"] != "FLIGHT" for r in report["trace"]), "LB input never reached controller"
        if case:
            report["resources"] = page.evaluate("""() => { const s=window.__SKIMMER_SCRAPER__.snapshot();
              return {world:s.world,adapter:s.adapter,streaming:s.streaming,buffering:s.bufferingEvents,
                usedJSHeapBytes:performance.memory?.usedJSHeapSize ?? null}; }""")
        page.clock.resume()
        if args.orders:
            field = page.locator("#radio-input")
            report["radio"] = []
            for attempt,message in enumerate(["KITE-1 lead", "KITE-2 escort me", "KITE-3 inspect the landmark", "KITE-2 escort me"]):
                if attempt == 3:
                    if any(m["type"] == "ESCORT" for m in report["radio"][-1]["missions"]):
                        break
                    # Leave the tower before retrying a route rejected near its roof.
                    await_state = page.evaluate(game + ".advance(3)")
                    assert await_state["mode"] == "running"
                page.keyboard.press("t")
                field.fill(message)
                field.press("Enter")
                page.wait_for_selector("#radio-panel", state="hidden")
                page.wait_for_timeout(600)
                report["radio"].append(page.evaluate("""() => {
                  const s=window.__SKIMMER_SCRAPER__.snapshot();
                  return {missions:s.cooperation.missions, tasks:s.companions.map(a=>a.task),
                    events:s.cooperation.trace.slice(-3)};
                }"""))
            page.evaluate(game + ".advance(3)")
            report["missions"] = page.evaluate(game + ".snapshot().cooperation.missions")
        if not case or args.screenshot:
            page.screenshot(path=str(args.report.with_suffix(".png")))
        library()
        page.locator("#local-world-builtin").click()
        page.wait_for_function(game + ".snapshot().localWorld === null")
        report["returnedToBuiltin"] = True
        phases = {r["phase"] for r in report["trace"]}
        report["outcome"] = ("impact" if report["trace"][-1]["impacts"] else
                             "capture-missed" if not phases.intersection({"REDIRECT","GLIDING","ATTACHING"}) else
                             "contact-lost" if report["trace"][args.release_tick]["phase"] != "GLIDING" else
                             "detach-missed" if "DETACHING" not in phases else "glide-and-release")
        if case:
            report["outcome"], report["metrics"] = summarize(report)
    except Exception as error:
        report["errors"].append(str(error))
        raise
    finally:
        args.report.write_text(json.dumps(report, indent=None if case else 2, allow_nan=False) + "\n", encoding="utf-8")
        browser.close()
print(args.report, report.get("outcome"))

