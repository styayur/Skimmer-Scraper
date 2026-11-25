const chapters: ReadonlyArray<readonly [id: string, title: string, ...paragraphs: string[]]> = [
  ['guide-start', '快速开始',
    '点击开始游戏、按 Enter 或按手柄 A 起飞。首次起飞采用自由飞行、追尾视角和三台伴机，防护罩默认开启。飞机会向前飞行，先练习小幅滚转，再加速穿过开阔街谷。',
    '想改起飞规则时，在标题页按 F 打开飞行设置。飞行中可以按 Esc 暂停、按 C 换视角、按 T 使用文字电台。按 R 从当前世界重新起飞。'],
  ['guide-flight', '键盘飞行操作',
    'W 或 ↑ 压低机头，S 或 ↓ 抬高机头。A / D 或 ← / → 向左、右滚转。Q / E 向左、右偏航，Shift 加速。小幅按键适合贴近建筑，大幅持续滚转适合改变航向。',
    'Esc 暂停或返回，C 切换视角，R 重试。F 打开飞行设置，G 打开世界，M 打开机库，H 打开游戏教程，T 打开电台。启用语音输入后，按住 V 讲话。'],
  ['guide-pad', '手柄操作与重新映射',
    '标准手柄用左摇杆控制俯仰和滚转，右摇杆控制偏航，RT 加速，Y 切换视角，X 重试。菜单用十字键或左摇杆移动焦点，A 确认，B 返回。Start / Menu 暂停，Back / View 打开菜单。左右方向可调整选择框和数字。',
    '在高级设置的「操控与手柄」选择 Precision 或 Classic。推荐从 Precision、灵敏度 1、曲线 1.4、死区 0.14、水平恢复 1 和开启协调转弯开始。漂移时稍加死区，细微拨动发闷时降低死区或响应曲线。反转轴选项在下一次输入时生效。',
    '手柄轴和按钮编号从 0 开始。标准映射的俯仰、滚转、偏航轴分别为 1、0、2，RT 为 7，Menu 为 9，View 为 8。用未分配的按钮设定按住讲话，填 −1 解除。映射立即保存。浏览器未识别时，先回到游戏页面按一次键，再确认输入设备状态，或用键盘完成设置。'],
  ['guide-modes', '自由飞行与近距挑战',
    'Free Flight 适合探索和练习，可以离开所有建筑继续飞行。Challenge 适合练习贴近表面，存在离开表面和碰撞失败条件，会保存个人最好时间。',
    '先在标题页按 F，选择玩法，再起飞。新玩家推荐自由飞行。玩法在本次起飞时锁定，重试沿用当前选择。'],
  ['guide-rules', '防护罩、宽限时间与成绩',
    '挑战时，与可贴近表面的距离在 32 米内会锁定宽限。离开后开始倒计时，回到范围会补满。宽限可设为 1 至 15 秒，推荐先用标准 5 秒。挑战中的直接撞击仍会结束本次飞行。',
    '自由飞行的防护罩推荐开启。它在撞击时减速并将飞机推离障碍。标准个人挑战、自定义宽限和有伴机的挑战分别保存成绩。改动在下次起飞生效。没看到成绩时，先确认选择的是近距挑战。'],
  ['guide-view', '追尾与驾驶舱',
    'Chase 在飞机后方观察，能看到机体和周围伴机，推荐熟悉街谷和编队时使用。Cockpit 从机体内向前观察，适合沿固定方向飞越窗口和桥面。',
    '按 C、手柄 Y 或选择飞行设置里的视角。视角立即切换。驾驶舱被模型遮挡时，在「座舱位置」预览并调整锚点。'],
  ['guide-anchor', '座舱预设与自定义坐标',
    '在高级设置打开「座舱位置」。先选标准座舱，机头较短可试战斗机座舱，机身细长可试滑翔机座舱。模型挡住视野时，试高位座舱。勾选实时预览观察当前位置。',
    '自定义锚点以米为单位。X 向右，Y 向上，负 Z 向前，每轴可输入 −8 至 8 米。点击保存后，坐标立即应用到当前机型。每架飞机独立保存，切换模型会读取各自的设置。'],
  ['guide-companions', '三台伴机、编队与自主任务',
    'KITE-1 领航（青色），KITE-2 守护（暖金），KITE-3 侦察（玫红）。本地伴机能跟飞、避障和集合。推荐从三台伴机和楔形编队开始，狭窄通道可以采用纵队，开阔处可以展开。',
    '起飞前选伴机数量。高级设置可选择编队跟随、独立跟随或 1 号领航，飞行中也能用电台下令。伴机远离编队时会安全回归，狭窄区域可先让全体集合。'],
  ['guide-world', '世界生成、种子与世界记忆',
    '按 G 打开世界，输入任意数字或文字种子，或用随机种子探索。复制种子可以带走当前输入。选择生成并重载后，新设置会生效。旧版链接仍能恢复对应种子、世界模式和生成器。',
    '需要复现路线时推荐稳定世界。短暂世界会在区块完全卸载后改变部分城市，页面会话最多记住最近 256 个卸载区块。重载会开启新的短暂会话。重游时发现内部布局变化属于这一模式的规则。'],
  ['guide-ascendant', '龙脊天域与冠脊龙',
    '在世界主题中选择「龙脊天域 · Ascendant」。从谷底沿亮色岩层寻找石拱和双层通道，飞出峡口后沿断桥爬升到云海。主城浮岛的环形中庭通往岛底，东侧巨构的侧洞可横穿岩体。高空保留连续飞行。',
    '冠脊龙会从巢台起飞，沿山脊滑翔并绕岛返巢。翼尖横跨两个区块，接近时留意翼骨和摆动的尾扇。旧的龙脊幻境仍可通过原来的种子链接进入。'],
  ['guide-sky', '天穹翻转与镜像城市',
    '镜像城市是随种子和天空配色变化的远景地平线。它的街道、楼房和地面用于观察，飞行碰撞依然来自当前世界中的实体。',
    '在程序城市中向上飞，在上升时穿过 520 米会触发 Sky Inversion。完成翻转与俯冲会进入新世界。高级设置中可选择完整或快速转场。快速模式缩短翻转，俯冲前仍会等待出口碰撞与编队就绪。想减少画面旋转，可开启减弱视觉效果。连续完成五次穿越会解锁第五层天空的标记。'],
  ['guide-dragon', '龙脊幻境', '在世界菜单选择龙脊幻境，输入种子并生成。沿峡谷飞过石拱，向高处的浮岛神殿爬升。巨龙的身体和龙翼在近距离会形成移动障碍。网页版和桌面版共用同一套地形、航线和种子。Windows 版可在世界窗口展开「世界资源库」，可下载官方高精度包，也可选择含 world-pack.json 的文件夹。安装时逐块校验，完成后点「进入世界」。可重新校验或修复，下载取消后保留原有副本。移除副本只清理本机资源库。在高级设置的 Windows 桌面版中可选择新目录以复制资源库，导出或导入成绩与设置，以及手动检查正式更新。已导入的 GLB 可在世界菜单单独导出。'],
  ['guide-aircraft', '导入 GLB 飞机',
    '按 M 打开机库，选择自包含的 GLB 2.0 飞机。建议小于 48 MB 和 25 万三角面，纹理应嵌入文件。导入后点击机型即可选择。模型方向倒置时，用机库里的「旋转 180°」，并用座舱预览检查。',
    '模型存于此浏览器，最多可保存 24 架导入机型。只想暂时换回原机时，选择内置的 KITE-07。删除本机副本会同时清除机库条目。'],
  ['guide-import', '导入和保存 GLB 城市',
    '在世界设置打开「本地 GLB 世界」，选择或拖入自包含 GLB，然后分析场景。推荐从比例 1、向上轴 Y、自动出生点开始。确认方向和碰撞层后启用世界。比例范围为 0.001 至 1000，文件须在 128 MB 内。',
    '勾选保存可在此浏览器再次打开，最多保存 6 座城市，总量 256 MB。起飞时立刻碰撞时，检查比例和场景方向，再选开阔的出生点和朝向。输入文件损坏或带外部资源时，重新导出嵌入式 GLB。'],
  ['guide-motion', 'GLB 动画、运动路径与碰撞分类',
    '分析后可选择动画片段和循环播放，也可以选择参考姿态。刚体节点的碰撞跟随动画，骨骼或形变网格按参考姿态处理。「起飞前预览」和「显示碰撞层」可检查实际运动范围。',
    '为独立网格添加往返运动时，从较小偏移和数秒周期开始。偏移用网格父节点的原始坐标，周期允许 0.25 至 300 秒。将跑道和楼面设为可贴近表面，将阻挡物设为仅碰撞障碍，将无交互装饰设为装饰。调整后点启用世界使索引生效。'],
  ['guide-variants', '世界变体与复现',
    '启用本地 GLB 后，按 G 点击「生成新变体」可探索另一条航线。分离的建筑和浮岛可能移到别处，连接的桥梁会一起移动。合并网格和带动画的城市仍保持整体结构，改变比例、朝向及起飞路线。生成后回到首页，可立即起飞。',
    '喜欢当前路线时点「保留当前世界」。存在本地副本的城市刷新时会重建，未保留的世界会生成新变体。「复制种子」复制当前布局的完整编码。在别的浏览器粘贴时，如提示缺少文件，请选择匹配的原始 GLB，点击「分析场景」。',
    '程序城市仍识别普通数字与文字种子。需要复现时使用稳定世界，想探索街区重载后的变化时使用短暂世界。'],
  ['guide-radio', '文字电台与伴机指令',
    '按 T 打开电台，可输入「二号去侦察左侧」「全体集合」「一号领航」「保持队形」或「找一条安全路线」。发送后继续飞行，字幕与电台记录会显示应答，实际动作仍遵守避障和飞行规则。',
    '默认用本地电台，适合这些常用指令。连接模型可提问或发送更自由的请求。挑战中的地表接力有条件和次数限制。听不到声音时，电台仍能使用文字和字幕。'],
  ['guide-voice', '语音引擎、播报与按键讲话',
    '伴机默认只显示字幕。高级设置的「语音电台」可开启轻量设备语音，试听和调整音量。常规状态更新保留文字，重要提醒和直接回应可发声。',
    '选择「高级语音 · 需下载模型」后才从 Hugging Face 下载约 177 MB 的中文 Kokoro 模型，另有浏览器推理组件和三种声线。该模式需要支持半精度运算的 WebGPU。浏览器会尽量缓存下载，模型空闲 45 秒后释放运行内存，也可手动卸载。中文播报在本机合成。设备不支持、模型下载或合成失败时可回退系统语音，字幕始终可用。Windows 上的 Firefox 会在下载前回退。',
    '语音输入默认关闭。需要麦克风时，启用本机识别或 DeepSeek，第一次按住 V 后按浏览器提示授权，再按住讲话，松开提交。单次最多 12 秒，Esc 取消。可在高级设置的「控制」中配置手柄按键。建议先试对应的本机识别语言包。',
    'DeepSeek 输入发送已提交的录音，DeepSeek 播报发送需要念出的文字。按住讲话时会暂停播报，避免录入伴机的声音。暂停、重试和世界切换会丢弃旧播报。网站权限被拒绝时可按 T 使用文字。'],
  ['guide-ai', '模型、API Key、费用与隐私',
    '默认用本地伴飞。需要模型协作时，在高级设置选择 DeepSeek Flash、OpenAI 或受信任的兼容端点。输入自己的 Key 后点击连接。自定义服务必须支持 HTTPS 与浏览器直连，只向自己信任的端点发送 Key。',
    '规划默认间隔 8 秒，每页最多 20 次请求、约 50,000 Token 超限保护，超时默认 8 秒。游戏开始后才按所选模式请求。建议先用默认值并观察用量。DeepSeek 的转写、推理和播报由提供商计费，重新连接不会重置当前页面的限制。',
    'Key 只保留在当前页面内存，网页脚本运行时仍有机会读到它。模型服务收到必要飞行状态和主动发送的文本，录音须获浏览器许可才会开启。DeepSeek 转写只上传主动提交的片段。断开连接会清除内存中的 Key 并恢复本地伴飞。'],
  ['guide-graphics', '画质、视觉辅助与故障排查',
    '推荐平衡画质。显卡余量充足时可试高画质，感觉闪光或翻转太强时选择减弱视觉效果。画质、视觉强度和静音在调整后即时生效。声音和字幕可在各自的设置中调整。',
    '出现 WebGL2 错误时，检查浏览器硬件加速后重新载入。大型 GLB 卡顿时，使用较小场景或减少纹理。短暂出现区块缓冲时，游戏正在准备可碰撞区域，准备完成后会继续飞行。'],
  ['guide-privacy', '源码与开源许可证',
    'Skimmer-Scraper 从 v0.3.0 起采用 AGPL-3.0-only。旧版 v0.2.0 的 MIT 许可保留在发行包。静态发行包包含对应源码链接、项目许可证和第三方依赖的许可清单。',
    '无需账号。设置、成绩和导入的 GLB 使用本机浏览器存储。清理站点数据前，先保留需要复现的种子和原始模型。'],
];

export function bindGameTutorial(panel: HTMLElement): void {
  const search = panel.querySelector<HTMLInputElement>('#guide-search')!;
  const index = panel.querySelector<HTMLElement>('#guide-index')!;
  const content = panel.querySelector<HTMLElement>('#guide-content')!;
  const empty = panel.querySelector<HTMLElement>('#guide-empty')!;
  const rows = chapters.map(([id, title, ...paragraphs]) => {
    const link = document.createElement('a');
    link.href = `#${id}`;
    link.dataset.helpSection = id;
    link.textContent = title;
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.id = id;
    heading.tabIndex = -1;
    heading.textContent = title;
    section.append(heading, ...paragraphs.map(text => {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      return paragraph;
    }));
    index.append(link);
    content.append(section);
    return { id, link, section, searchText: [title, ...paragraphs].join(' ').normalize('NFKC').toLowerCase() };
  });
  rows.find(row => row.id === 'guide-graphics')!.section.append(panel.querySelector('#record-hint')!);
  rows.find(row => row.id === 'guide-privacy')!.section.append(panel.querySelector('#guide-source-links')!);
  rows.find(row => row.id === 'guide-world')!.section.append(panel.querySelector('#guide-legacy-link')!);

  const skyRecord = document.createElement('p');
  rows.find(row => row.id === 'guide-sky')!.section.append(skyRecord);
  panel.addEventListener('skimmer:open', () => {
    let unlocked = false;
    try { unlocked = JSON.parse(localStorage.getItem('skimmer-scraper.journey.v3') ?? '{}').fifthUnlocked === true; } catch { /* optional record */ }
    skyRecord.hidden = !unlocked;
    skyRecord.textContent = unlocked ? '已解锁 · 第五次穿越：天空记得同伴。' : '';
  });

  const filter = (): void => {
    const terms = search.value.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
    let any = false;
    for (const row of rows) {
      const visible = terms.every(term => row.searchText.includes(term));
      row.link.hidden = !visible;
      row.section.hidden = !visible;
      any ||= visible;
    }
    empty.hidden = any;
    index.hidden = !any;
  };
  search.addEventListener('input', filter);
  panel.addEventListener('skimmer:close', () => {
    search.value = '';
    filter();
    panel.scrollTop = 0;
  });
}
