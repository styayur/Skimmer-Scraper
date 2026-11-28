# 正式 Web 67a56870 的固定输入重播

合并源码 `67a568705cd0cabe18d467f465ae745e784aa245`，Git 树 `a04cc7b34ac5369e3b8bf6dce84b7d851df9b1cf`。托管 runner 完成矩阵 34/34 条，其中 33 条达到原登记门槛，另完成历史默认入口 5/5 条。 [正式构建](https://github.com/styayur/Skimmer-Scraper/actions/runs/46141030022) · [托管重播](https://github.com/styayur/Skimmer-Scraper/actions/runs/46141326650) · [逐案指标](measurement.json)

官方主分支产物 15261239900 为 5,578,110 字节，ZIP SHA-256 `7796bba40957d8de01655992a4bd03c814828206ca1c30fce428b0192597519a`。页面实际加载 `/assets/index-Bsbba57z.js`，1,307,692 字节，SHA-256 `db070a006eb1e672ea92a994987cc563458aa5e2e621b4bafcda737564e8bd98`。独立归档、暂存站点与托管服务的 105 个文件哈希逐一相符，站点树为 `a97acaf4a40bed31ea0c1c123aa0328a0a7dcef17b4ce50a1be665fac397b80f`。 [归档收据](archive-receipt.json) · [逐文件封印](served-files.json) · [与上一版的构建对照](staged-distribution.json)

与 `ac943acd` 直接配对的 39/39 条飞行包含 2,455 个同步采样时刻。39 条完整轨迹、39 组指标逐项相同。矩阵记录了 34 次飞行尝试。每份新报告均核对 GLB 哈希、保存与重开布局、实际加载的 JS 入口、模拟时钟和按键时序。 [逐案差异](compare-ac943acd.json) · [上一版永久收据](https://github.com/styayur/Skimmer-Scraper/blob/c67d8f87e5b920019a7d46a3b1b0ec9ba0608882/acceptance/final-web-011/results/main-ac943acd/README.md)

## 冻结矩阵

must-succeed 为 10/10，must-reject 为 5/5，may-reject 为 18/19。矩阵共 0 次护盾受击，0 条出现采样机身侵入。

### development · 14/14

| 案例与原始轨迹 | 登记门槛 | 观测结果 | 达标 | 主动释放 | 护盾受击 | 最长采样滑行，米 |
|---|---|---|---|---|---:|---:|
| [ribbon-bridge-8131-cruise](development/ribbon-bridge-8131-cruise.json) | must-succeed | glide-and-release | 是 | 是 | 0 | 156.711 |
| [ribbon-bridge-8132-boost](development/ribbon-bridge-8132-boost.json) | must-succeed | glide-and-release | 是 | 是 | 0 | 181.768 |
| [s-curve-10243-cruise](development/s-curve-10243-cruise.json) | may-reject | glide-and-release | 是 | 是 | 0 | 114.266 |
| [helix-18731-boost](development/helix-18731-boost.json) | may-reject | contact-lost | 是 | 否 | 0 | 120.931 |
| [sky-arch-25057-cruise](development/sky-arch-25057-cruise.json) | may-reject | glide-and-release | 是 | 是 | 0 | 164.968 |
| [bowl-31607-boost](development/bowl-31607-boost.json) | may-reject | glide-and-release | 是 | 是 | 0 | 159.904 |
| [tunnel-40751-cruise](development/tunnel-40751-cruise.json) | may-reject | glide-and-release | 是 | 是 | 0 | 165.714 |
| [ribbon-bridge-48947-cruise](development/ribbon-bridge-48947-cruise.json) | must-reject | capture-missed | 是 | 否 | 0 | 0.000 |
| [s-curve-55001-boost](development/s-curve-55001-boost.json) | may-reject | contact-lost | 是 | 否 | 0 | 82.273 |
| [helix-62819-cruise](development/helix-62819-cruise.json) | may-reject | contact-lost | 是 | 否 | 0 | 122.799 |
| [sky-arch-71023-boost](development/sky-arch-71023-boost.json) | may-reject | glide-and-release | 是 | 是 | 0 | 237.486 |
| [bowl-79757-cruise](development/bowl-79757-cruise.json) | may-reject | glide-and-release | 是 | 是 | 0 | 166.529 |
| [tunnel-87337-boost](development/tunnel-87337-boost.json) | must-reject | capture-missed | 是 | 否 | 0 | 0.000 |
| [ribbon-bridge-95603-cruise](development/ribbon-bridge-95603-cruise.json) | must-succeed | glide-and-release | 是 | 是 | 0 | 109.885 |

### holdout · 6/6

| 案例与原始轨迹 | 登记门槛 | 观测结果 | 达标 | 主动释放 | 护盾受击 | 最长采样滑行，米 |
|---|---|---|---|---|---:|---:|
| [ribbon-bridge-104729-boost](holdout/ribbon-bridge-104729-boost.json) | must-succeed | glide-and-release | 是 | 是 | 0 | 182.904 |
| [s-curve-112909-cruise](holdout/s-curve-112909-cruise.json) | may-reject | contact-lost | 是 | 否 | 0 | 88.230 |
| [helix-120011-cruise](holdout/helix-120011-cruise.json) | may-reject | contact-lost | 是 | 否 | 0 | 127.284 |
| [sky-arch-131071-boost](holdout/sky-arch-131071-boost.json) | may-reject | glide-and-release | 是 | 是 | 0 | 237.487 |
| [bowl-140053-cruise](holdout/bowl-140053-cruise.json) | may-reject | glide-and-release | 是 | 是 | 0 | 166.529 |
| [tunnel-150001-boost](holdout/tunnel-150001-boost.json) | must-reject | capture-missed | 是 | 否 | 0 | 0.000 |

### second-holdout · 8/8

| 案例与原始轨迹 | 登记门槛 | 观测结果 | 达标 | 主动释放 | 护盾受击 | 最长采样滑行，米 |
|---|---|---|---|---|---:|---:|
| [ribbon-bridge-741401678-cruise](second-holdout/ribbon-bridge-741401678-cruise.json) | must-succeed | glide-and-release | 是 | 是 | 0 | 111.768 |
| [ribbon-bridge-936778437-boost](second-holdout/ribbon-bridge-936778437-boost.json) | must-succeed | glide-and-release | 是 | 是 | 0 | 182.483 |
| [ribbon-bridge-1753094196-cruise](second-holdout/ribbon-bridge-1753094196-cruise.json) | must-succeed | glide-and-release | 是 | 是 | 0 | 154.937 |
| [s-curve-873882295-cruise](second-holdout/s-curve-873882295-cruise.json) | may-reject | contact-lost | 是 | 否 | 0 | 88.231 |
| [bowl-1085831800-boost](second-holdout/bowl-1085831800-boost.json) | may-reject | glide-and-release | 是 | 是 | 0 | 159.904 |
| [helix-798281854-cruise](second-holdout/helix-798281854-cruise.json) | may-reject | contact-lost | 是 | 否 | 0 | 127.266 |
| [sky-arch-459273010-boost](second-holdout/sky-arch-459273010-boost.json) | may-reject | glide-and-release | 是 | 是 | 0 | 237.486 |
| [tunnel-1623444429-boost](second-holdout/tunnel-1623444429-boost.json) | must-reject | capture-missed | 是 | 否 | 0 | 0.000 |

### third-holdout · 5/6

| 案例与原始轨迹 | 登记门槛 | 观测结果 | 达标 | 主动释放 | 护盾受击 | 最长采样滑行，米 |
|---|---|---|---|---|---:|---:|
| [ribbon-bridge-2146666385-boost](third-holdout/ribbon-bridge-2146666385-boost.json) | must-succeed | glide-and-release | 是 | 是 | 0 | 133.501 |
| [ribbon-bridge-1566703471-boost](third-holdout/ribbon-bridge-1566703471-boost.json) | must-succeed | glide-and-release | 是 | 是 | 0 | 181.603 |
| [ribbon-bridge-1360618348-boost](third-holdout/ribbon-bridge-1360618348-boost.json) | must-succeed | glide-and-release | 是 | 是 | 0 | 183.673 |
| [s-curve-661077278-cruise](third-holdout/s-curve-661077278-cruise.json) | may-reject | contact-lost | 否 | 否 | 0 | 92.793 |
| [helix-699134824-boost](third-holdout/helix-699134824-boost.json) | may-reject | contact-lost | 是 | 否 | 0 | 120.902 |
| [sky-arch-1173553645-cruise](third-holdout/sky-arch-1173553645-cruise.json) | must-reject | capture-missed | 是 | 否 | 0 | 0.000 |

保留未达标案例 `s-curve-661077278-cruise`。释放采样时刻 2.3000 秒，状态 `RECOVERY`，最终判定 `contact-lost`。上一版结果为 `contact-lost`。 [完整飞行](third-holdout/s-curve-661077278-cruise.json)

## 五个历史默认入口

| 历史资产 | 默认捕获 | 主动释放 | 护盾受击 | 最长采样滑行，米 | 读回结果 |
|---|---|---|---:|---:|---|
| [Canopy](shipped/canopy.json) | 否 | 否 | 0 | 0.000 | capture-missed |
| [Caldera](shipped/caldera.json) | 否 | 否 | 0 | 0.000 | capture-missed |
| [Lattice](shipped/lattice.json) | 否 | 否 | 0 | 0.000 | capture-missed |
| [Contact Deck](shipped/contact.json) | 是 | 是 | 0 | 148.007 | glide-and-release |
| [Relay District](shipped/district.json) | 是 | 否 | 0 | 0.000 | contact-lost |

五份原始导出使用默认出生点，中性巡航、三名僚机，LB 在第 4 和 48 个 64 ms 输入区间触发。每份诊断由生产方读取器验算。[五份读回](shipped/readback.json)

归档下载后，又由 V2Wpro v0.4 的原版读取器核对全部五份报告的入口、世界指纹、结果、护盾和距离。[生产方完整读回](shipped/producer-readback.json)

同一产物的三个预登记手动入口另有独立结果，单独计数。[定向重播收据](https://github.com/styayur/Skimmer-Scraper/blob/c74fbcdd824341b83da430a5cd9799ac63af6274/acceptance/shipped-approaches-011/results/46141440292/README.md)

## 测量范围

Chromium 153.0.8010.12 使用 SwiftShader，640 × 360，游戏固定 120 Hz。实飞通过浏览器模拟的标准映射手柄送入 LB，原诊断按 64 ms 采样。输入归档 SHA-256 `d996f98c1f112fa8d793bace4a56c6233ad93c4d64663cb5477b4ef23f30617b`，测量脚本 `d66b343cdd88d7d499e77afa4a63e8e3594f2813`。实体手柄、无线链路和设备映射属于单独的硬件验证。 [冻结输入](../../inputs.json) · [托管子任务与归档](hosted-run.json) · [首组 20 条](compare-development-holdout.json) · [第二组 8 条](compare-second-holdout.json) · [第三组 6 条](compare-third-holdout.json)

7 个托管 ZIP 中的 141 个文件均核对了原始字节。重复的轨迹在索引中指向同一份 Git 副本。[逐成员路径及 SHA-256](artifact-members.json)
