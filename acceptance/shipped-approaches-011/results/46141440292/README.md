# 正式 Web 67a56870 的三个预登记手动入口

Canopy、Caldera、Lattice 各从原登记的出生点实飞一次，三次都持续捕获了指定顶面，在第二次 LB 主动释放，最后回到自由飞行。三次护盾受击均为零。每次通过普通世界库保存、重载并重开同一布局，使用浏览器模拟的标准映射手柄。实体手柄、连接方式和端到端输入延迟属于单独的硬件验证。[预登记设计](https://github.com/styayur/Skimmer-Scraper/blob/1ccf35240747aeb7405679d1b517823a7b3f072b/acceptance/shipped-approaches-011/DESIGN.md) · [托管实飞](https://github.com/styayur/Skimmer-Scraper/actions/runs/46141440292)

| 世界与目标 | 出生位置，米 | 航向 | 两次 LB 区间 | 连续目标样本 | 目标弦长 | 全程最小采样实体间距 | 原始记录 |
|---|---|---:|---|---:|---:|---:|---|
| Canopy · box-64 | (−29, 15.8, −23.5) | −90° | 4、8 | 16 | 16.075 m | 6.321 m | [16 ms](raw/attempts/canopy/1/frames.json) · [64 ms](raw/attempts/canopy/1/flight.json) · [读回](raw/attempts/canopy/1/reader.json) |
| Caldera · mound-49 | (−4.85, 26.4, −49.5) | 180° | 6、8 | 8 | 7.190 m | 6.510 m | [16 ms](raw/attempts/caldera/1/frames.json) · [64 ms](raw/attempts/caldera/1/flight.json) · [读回](raw/attempts/caldera/1/reader.json) |
| Lattice · box-0 | (−22, 7.84, 57.2) | −45° | 6、8 | 8 | 7.190 m | 5.885 m | [16 ms](raw/attempts/lattice/1/frames.json) · [64 ms](raw/attempts/lattice/1/flight.json) · [读回](raw/attempts/lattice/1/reader.json) |

正式源码为 `67a568705cd0cabe18d467f465ae745e784aa245`，Linux 主分支运行 46141030022，产物 15261239900。浏览器实际载入 `/assets/index-Bsbba57z.js`，SHA-256 `db070a006eb1e672ea92a994987cc563458aa5e2e621b4bafcda737564e8bd98`。托管 runner 先保存原始碰撞查询，再开始三条航线。[分发身份](raw/runtime.json) · [碰撞查询](raw/geometry-survey.json) · [全部尝试和归档哈希](run.json)

与 `ac943acd` 的定向收据逐项比较，三份原诊断共 75 个 64 ms 飞行样本和三组指标全部相同。细采样中的 Three 几何 UUID 由各浏览器会话生成。保留了两次的原始 UUID 和一一对应关系。仅对该字段按实例对应后，291 个 16 ms 样本、12 个按钮边沿及全部碰撞探点均相同。三个历史 GLB、输入时序和定向判定条件均沿用预登记版本。这三条另行计数。[逐世界差异和原始 UUID](compare-previous.json) · [前次永久收据](https://github.com/styayur/Skimmer-Scraper/blob/68a9b1f9a04aed4898565f8197ba2c9503d2ad8a/acceptance/shipped-approaches-011/README.md)
