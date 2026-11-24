/** 原版首页艺术字与既有编辑入口回归，复用资料库专项隔离窗口及正式构建。 */
// 不导入 React 组件另搭样例，所有断言都读取路由实际生成的页面。
// 首页背景走静态资源，联网图片拦截器不会替换用户提供的背景。
// 此处只验证展示与导航，不提交 ComfyUI 任务，也不读取用户的真实设置。

// 主题切换使用生产 IPC，让原生媒体查询与页面标记一起更新。
// 等待实际主题，避免刚点完按钮就把过渡中的颜色截图当最终状态。
async function theme(context, value) {
  await context.click("[data-theme-trigger]");
  await context.click(`[data-theme-option="${value}"]`);
  if (!await context.waitFor(`document.documentElement.dataset.theme==='${value}'`)) throw new Error("Theme did not settle");
  await require("./sidebar-menu-fixture").closeAppearance(context.run);
}

// 公告正文异步到达，不能把“当前还没出现”当成用户已经确认过。
// 截图前按真实关闭按钮处理可见公告，再等组件卸载；没有公告时不改页面。
// 不用移除 DOM 或透明遮罩造一张干净图，正式的已读动作仍会写入临时用户文档。
async function captureHome(context, name) {
  await context.run(`document.querySelector('[aria-labelledby=update-announcement-title] button[aria-label]')?.click()`);
  if (!await context.waitFor("!document.querySelector('[aria-labelledby=update-announcement-title]')")) throw new Error("Announcement still covers home");
  await context.screenshot(name);
}

// 原首页卡片的几何变化最多半个 rem，采样点使用中心避免正好离开命中边缘。
// 阴影可以存在于 box-shadow 中，不能为了禁滤镜把合法卡片悬停阴影也判失败。
// 描边读取的是原主题焦点标准，测试不要求完全隐藏键盘可访问反馈。
// 按钮依然采用语义 button，不将它替换成没有键盘行为的 div 来消除浏览器状态。
// 计算颜色来自编译后的 Tailwind 产物，源码里出现主题类不代表实际生效。
// 深色若误受全局白底规则覆盖，样本会直接读到高亮颜色，不依赖 class 名判断。
// 本组仅验证当前 Electron 版本，其他 Chromium 或 Windows 显卡组合需要另验。
// 完整首页内容继续留在同一个品牌层，布局检查能发现移动滤镜后产生的意外边界。
// 探索按钮在这轮只悬停，下一段导航还会实际点击验证可用性。
// 所有断言按入口编号留名，回归时能够具体定位图片、视频或探索按钮。
// 本地背景图由原资源路径加载，网络图片重定向夹具不影响它的真实解码。
// 页面初始化如仍有公告，captureHome 会用真实业务动作关闭，而不是遮挡截图。
// 左上角移开点位于应用外壳，不会再触发首页另一个入口的悬停。
// 采样结果没有写回产品或磁盘，退出测试不留下“已验证”的用户设置。
// 实际 Electron 指针进入按钮后连续采样，覆盖悬停过渡而非只读最终样式。
// 旧问题涉及背景发白，深色样本必须同时检查三个入口的实际背景亮度。
// 普通入口允许半透明主题底色，探索入口保留原白色半透明按钮，不能误判成白底。
// 对纯白的判断同时要求高不透明度，避免把合法的白色透明层当成闪白。
// 每次鼠标移动都由 Electron 输入通道发送，不用添加 :hover 类冒充状态。
// 主进程计时有界，即使页面没有 requestAnimationFrame 也可结束采样。
// 这里采用软件渲染宿主，不能证明所有用户 GPU 驱动下都不再闪烁。
// 截图记录同尺寸的正常与悬停状态，不能以构建成功代替实际画面证据。
// 检查的是当前主题媒体查询，不能只根据测试刚点击过深色按钮就作推断。
// 祖先不应保留 filter 或 backdrop-filter，防止后续改动重新引入嵌套离屏层。
// 背景图片和花瓣动画仍然真实存在，不通过删掉背景让测试变得容易。
// 只采集绘制属性，不收集用户路径、账号或浏览器内部状态。
// 采样数组由每次实际计算样式组成，不能提前写入一组期望颜色。
// 普通卡片的前景色来自主题，深色不应为白背景配白文字。
// 减少动态效果单独依赖产品 motion-reduce 类，本测试不声称 Windows 人工设置已验。
// 最后移开指针，后续窄窗口截图不会意外保留半程悬停样式。
// 三个按钮分别处理，修掉第一张卡不能掩盖视频入口或探索入口仍有问题。
// 光栅画面是否存在单帧 GPU 闪白还需要用户设备复测，自动属性证据保留这一限制。
// 先调整为同一桌面尺寸，正常和悬停截图才有可比较的几何前提。
// 每个按钮中心从真实 DOM 计算，不能猜导航宽度或写死历史坐标。
// 指针事件的结果以 matches(:hover) 验证，移动到错误位置不能算已测悬停。
// 八次采样覆盖两百毫秒，超过产品一百五十毫秒的背景与位移过渡。
// 采样包含初始、中间和最终状态，能发现过渡属性错误地回到全白表面。
// 检查 backdropFilter 为 none 能防止模糊层在后续样式修改中悄悄回归。
// 检查 filter 为 none 针对按钮本身，祖先检查则针对品牌层的整块投影。
// text-shadow 允许保留，因为字形阴影不需要把整个按钮表面做离屏滤镜。
// transitionProperty 不应为 all，新增 outline 不应被自动纳入动画。
// 浅色入口本来就使用浅色表面，不能简单禁止任何白色背景。
// 深色探索按钮允许低透明度白层，正则同时检查透明度而非只比 RGB。
// RGB 255 配零点三透明度与不透明纯白在视觉和合成上不是一回事。
// 这个颜色反证不取截图像素，因为插画高光本身也可能是白色。
// 最终截图交给人检查文字、图标和布局，计算样式只负责可量化边界。
// 原标题的可读阴影仍存在，避免为了消除滤镜让白字丢在背景高光上。
// 点击导航未发生在采样中，不会把页面切换动画误算成按钮悬停闪白。
// 模态公告先关闭，才能保证截图中的按钮未被遮罩和焦点锁覆盖。
// 如果主题切换失败，后续属性与媒体查询会暴露不符，不强制改 DOM 主题值。
// 使用普通主进程计时而非浏览器 rAF，隐藏测试窗口也能有界结束。
// 两主题的样本分别命名，不能复制一张截图改名字声称两种状态都验证过。
// 这里不会读系统剪贴板或用户输入，只读取固定首页按钮的绘制属性。
// Electron 软件渲染路径与用户独显仍有差异，因此 GPU 单帧闪烁保留人工复测。
// 测试不修改全局 button CSS，范围限定在首页，其他页面不会被本断言“修绿”。
// 原按钮的业务回调仍由后续探索入口导航检查，悬停正确不等于点击路径正确。
// 恢复指针到窗口左上角能防止下一尺寸的几何变化把同一坐标落在新按钮上。
// 小窗口标题检查继续使用原用例，新增悬停检查不删旧的响应式和字体断言。
// 自动截图不能替代用户系统缩放或实体操作证据，交付需保留这两类待验。
// 任何一个入口出现白底都应使总结果失败，不能只汇总最后一个按钮的样本。
// context.check 使用共同护栏，某个入口失败不能因后面正常导航而被清零。
// 本检查没有重试到成功的循环，八次采样中的任何坏帧都保留为失败依据。
// 截图前不手动设置按钮 style，不把预期外观注入页面后再自证通过。
// 如后续新增首页按钮，应同步本组枚举，避免未采样入口被错误算作覆盖完成。
async function checkHover(context, value) {
  context.win.setSize(1500, 980);
  await context.waitFor("!document.documentElement.classList.contains('theme-ripple')");
  await captureHome(context, `home-${value}-before-hover`);
  for (const index of [0, 1, 2]) {
    const point = await context.run(`(()=>{const e=document.querySelectorAll('[data-home-hero] button')[${index}],r=e.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
    context.win.webContents.sendInputEvent({ type: "mouseMove", ...point });
    const samples = [];
    for (let sample = 0; sample < 8; sample++) {
      await new Promise(resolve => setTimeout(resolve, 25));
      samples.push(await context.run(`(()=>{const e=document.querySelectorAll('[data-home-hero] button')[${index}],s=getComputedStyle(e);return {background:s.backgroundColor,filter:s.filter,backdrop:s.backdropFilter,transition:s.transitionProperty,hover:e.matches(':hover'),ancestorFilter:getComputedStyle(e.parentElement.parentElement).filter}})()`));
    }
    context.check(`首页入口悬停无高亮白底与嵌套滤镜 ${value} ${index}`, samples.every(sample => sample.hover && sample.filter === 'none' && sample.backdrop === 'none' && sample.ancestorFilter === 'none' && sample.transition !== 'all' && (value !== 'dark' || !/^rgba?\(255, 255, 255(?:, (?:0\.[7-9]|1))?\)$/.test(sample.background))));
    await context.screenshot(`home-${value}-hover-${index}`);
  }
  context.win.webContents.sendInputEvent({ type: "mouseMove", x: 4, y: 4 });
}

// 首页回归仍从正式路由进入，不能导入 HomeHero 另造一个看起来相同的样例。
// 第二模板已移除，断言同时确认它和切换按钮都不在 DOM 中。
// 艺术字保留真正的 h1，测试读取浏览器计算样式，不从截图像素猜字体。
// 字重应是正常四百，区别于原先的无衬线粗体标题。
// fontStyle 必须是 italic，只有字体家族变化还不能达到参考图的斜体效果。
// Times New Roman 在 Windows 上是系统字体，不允许测试偷偷注入远端字体。
// 原背景应成功解码而不是只出现一个 img 标签，图片丢失也必须失败。
// naturalWidth 大于零证明浏览器取得了实际背景，不能用 div 色块替代。
// 旧模板的背景和配置不会被这个用例读取，截图只来自原版资源。
// 同一张首页在两个主题间切换，不能靠重载生成两套不同品牌组件。
// 两主题各检查三种窗口，防止大标题在手机宽度把 main 撑出视口。
// 1500 宽度观察完整品牌与创作入口，900 覆盖导航仍占空间的紧凑桌面。
// 390 宽度观察自然换行，允许两行标题，不强求把整句缩成难以辨认的小字。
// 检查的是全页 scrollWidth，局部标题不溢出还不足以证明外壳正常。
// 一像素容差只允许浏览器小数取整，不能掩盖一整段标题伸出屏幕。
// 标题不得超出 main 的右边界，导航缩窄可用区域后仍需正确适应。
// 页面高度可超过窗口并由原 main 滚动，测试不要求裁掉页尾入口来凑高度。
// 原版装饰和背景层继续挂在同一 section，下层插画不能跨出 AppShell。
// 公告通过真实关闭操作处理，不把遮罩样式隐藏后伪称首页可用。
// 等待公告出现沿用原专项前提，异步正文未到时不能立即截一张被遮挡的图。
// captureHome 会再次核对没有可见公告，主题与尺寸变化不会绕过该边界。
// 各截图名包含主题和宽度，交付时能对应到同一轮实际断言。
// 截图由 Chromium 绘制，不将构建成功当作字体效果符合参考图的证明。
// 人工查看截图可以复核笔画、留白和人物遮挡，自动断言只验证可量化边界。
// 主题切换仍经过真实 nativeTheme IPC，不给标题独立增加暗色开关。
// 原版的白字和投影在两个主题下保持可读，背景不随测试换成纯色。
// 窗口变宽变窄使用同一 DOM 实例，能发现 resize 后沿用旧尺寸的问题。
// 不改应用字体全局变量，其他页面、导航和顶栏品牌不参与本轮视觉调整。
// 轮询有上限；丢失首页标题或背景时应该报告失败而不是继续截图。
// 本专项不消耗模型 token，不执行图片、视频或音频生成。
// 测试用户文档由宿主隔离，不写真实首页偏好或其他用户设置。
// 模板选择原先就是临时状态，删除后不需要假造一次用户数据迁移。
// 导航回归使用原版探索按钮，确保去掉外层模板容器没有断开它的事件。
// 探索按钮应进入工具箱；之后用正式 URL 回到创建页，继续原有编辑回归。
// 这是为了保留同一 helper 原来负责的编辑与原生弹窗检查，不顺带删除有效断言。
// 导航等待检查实际 pathname，不根据按钮点击 Promise 完成就推断跳转成功。
// 创建页等待模式标签后再调用 edit，避免初始化期间点到空元素。
// 最后恢复桌面窗口尺寸，防止首页手机截图给后续原生 dialog 留下错误几何前提。
// 所有捕获仍由宿主 screenshot 清理策略管理，不额外开启第二个 Electron 实例。
// 测试不验证不同操作系统的字体文件一致，系统回退的视觉差异需跨平台实机检查。
// 本轮没有安装包启动验证，静态导出上的字体成功不等于已重打包分发。
// 若背景损坏，complete 可能仍为 true，因此同时要求 naturalWidth 合法。
// 若误把艺术字做成图片，h1 的计算样式与文字内容断言不能得到预期值。
// 若只隐藏第二模板而继续保留 DOM，querySelector 的负向断言仍会失败。
// 标题文本必须保持品牌全称，不能为适应窄屏截短成 Illusion 或省略号。
// 字体族检查只指定已声明家族，不假装浏览器提供了实际字体文件授权证明。
// SVG 波浪和花瓣仍由原页面负责，本用例不为它们引入新的动画或等待机制。
// 不检查布局 class 字符串，Tailwind 编译后的真实效果才是这轮的验证对象。
// 其他页面仍可以使用各自字体，测试限定 data-home-hero 内的唯一标题。
async function home(context) {
  context.win.setSize(1500, 980);
  await context.win.loadURL("app://app/");
  await context.waitFor("!!document.querySelector('[data-home-hero] h1')");
  await context.waitFor("!!document.querySelector('[aria-labelledby=update-announcement-title]')");
  await captureHome(context, "home-original-entry");
  for (const value of ["light", "dark"]) {
    await theme(context, value);
    await checkHover(context, value);
    for (const width of [1500, 900, 390]) {
      context.win.setSize(width, 980);
      await context.waitFor(`innerWidth===${width}`);
      context.check(`原版首页艺术字与边界 ${value} ${width}`, await context.run(`(()=>{const root=document.querySelector('[data-home-hero]'),title=root.querySelector('h1'),image=root.querySelector('img'),style=getComputedStyle(title);return title.textContent.trim()==='Illusion Realm'&&style.fontStyle==='italic'&&style.fontWeight==='400'&&style.fontFamily.includes('Times New Roman')&&image.complete&&image.naturalWidth>0&&!document.querySelector('[data-home-template=v2],[data-home-template-switch]')&&document.documentElement.scrollWidth<=innerWidth+1&&title.getBoundingClientRect().right<=document.querySelector('main').getBoundingClientRect().right+1})()`));
      await captureHome(context, `home-original-${value}-${width}`);
    }
  }
  context.win.setSize(1600, 1000);
  await context.click('[data-home-hero-explore]');
  context.check("原版探索入口仍进入工具箱", await context.waitFor("location.pathname==='/tools'"));
  await context.win.loadURL("app://app/create");
  await context.waitFor("!!document.querySelector('[data-create-mode-tabs]')");
}

// 删除范围只限文字编辑表单；顶部三个工具必须都能切换。
// 不上传图片、不运行编辑，避免用假生成数据证明入口清理。
// 旧模式标记与 API 导出按钮不存在，才能排除仅仅用 CSS 隐藏的处理。
async function edit(context) {
  await context.run(`Array.from(document.querySelectorAll('[data-create-mode-tabs] button')).find(button=>button.textContent.trim()==='编辑').click()`);
  if (!await context.waitFor("!!document.querySelector('[data-anima-form]')")) throw new Error("Text editor did not open");
  context.check("文字改图移除内部重复模式与API导出", await context.run(`!document.querySelector('[data-anima-mode],[data-anima-export]')&&['anima-edit-tab','mask-edit-tab','edge-edit-tab'].every(id=>!!document.getElementById(id))`));
  await context.screenshot("text-edit-simplified");
  for (const id of ["mask-edit-tab", "edge-edit-tab", "anima-edit-tab"]) {
    await context.click(`#${id}`);
    context.check(`顶部编辑工具切换保留：${id}`, await context.waitFor(`document.getElementById('${id}').getAttribute('aria-selected')==='true'`));
  }
}

// 原生 dialog 位于浏览器顶层，body 上的菜单即使有很大 z-index 也会被挡住。
// 检查菜单归属与实际命中点，避免只测到一个被遮住的选项节点。
// Escape 必须先关闭下拉并归还焦点，不能同时关闭保存弹窗。
// 漫画草稿只存在该测试用户目录，不会保存到真实模板库。
async function nativeDialog(context) {
  await context.win.loadURL("app://app/tools/image/comic");
  await context.waitFor("!!document.querySelector('[data-finish-layout]')");
  await context.run(`document.querySelector('#comic-tabpanel-layout .grid button:nth-child(2)').click()`);
  await context.click("[data-finish-layout]");
  await context.click("[data-save-template-category]");
  context.check("原生弹窗下拉位于同一顶层且能被真实指针命中", await context.run(`(()=>{const option=document.querySelector('[data-simple-select-option=new]');const panel=option?.closest('[data-simple-select-panel]');const r=option?.getBoundingClientRect();return !!panel?.closest('dialog[open]')&&option.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`));
  await context.screenshot("unified-select-native-dialog");
  context.win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  context.win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  context.check("原生弹窗内Escape仅关闭下拉", await context.waitFor("!!document.querySelector('dialog[open]')&&!document.querySelector('[data-simple-select-panel]')&&document.activeElement?.matches('[data-save-template-category]')"));
  await context.click("[data-save-template-category]");
  await context.click('[data-simple-select-option="new"]');
  context.check("原生弹窗菜单仍连接真实表单状态", await context.waitFor("!!document.querySelector('[data-custom-category]')"));
}

// 这些流程依赖同一条窗口生命周期，顺序执行防止单实例锁和主题串扰。
// 首页检查放在资料库之后，导航离开创建页不会中断收藏的写盘断言。
module.exports = async context => {
  // 先核对唯一首页，再继续本文件已有的编辑和原生弹窗回归。
  // 不因移除预览模板丢失独立业务的检查边界。
  await home(context);
  await edit(context);
  await nativeDialog(context);
};
