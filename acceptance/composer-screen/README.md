# 末端屏幕输出与全屏 HDR 目标

Skimmer-Scraper 正式基线 `ac943acd` 的屏幕管线从第二帧起持有两个等大的全屏帧缓冲。候选 `b84ab55e` 在相同管线中只持有一个。托管 WebGL2 的 15 个采样点全部取得像素逐字节相等的 canvas，离屏和带后续读取者的两个对照也通过。候选只改动 `src/render/GameRenderer.ts`。[候选源码差异](https://github.com/styayur/Skimmer-Scraper/commit/b84ab55ef543e40f9c345445cb3b8d85089d2b40) · [托管运行](https://github.com/styayur/Skimmer-Scraper/actions/runs/46137729038) · [原始逐帧对比](results/46137729038-1/raw/comparison.json)

## 锁定源码中的读写顺序

两棵源码树都使用锁文件安装 Three `0.187.0`。核对的八个文件在两次构建中 SHA-256 相同，其字节也与 npm 记录的上游提交 `7e89746a687bb88271253698fa108b1dd59825d0` 的 Git blob 相符。[锁文件与构建指纹](results/46137729038-1/raw/builds.json) · [逐文件上游核对](results/46137729038-1/audit.json)

1. EffectComposer 创建一个半精度颜色目标并克隆第二个，初始读 `rt2`、写 `rt1`。WebGLRenderer 在首次绑定且尚无原生 FBO 时分配存储。两个 Three 对象可在 JS 中同时存在而无需两份原生存储。[EffectComposer 创建与初始角色](https://github.com/mrdoob/three.js/blob/7e89746a687bb88271253698fa108b1dd59825d0/examples/jsm/postprocessing/EffectComposer.js#L59-L105) · [WebGLRenderer 首次绑定](https://github.com/mrdoob/three.js/blob/7e89746a687bb88271253698fa108b1dd59825d0/src/renderers/WebGLRenderer.js#L2982-L3002)
2. RenderPass 先清屏并重画 `readBuffer`。Bloom 从其纹理提取亮部，使用自己的降采样目标，最终混合回同一 `readBuffer`。两者的 `needsSwap` 都是 false。这个配置里的下一帧会重新绘制场景。[RenderPass](https://github.com/mrdoob/three.js/blob/7e89746a687bb88271253698fa108b1dd59825d0/examples/jsm/postprocessing/RenderPass.js#L150-L167) · [Bloom 最终混合](https://github.com/mrdoob/three.js/blob/7e89746a687bb88271253698fa108b1dd59825d0/examples/jsm/postprocessing/UnrealBloomPass.js#L347-L371)
3. OutputPass 读取 `readBuffer.texture`，呈现到屏幕时绑定默认 framebuffer。它继承了 `needsSwap = true`，EffectComposer 在 pass 渲染结束后检查这个标志并交换引用。下一帧 RenderPass 首次绑定另一块目标，触发第二份原生分配。后续稳态帧交替复用两块存储。[默认标志](https://github.com/mrdoob/three.js/blob/7e89746a687bb88271253698fa108b1dd59825d0/examples/jsm/postprocessing/Pass.js#L40-L47) · [OutputPass 的两个输出分支](https://github.com/mrdoob/three.js/blob/7e89746a687bb88271253698fa108b1dd59825d0/examples/jsm/postprocessing/OutputPass.js#L90-L132) · [交换条件](https://github.com/mrdoob/three.js/blob/7e89746a687bb88271253698fa108b1dd59825d0/examples/jsm/postprocessing/EffectComposer.js#L232-L257)

候选在这个 OutputPass 的 render 中按当帧的 `renderToScreen` 设置 `needsSwap`，继续调用原 OutputPass。关闭 composer 的屏幕输出、或在后面添加读取其结果的 pass 时，OutputPass 仍写另一块并交换。实验中这两个对照都实际分配了两块并正确呈现像素。从离屏切回屏幕后，两块已分配的目标仍有可查询的原生句柄，直至后续尺寸变化或释放。[逐帧绑定、交换与原生句柄](results/46137729038-1/raw/candidate/observations.json)

## 原生分配与容量

通过实际 `texImage2D` 和 `renderbufferStorage` 调用记录尺寸、格式与对象，再查询已存在 FBO 的附件位数、深度 renderbuffer 尺寸、采样数及 framebuffer 完整性。每块目标有单级 `RGBA16F` 纹理（8 字节/像素）及 `DEPTH_COMPONENT24` renderbuffer（3 字节/像素有效位），无 MSAA 样本。统计只含 composer 的两个候选目标。随尺寸变化退役的原生 FBO、颜色纹理和深度 renderbuffer 均有删除记录。[查询实现](targets.mjs) · [基线原始分配记录](results/46137729038-1/raw/base/observations.json)

| 实际画布像素 | 稳态基线目标 | 稳态候选目标 | 基线附件有效字节 | 候选附件有效字节 | 节省 |
|---|---:|---:|---:|---:|---:|
| 480 × 270，均衡 | 2 | 1 | 2,851,200 | 1,425,600 | 1.360 MiB |
| 576 × 324，resize 后均衡 | 2 | 1 | 4,105,728 | 2,052,864 | 1.958 MiB |
| 768 × 432，高画质 | 2 | 1 | 7,299,072 | 3,649,536 | 3.480 MiB |
| 576 × 324，切回均衡 | 2 | 1 | 4,105,728 | 2,052,864 | 1.958 MiB |

构造时两版均有零个已分配的 composer 原生 FBO。首次绘制、resize 后首帧、每次画质切换后首帧都是 1 对 1，各尺寸的第二帧才出现 2 对 1。同场景首次绘制时 Three 统计的总纹理数为 18，第二帧基线上升至 19，候选仍为 18。所有容量取驱动公开的附件位数。驱动对齐、压缩、显存驻留量及硬件帧时需要其他测量。以相同附件格式推算，1920 × 1080 的单块有效载荷为 21.753 MiB。[原生句柄、颜色和深度格式](results/46137729038-1/raw/base/observations.json) · [逐帧数值摘要](results/46137729038-1/audit.json)

## 像素对照和再现条件

同一托管 Chromium 153.0.8010.12、ANGLE Vulkan SwiftShader，按基线、基线复跑、候选顺序使用独立的浏览器上下文。夹具直接构建各提交的生产 GameRenderer、WorldStreamer、Kinetic City 生成器和飞行模型，用同一批已经完成加载的 9 个区块（种子 334458，42 栋建筑、18 座桥）。固定随机种子 191147、时钟、相机姿态与动画步长。通过真实 resize 与 setQuality 路径使像素比在 1.5 与 2 之间切换。固定场景的相机矩阵、投影、绘制调用与三角形、AA、阴影与 Bloom 设置均逐帧核对。[预登记步骤与阈值](https://github.com/styayur/Skimmer-Scraper/blob/da7a11d55956ec79cbfe1098602455900bc813d1/acceptance/composer-screen/plan.json) · [渲染夹具](fixture.mjs)

从默认 framebuffer 同步读出 RGBA8，逐通道比较，并归档全部 45 张无损 PNG。15 对候选与基线合计 3,006,720 个像素，变化像素数、最大通道差、平均绝对通道差和超过 1 LSB 的像素数都为零。独立基线复跑的 15 对结果也完全一致。所有 GL 错误码均为零。普通生产构建与类型检查均通过。基线生产入口与正式 Web 的 SHA-256 `176ab1ccad4a48f9aad5a73ca7f99c06d409807db34f5f797c3ad5ccc7a6483a` 相同。候选生产入口 SHA-256 为 `42a0657a6c6a568fa2b0271044663d1c2fbee03c3a8294fe5eb4617fe6a1d783`。像素证据来自独立渲染夹具。[两个生产入口和两个夹具入口的指纹](results/46137729038-1/raw/builds.json) · [基线画面](results/46137729038-1/raw/base) · [基线复跑](results/46137729038-1/raw/base-repeat) · [候选画面](results/46137729038-1/raw/candidate)

本次托管运行的失败项为空。Three 在所有上下文中都报告原有阴影模式回退，首个上下文另有驱动对同步 readPixels 的停顿提示。原始控制台消息随每组观测保留。测试范围为这一固定场景的存储与像素，未测独显帧时或进程显存。归档包括 50 个文件，并已按 GitHub 返回的 SHA-256 核验。[运行与归档收据](results/46137729038-1/receipt.json) · [三组 PNG 与原始 RGBA 校验](results/46137729038-1/audit.json)
