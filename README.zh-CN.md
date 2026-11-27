# Skimmer-Scraper · 掠面飞行

**Shift your flight. Shift your gravity. Shift your world.** 在樱色巨城贴着屋顶和墙面飞行，带领三台伴机穿过天空翻转。每个世界都可以用种子重现。[在线游玩](https://styayur.github.io/Skimmer-Scraper/) · [Windows 下载](https://github.com/styayur/Skimmer-Scraper/releases/latest) · [English](README.md)

## 开始飞行

从有护盾的自由飞行开始。接近实体表面时按空格或手柄 LB 启用贴面机动，再按一次主动脱离。挑战模式为实际使用运动辅助的飞行保存独立成绩。打开标题页的游戏教程可查看飞行、手柄、相机、语音和世界切换操作。

在机库选择原有战机、KITE-W 翼装或 KITE-S 微型飞行器。从世界面板进入樱色巨城、Dragonspine 或 WorldForge。相同种子可以复现同一世界。导入的本地 GLB 留在玩家设备上。Windows 可选装 Dragonspine 高精度资源包。[程序化世界](docs/WORLDFORGE.md) · [贴面物理](docs/SURFACE-GLIDE.md)

## 伴机与电台

三台伴机可在本地执行飞行任务。文字指令、内置语音片段和程序化世界均可在没有 API 密钥时使用。在高级设置中开启角色电台或背景音乐。使用可选云端对话与语音服务时，需自行提供密钥并承担服务费用。[角色音频来源](docs/VOICE.md)

## Windows 与 itch.io

Windows x64 使用 WebView2，发行附件提供安装程序和便携版。安装程序未签 Authenticode。桌面设置可导出与恢复飞行员数据。itch.io 使用 HTML5 ZIP，解压后根目录含游戏入口和全部内置素材。[Windows 使用说明](docs/windows-desktop.md) · [参赛主题和 AI 使用披露](docs/GAME-OFF.md)

## 从源码运行

```sh
npm ci
npm run dev
```

运行 `npm run test:all` 执行类型检查、单元测试、生产构建和 Chromium 集成测试。桌面构建使用 Rust、Windows C++ 工具链及 `npm run desktop:build`。项目采用 AGPL-3.0-only，第三方代码、声音和工具保留各自的许可。[项目许可](LICENSE) · [来源与署名](CREDITS.md)
