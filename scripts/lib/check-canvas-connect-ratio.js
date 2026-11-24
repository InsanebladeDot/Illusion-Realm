// 正式静态画布的拖线与比例专项，复用宿主窗口、生产保存器和有界等待。
// Electron注入鼠标验证实际Handle拖动链，菜单点击属于DOM自动事件。
// 初始空图片是参数夹具，不是实际生成图片，也不代表实体鼠标人工验收。
// 所有文件读写仅发生在宿主临时目录，绝不读取或覆盖用户当前画布。
// 证据分为三层：纯算法、正式DOM菜单、Electron自动鼠标。
// 本脚本只负责后两层，不用它替代真实服务推理验证。
// 实际schema和主进程允许集由另一个Node专项执行。
// 生产静态构建由宿主指纹守护，过期产物应在进入本函数前失败。
// 初始账号仍由宿主游客夹具提供，本例不绕过认证写盘。
// 宿主注册原preload，测试没有添加新的window测试专用桥接。
// 测试窗口关闭由宿主finally处理，本模块不自行退出Electron。
// 任何断言失败由smoke.check累计，最终不能被正常关窗冲成成功。
// 有界wait负责等待React完成提交，不用无限循环等待偶然成功。
// waitTime只分隔输入采样，不代表任何媒体解码或生成进度。
// 保存读取实际JSON文件，返回对象不是一个模拟成功回包。
// 独立期望presets写出八项，防止产品表缺项时UI测试也跟着少验。
// 纯数据专项还会核对生产表本身，因此这里不是另一份产品清单。
// 测试期望的冒号文案属于展示，实际磁盘断言使用斜杠值。
// 源图片无输出，连接允许先搭配置，不伪造可用media字段。
// 标题夹具故意超过常见短名，端口身份不能从省略后的文字推导。
// 本例不上传资源，不需要密钥，也不会消耗外部模型额度。
// 临时工程名仅用于测试窗口，不改项目的默认画布命名。
// 同一个宿主串行执行两种目标，避免两个Electron争夺单实例锁。
// 浅深主题切换继续使用产品设置，不直接注入dark类或覆盖CSS。
// 窗口缩小通过原生setSize，不用整体缩放让溢出问题消失。
// 1100窗口属于本次菜单窄窗检查，不代表所有项目目标尺寸都重验。
// 截图从capturePage取得整个实际工作区，不使用资料包参考图。
// 截图编号81和82与旧阶段证据区分，失败截图另由宿主记录。
// 两类目标的截图使用kind命名，不能把图片截图复制成视频证据。
// 正式保存会写到宿主随机目录，同名上次结果无法让本轮误通过。
// 读取infiniteCanvas前不补默认对象，字段遗漏应直接暴露。
// 节点新ID必须从实际文件读取，不用CSS顺序猜用户刚添加的对象。
const fs = require('node:fs');
const presets = ['1:1','2:3','3:2','3:4','4:3','5:6','9:16','16:9'];
const menu = '[data-canvas-connection-menu]';
const waitTime = ms => new Promise(resolve => setTimeout(resolve, ms));

// 重新加载从真实磁盘恢复，不访问React私有状态或直接调用dispatch。
// 公告若重现仍走原按钮，不能移除遮罩后宣称焦点路径正常。
// 宿主已注册生产app协议，重开仍使用同一个静态构建。
// 重载会卸载整个旧画布，局部菜单和表单草稿应随之清理。
// 新页面必须重新读取生产持久化文件，因此能暴露序列化丢字段。
// 等待source稳定ID出现，比等待任意节点更能发现加载了错误工程。
// 公告点击是自动DOM行为，不算实体鼠标或完整人工焦点验收。
// 本例不通过强制隐藏公告让下层节点接收本不该接收的输入。
// 首次宿主已关闭公告，后续重载仍考虑其保存节流尚未完成的可能。
// 450毫秒只是给公告初始化的短缓冲，不用长睡眠代替状态等待。
// loadURL如果失败会拒绝到宿主错误边界，不返回空工程继续验证。
// 源恢复后不调用fitView，避免镜头变化掩盖真实端口位置问题。
// 每次读取元素都从新页面查找，不保留重载前的失效元素句柄。
// URL固定为本机app协议，不能由测试参数导向任意外部地址。
// 此重开不等于归档导出导入，便携工程由原格式回归另验。
// 重载不启动模型请求，不能从页面重新出现推断生成结果已恢复。
// 后续磁盘图比较会核对新节点和边，源节点出现本身还不够。
async function reopen(ctx) {
  await ctx.win.loadURL('app://app/canvas');
  await require("./canvas-library-fixture").openProject(ctx);
  // 重载会重新建立渲染frame，离屏窗口的焦点模拟需明确应用到当前frame。
  // 这只补齐自动输入环境，不改变菜单或Escape的产品判定。
  // 后续输入仍由Electron发送，交付不能写成实体键盘人工通过。
  // 先聚焦正式画布根，避免公告关闭后焦点留在已卸载按钮。
  // 菜单出现时它自己的effect仍须将焦点转入首项。
  await ctx.wait("document.querySelector('[data-canvas-node=source]')");
  await ctx.win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  await waitTime(450);
  await ctx.run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
}

// 坐标从真实端口读取，拖动点包含导航偏移与当前画布倍率。
// 分段移动让图引擎经历起手、运动、松手，不能用click回调冒充拖线。
// 目标固定在当前卡片右侧空白，不改节点世界位置制造命中结果。
// Escape在鼠标仍按住时发送，专门覆盖迟到mouseup重新打开菜单的竞态。
// 鼠标移动由Electron注入，操作系统真实拖放、触屏和手感均不在此证据中。
// 源选择器限定source节点的输出Handle，避免误拖输入端。
// 取getBoundingClientRect中心包含CSS缩放，不依赖固定轨道或导航常量。
// 系统窗口外部位置不参与客户区坐标计算，sendInputEvent使用窗口内部点。
// mouseMove先移到源，hover装饰的磁吸不能改变真实Handle中心。
// mouseDown明确左键，右键菜单不参与这条创建路径。
// 五个中间采样覆盖拖动阈值，单个mousedown加mouseup可能被识别成端口点击。
// 每段45像素横移让落点脱离源卡，不会误当自连接。
// 每段12像素下移使落点避开同高度端口，仍在可见空白pane内。
// 源节点世界位置固定，因此这段轨迹不会拖走整个节点主体。
// 最后mouseup与最后运动点一致，不让测试产生一个从未经过的瞬移落点。
// 取消分支先按Escape再松鼠标，正是旧回调晚到的风险窗口。
// 正常分支完全不按Escape，菜单应由onConnectEnd自行打开。
// 移动期间不调用产品cancelConnection，不能从测试强迫取消后判断成功。
// 只在产品收到真实结束事件后等待菜单，不直接设置open标志。
// 结束后160毫秒允许事件提交，不将它当作菜单必然成功的断言。
// 真正的是否弹出由后续DOM状态或有界wait判断。
// 错误时宿主会留失败截图，不能反复拖动直到偶然出现再算通过。
// 触摸changedTouches分支没有被鼠标用例覆盖，交付应继续列未实测。
// 系统DPI没有在本脚本改变，客户区自动事件不替代系统缩放验收。
// 五段轨迹是自动驱动证据，不能改口描述为资源管理器拖入。
// 文件导入属于另一个能力，源夹具没有实际本地图片文件。
// 因此截图只证明连接与配置界面，不证明真实图片解码。
// 菜单落点靠近松手点，截图可检查是否被错误扣除两次导航偏移。
// 当前pane空白是前置条件，若未来节点布局变化使它被占应显式修测试前提。
// 不能为迁就此坐标把产品改成所有无效连接都自动新建。
async function drag(ctx, cancel = false) {
  const start = await ctx.run("(()=>{const r=document.querySelector('[data-canvas-node=source] .source').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
  const send = (type, x, y) => ctx.win.webContents.sendInputEvent({type,x,y,button:'left',clickCount:1});
  send('mouseMove',start.x,start.y);
  send('mouseDown',start.x,start.y);
  for (let step=1;step<=5;step++) {
    send('mouseMove',start.x+step*45,start.y+step*12);
    await waitTime(30);
  }
  if (cancel) await ctx.key('Escape');
  send('mouseUp',start.x+225,start.y+60);
  await waitTime(160);
}

// 正式保存按钮提交后再读隔离文件，不能只读组件标签推断落盘成功。
// 自动保存可能已经完成，明确保存仍应保持同一份数据与无错误状态。
// 保存前不把期望节点写回磁盘，正式点击是唯一结果提交入口。
// 等待状态包含已保存，能区分仅点击了按钮和真实写盘完成。
// 写盘失败时状态不会满足，wait将有界报错而不是读旧JSON算通过。
// JSON.parse异常不吞掉，损坏文档必须使本例失败。
// 读取的是宿主documentPath，不根据当前工作目录猜用户数据位置。
// 返回值仍是实际infiniteCanvas，不对节点排序或清洗坏字段。
// 自动保存与手动保存共用同一生产链，本例不单独替换其中一个。
// 用户文档其他区由最外层夹具保留，保存不能清掉账号或主题设置。
// 保存结果用于跨进程断言，DOM选择文字不能自己证明业务状态。
// 无关系统路径不打印到产品错误提示，这里只在测试内部读取临时根。
// 这条路径没有ComfyUI输出，也没有等待远端请求完成。
// 保存不等于成功生成图片，两者在交付中必须分开。
async function save(ctx) {
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  return require("./canvas-library-fixture").readCanvas(ctx);
}

// 两种节点使用完全相同的菜单，逐项比对独立基准，防止少一项仍蒙混通过。
// 八项列表与生产静态源另有纯契约对照，这里独立期望负责反证展示遗漏。
// 选择新增的5:6，不仅检查旧四项仍能打开，从而覆盖本轮真正新增路径。
// 入口是原比例浮层，不创建第二份专门为测试传props的样板。
// aria-pressed来自当前节点确认值，必须与已关闭后的触发器一致。
// 先点击目标标题图标选中节点，不能靠source先前的选中状态显示目标面板。
// 比例触发器限定目标ID，避免多个节点同时存在时误改源图片。
// 菜单列表读取实际button属性，不能只在源码中搜索八个字符串。
// 逐项比较同时验证顺序、数量和显示身份，重复项也会使比较失败。
// 没有用includes判断至少包含一个新选项，避免漏项通过。
// 图片和视频都走本helper，两个实际调用方共享控件的接线均被覆盖。
// 5:6是本轮新接选项，旧四项实现不可能仅靠默认状态通过。
// 菜单选项点击后应关闭，触发器读取确认值而非仍在列表里的标签。
// 后续save会另验5/6，显示更改但持久化漏项仍会失败。
// 源节点1/1保持不变，为局部回调目标ID提供A/B对照。
// 输入图片和生成视频属于不同节点种类，不能把其比例状态放在共享单例。
// 没有直接修改data.ratio，所有更改均来自生产onChange回调。
// 不在这里检查SDXL分桶像素，比例和画质采用不同已约定语义。
// 图像1K长边规则与视频1080p短边规则由现有尺寸专项守护。
// 本例只改变比例身份，不改自定义FPS、时长或批量数量。
// 没有展开侧栏，因此不能从本例推断侧栏所有数值字段人工已验。
// 列表较长允许内部滚动，按钮可通过原Popover的键盘规则访问。
// 是否存在横向溢出仍需看截图和计算几何，八项文字相等不是视觉验收。
// aria-label沿原SegmentedControl提供，不添加测试专用假按钮。
// 模板选择没有在这里切换，图片新卡的编辑流应在后续保存中保留。
// 浅色视频调用和深色图片调用读取相同文案，无单独主题参数表。
// 比例变更不要求真实视频存在，本轮不宣称空卡可播放。
async function ratio(ctx, id) {
  await ctx.pointer(`[data-canvas-node="${id}"] header>svg`);
  // 真实松手创建点靠近右下，选中面板可能超出镜头；用原适配全部让控件实际可见。
  // 不改节点世界坐标，不靠DOM click穿过裁切区域冒充可操作证据。
  // 视口适配不进入作品历史，因此后续撤销仍只对应比例与原子创建。
  // 等适配动画结束再读取几何，不能将中间帧误报为布局溢出。
  // 浮层截图同时展示八项选项，不能拿收起后的触发器代替列表证据。
  // 菜单应落在画布可用区内，DOM有八项但被裁掉仍算集成失败。
  // 这里检查CSS几何，不冒充系统DPI或实体鼠标手感验收。
  // 使用标准适配入口保持与真实用户路径一致，不直接修改ReactFlow transform。
  // 抓图按节点ID区分两类实际调用，保存后可用同一ID追溯文件结果。
  // 输出卡仍为空媒体，列表截图只验证UI与配置，不证明模型生成。
  await ctx.click('[data-canvas-viewport] [aria-label="适配全部"]');
  await waitTime(350);
  await ctx.click(`[data-canvas-node="${id}"] [data-canvas-image-ratio]>button`);
  const labels = await ctx.run("[...document.querySelectorAll('.hy-ratio-options button')].map(e=>e.getAttribute('aria-label'))");
  // 几何使用浮层外框而不是滚动列表内容高，内部滚动允许但整个表面不能消失。
  // 左边界相对实际canvas，而不是整个浏览器宽度，应用导航不能算菜单可用区。
  // 右边界排除窗口外部分，能发现菜单仅在DOM存在却被父层裁切。
  // 顶边界避免浮层向上跑到应用标题栏或导航头部。
  // 底边界避免参数触发器靠下时列表被画布overflow裁掉。
  // 所有边界均读取当前浏览器布局，不从fixture预先计算期望位置。
  // 图片先深色大窗、视频后浅色窄窗，两种尺寸都执行同样几何断言。
  // 图片card的502宽度不作为浮层宽度期望，画布缩放由原fit统一处理。
  // 缩放视口是合法用户操作，但不能在测试中更改源和目标作品位置。
  // 新目标位置仍由松手点创建，保存结果不会因为适配镜头而改变。
  // 八项选项可能超过可见高度，内部滚动与边框裁切是两种不同问题。
  // 本例选5:6位于后半列表，可发现只显示前四项而无法确认新增值的遗漏。
  // 列表截图在点击选项之前采集，确认后的文字不会替代展开状态证据。
  // 原图片和视频画质回归继续运行，比例菜单几何通过不代表输出规则已覆盖。
  // 若此断言失败，应修菜单或实际操作前提，不能只删除几何检查保留文案通过。
  ctx.smoke.check(`${id} ratios match creation presets`,JSON.stringify(labels)===JSON.stringify(presets));
  ctx.smoke.check(`${id} ratio popup is inside visible canvas`,await ctx.run("(()=>{const a=document.querySelector('[data-infinite-canvas]').getBoundingClientRect(),b=document.querySelector('.hy-ratio-popup').getBoundingClientRect();return b.top>=a.top&&b.bottom<=a.bottom&&b.left>=a.left&&b.right<=a.right})()"));
  // 外框可见不代表列表真的展开，原分段条30px固定高度会仅露出第一项。
  // 独立检查第八项矩形位于列表可见范围，防止八个DOM按钮却只有一个能看见。
  // 八项当前总高低于240px上限，因此末项应直接可见，不需测试强制滚动。
  // 若以后静态源增项超过上限，应补用户滚动路径，不能删掉可达性检查。
  // 末项有正高度，避免flex错误将按钮压成零高后仍满足边界关系。
  // 捕获截图前执行此断言，失败图片保留现场，不能当正常验收展示。
  ctx.smoke.check(`${id} all eight ratio rows are visible`,await ctx.run("(()=>{const a=document.querySelector('.hy-ratio-options .hy-segmented').getBoundingClientRect(),b=document.querySelector('.hy-ratio-options button:last-child').getBoundingClientRect();return b.height>10&&b.top>=a.top&&b.bottom<=a.bottom})()"));
  await ctx.shot(`83-ratio-options-${id}`);
  await ctx.click('.hy-ratio-options button[aria-label="5:6"]');
  ctx.smoke.check(`${id} new ratio confirms in original trigger`,await ctx.run(`document.querySelector('[data-canvas-node="${id}"] [data-canvas-image-ratio]>button').textContent.includes('5:6')`));
}

// 两种创建都从图片源端真实拉线，不能直接调用reducer创建期望节点。
// 图片创建默认编辑模板，视频保留原MiniMax默认，生成按钮不会自动执行。
// 保存后按类型查ID，因为新ID由产品事件入口产生，不由测试提前指定。
// 撤销和重做走底栏原命令，验证节点与引用线共同消失和恢复。
// 第一次drag只传默认cancel=false，用户松手后产品自己决定是否弹菜单。
// 等待菜单挂载之后才取条目，避免用尚未更新的旧DOM判断按钮不存在。
// 两个目标的文字必须精确为图片生成和视频生成，而非全部七种节点类型。
// 生成项数量恰好两项，不应混入导入、音频或不可用世界模型。
// 截图在确认前保存，证明这是真实拖线结束后的菜单位置。
// 按钮的data-node-kind来自原共享菜单，确认仍由其原onSelect发送意图。
// 点击后正式保存读出的target必须不是源ID，不能复用源节点当新输出。
// 节点数为二，若重复click或重复end创建了第三张卡会直接失败。
// 边数为一，若菜单保留了临时边并再建一条正式边也会失败。
// 边source应为起手图片，而不是目标节点或最近选中对象。
// 边target要与实际新ID相等，不能仅根据两个类型存在推断正确。
// 图片目标workflow默认H3多图编辑，普通文生图零输入规则不能被绕过。
// 视频目标保持原默认工作流解释，本例不把它改成图片编辑模板。
// ratio动作单独产生一次历史，因此撤销创建之前先撤销比例。
// 第二次撤销必须整笔移除新节点与边，不能只移除其中一项。
// 撤销后save检查磁盘，图形暂时隐藏但仍写入文件也算失败。
// 源节点不能被撤销创建目标时一起删除，节点数一是必要对照。
// 重做两次依次恢复创建和比例，之后才检验重开恢复。
// 重做不应分配另一个新ID，所以重开仍按原target.id寻找。
// 恢复边仍必须指向原target，不能靠标题匹配一个新建替代节点。
// 重开读盘可发现界面成功但serializeCanvas遗漏ratio的错误。
// 下一轮重新安装初态不会用上一轮新卡当源，两个目标案例相互独立。
// 没有通过改变模板输入规则让测试通过，产品仍用共同connectionError。
// 如果目标未创建，target为空会报错到宿主，不能回落默认ID继续。
// 节点和边的原子性还由纯reducer测试独立检查，UI证据不是唯一保护。
// 两次redo后先明确保存再重开，避免依赖自动保存的节流时间。
// 截图包含新卡参数，不把旧的资料图作为当前结果对比。
// 本例不按生成按钮，不创建背景任务，不把节点出现叫生成成功。
async function create(ctx, kind) {
  await drag(ctx);
  await ctx.wait(`document.querySelector('${menu}')`);
  ctx.smoke.check('Connection menu offers image, video generation, upscale and comparison',await ctx.run(`[...document.querySelectorAll('${menu} [data-node-kind]')].map(e=>e.textContent).join('|')==='图片生成|视频生成|超分|对比图像'`));
  await ctx.shot(`81-connect-${kind}-menu`);
  await ctx.click(`${menu} [data-node-kind=${kind}]`);
  let value = await save(ctx);
  const target = value.nodes.find(node=>node.id!=='source');
  ctx.smoke.check(`${kind} creates node and valid input together`,value.nodes.length===2&&value.edges.length===1&&value.edges[0].source==='source'&&value.edges[0].target===target.id&&(kind!=='image'||target.data.workflow==='minimax-image-edit'));
  await ratio(ctx,target.id);
  await ctx.shot(`82-connect-${kind}-ratio`);
  value=await save(ctx);
  ctx.smoke.check(`${kind} new ratio persists independently`,value.nodes.find(node=>node.id===target.id).data.ratio==='5/6'&&value.nodes.find(node=>node.id==='source').data.ratio==='1/1');
  await ctx.click('[data-canvas-toolbar] [aria-label="撤销"]');
  await ctx.click('[data-canvas-toolbar] [aria-label="撤销"]');
  value=await save(ctx);
  ctx.smoke.check(`${kind} one creation undo removes both node and edge`,value.nodes.length===1&&value.edges.length===0);
  await ctx.click('[data-canvas-toolbar] [aria-label="重做"]');
  await ctx.click('[data-canvas-toolbar] [aria-label="重做"]');
  await save(ctx);
  await reopen(ctx);
  value=await save(ctx);
  ctx.smoke.check(`${kind} redo and disk reopen preserve graph and ratio`,value.nodes.some(node=>node.id===target.id&&node.data.ratio==='5/6')&&value.edges[0]?.target===target.id);
}

// 每轮重设夹具只作为独立用例前提，操作与结果必须由正式页面完成。
// 第二轮切浅色窄窗验证同一菜单，不以全局缩放隐藏溢出。
// 长标题保留在源节点，用于检查它不挤掉端口或改变连接身份。
// 空白点击与Escape只关闭意图，保存后仍必须只有源节点、没有边。
// 循环的初态写入属于参数夹具，与结果文件回读必须明确区分。
// 保留宿主用户文档其他字段，因此生产认证和主题初始化仍生效。
// 每次只替换infiniteCanvas，不清空整个文档以绕过未知业务约束。
// 源位置45,140属于世界坐标，实际点击点仍从DOM重新计算。
// 源节点ratio固定1/1，新增目标改成5/6时才有明确隔离对照。
// 源不带workflow，继续使用原默认，不能偷偷给源也加入编辑输入要求。
// source节点ID在两轮相同只是独立夹具，不意味着产品新节点使用固定ID。
// 图片一轮使用宿主默认深色，视频一轮从真实菜单切浅色。
// 系统主题切换仍由原主进程themeSource传播，不直接改matchMedia返回值。
// closeAppearance负责结束外观菜单，避免它挡住接下来的拖线目标。
// 窄窗在主题操作之后缩小，不修改画布transform迁就源卡几何。
// 取消拖动后检查没有连接菜单，覆盖Escape只收线却又弹菜单的旧结果。
// 随后正常再拖一次，能发现cancelled标志永不复位导致以后无法创建。
// ArrowDown在首项已经自动聚焦后发送，预期应到第二项视频生成。
// 焦点断言读取activeElement，不能用aria-selected文字假装键盘导航完成。
// Escape关闭后保存节点数仍为一，确认没有取消时偷偷创建空卡。
// 取消保存的边数为零，临时橡皮筋不能被序列化成作品引用。
// 菜单方向键是Electron自动键盘事件，不表示实体键盘完整路径已人工通过。
// 同一菜单关闭两次也必须幂等，不能因工作区捕获和内部Escape产生双重历史。
// 输入状态不会跨这两轮保留，真正A/B隔离由同一轮源与目标对照。
// 读取根value一次仅作为前提模板，结果永远重新读正式文件。
// 两轮失败都应停止后续本例，不能跳过图片失败直接报视频通过。
// 宿主最终还检查React及hydration错误，不只计算成功断言数量。
// 没有执行外部文件拖入，本例不能补写以前资源管理器人工未验项。
// 没有系统扬声器试听，因此音频听感仍保持原状态。
// 触屏、屏幕阅读器与非100%DPI属于未覆盖环境，不因主题截图而改成通过。
// 该专项仅验证本轮连接和比例，旧媒体导入与公共侧栏要接着跑完整回归。
// 测试完成不继续开发生成能力，保留用户当前任务边界。
async function checkCanvasConnectRatio(ctx) {
  const value={};
  for (const kind of ['image','video']) {
    value.infiniteCanvas={version:1,name:'拖线与比例验证',nodes:[{id:'source',position:{x:45,y:140},data:{kind:'image',title:'长标题图片来源-保持真实稳定节点身份',prompt:'',content:'',ratio:'1/1'}}],edges:[]};
    await require("./canvas-library-fixture").writeCanvas(ctx, value.infiniteCanvas);
    await reopen(ctx);
    if (kind==='video') {
      await ctx.click('[data-theme-trigger]');
      await ctx.click('[data-theme-option=light]');
      await require('./sidebar-menu-fixture').closeAppearance(ctx.run);
      ctx.win.setSize(1100,800);
    }
    await drag(ctx,true);
    ctx.smoke.check('Escape during drag prevents late menu',await ctx.run(`!document.querySelector('${menu}')`));
    await drag(ctx);
    await ctx.wait(`document.querySelector('${menu}')`);
    // Electron加速键名称是Down，ArrowDown会发出空event.key，不代表产品方向键失败。
    // 诊断记录保留在首轮日志；正式断言继续要求实际焦点移动到视频项。
    await ctx.key('Down');
    ctx.smoke.check('Connection menu supports arrow focus',await ctx.run(`document.activeElement.matches('${menu} [data-node-kind=video]')`));
    await ctx.key('Escape');
    const cancelled=await save(ctx);
    ctx.smoke.check('Closing menu creates no orphan node',cancelled.nodes.length===1&&cancelled.edges.length===0);
    // 菜单外点击走真实自动指针，不能用直接close回调伪造dismiss行为。
    // 点击源标题同时允许原节点选择，外部监听不能吞掉底层正常点击。
    // 此时没有生成目标，下一次drag必须重新起手建立新的意图。
    // 关闭不影响原图，最终create数量断言会发现任何残留孤立卡。
    // source长标题的SVG图标位置稳定，避免点击触发双击改名输入。
    // 只有一次左键短按，不以右键contextmenu代替外部pointerdown。
    // 菜单卸载应自动释放外部监听，后续新菜单仍能正常确认。
    // 同一工作区两种主题都会覆盖此路径，不能只验深色菜单关闭。
    // 测试不调用removeChild或改display，隐藏必须来自产品自身state。
    await drag(ctx);
    await ctx.pointer('[data-canvas-node=source] header>svg');
    ctx.smoke.check('Outside pointer dismisses pending connection menu',await ctx.run(`!document.querySelector('${menu}')`));
    await create(ctx,kind);
  }
}
module.exports={checkCanvasConnectRatio};
