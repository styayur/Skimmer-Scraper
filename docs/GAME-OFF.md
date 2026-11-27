# SHIFT · Surface & Symbiosis

**Shift your flight. Shift your gravity. Shift your world.**

Fly low through a city with three wingmates. Arm Surface Glide to turn a wall into a flight path, then release and carry your speed back into open air. Sky Inversion changes your frame of reference. Choose another world seed to change the terrain itself.

驾驶飞行器与三台伴机穿行在城市中。开启贴面机动，把墙面变成航路，再脱离表面回到自由飞行。世界翻转改变飞行参考系，更换种子则改变世界本身。

## Listing screenshots

These 960 × 540 captures show the v0.9.1 development preview running from an extracted HTML5 ZIP. The English departure frame shows the three wingmates, the flight HUD and the navigator’s subtitle. Each image is an original, unedited gameplay capture.

| View | File |
| --- | --- |
| English title screen | [Title](game-off/en-US-title.png) |
| English chase view | [Departure](game-off/en-US-flight.png) |
| 中文追尾视角与伴机状态 | [编队起飞](game-off/zh-CN-flight.png) |

## AI use disclosure

The creator directed development with OpenAI Codex. Coding agents assisted with implementation, procedural geometry and asset-authoring scripts, documentation, test design and release verification. This entry builds on the existing Skimmer-Scraper game. Its source history and release notes distinguish earlier work from the SHIFT update.

The local character radio uses pre-rendered synthetic Mandarin and English voices. The authoring sources and license notices ship with the project. WorldForge geometry and the eight original music tracks come from deterministic generators. The optional DeepSeek connection supplies high-level dialogue and intent. The offline game runs local flight, collision and companion logic. [Voice production](VOICE.md) · [WorldForge](WORLDFORGE.md) · [Music](MZK.md) · [Credits](../CREDITS.md)

本次作品基于已有的 Skimmer-Scraper。作者使用 OpenAI Codex 辅助实现玩法、编写程序化资产脚本、设计测试和整理发行材料。角色电台使用开发阶段预先合成的中英文语音。WorldForge 地形和八首原创配乐由确定性生成器制作。玩家可自行连接 DeepSeek 处理对话和任务意图。离线飞行、碰撞检测和伴机控制均在本机运行。

## Testing the upload archive

From the repository root, run the local smoke against an existing build. It creates a temporary ZIP and serves only its extracted files at a nested URL.

```powershell
$sha = (Get-Content dist/build-info.json -Raw | ConvertFrom-Json).sourceCommit
python scripts/qualify-itch-zip.py --preview-dist dist --sha $sha --output "$env:TEMP/skimmer-itch-qa"
```

For the merged build, use the actual itch ZIP next to its release manifest. Obtain the expected SHA from the merged source checkout. Substitute your bundle and evidence directories below.

```powershell
$sha = git rev-parse HEAD
python scripts/qualify-itch-zip.py --zip "$bundle/skimmer-scraper-v0.9.1-itch-html5.zip" --sha $sha --output "$proof/web-smoke"
```

Each run writes its ZIP SHA-256, embedded build identity, four browser receipts and screenshots. The standalone cases open the game directly. The iframe cases load it from a different loopback origin than the parent. Both modes use separate English and Chinese browser contexts. A live project check requires the actual itch.io project URL and its processed upload.

## itch.io upload

Select **HTML Game**, upload the release file ending in `-itch-html5.zip` and mark it playable in the browser. The ZIP opens at its root `index.html`. Enable click-to-play and the host fullscreen button, then preview the uploaded build with both browser languages. Check audio after clicking into the game, keyboard focus after Escape and the fullscreen fallback if the embed denies fullscreen.

Publish the project and submit its itch.io page to the jam from the creator account after reviewing the entry details, eligibility and AI disclosure. The repository and GitHub Release do not submit an entry. [Game Off 2026](https://itch.io/jam/game-off-2026) · [itch.io HTML5 upload guide](https://itch.io/docs/creators/html5)
