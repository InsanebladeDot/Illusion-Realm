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
