"""Fly the Switchyard handoff and read the game's downloaded observation in the producing inspector."""
import argparse
from contextlib import ExitStack
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import sync_playwright

PRODUCER = "https://styayur.github.io/V2Wpro/"
GAME = "https://styayur.github.io/Skimmer-Scraper/"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("producer_sha")
parser.add_argument("game_sha")
parser.add_argument("output", type=Path)
parser.add_argument("--preview-sites", nargs=2, type=Path, metavar=("PRODUCER_DIST", "GAME_DIST"))
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)

class Static(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def preview(stack, directory):
    server = stack.enter_context(ThreadingHTTPServer(("127.0.0.1", 0),
        partial(Static, directory=directory.resolve(strict=True))))
    Thread(target=server.serve_forever, daemon=True).start()
    stack.callback(server.shutdown)
    return f"http://127.0.0.1:{server.server_port}/"

with ExitStack() as stack:
    producer, game = ((preview(stack, directory) for directory in args.preview_sites)
                      if args.preview_sites else (PRODUCER, GAME))
    play = stack.enter_context(sync_playwright())
    browser = stack.enter_context(play.chromium.launch(args=["--enable-unsafe-swiftshader"]))
    session = stack.enter_context(browser.new_context(locale="en-US", viewport={"width":1280,"height":800}))
    designer = session.new_page()
    errors, transfers = [], []
    session.on("page", lambda tab: tab.on("pageerror", lambda error: errors.append(str(error))))
    designer.on("pageerror", lambda error: errors.append(str(error)))
    build = session.request.get(urljoin(producer, "build-manifest.json")).json()
    consumer = session.request.get(urljoin(game, "build-info.json")).json()
    assert (build["commit"], build["version"]) == (args.producer_sha,"0.4.0")
    assert (consumer["sourceCommit"], consumer["version"],consumer["dirty"]) == (args.game_sha,"0.11.0",False)
    expected = build["files"]["examples/switchyard.glb"]
    session.on("request", lambda req: transfers.append({"method":req.method,"url":req.url})
               if urlsplit(req.url).hostname == "raw.githubusercontent.com" else None)
    designer.goto(producer+"?world=topogenesis")
    designer.locator("#motion-inspector").wait_for()
    designer.locator("#exchange-panel summary").click()
    designer.wait_for_function("document.getElementById('fly-skimmer').href.endsWith('?catalog=switchyard')")
    link = designer.locator("#fly-skimmer")
    assert link.get_attribute("href") == GAME+"?catalog=switchyard"
    if args.preview_sites:
        pilot = session.new_page()
        pilot.goto(game+"?catalog=switchyard")
    else:
        with session.expect_page() as opened:
            link.click()
        pilot = opened.value
        pilot.wait_for_url(GAME+"?catalog=switchyard")
    pilot.locator("#partner-world-select").wait_for()
    assert pilot.locator("#partner-world-select").input_value() == "switchyard" and not transfers
    pilot.locator("#partner-world-catalog details > summary").click()
    source, digest = pilot.locator("#partner-world-pin").inner_text().split(" · SHA-256 ")
    assert digest == expected and not transfers
    assert source == f"https://raw.githubusercontent.com/styayur/V2Wpro/{args.producer_sha}/examples/switchyard.glb"
    pilot.locator("#partner-world-import").click()
    pilot.locator("#local-world-config").wait_for(timeout=90000)
    pilot.locator("#local-world-save").uncheck()
    pilot.locator("#local-world-apply").click()
    pilot.locator("#start-button").click()
    pilot.wait_for_function("window.__SKIMMER_SCRAPER__?.snapshot().runTime > 0.3")
    pilot.keyboard.press("Space")
    pilot.wait_for_function("window.__SKIMMER_SCRAPER__.snapshot().runTime > 1.7")
    pilot.screenshot(path=args.output/"switchyard-flight.png")
    pilot.keyboard.press("g")
    layout = pilot.locator("#world-seed-input").input_value()
    with pilot.expect_download() as saved:
        pilot.locator("#local-world-diagnostic").click()
    file = args.output/"player-observation.json"
    saved.value.save_as(file)
    observation = json.loads(file.read_bytes())
    assert observation["sha256"] == expected and observation["world"]["layoutSeed"] == layout
    assert observation["imported"]["id"] == expected and observation["replayed"] is None
    assert observation["recording"]["kind"] == "player" and len(observation["trace"]) >= 2
    assert observation["build"]["sourceCommit"] == args.game_sha
    entry = pilot.locator("script[type=module][src]").first.evaluate("e=>e.src")
    assert hashlib.sha256(session.request.get(entry).body()).hexdigest() == observation["binary"]["sha256"]
    pilot.locator("#local-world-keep").click()
    pilot.wait_for_function("""Object.values(sessionStorage).some(v=>v.includes('"replay":true'))""")
    pilot.reload()
    pilot.wait_for_function("window.__SKIMMER_SCRAPER__?.snapshot().ready && window.__SKIMMER_SCRAPER__.snapshot().localWorld", timeout=90000)
    assert pilot.locator("#world-seed-input").input_value() == layout
    pilot.locator("#world-close").click()
    pilot.locator("#start-button").click()
    pilot.wait_for_function("window.__SKIMMER_SCRAPER__.snapshot().runTime > 0.3")
    pilot.keyboard.press("g")
    with pilot.expect_download() as reopened_download:
        pilot.locator("#local-world-diagnostic").click()
    replay_file = args.output/"reopened-observation.json"
    reopened_download.value.save_as(replay_file)
    reopened = json.loads(replay_file.read_bytes())
    assert reopened["world"] == observation["world"] and reopened["binary"] == observation["binary"]
    assert reopened["replayed"] == reopened["imported"] == observation["imported"]
    designer.locator("#flight-report").set_input_files(file)
    designer.wait_for_function("document.getElementById('report-result').textContent.includes('player-observation')")
    assert transfers == [{"method":"GET","url":source}] and not errors
    receipt = {"publicSites":args.preview_sites is None,"producer":producer,"game":game,
        "producerCommit":build["commit"],"consumerCommit":consumer["sourceCommit"],"handoff":link.get_attribute("href"),
        "glbSha256":expected,"bytes":observation["world"]["bytes"],"browser":browser.version,
        "binary":observation["binary"],"layoutRestored":True,"reopenedImport":reopened["replayed"],
        "traceSamples":len(observation["trace"]),
        "result":designer.locator("#report-result").inner_text(),"requests":transfers,"errors":errors}
    (args.output/"handoff.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(receipt,ensure_ascii=True))
