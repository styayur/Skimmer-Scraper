# Kinetic City 联合验收

本目录记录游戏实际执行过的输入、导入的资产和观测结果。每份飞行记录保留自身构建身份。发行附件中的版本报告另列正式网站、Windows 安装器和便携程序对应的身份与校验值。

## 从编辑器到玩家

Motion Inspector 打开 Switchyard 的游戏目录项。玩家确认后，游戏按固定的 V2Wpro 提交下载 326,792 字节的 GLB，检查 SHA-256 并预检网格。保存布局再启动时，游戏从本地恢复原来的出生点、变体和 6,100 个碰撞三角面。玩家可把观察记录手动交回 Inspector。集成构建 `3749724` 的这次飞行记录到 168.0 米连续滑行、6.00 米最低采样净空和零撞击。复现命令为 `python scripts/verify-partner-handoff.py <V2Wpro提交> <游戏提交> <新目录>`。本地候选站点的实测使用 `--preview-sites` 参数。[首次导入和重开后的两份记录](partner-handoff/reopened-3749724) · [脚本](../../scripts/verify-partner-handoff.py)

## 城市与贴面飞行

Kinetic City 用共享端口连接分区。相同种子可在不同访问顺序下重建几何并恢复碰撞。等价比较覆盖 16 个区块、774,400 平方米，计入材质、两级渲染网格和碰撞。生成输入的 gzip 总量为 67,765 字节，烘焙资产为 1,733,035 字节。Dragonspine 的可选峡谷桥使用同一套端口方法。[实机城市画面](../v0110/kinetic/kinetic-helix.jpg) · [峡谷桥](../v0110/kinetic/dragonspine-span.jpg) · [等价范围及三角面统计](../v0110/kinetic/comparison.json) · [卸载、重载及误差](../v0110/kinetic/geometry.json)

固定步长为 120 Hz。弯廊、跨区块斜折面、螺旋、平移平台及缺失支撑的夹具分别测量了捕获、脱离和碰撞。在汇合处被移动面板封住的负例中，控制器开始脱离后，中性输入仍撞到了面板。修正带状桥接触判断前，首个集成候选在四个要求成功的桥面场景中均提早失去接触。原始轨迹和修正后的对照均保留。[复杂曲面及边界条件](../v0110/surface-glide/README.md) · [带状桥根因与对照](../v0110/surface-glide/ribbon-recheck/README.md) · [跨区块贴面轨迹](../v0110/surface-glide/kinetic-socket.json)

## 规则修正与盲测

使用相同的发布版 v0.10.0、GLB 导入流程、LB 输入时刻和接近姿态，第一轮修正降低拱顶与碗面的纵向起伏，第二轮移动螺旋下降段以留出脱离空间。六个对齐输入达标数依次为 3、5、6。另一次碗面实验只调整配方的起伏系数。在一个已知问题种子及三个预先选定的新种子上，原碗面各出现一次护盾撞击，较浅配方四次均主动脱离。固定二十种子的原始成绩保留。输入设备由测试驱动模拟，最终报告单列实体手柄证据。[固定矩阵、各轮原始轨迹和独立留出](../joint-flight/topogenesis/README.md) · [碗面配对实验](../joint-flight/topogenesis/bowl-relief/README.md) · [生成器核对索引](https://github.com/styayur/V2Wpro/blob/3e4afa56c92d2f5f517e2b35f5785c061410d8f1/evidence/topogenesis/engine-feedback.json)

## 控制器对照

构建 `946d2f7e` 的 34 条轨迹有 33 条达到预先规定的条件。原始 20 条和后来公开的 8 条回归轨迹全部达标。新控制器冻结前保密的 6 条中，3 个加速带状桥、1 个螺旋和 1 个空中拒绝场景达标。余下的斜向 S 弯在规定脱离时刻仍处于恢复阶段，约 0.067 秒后进入自由飞行。34 条均为零护盾撞击、零采样穿透。[逐例结果、三组原始对照和时间戳](../joint-flight/topogenesis/integrated-946d2f7e/results.md) · [主动脱离的逐物理步对照](../v0110/surface-glide/ribbon-departure/README.md)

## 前台性能与资源

Radeon 780M、D3D11、1920 × 1080、High 画质的首轮长飞，每端每版本均覆盖至少 901 秒。Web 的均值由 85.19 变为 86.20 FPS，p95 由 17.9 变为 17.0 毫秒。Windows 的均值由 78.08 降至 72.58 FPS，降幅 7.04%，超出 5% 目标。p95 由 23.7 变为 25.0 毫秒。两版自由航线触发的自然翻转次数不同。单独的 Kinetic City 180 秒前台预算测试中，两端均最多驻留 36 个区块和 36 棵静态碰撞树，上限为 41 个区块。[四份长飞原始记录及两端新城市预算](../foreground-qualification/README.md) · [合并版本预先登记的复验航线](../foreground-qualification/final-repeat.md)

## 伴机、记忆与历史存档

领航、侦察和脱离空间检查都由当前世界的几何确认。三个角色在两个城市种子上分别完成任务。旅程记忆默认关闭。记录包含历史世界身份，玩家可以查看、单条删除或清空。向模型提供历史摘要使用单独授权。[飞行任务与转向](companions/README.md) · [存储和删除记录](companions/journal-lifecycle.json)

在四套独立的 Windows 当前用户安装中，分别从 v0.8.2、v0.9.1、v0.9.2、v0.10.0 升到首个候选，再回退至 v0.10.0 并重新升级。每步保留安装包和程序哈希，以及成绩、设置、世界、SQLite 和玩家启用后的旅程记录。Linux 原生构建使用保留真实 GLib 版本号的修补源码。[四条安装路径的收据](windows-lifecycle/candidate-0a5272b/receipts.json) · [Linux 修复来源](../../security/glib-backport.md) · [已核验的上游警报处置](https://github.com/styayur/Skimmer-Scraper/issues/71#issuecomment-7234653999)
