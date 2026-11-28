# V2Wpro v0.4 历史世界的可捕获入口

正式 Web `67a56870` 已使用同一登记设计重放三个手动入口，逐帧对照与新产物身份单独收录。[67a56870 定向重播收据](results/46141440292/README.md)

在 Skimmer-Scraper 正式 Web `ac943acd` 上，Canopy、Caldera 和 Lattice 各用一个预登记的手动入口实飞一次。三次都捕获了指定顶面，持续滑行到第二次 LB，主动释放后回到自由飞行，护盾受击均为零。三条路线各提供一个可复现的入口。五个默认出生点的中性 LB 结果和原矩阵的 **33/34** 独立保存在先前收据中。[飞行前登记的设计](https://github.com/styayur/Skimmer-Scraper/blob/1ccf35240747aeb7405679d1b517823a7b3f072b/acceptance/shipped-approaches-011/DESIGN.md) · [原 34+5 收据](https://github.com/styayur/Skimmer-Scraper/blob/c67d8f87e5b920019a7d46a3b1b0ec9ba0608882/acceptance/final-web-011/results/main-ac943acd/README.md)

| 历史世界 | 默认出生点，中性 LB | 定向入口的实际结果 | 原始读数 |
|---|---|---|---|
| Canopy · Reading Rooms | 未观测到滑行 | 后壁窄顶，16 个连续目标样本，16.075 米，主动释放 | [默认](https://github.com/styayur/Skimmer-Scraper/blob/c67d8f87e5b920019a7d46a3b1b0ec9ba0608882/acceptance/final-web-011/results/main-ac943acd/shipped/canopy.json) · [定向](results/46135808044/raw/attempts/canopy/1/frames.json) |
| Caldera · Split Ascent | 未观测到滑行 | 后方平台，8 个连续目标样本，7.190 米，主动释放 | [默认](https://github.com/styayur/Skimmer-Scraper/blob/c67d8f87e5b920019a7d46a3b1b0ec9ba0608882/acceptance/final-web-011/results/main-ac943acd/shipped/caldera.json) · [定向](results/46135808044/raw/attempts/caldera/1/frames.json) |
| Lattice · Relay Exchange | 未观测到滑行 | 起飞平台对角线，8 个连续目标样本，7.190 米，主动释放 | [默认](https://github.com/styayur/Skimmer-Scraper/blob/c67d8f87e5b920019a7d46a3b1b0ec9ba0608882/acceptance/final-web-011/results/main-ac943acd/shipped/lattice.json) · [定向](results/46135808044/raw/attempts/lattice/1/frames.json) |
| Contact Deck | 捕获，连续采样弦长 148.007 米，主动释放，零受击 | 引用默认实飞 | [默认原始轨迹](https://github.com/styayur/Skimmer-Scraper/blob/c67d8f87e5b920019a7d46a3b1b0ec9ba0608882/acceptance/final-web-011/results/main-ac943acd/shipped/contact.json) |
| Relay District | 1 个 GLIDING 样本，随后失去接触，未主动释放，零受击 | 引用默认实飞 | [默认原始轨迹](https://github.com/styayur/Skimmer-Scraper/blob/c67d8f87e5b920019a7d46a3b1b0ec9ba0608882/acceptance/final-web-011/results/main-ac943acd/shipped/district.json) |

## 入口与实飞

在世界库导入表单中勾选手动出生，按表输入位置和出生航向，使用默认缩放、Y 向上、场景旋转 0°。保存后重载，并在独立标签页从世界库重新打开同一布局。标准手柄的四个轴归零，巡航，三名僚机，游戏物理 120 Hz。LB 区间从零起算，每次按住 64 ms，随后松开。每条航线记录 97 个细采样、25 个原诊断采样、4 个实际按钮边沿和保存后的布局种子。[冻结输入及三个完整 GLB 指纹](plan.json) · [正式客户端碰撞查询](results/46135808044/raw/geometry-survey.json)

| 世界及顶面 | 出生 (x, y, z)，米 | 航向 | LB 区间 | 首次目标接触，游戏秒 | 全程最小采样实体间距 | 原诊断及生产方读回 |
|---|---|---:|---:|---:|---:|---|
| Canopy · box-64，Y=9 | (−29, 15.8, −23.5) | −90° | 4、8 | 0.2667 | 6.321 米 | [64 ms 诊断](results/46135808044/raw/attempts/canopy/1/flight.json) · [v0.4 读取器](results/46135808044/raw/attempts/canopy/1/reader.json) |
| Caldera · mound-49，Y=19.6 | (−4.85, 26.4, −49.5) | 180° | 6、8 | 0.4000 | 6.510 米 | [64 ms 诊断](results/46135808044/raw/attempts/caldera/1/flight.json) · [v0.4 读取器](results/46135808044/raw/attempts/caldera/1/reader.json) |
| Lattice · box-0，Y=1.04 | (−22, 7.84, 57.2) | −45° | 6、8 | 0.4000 | 5.885 米 | [64 ms 诊断](results/46135808044/raw/attempts/lattice/1/flight.json) · [v0.4 读取器](results/46135808044/raw/attempts/lattice/1/reader.json) |

实飞前的 9 个顶面探点均命中指定高度的朝上三角形。36 个起飞走廊探点的分世界最小间距为 6.800、7.354、6.942 米。实飞中根据控制器接触点、法线、表面及几何标识核对目标，完整网格清单中这三个顶面各自的容差范围内均无其他共面顶面重叠。三次第二个 LB 按下前的读数均为 0.5083 游戏秒、GLIDING，0.5250 秒观测到 DETACHING，0.7667 秒观测到 FLIGHT。三条轨迹均未采到小于 3.2 米的实体间距。[逐点网格清单](geometry.json) · [定向判读及状态切换](results/46135808044/raw/directed-summary.json)

表内定向滑行距离取自每 16 ms 读取一次的连续顶面接触区间，按相邻飞机中心位置的弦长相加。原 64 ms 诊断采到的连续距离分别为 12.762、4.430、4.430 米。官方 v0.4 读取器独立校验了三份 64 ms 诊断的 GLB、布局重开、滑行距离和护盾结果。默认五条沿用原 64 ms 采样。[五份默认读回](https://github.com/styayur/Skimmer-Scraper/blob/c67d8f87e5b920019a7d46a3b1b0ec9ba0608882/acceptance/final-web-011/results/main-ac943acd/shipped/readback.json)

## 产物与运行记录

下载托管归档后，按归档中每个文件的 SHA-256 核实原始字节，用 291 个细采样重算三条路线的判读。五条默认轨迹的指纹与先前永久收据逐一相符。另已核对三份正式读取结果、12 个按钮边沿及 105 个站点文件的哈希清单。[下载后的核对记录](results/46135808044/audit.json)

正式源为 `ac943acd6a2c6d21431aa138327bc3e64ed8552f`。主分支运行 46129442515 的产物 15256573631，归档 SHA-256 为 `65f99fab675febfe9f21d8c42b9f0b3ef7d71f7d97780a14e358ba6ba9943038`。105 个站点文件由托管 runner 直接提供。Chromium 153.0.8010.12 在 640 × 360 使用 SwiftShader。浏览器实际加载的 `/assets/index-yT2wa0pU.js` 为 1,307,632 字节，SHA-256 为 `176ab1ccad4a48f9aad5a73ca7f99c06d409807db34f5f797c3ad5ccc7a6483a`。本次只测飞行功能。[官方构建](https://github.com/styayur/Skimmer-Scraper/actions/runs/46129442515) · [托管文件哈希](results/46135808044/raw/SHA256SUMS) · [运行环境](results/46135808044/raw/runtime.json)

| 托管运行 | 起飞次数 | 结果与原始记录 |
|---|---:|---|
| [46132361340](https://github.com/styayur/Skimmer-Scraper/actions/runs/46132361340) | 0 | 几何清单的跨平台浮点逐值相等断言提前终止准备。[原始错误](results/46132361340/failed-step.txt) · [工作流提交和步骤](results/46132361340/run.json) |
| [46135715342](https://github.com/styayur/Skimmer-Scraper/actions/runs/46135715342) | 0 | 字节校验通过，12 个派生数值的最大差为 7.11 × 10⁻¹⁵。工作流的稀疏检出遗漏旧脚本读取的矩阵清单，准备停止。[原始错误](results/46135715342/failed-step.txt) · [归档收据](results/46135715342/run.json) |
| [46135808044](https://github.com/styayur/Skimmer-Scraper/actions/runs/46135808044) | 3 | 先归档正式客户端碰撞查询，再分别飞行，一世界一次。保留全部尝试、按钮前状态、细采样、原诊断和读取器输出。[完整原始目录](results/46135808044/raw) · [两个 Actions 归档及逐文件指纹](results/46135808044/run.json) · [派生浮点差异](results/46135808044/raw/preflight-float-check.json) |
