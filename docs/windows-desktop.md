# Windows 桌面开发

在仓库根目录运行 `npm ci`。Windows x64 构建需要 Rust 的 MSVC 工具链、Visual Studio C++ Build Tools、Windows SDK 和 Edge WebView2 Runtime。

- `npm run desktop:dev` 启动本机 WebView2，并连接仅监听回环地址的 Vite 开发服务。
- `npm run desktop:build` 构建共享前端，将静态资源嵌入可执行文件，并在 `src-tauri/target/release/bundle/nsis/` 生成当前用户安装包。
- 安装后运行 `node scripts/desktop-smoke.mjs "<安装目录>/skimmer-scraper.exe" "<证据目录>"` 可用隔离配置检查窗口、城市飞行和全屏切换。测试专用的 WebView2 调试端口随测试进程关闭。

飞行中可按 Alt+Enter 切换全屏，单击飞行画面锁定鼠标，按 Esc 进入菜单。窗口失焦时暂停，可从菜单继续。网页版和桌面版复用同一套飞行控制、碰撞、渲染与语音代码。开发安装包使用预发行版本号。
