/** UI-07容器、临时面板、分隔和主题证据；复用静态样板窗口，不创建第二个编辑器。 */
const fs = require("node:fs"), path = require("node:path");
const { setVideoUiTheme } = require("./check-video-ui-preview");

// 此helper测的是实际Electron DOM和窗口像素，不在浏览器外重画一个布局示意。
// 输入仍是公开演示工程，不能拿这里的正常封面当作真实本地视频解码证据。
// 真实媒体能力在LIVE套件回归；本组专门保护主题、容器和布局交互边界。
// 共用主套件窗口使公共组件的其他调用处也能在同一轮继续接受legacy/GIF检查。
// 不创建新的AppShell，截图里应始终只有一份导航和系统窗口控制。
// 目标尺寸指编辑器host，不是PNG文件总尺寸，外壳占位由sizeHost实测补偿。
// 宽高测量有一像素容差，允许小数布局舍入，不容忍一整条nav的偏移。
// 每个断言失败都进入harness，后面成功主题截图不能抹掉早先错误。
// 输出facts保留实际测量值，不能只在交付文档里写一个未经记录的“无溢出”。
// 测试只影响隔离游客文档和临时浏览器目录，不改用户真实外观偏好。
// setVideoUiTheme复用原UI-04的实际主题菜单操作，避免测试也维护第二套主题入口。
// 深浅主题使用同一个工作区，切主题不能重载页面来掩盖组件状态丢失。

// 几何取实际DOM盒子，不能用CSS源码里写着min-height就宣称满足下限。
// 记录上下两个区域，是为了发现只把上区放大却把时间轴挤出宿主的错误。
function geometry(ctx) {
  // upper与timeline分别读真实边界，不用cssText推断布局结果。
  // separator是独立八像素槽，若变成absolute覆盖条也应被几何检查发现。
  // 返回纯数字不含DOM节点，主进程不能误把不可序列化对象当成有效事实。
  // 这里不主动scrollIntoView，测量本身不应改变布局或焦点前提。
  // 多个面板各自滚动并不改变其外盒高度，区域最小值应针对外盒判断。
  return ctx.run("(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect();return {upper:rect('[data-editor-upper]').height,timeline:rect('[data-editor-timeline]').height,separator:rect('[data-editor-region=R05]').height}})()");
}
// 通过公开分隔条键盘事件，不读取或修改hook内部height。
// 跳到Home与End必须仍保留上区260px和时间轴202px，截图之外保留数值断言。
// 箭头调节后比较布局差，证明按钮有实际几何效果而非只有光标变化。
async function checkSplit(ctx) {
  // 先记录真实默认分配，不在测试里给upper强行设一个已知height。
  // ArrowDown应增加上区十像素，不能仅检查aria-valuenow变了数字。
  // 分隔条先focus，键事件属于真实控件的局部处理，不调用产品Hook方法。
  // 合成键盘事件不等于人工系统按键，交付证据明确为DOM自动化。
  // 调节后读取另一个浏览器回合的布局，确保React提交已完成。
  // Home压到上区下界，时间轴仍要保有自己的最小可用高度。
  // End扩大上区到上界，不能把时间轴挤成零却通过上区单独检查。
  // separator也要保留命中尺寸，不能靠吞掉抓手空间给两区凑下限。
  // 当前前提是1600×1000宿主，预算足够容纳两个下界。
  // 之后窄容器继续测同一实例，已有手动高度会接受ResizeObserver的新范围校正。
  // 不比较工程总长作为布局结果，因为布局根本不应修改时间模型。
  // 刻度和片段的时间不变量由时间轴专项快照负责，本组测几何职责。
  // Home/End必须有界结束，不用重复按几十次箭头直到视觉上看起来到底。
  // 无需依赖系统显示器物理尺寸，offscreen宿主可准确验证CSS边界。
  // 这一点不等价于系统125%缩放，后者仍须真实环境另行验收。
  const before = await geometry(ctx);
  // 默认比例由CSS分配，记录before后才按键，避免测试自己预设一个容易满足的高度。
  // 从1600×1000开始时两个面板常驻，面板覆盖层不会干扰分隔测量。
  // Home与End循环共享当前实例，验证连续极值操作仍收敛而非累计超出。
  // 几何结果与aria不是同一数据源，这里故意测实际盒子而不是信任aria数字。
  // 上区与时间轴都达下限仍不代表外壳唯一，外层旧布局断言另核对AppShell数量。
  // 三种责任分开断言，能定位是分隔预算、外壳占位还是重复容器的问题。
  await ctx.run("document.querySelector('[data-editor-region=R05]').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))");
  await ctx.delay(80);
  ctx.smoke.check("UI07: separator keyboard adjusts only the workspace split", Math.abs((await geometry(ctx)).upper - before.upper - 10) < 1);
  for (const key of ["Home", "End"]) {
    await ctx.run(`document.querySelector('[data-editor-region=R05]').dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',bubbles:true,cancelable:true}))`); await ctx.delay(60);
    const fact = await geometry(ctx);
    ctx.smoke.check(`UI07: separator ${key} respects both region minimums`, fact.upper >= 259.5 && fact.timeline >= 201.5 && fact.separator >= 8);
  }
}

// 打开素材面板后必须真实可见且位于上区，不能覆盖下面的轨道。
// 改开属性时素材恢复隐藏，隐藏搜索框不应继续出现在可聚焦布局中。
// Escape从未被字段消费的目标发出，关闭后焦点回到对应入口按钮。
// 不把临时区标成全窗口模态框，宿主nav仍可用。
async function checkPanels(ctx) {
  // 960容器按约定同时收起素材与属性，因此两个入口都必须可用。
  // 先开素材再开属性，能发现两个独立布尔值导致同时覆盖的实现。
  // 只看aria-expanded不够，必须读取素材面板实际width大于零。
  // panel.bottom应在upper内，并严格位于时间轴top之前，不能盖住轨道内容。
  // 同一原面板节点仍存在，收起只改变可见布局，不清掉其搜索状态。
  // 属性展开后，素材input的getClientRects应为空，表示隐藏节点不占焦点布局。
  // 这不是只检查opacity零，透明但仍可Tab进入的输入属于回归。
  // Escape从当前活动控件发出，未被字段消费才应该冒泡到workspace关闭。
  // 本样板正式效果字段禁用，焦点会进入属性分组可用按钮。
  // 关闭后activeElement必须是属性入口，不能随意落到body或另一个同名按钮。
  // trigger是本次打开来源，所以素材切属性后应返回属性而非先前素材入口。
  // openPanel标记必须清空，不能只把面板视觉移出屏幕还保留逻辑展开。
  // 焦点回到入口时用preventScroll，不应把时间轴或main拉到别的位置。
  // nav仍在真实AppShell中可交互，临时区不应生成覆盖全窗口的遮罩。
  // 此处验证互斥显示与自动焦点，不把它称为人工完整Tab路径验收。
  // 选择数据由原面板持有，关面板不是取消片段或清空素材列表。
  await ctx.sizeHost(960, 720);
  // sizeHost会读取实际main占位补偿，960不是拿屏幕截图缩到960。
  // CSS容器断点根据host宽工作，系统窗口整体宽度还包含真实应用nav。
  // 因此不以innerWidth是否小于1040来推断素材应隐藏。
  // 窄屏入口仍在节目标题流内，不能绝对定位盖住长文件名。
  // 打开左面板后右面板未开，随后切右面板验证只有一个临时状态。
  // 面板的关闭按钮是公共EditorAction，键盘取消应返回其对应入口而不是该关闭按钮。
  // 如果Escape已被字段用于取消输入，workspace不应再关闭；这里当前焦点是组标题。
  // 这一前提避免测试把正确的字段优先行为错误判断成面板关闭失败。
  // 触发后的短等待给React与容器样式提交，不反复click入口直到碰巧打开。
  await ctx.run("document.querySelector('[data-editor-region=R03] button[aria-label=素材]').click()"); await ctx.delay(80);
  ctx.smoke.check("UI07: compact media opens only within the upper workspace", await ctx.run("(()=>{const p=document.querySelector('[data-editor-region=R02]').getBoundingClientRect(),u=document.querySelector('[data-editor-upper]').getBoundingClientRect(),t=document.querySelector('[data-editor-timeline]').getBoundingClientRect();return p.width>0&&p.bottom<=u.bottom+1&&p.bottom<t.top})()"));
  // 保存展开后的真实左栏，交付可看见它没有遮住下方时间轴，而非只有关闭态截图。
  // 截图在已通过几何条件后采集，不需要重画边框或裁掉导航来伪造局部展开。
  // 像素证据与刚才读到的panel.bottom属于同一实例和同一次打开操作。
  fs.writeFileSync(path.join(ctx.root, "ui-07-compact-media.png"), (await ctx.win.webContents.capturePage()).toPNG());
  await ctx.run("document.querySelector('[data-editor-region=R03] button[aria-label=片段属性]').click()"); await ctx.delay(80);
  ctx.smoke.check("UI07: compact panels are mutually exclusive with hidden media unfocusable", await ctx.run("document.querySelector('[data-editor-region=R04]').getBoundingClientRect().width>0&&document.querySelector('[data-editor-region=R02] input').getClientRects().length===0"));
  // 右栏截图与前一张形成互斥对照，不能用两张来自不同重载工程的图冒充状态切换。
  // 未接效果仍显示禁用说明，临时打开面板不会把演示默认值包装成正式可编辑效果。
  // capturePage只写测试证据，不是应用的节目帧导出功能。
  fs.writeFileSync(path.join(ctx.root, "ui-07-compact-inspector.png"), (await ctx.win.webContents.capturePage()).toPNG());
  await ctx.run("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))"); await ctx.delay(80);
  ctx.smoke.check("UI07: Escape closes the panel and restores its actual trigger focus", await ctx.run("!document.querySelector('[data-editor-upper]').dataset.openPanel&&document.activeElement===document.querySelector('[data-editor-region=R03] button[aria-label=片段属性]')"));
}

// 同一工程在三个目标容器检查，不为每个尺寸重载导致状态重置被掩盖。
// nav真实点击后读取可用宽度，不能拿预设导航宽度常量减一次代替测量。
// reduce-motion使用Chromium媒体特性模拟，报告中不能称系统偏好已人工验证。
async function checkResponsive(ctx) {
  // 两种主题各跑三个目标host尺寸，不能只拍宽浅色和窄深色两张代替矩阵。
  // 调尺寸不重载工程，前面操作后的布局仍是当前同一个实例。
  // 主题状态从documentElement读，这是应用主题决议结果，不是测试手工贴标签。
  // 工作区外盒宽高均记录，避免只验证宽度而漏掉信息条落在底部外侧。
  // overflow测workspace实际scrollWidth，内层时间轴合法横滚不属于整页溢出。
  // 不能给host追加overflow:hidden后宣称没有溢出，测试不修改产品样式。
  // devicePixelRatio记录为证据边界，当前DPR=1不冒充真实系统缩放。
  // 截图前等待一个有限合成间隔，避免主题菜单刚消失时取得旧帧像素。
  // 文件名含主题和目标host尺寸，后续归档不会把1600截图误标为1280。
  // 每套主题末尾测文字对比度，不能只凭“浅深色看起来都可以”判断可读。
  // nav切换用实际按钮，使main可用宽变化进入真实容器查询。
  // 不从历史sidebar宽度常量减一次，容器可能已有外壳边框和小数间距。
  // 打开后再次检查预览与时间轴仍在host内，不能只证明按钮被点到。
  // 再点击恢复导航，避免影响主套件后续legacy/GIF宿主前提。
  // facts包含所有六次测量，交付可以独立核对尺寸和主题而非只信一句PASS。
  // 写JSON不改变产品工程，无须新增项目保存能力来留验证记录。
  const facts = [];
  // facts每次push新对象，不复用一个不断覆盖的引用，否则JSON会出现六份最终尺寸。
  // 保存theme便于核对每种尺寸都测了两种主题，而不是同一主题拍了两套名字。
  // dpr字段保留当前实际值，即便将来测试环境改了缩放也不会默认写成1。
  // overflow以大于clientWidth一像素为界，不因小数边框舍入错误判整页溢出。
  // 这个容差不允许把完整字段或按钮压到host之外，原几何与图片核查还会发现。
  // 在当前导航状态下先精确测六个目标，再单独切nav，不把目标尺寸与nav变化混在一起。
  // nav切换后的可用宽度可以不同于960，这是实际响应式变化，不再人为补回960掩盖它。
  // 恢复nav后写布局JSON，保存的是原六次独立测量，不覆盖成导航后的估算尺寸。
  for (const theme of ["light", "dark"]) {
    await setVideoUiTheme(ctx, theme);
    for (const [width, height] of [[1600, 1000], [1280, 800], [960, 720]]) {
    await ctx.sizeHost(width, height);
    const fact = await ctx.run("(()=>{const h=document.querySelector('[data-video-editor-ui]'),r=h.getBoundingClientRect();return {width:r.width,height:r.height,overflow:h.firstElementChild.scrollWidth>h.clientWidth+1,theme:document.documentElement.dataset.theme,dpr:devicePixelRatio}})()");
    facts.push(fact);
    ctx.smoke.check(`UI07: same workspace fits ${width}x${height} without hiding overflow`, !fact.overflow && Math.abs(fact.width - width) < 1 && Math.abs(fact.height - height) < 1);
      await ctx.delay(200);
      fs.writeFileSync(path.join(ctx.root, `ui-07-${fact.theme}-${width}x${height}.png`), (await ctx.win.webContents.capturePage()).toPNG());
    }
    await checkContrast(ctx, theme);
  }
  await ctx.run("document.querySelector('[data-sidebar-toggle]').click()"); await ctx.delay(400);
  ctx.smoke.check("UI07: nav toggle leaves the preview and timeline inside their host", await ctx.run("(()=>{const h=document.querySelector('[data-video-editor-ui]');return h.firstElementChild.scrollWidth<=h.clientWidth+1&&document.querySelector('[data-editor-timeline]').getBoundingClientRect().width<=h.clientWidth+1})()"));
  await ctx.run("document.querySelector('[data-sidebar-toggle]').click()"); await ctx.delay(400);
  fs.writeFileSync(path.join(ctx.root, "ui-07-layout.json"), JSON.stringify(facts, null, 2));
  // 布局JSON与PNG成对归档，PNG能观察可读性，JSON能核对容器是否真正达到尺寸。
  // 不用PNG分辨率反推host，因为画面还包含应用导航、标题栏和底部状态。
  // 1600×1000是宽三栏，1280×800恰在属性常驻边界，960×720进入紧凑入口。
  // 三者覆盖的是容器断点，而非手机设备模拟或浏览器整页缩放。
  // 页面右侧有内部属性滚动时，外层workspace仍应保持不横向撑宽。
  // 浅深色切换使用相同图片，没有为深色换另一张更适合颜色的封面。
  // 主标题与参数文字比值在两种主题分别读取，不能用浅色结果代表深色。
  // nav收起实际增大main宽度，容器可能跨断点，布局应按当前盒子重新判断。
  // 其变化由实际CSS容器查询处理，不在测试里补写面板display来满足预期。
  // 最终恢复nav只还原测试环境，不还原已经调整的上下分隔状态。
  // 保留调节状态能发现窗口变矮时上区高度没有按新预算收回的错误。
  // 允许合法时间轴内部横滚，不把它当整体溢出然后隐藏整块内容。
  // 同样不能把属性长文本裁掉后说界面无溢出，内容应在自己的滚动区读取。
  // 长文件名和错误场景由共用素材与预览专项覆盖，此矩阵复核宿主收缩边界。
  // 自动证据没有检查多显示器移动，文档不能把六张容器图外推到多屏系统。
  // DPR=1与减少动态模拟是两类环境证据，不能彼此替代。
  // Windows125%/150%若没实际设置，仍列未验证，而非从CSS像素尺寸推断通过。
  // 本组也没有扬声器输出，浅深主题通过不能代表真实声音试听完成。
}

// 浏览器将主题颜色真正绘制为sRGB像素，能识别oklch和color-mix，不猜十六进制色表。
// 背景按祖先从外到内叠加，再绘制文字颜色，透明色也会计算成用户实际看到的颜色。
// 此处只测标题与普通辅助文字，原生disabled控件不以普通正文4.5:1门槛衡量。
async function checkContrast(ctx, theme) {
  // CSS变量可能使用oklch或color-mix，手写十六进制解析器会漏掉真实颜色。
  // Canvas使用Chromium同一颜色解析能力，把计算样式绘制成可读取的sRGB像素。
  // 临时canvas不挂DOM，不参与被测布局，也不修改任何目标文字或背景。
  // 从白色基底开始逐级叠背景，透明根节点不会被误当成黑底。
  // 祖先顺序从documentElement到目标，符合正常背景覆盖的可见结果。
  // 目标若有不透明背景，会自然覆盖祖先；透明目标则保留父面板颜色。
  // 读取背景后再绘制前景，前景alpha也通过同一画布混合。
  // luminance先归一化到0至1，再按sRGB传输函数转线性光。
  // .04045是传输函数分界，不能对所有通道简单除255后直接加权。
  // .2126/.7152/.0722分别是红绿蓝相对亮度权重，绿色对亮度贡献最大。
  // 比值采用亮色加.05除暗色加.05，前景深浅次序不影响计算。
  // 门槛4.5:1用于当前小号普通文本，不能借“大标题”门槛降低要求。
  // 三个样本分别覆盖节目标题、项目名称和底部参数信息。
  // 这是抽样对比度，不声称穷举所有hover、disabled和视频画面上的颜色。
  // 禁用控件不按普通正文门槛计，但仍要有可读能力说明，其他用例检查该点。
  // 媒体画面内容不是面板底色，不能依据封面某一像素替整个主题做对比度结论。
  // 每个样本保留ratio与selector，若之后颜色变化可直接定位哪类文字退化。
  // selector为空会让测试明确失败，不能因没有测到目标就把空集合当全部通过。
  // 本次固定选择器对应现有三个可见节点，不依赖CSS Module哈希。
  // 画布数据是颜色计算证据，截图仍来自capturePage，二者用途不同。
  const facts = await ctx.run(`(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');
    const lum=rgb=>rgb.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
    return ['[data-editor-region=R03] h2','[data-editor-region=R01] strong','[data-editor-region=R10]'].map(selector=>{
      const e=document.querySelector(selector),parents=[];for(let p=e;p;p=p.parentElement)parents.unshift(p);
      context.clearRect(0,0,1,1);context.fillStyle='white';context.fillRect(0,0,1,1);
      for(const p of parents){context.fillStyle=getComputedStyle(p).backgroundColor;context.fillRect(0,0,1,1)}
      const bg=lum([...context.getImageData(0,0,1,1).data]);context.fillStyle=getComputedStyle(e).color;context.fillRect(0,0,1,1);
      const fg=lum([...context.getImageData(0,0,1,1).data]);return {selector,ratio:(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)};
    });
  })()`);
  // facts为空不在当前固定三选择器的合法路径中，缺少目标会在浏览器求值时明确抛错。
  // 背景解析包含目标自身的backgroundColor，不能只拿body颜色和文字比较。
  // 文字取getComputedStyle，不从主题配置表读未真正应用到该节点的预设颜色。
  // 某个样本如果被主题局部覆盖，这套测量会反映覆盖后的实际颜色。
  // 三个比值共同达标才通过，不把高对比标题的平均值抵消低对比信息条。
  // 数值写入JSON保留小数精度，交付可报告最低值，不需要四舍五入成看似整齐的高值。
  // 不检查视频纹理像素对比度，因为媒体内容没有固定正文阅读语义。
  // 这套方法也不自动计算整个产品所有文字，报告必须保留“抽测”的范围。
  fs.writeFileSync(path.join(ctx.root, `ui-07-contrast-${theme}.json`), JSON.stringify(facts, null, 2));
  ctx.smoke.check(`UI07: ${theme} headings and info text meet 4.5 to 1 contrast`, facts.every(fact => fact.ratio >= 4.5), JSON.stringify(facts));
}

// 模拟的是Chromium媒体偏好，不是操作Windows设置；交付明确区分这两种证据。
// 读取原样板的真实等待图标，不插入一个会自动通过的临时spinner。
// 无论断言结果如何都清除模拟，避免改变后面legacy/GIF的运行环境。
async function checkReducedMotion(ctx) {
  // 工作区没有等待动画时无法证明减少动态设置生效，所以进入公开控件样板。
  // 样板里的busy按钮使用真实公共EditorAction，不为测试新造一枚特殊spinner。
  // 等待busy图标出现后才设置媒体偏好，确保测的是已经挂载实例的样式响应。
  // Emulation.setEmulatedMedia只改变本测试页面的媒体匹配条件。
  // 它没有打开Windows设置，不能报告系统减少动态效果已由人工启用并验证。
  // 先要求matchMedia确实匹配reduce，再检查计算animationName为none。
  // 只有CSS源码有reduce分支但运行不匹配，不能通过这一条。
  // 图标保留aria-label，关闭旋转后等待状态仍有文字语义，不变成空白按钮。
  // try-finally无论断言或命令是否抛错都清除模拟，不把测试环境留给后续场景。
  // 清除features不是切换应用主题，两种设置的作用域各自独立。
  // 最后返回公开project页，确保原主套件能继续查到legacy链接。
  // 回到project只恢复样板入口，不把正式工程数据塞进演示数组。
  // 这个用例没有验证系统动画首选项的持久化，那不是渲染层CSS回归的职责。
  await ctx.win.loadURL("app://app/tools/video/editor/samples"); await ctx.wait("document.querySelector('[data-editor-samples] .animate-spin')||document.querySelector('[data-editor-samples] [aria-busy=true] svg')");
  try {
    // 模拟前样板已经存在，媒体偏好变化必须在当前实例的样式中立即生效。
    // 不能刷新页面后拿静态首帧没有旋转来证明动态偏好监听正确。
    // 原spinner使用CSS媒体条件，不需要业务state额外记录reduce布尔值。
    // 这避免组件自建第二套主题或动态设置，与项目统一机制保持一致。
    // finally里清模拟失败时会抛出命令异常，不吞掉环境恢复问题。
    await ctx.win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await ctx.delay(80);
    ctx.smoke.check("UI07: reduced motion removes spinner animation while keeping its text", await ctx.run("(()=>{const e=document.querySelector('[data-editor-samples] [aria-busy=true] svg');return matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(e).animationName==='none'&&e.parentElement.getAttribute('aria-label')})()"));
  } finally { await ctx.win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [] }); }
  await ctx.win.loadURL("app://app/tools/video/editor/samples/project"); await ctx.wait("document.querySelector('[data-editor-upper]')");
}

// 这里验证的指针来自Chromium，真实鼠标没有离开用户当前全屏程序。
// 拖动前后均截图/读数，回滚用pointercancel也走公共分隔条处理。
async function checkPointerSplit(ctx) {
  // 从实际分隔条中心取点，不能用全窗口高度某个比例猜命中位置。
  // clientX选择中点，避免侧栏关闭按钮或导航遮住分隔抓手。
  // 按下、移动、松手来自Chromium输入序列，产品自己处理pointer capture。
  // 先记upper高度，再向上移动三十像素，结果应至少减少二十像素。
  // 容差允许抓手命中位置与布局舍入，不能容忍完全没变化。
  // 这里不直接写gridTemplateRows，真实DOM几何变化由公共分隔逻辑产生。
  // sender保持同一x，只改y，保证验证的是上下分隔而非横向拖动。
  // 松手时buttons归零，避免后续主题按钮点击被当成仍在拖动。
  // 本用例不是人工鼠标操作，不使用系统光标，也不抢用户前台全屏程序。
  // 断言之后保留新布局，随后的三尺寸主题矩阵会验证此状态继续接受范围调整。
  const point = await ctx.run("(()=>{const r=document.querySelector('[data-editor-region=R05]').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+4}})()");
  // y取分隔条内第4px，能实际触发抓取偏移的路径，不只点在上边缘这个特例。
  // 先前End已把上区调大，向上三十像素仍有足够合法空间，不会被下界截住。
  // 因此几何变化过小应解释为事件没命中或算法错误，不能借上下界限位掩盖。
  // 指针序列在同一个webContents发送，不把系统光标坐标与CSS客户区坐标混用。
  // devicePixelRatio不参与point计算，getBoundingClientRect本来就是CSS像素。
  // 松手后有界等待再量，是确认后的布局，不是pointermove过程中的草稿像素。
  // 本次调节不会重置素材与片段选择，相关隔离已有样板与LIVE快照回归保护。
  const before = await geometry(ctx), send = (type, y) => ctx.win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type, x: point.x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  await send("mousePressed", point.y); await send("mouseMoved", point.y - 30); await send("mouseReleased", point.y - 30); await ctx.delay(80);
  ctx.smoke.check("UI07: pointer splitter changes actual upper geometry", (await geometry(ctx)).upper < before.upper - 20);
}

// 样板是公开演示工程，状态改变只影响本次会话，不应触发导入或FFmpeg调用。
// 最后停回project入口，原冒烟继续检查legacy/GIF真实宿主链接。
async function checkVideoUiWorkspace(ctx) {
  // 先进入同一公开project宿主，所有区域组件仍来自真实业务装配。
  // 宿主存在才开始量尺，不能在页面加载中读零尺寸当作窄窗状态。
  // 顺序先键盘、再面板、再指针，分别确认每条公开交互链可用。
  // 这些操作不应触发导入或FFmpeg，外层媒体计数仍保护业务禁用边界。
  // 响应式与主题共用当前实例，几何状态和业务数据不因截图需求重置。
  // 最后一项清除媒体模拟并返回project，调用者仍拥有窗口最终清理职责。
  // helper不主动app.quit，不能把其他检查尚未完成的套件提前标成成功。
  await ctx.win.loadURL("app://app/tools/video/editor/samples/project"); await ctx.wait("document.querySelector('[data-editor-upper]')");
  await ctx.sizeHost(1600, 1000); await checkSplit(ctx); await checkPanels(ctx);
  await ctx.sizeHost(1600, 1000); await checkPointerSplit(ctx); await checkResponsive(ctx);
  await checkReducedMotion(ctx);
  // 结束时不销毁窗口，原主流程还需要验证legacy/GIF的普通工具框架。
  // 主流程最终finally只关闭自己创建的win，不终止用户正在使用的客户端。
  // 测试目录保留成功与失败现场，文档仅归档本轮需要的证据文件。
  // 系统拖放与人工缩放的限制不能因为本helper全部PASS就从未验证清单删除。
  // 真实截图是Electron运行像素，自动输入证据仍与人工操作分别报告。
}
module.exports = { checkVideoUiWorkspace };
