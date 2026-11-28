# Windows 桌面开发

在仓库根目录运行 `npm ci`。Windows x64 构建需要 Rust 的 MSVC 工具链、Visual Studio C++ Build Tools、Windows SDK 和 Edge WebView2 Runtime。

- `npm run desktop:dev` 启动本机 WebView2，并连接仅监听回环地址的 Vite 开发服务。
- `npm run desktop:build` 构建共享前端，将静态资源嵌入可执行文件，并在 `src-tauri/target/release/bundle/nsis/` 生成当前用户安装包。
- 安装后运行 `node scripts/desktop-smoke.mjs "<安装目录>/skimmer-scraper.exe" "<证据目录>"` 可用隔离配置检查窗口、城市飞行和全屏切换。测试专用的 WebView2 调试端口随测试进程关闭。
- 在上述命令末尾加入 `gamepad` 可单独验收实体手柄。飞行时拨动摇杆并按 Start，程序将设备名称、轴变化和暂停结果写入 `gamepad.json`。等待时间默认为 90 秒，可用环境变量 `SKIMMER_PAD_SECONDS` 调整。

飞行中可按 Alt+Enter 切换全屏，单击飞行画面锁定鼠标，按 Esc 进入菜单。窗口失焦时暂停，可从菜单继续。网页版和桌面版复用同一套飞行控制、碰撞、渲染与语音代码。开发安装包使用预发行版本号。

桌面本地世界库保存在应用专用数据目录的 world-library-v1 中。文件通过系统文件选择器导入，保存前校验 SHA-256。可在世界菜单重开、导出或删除副本。网页玩家可在支持「导出 GLB」的版本中导出原文件，并复制世界种子到桌面端。

## v0.9 世界、机型与音频

WorldForge 用内置原型和种子在本机生成地形。KITE-W 与 KITE-S 可在机库中选择。Dragonspine 高精包沿用已发布的 schema 2 地形摘要。角色电台与世界配乐均由玩家在飞行设置中开启。NSIS 安装范围为当前用户，安装包未签署 Authenticode。

在桌面验收命令末尾使用 `glide-pad` 可记录实体 LB 的两次按下与滑行状态。按页面提示先开启、再退出。首次开启后，测试将飞机定位到城市地面上方 6 米；手柄按钮来自真实 Gamepad API。报告写入验收目录的 `glide-bumper.json`。

## Windows 安装器升级与回滚

在包含本工作流的分支上调用 Windows desktop，传入集成候选的完整 Git SHA。候选必须声明 0.11.0 并保留现有应用标识与 currentUser 安装模式。

```powershell
gh workflow run windows-desktop.yml --ref codex/windows-011-compat -f expected_sha=$candidateSha -f installer_lifecycle=true
```

流水线在该 SHA 上构建一次 NSIS，四台临时 Windows 主机分别从 v0.8.2、v0.9.1、v0.9.2、v0.10.0 开始。每台主机依次运行旧版、候选、回滚的 v0.10.0、重新升级的候选，然后关闭并再次启动。所有安装使用同一目录、同一 Windows SID 的 HKCU 注册项和 WebView2 默认用户数据目录。安装包和安装后的可执行文件均校验 SHA-256。每次启动的 CDP 记录包含内嵌构建 SHA、实际执行的入口脚本散列、WebView2 版本和 WebGL 渲染器。

每次替换程序前，测试关闭客户端，通过 SQLite 备份 API 保存含已提交 WAL 页的世界库，并复制该应用已关闭的 Local Storage 和 IndexedDB。安装后、首次启动前，对照快照检查数据。每次启动后再由游戏导入或导出飞行员存档，重读 GLB 和资源包瓦片，并核对种子、世界指纹和历史成绩。候选通过玩家设置启用旅程记忆并生成真实访问记录。回滚版本保留同一来源下的 `skimmer.journey-memory.v1`，重新升级后从界面查看。原始存储备份留在临时主机，Actions 附件只含测试生成的数据与摘要。

日常 PR 演练以已发布的 v0.10.0 为目标，回滚到 v0.9.2；v0.10.0 起点的第一步是同版重装。演练使用合成记忆记录验证旧版保留陌生键。正式候选的验收以该候选 SHA 的四份 `lifecycle-<SHA>-from-*` 附件为准。每份 `lifecycle.json` 给出安装轨迹，各阶段 JSON 给出运行时观测及安装前后快照。
