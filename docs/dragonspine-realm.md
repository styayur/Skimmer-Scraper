# Dragonspine

按 G 打开世界窗口，选择 Dragonspine 并输入种子。种子 334458 的起始峡谷通往石拱和穿山通道。飞出峡口后可沿断桥爬升到云海。主城浮岛的环形中庭通往岛底。冠脊龙从巢台起飞，沿山脊和浮岛巡游。

| v0.8.2 输入 | 当前版本行为 |
| --- | --- |
| theme=ascendant | 使用同一套地形、碰撞和种子，沿用原有成绩键。复制种子将产生 theme=dragonspine。 |
| theme=dragon | 使用原种子进入 Dragonspine，显示恢复提示。原地图的成绩和高精度资源留在本机，供 v0.8.2 恢复使用。 |
| 城市链接或导入 GLB | 城市种子格式、导入记录和本地资源库沿用原格式。 |

Windows 的官方高精度包装载已有的 schema 2 分块。资产 ID 和校验值保留，以便使用已经下载的包。资源库仍可显示和校验旧地图资源。回退前可用 Windows 设置导出飞行员存档，并用世界菜单单独导出 GLB。使用 v0.8.2 相同安装身份与浏览器配置，访问原链接可读取历史成绩和资源。需要在 v0.8.2 重开当前地图的新链接时，将 theme=dragonspine 改为 theme=ascendant。

从仓库根目录运行以下命令可生成独立世界包。

    node scripts/build-dragon-pack.mjs <空输出目录> [web|high] [uint32 seed]

地图和碰撞可由代码生成。资源包只补充渲染地表，冠脊龙的编辑源与构建脚本位于 art/dragonspine。
