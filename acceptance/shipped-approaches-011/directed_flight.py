"""World-library controls and read-only measurements for the three preselected routes."""
import base64
import json

GAME = "window.__SKIMMER_SCRAPER__"


def apply_spawn(page, case):
    form = page.locator("#local-world-config")
    form.wait_for(state="visible")
    transform = form.locator(".world-import-transform").first
    if not transform.evaluate("e => e.open"):
        transform.locator(":scope > summary").click()
    form.locator("#local-world-manual").check()
    for field, value in {**case["spawn"], "spawnYaw": case["spawnYaw"]}.items():
        form.locator(f'[name="{field}"]').fill(str(value))
    assert form.locator("#local-world-save").is_checked()


def verify_layout(page, case):
    layout = page.locator("#world-seed-input").input_value()
    payload = layout.removeprefix("glb-world:")
    decoded = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    actual = page.evaluate("""() => {
        const w = window.__SKIMMER_SCRAPER__.snapshot().localWorld;
        return {id:w.manifest.id, spawn:w.spawn, options:w.manifest.options,
                collisionTriangles:w.manifest.collisionTriangles, layoutVariant:w.manifest.variant?.seed ?? 0};
    }""")
    options = dict(scale=1, yaw=0, up="y", spawn=case["spawn"], spawnYaw=case["spawnYaw"])
    assert decoded == [1, case["sha256"], 0, options], decoded
    assert actual["options"] == options and actual["spawn"] == case["spawn"], actual
    assert actual["id"] == case["sha256"] and actual["layoutVariant"] == 0
    return {"layoutSeed":layout, "decoded":decoded, **actual}


def frame(page):
    return page.evaluate("""() => {
        const game = window.__SKIMMER_SCRAPER__, s = game.snapshot(), g = s.glide;
        const hit = game.glideSurface(s.position, 90);
        const pad = navigator.getGamepads()[0];
        return {time:s.runTime, position:s.position, velocity:s.velocity, speed:s.speed,
                phase:g.phase, contactPoint:g.contactPoint ?? null, normal:g.normal ?? null,
                surfaceId:g.surfaceId ?? null, geometryId:g.geometryId ?? null,
                solidDistance:game.surface(s.position,90)?.distance ?? null, nearestGlide:hit,
                impacts:s.shieldImpacts, mode:s.mode, lb:pad.buttons[4].pressed,
                boost:pad.buttons[7].pressed, axes:pad.axes};
    }""")


def survey_world(browser, url, glb, row, geometry, prior):
    import hashlib
    import math
    from urllib.parse import urlsplit

    page = browser.new_page(locale="zh-CN", viewport={"width":640,"height":360})
    try:
        scripts = {}
        page.on("response", lambda r: scripts.update({r.url:r}) if r.request.resource_type == "script" else None)
        page.goto(url + "/?seed=334458&gen=2")
        page.wait_for_function(GAME + "?.snapshot().ready", timeout=90000)
        entry = page.locator('script[type=module][src]').first.evaluate("e=>e.src")
        code = scripts[entry].body()
        row.update(browser=browser.version, build=page.request.get(url+"/build-info.json").json(),
                   binary={"url":urlsplit(entry).path,"sha256":hashlib.sha256(code).hexdigest(),"bytes":len(code)})
        if not page.locator("#world-panel").is_visible():
            page.keyboard.press("g")
        panel = page.locator("#local-world-library")
        if not panel.evaluate("e => e.open"):
            panel.locator(":scope > summary").click()
        page.locator("#local-world-file").set_input_files(glb)
        page.locator("#local-world-analyze").click()
        page.locator("#local-world-apply").click()
        page.wait_for_function(GAME + ".snapshot().localWorld")
        row["imported"] = page.evaluate(GAME + ".snapshot().localWorld")
        manifest = row["imported"]["manifest"]
        assert manifest["id"] == geometry["sha256"] and manifest["options"]["spawn"] is None
        assert (manifest["collisionTriangles"], manifest["bounds"], row["imported"]["spawn"]) == (
            geometry["collisionTriangles"], prior["imported"]["bounds"], prior["imported"]["spawn"])
        def probe(point):
            return page.evaluate("""p => {
                const g = window.__SKIMMER_SCRAPER__;
                return {at:p,solid:g.surface(p,90),glide:g.glideSurface(p,90)};
            }""", point)
        row["spawnCorridor"] = [probe(p) for p in geometry["spawnCorridorPoints"]]
        row["topProbes"] = [probe(p) for p in geometry["topProbePoints"]]
        row["minimumCorridorM"] = min(p["solid"]["distance"] for p in row["spawnCorridor"])
        row["spawnCorridorClear"] = row["minimumCorridorM"] > 6.5
        def matches(p):
            hit = p["glide"]
            expected = {**p["at"], "y":geometry["target"]["max"][1]}
            return bool(hit and hit["surfaceId"] == "local-"+manifest["id"]+"-surface"
                        and hit["contact"]["normal"]["y"] >= .95
                        and abs(hit["distance"]-.35) < .01
                        and math.dist(list_xyz(hit["point"]),list_xyz(expected)) < .01)
        row["topVerified"] = all(matches(p) for p in row["topProbes"])
    finally:
        page.close()


def list_xyz(vector):
    return [vector[k] for k in "xyz"]
