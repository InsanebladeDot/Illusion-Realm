/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * window.handlers：窗口和主题 IPC 隶属 core 的系统交互边界。
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 */
/** Personal-center UI regression in the real renderer, with isolated guest data and no network writes. */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'profile-ui', timeoutMs: 90000 });
// 使用独立浏览器目录和内存用户文档，不读取真实账户，不把样例互动写进本机历史。
// 使用独立浏览器目录和内存用户文档，不读取真实账户，不把样例互动写进本机历史。
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-profile-ui-'));
let win;
const errors = [];
let userData = { version: 1, settings: { paths: {}, theme: 'light', locale: 'zh-CN' }, profile: { username: '幻境旅人', bio: '', avatarDataUrl: null, socialLinks: [], stats: { posts: 0, followers: 0, following: 0 } } };
app.disableHardwareAcceleration(); app.setPath('userData', path.join(root, 'browser'));
smoke.setWorkDir(root); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
// 个人中心也挂载真实自定义顶栏，需要对应的窗口状态查询与受限动作通道。
// 使用生产注册入口，避免测试初始化时缺失 handler，或用固定状态掩盖边界问题。
// 本专项的指针操作仍只控制 nav；系统窗口动作由顶栏专项单独覆盖。
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: require('./lib/guest-session-fixture').withGuestSession(userData), filePath: '', isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, data) => { userData = data; return { data, filePath: '' }; });
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => '');
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: 'UNAUTHENTICATED' } }));
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root);
registerHandle(C.CHANGELOG_READ, () => '');
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] }));
registerHandle(C.MODELS_SCAN, () => []);
registerHandle(C.CLOUD_LIBRARY_REQUEST, () => ({ status: 401, body: { success: false, code: 'UNAUTHENTICATED' } }));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = smoke.createRun();
// 等待真实 React 提交，最多轮询六秒；节拍在主进程，不依赖可能暂停的页面 rAF。
// 等待真实 React 提交，最多轮询六秒；节拍在主进程，不依赖可能暂停的页面 rAF。
async function wait(source) {
  for (let i = 0; i < 100; i++) { if (await run(`Boolean(${source})`)) return; await delay(60); }
  throw new Error('Profile condition timed out: ' + source);
}
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100); }
async function tab(name) { await click(`[data-profile-content-tab=${name}]`); }
async function shot(name) {
  await delay(120);
  fs.writeFileSync(path.join(root, name + '.png'), (await win.webContents.capturePage()).toPNG());
}
async function metrics(width, height = 900) {
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await delay(240);
}
async function setSelect(selector, value) {
  // 先打开再点真实选项，验证公共菜单的事件接线而非改写 DOM 值。
  // Portal 挂在 body，不能限定到触发按钮的后代节点中寻找。
  await click(selector);
  await click(`[data-simple-select-option="${value}"]`);
  await delay(100);
}
/**
 * 前提：首次进入样例模式，六个参考作品均可见。
 * 分类、排序和喜欢通过实际控件操作；跨标签检查同一份状态，防止切换时意外卸载。
 * 输入看似 HTML 的评论，断言原文保留且没有新增 img，验证转义边界。
 * 切实际模式检查帖子和指标不再声称样例成果，并检查内存文档未收到互动字段。
 */
/**
 * 前提：首次进入样例模式，六个参考作品均可见。
 * 分类、排序和喜欢通过实际控件操作；跨标签检查同一份状态，防止切换时意外卸载。
 * 输入看似 HTML 的评论，断言原文保留且没有新增 img，验证转义边界。
 * 切实际模式检查帖子和指标不再声称样例成果，并检查内存文档未收到互动字段。
 */
async function checkPosts() {
  // 默认浅色的隔离样例同时检查 head/nav 与两层 main，防止水合覆盖指定颜色。
  // main 为 #ebf2fe，展示层及个人主页为 #f3f8ff；仅改页面颜色不能满足包裹关系。
  // 外层四边改为 4px 加 1px 边框；展示层内部另以 12px padding 安放页面。
  // 比较实际页面和展示层坐标，避免只检查颜色而漏掉横幅、标签及帖子区贴边。
  // 样例提示保留原文与透明底色；这里不覆盖真实账号服务或数据联调。
  smoke.check('Sample mode retains disclosure inside a padded pale-blue surface and narrower blue frame', await run("(()=>{const root=document.querySelector('[data-profile-mode]'),mode=document.querySelector('.pr-mode'),main=document.querySelector('[data-app-main]'),surface=main.firstElementChild,head=getComputedStyle(document.querySelector('[data-window-titlebar]')),nav=getComputedStyle(document.querySelector('[data-app-nav]')),m=main.getBoundingClientRect(),s=surface.getBoundingClientRect(),r=root.getBoundingClientRect();return root.dataset.profileMode==='sample'&&document.querySelectorAll('[data-profile-post]').length===6&&mode.textContent.includes('不会写入账户')&&head.backgroundColor==='rgb(243, 248, 255)'&&nav.backgroundColor===head.backgroundColor&&getComputedStyle(main).backgroundColor==='rgb(235, 242, 254)'&&getComputedStyle(surface).backgroundColor===head.backgroundColor&&getComputedStyle(root).backgroundColor===head.backgroundColor&&[s.left-m.left,s.top-m.top,m.right-s.right,m.bottom-s.bottom].every(gap=>Math.abs(gap-5)<1)&&[r.left-s.left,r.top-s.top,s.right-r.right,s.bottom-r.bottom].every(gap=>Math.abs(gap-12)<1)&&getComputedStyle(mode).backgroundColor==='rgba(0, 0, 0, 0)'})()"));
  await shot('profile-posts-desktop');
  await run("[...document.querySelectorAll('.pr-categories button')].find(b=>b.textContent==='创作心得').click()");
  smoke.check('Post category filters actual cards', await run("document.querySelectorAll('[data-profile-post]').length===2"));
  await run("document.querySelector('.pr-categories button').click()");
  await setSelect('.pr-post-toolbar [data-simple-select]>button', 'popular');
  smoke.check('Sorting orders the most liked post first', await run("document.querySelector('[data-profile-post]').dataset.profilePost==='1'"));
  await click('[data-profile-post="1"] footer button'); await tab('likes');
  smoke.check('Likes share state with posts', await run(`document.querySelectorAll('[data-profile-post]').length===1&&document.querySelector('[data-profile-post="1"] footer button').getAttribute('aria-pressed')==='true'`));
  await tab('privatePosts');
  smoke.check('Private sample posts are separate from statistics', await run(`document.querySelectorAll('[data-profile-post]').length===1&&document.querySelector('[data-profile-post="4"]')!==null`));
  await tab('posts'); await click('[data-profile-post="1"] .pr-post-cover');
  await wait("document.querySelector('dialog[open]')");
  smoke.check('Post detail is a labelled native modal with real image', await run("!!document.querySelector('dialog[open][aria-labelledby] .pr-detail-image')"));
  await run("(()=>{const e=document.querySelector('dialog textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'<img src=x onerror=alert(1)>');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await click('dialog button[type=submit]');
  smoke.check('Comment is rendered as text, never HTML', await run("document.querySelector('.pr-comments li')?.textContent==='<img src=x onerror=alert(1)>'&&!document.querySelector('.pr-comments img')"));
  await click('dialog>header button');
  await click('[data-profile-actual]');
  smoke.check('Actual mode does not claim sample posts or social metrics', await run("document.querySelectorAll('[data-profile-post]').length===0&&!document.querySelector('.pr-social').textContent.includes('468')"));
  await tab('private');
  smoke.check('Actual statistics show unavailable values and explicit data boundary', await run("[...document.querySelectorAll('.pr-metric strong')].every(e=>e.textContent==='—')&&document.querySelector('.pr-data-note').textContent.includes('不推算')"));
  await click('[data-profile-sample]');
  smoke.check('Sample interactions never persist in user profile', userData.profile.stats.posts === 0 && !Object.hasOwn(userData.profile, 'liked'));
}
// 这组回归验证“有几列”与“有几条数据”两个独立条件，数据减少不能改变列宽。
// 所有卡片仍使用打包内置图片，截图不代表当前用户实际发布了这些作品。
// 首个宽屏尺寸包含左侧127px导航和个人主页右侧信息栏，不拿整个窗口充当网格宽度。
// before读取实际矩形，包括现有padding和border，后续比较因此不依赖手工估算。
// 绘画筛选的三项来自固定样例，足以复现用户截图中原本三张卡铺满一行的情况。
// 筛选后的三张绘画作品曾因auto-fit合并空列而变成三张巨大卡片。
// 在实际主页宽屏打开该分类，先记全部卡片宽度再筛选，两个宽度应相同。
// 之后切到只有一张的喜欢标签，证明列数不依赖样例数量而变化。
// 测试通过正式分类和标签按钮，不注入帖子或修改用户数据。
async function checkSparseCards() {
  await metrics(1920,1080); await tab('posts');
  const before=await run("document.querySelector('.pr-post').getBoundingClientRect().width");
  await run("[...document.querySelectorAll('.pr-categories button')].find(b=>b.textContent==='绘画作品').click()"); await delay(100);
  // 宽屏实际可用区应有4至5列，即使筛选结果只有3项也要保留空轨道。
  // 卡片宽高沿用既有横向矩形比例，不能通过仅压缩图片掩盖整卡放大。
  // 精确比较筛选前后矩形宽度，避免只检查gridTemplateColumns的文本正确。
  smoke.check('Drawing filter retains four-to-five columns and original card width',await run(`(()=>{const g=document.querySelector('.pr-post-grid'),c=[...g.children],n=getComputedStyle(g).gridTemplateColumns.split(' ').length;return c.length===3&&n>=4&&n<=5&&c.every(e=>Math.abs(e.getBoundingClientRect().width-${before})<1)})()`));
  // 截图在筛选状态下保存，保留右侧空轨道，便于直接观察是否仍有卡片被拉伸。
  // 固定1920px视口与上一张全部帖子对照，不能用切换屏幕大小掩盖列宽变化。
  // tab切换由页面真实控件驱动，帖子组件及其本地点赞状态继续保留挂载。
  // 喜欢页使用已有点赞结果，测试不会新增API请求或将样例状态持久化。
  // 若前序点赞用例未建立喜欢项，后面的数量断言会失败而不是空集合自动通过。
  await shot('profile-drawing-grid-1920'); await tab('likes');
  // checkPosts已通过真实点赞选中一项，这里复用该状态而非增加新的夹具记录。
  // 一张喜欢作品也必须和同宽度下帖子卡相等，不能独占整行变宽。
  // 这覆盖同组件不同tab分支，分类过滤还在绘画类别且所选作品属于该类别。
  smoke.check('A single liked post keeps the same grid card width',await run(`document.querySelectorAll('[data-profile-post]').length===1&&Math.abs(document.querySelector('.pr-post').getBoundingClientRect().width-${before})<1`));
  // 退出喜欢标签并恢复全部分类后再压缩容器，避免只测一项遗漏换行问题。
  // 六项数据在五列时必须跨行，能同时验证纵向排列没有干扰卡片自身比例。
  // 单列200px输入小于默认最小卡宽，专门验证min(100%,...)回退不会撑破父容器。
  // 不检查隐藏统计面板的轨道读数：display:none时计算样式不代表可见网格布局。
  // 460px只能容纳两个210px卡及一条间距，700px允许三列，950px允许四列。
  // 1120px容纳五列；更宽时上限仍由同一网格规则约束，原布局专项继续覆盖2560px。
  await tab('posts'); await run("document.querySelector('.pr-categories button').click()");
  // 限定真实网格容器宽度逐步收缩，避开应用side在断点折行对可用宽度的影响。
  // 五个输入独立给定预期列数，防止测试复制产品公式成为恒真对照。
  // 保留全部六张样例，检查所有卡片比例和横向溢出，不仅检查第一行。
  // 临时宽度只用于测量容器规则，finally恢复，后续主题与资料回归不受影响。
  try {
    for(const [width,columns] of [[1120,5],[950,4],[700,3],[460,2],[200,1]]) {
      await run(`void(document.querySelector('.pr-post-grid').style.width='${width}px')`);
      // 通过浏览器实际布局读取轨道与卡片盒，不以CSS类名或源码字符串代替几何。
      // 每个尺寸保持宽大于高，同时拒绝卡片内容撑出网格宽度。
      // 少于五列来自容器空间不足，不由图片数量决定。
      smoke.check(`Shared profile grid ${width}px uses ${columns} columns`,await run(`(()=>{const g=document.querySelector('.pr-post-grid');return getComputedStyle(g).gridTemplateColumns.split(' ').length===${columns}&&g.scrollWidth<=g.clientWidth+1&&[...g.children].every(e=>{const r=e.getBoundingClientRect();return r.width>r.height&&r.width/r.height<1.1})})()`));
    }
  // finally覆盖断言或页面读取抛错的路径，临时内联宽度不能泄露给后续用例。
  // 不恢复分类数组或点赞字段：这组只改变布局和筛选，本地互动仍交给原组件管理。
  // 这个测试不会用样式覆盖grid-template-columns，生产CSS是列数的唯一来源。
  // 若响应式CSS失效，预期列数及实际卡片矩形检查都会独立报错。
  // 远端云端图片与收藏夹本轮只共享CSS排布，真实网络数据不包含在隔离游客冒烟内。
  } finally {await run("document.querySelector('.pr-post-grid').style.removeProperty('width')");}
}
/**
 * 四张图必须由真实 ECharts SVG 渲染，不以图表名称或数据属性冒充渲染成功。
 * 检查 ECharts 实例标记与实际 SVG 路径，手写空 div 或旧 CSS 环不能通过。
 * 首次进入前统计标签曾隐藏，非零 SVG 宽度同时覆盖延迟初始化风险。
 * 使用现有隔离样例，不连接真实账户统计服务，不代表线上确有这些生成记录。
 * 七天186与三十天762来自既有夹具，指标与环图中央文字必须同步变化。
 * 环图中心读取 ECharts graphic 生成的 SVG text，不再读取旧 HTML strong。
 * 周期检查之后切换成功率，直接确认坐标轴出现百分号而非只检查下拉选项。
 * 横条末端的68%也是实际SVG文字，可检测新系列漏注册或空配置。
 * 卡片右上角走正式明细按钮，原生dialog里的第五张图必须完成ECharts初始化。
 * 弹窗闭合后要求宿主节点减少，避免明细SVG继续滞留在页面中。
 * 这验证可观察的DOM回收；未把它等同于完整堆内存或全部监听器泄漏分析。
 * 隐藏并重新显示统计标签时，保留同一个ECharts实例，不能生成重复图层。
 * 库写入的实例标记用于比较实际生命周期，不增加产品测试专用全局变量。
 * SVG宽度与当前宿主宽度必须一致，不能只剩隐藏前的固定像素尺寸。
 * 后续原有尺寸循环还会覆盖从桌面到手机的容器变化与卡片溢出。
 * 实际模式先清空样例，再检查环图没有环片路径且中央显示破折号。
 * 模型图必须出现暂无统计，不能让旧的68%混入未知实际数据。
 * 趋势图不保留固定样例日期，防止数据清空却仍暗示存在历史记录。
 * 这些负向检查针对未知数据，不能改写成业务统计值为零的断言。
 * 最后恢复样例、七天和生成数，后续布局截图沿用同一初始场景。
 * 所有等待均使用主进程有界轮询，不等待可能被隐藏页面暂停的rAF。
 * 操作期间不修改用户文档，原有样例互动的非持久化约束继续保留。
 */
async function checkStatistics() {
  await tab('private'); await wait("document.querySelectorAll('.pr-echart[_echarts_instance_] svg').length===4");
  // 四种系列各自需要可见路径，未注册某一种图表类型不能靠其余图通过。
  // 模型标签读数另外验证bar标签配置，检查的不只是宿主存在或有一个svg空壳。
  // 样例总数仍由原指标卡显示，五张指标不参与ECharts实例数量的计算。
  // 这里不比较像素颜色，避免抗锯齿差异掩盖本来要验证的库接入和数据路径。
  smoke.check('Four statistics cards render real ECharts SVG series', await run("document.querySelectorAll('.pr-metric').length===5&&[...document.querySelectorAll('.pr-echart')].every(e=>e.getAttribute('_echarts_instance_')&&e.querySelectorAll('svg path').length>0&&e.querySelector('svg').getBoundingClientRect().width>0)&&document.querySelector('[data-chart-kind=models] svg').textContent.includes('68%')"));
  await shot('profile-statistics-desktop'); await setSelect('.pr-stats-heading [data-simple-select]>button', '30');
  // 三十天使用原版下拉事件触发React状态，测试没有向图表实例直接注入option。
  // 762必须出现在库生成的中央graphic文字中，旧的186不能通过指标单独变化蒙混。
  // 这项与后面的明细断言配对，分别覆盖卡片配置更新和新宿主的初始配置。
  smoke.check('30-day total agrees between metric and ECharts ring', await run("document.querySelector('.pr-metric strong').textContent==='762'&&document.querySelector('[data-chart-kind=distribution] svg').textContent.includes('762')"));
  await setSelect('.pr-chart-card [data-simple-select]>button', 'success');
  // 纵轴100%来自真实SVG刻度，能发现只更新HTML单位而漏改ECharts轴域的错误。
  // 固定96至100的成功率轴在三十天也成立，不能继续沿用生成次数的自动上限。
  // 数据仍为显式样例，不据此验证任何实际生成任务的成功率。
  smoke.check('ECharts trend switches its rendered axis to percentages', await run("document.querySelector('.pr-chart-legend').textContent.includes('单位：%')&&document.querySelector('[data-chart-kind=trend] svg').textContent.includes('100%')"));
  await click('.pr-chart-row .pr-chart-card:nth-child(2)>header button'); await wait("document.querySelector('dialog[open] .pr-echart svg text')");
  // 明细图使用当前已选三十天，断言762而不是默认七天的186。
  // 第五个宿主应只存在于dialog打开期间，隐藏的主面板四图仍应保留。
  // 等待SVG文字而非仅等待dialog open，覆盖showModal晚于子effect的挂载时序。
  smoke.check('Chart details render the same period in a real modal', await run("document.querySelectorAll('.pr-echart').length===5&&document.querySelector('dialog[open] .pr-echart svg').textContent.includes('762')"));
  await click('dialog>header button'); const instance=await run("document.querySelector('[data-chart-kind=trend]').getAttribute('_echarts_instance_')");
  await tab('posts'); await tab('private');
  // 保留的实例标识由库初始化写入；重新显示前后应完全相同。
  // 每个宿主只允许一个SVG，避免ResizeObserver重复通知不断append新图层。
  // 宽度从浏览器读取，ECharts init成功但没有resize也不能得到通过结论。
  // hidden期间不做零宽度断言，因为原生display:none正应返回零尺寸。
  smoke.check('Hidden statistics resume with one correctly sized instance per host',await run("document.querySelectorAll('.pr-echart').length===4&&document.querySelector('[data-chart-kind=trend]').getAttribute('_echarts_instance_')==="+JSON.stringify(instance)+"&&[...document.querySelectorAll('.pr-echart')].every(e=>e.querySelectorAll('svg').length===1&&Math.abs(e.querySelector('svg').getBoundingClientRect().width-e.clientWidth)<1)"));
  await click('[data-profile-actual]');
  // 中心破折号与没有环片同时成立，防止只替换标题而残留样例圆环。
  // 模型图暂无统计与68%消失同时成立，防止空数组被旧系列合并覆盖。
  // 日期不存在检查折线的类别也清空，而非仅把线颜色设透明。
  // 仅检验账户数据未知的边界，不断言无统计等于零次或零成功。
  smoke.check('Actual mode clears sample ECharts series instead of claiming zero history',await run("(()=>{const ring=document.querySelector('[data-chart-kind=distribution] svg'),model=document.querySelector('[data-chart-kind=models] svg'),trend=document.querySelector('[data-chart-kind=trend] svg');return ring.textContent.includes('—')&&!ring.querySelector('path')&&model.textContent.includes('暂无统计')&&!model.textContent.includes('68%')&&!trend.textContent.includes('10-21')})()"));
  await click('[data-profile-sample]'); await setSelect('.pr-stats-heading [data-simple-select]>button', '7'); await setSelect('.pr-chart-card [data-simple-select]>button', 'count');
}
/**
 * 键盘使用冒泡事件走 tablist 处理逻辑，同时验证 focus、selection 与控制面板关系。
 * 减少动效通过 Chromium 媒体特性模拟，检查最终 computed style，而非读取 CSS 源码。
 * 手机滚动检查横幅确实位移且根页面不动，区分整页内滚动与旧版固定横幅。
 * 图片只检查当前视口内可见节点，避免把 lazy 图片尚未进入视口误报为破图。
 */
/**
 * 键盘使用冒泡事件走 tablist 处理逻辑，同时验证 focus、selection 与控制面板关系。
 * 减少动效通过 Chromium 媒体特性模拟，检查最终 computed style，而非读取 CSS 源码。
 * 手机滚动检查横幅确实位移且根页面不动，区分整页内滚动与旧版固定横幅。
 * 图片只检查当前视口内可见节点，避免把 lazy 图片尚未进入视口误报为破图。
 */
async function checkAccessibility() {
  await tab('posts');
  await run("document.querySelector('[role=tab][aria-selected=true]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  smoke.check('Keyboard tabs keep selection, focus and panel relationship aligned', await run("(()=>{const t=document.querySelector('[role=tab][aria-selected=true]');return t.dataset.profileContentTab==='likes'&&document.activeElement===t&&!document.getElementById(t.getAttribute('aria-controls')).hidden})()"));
  await tab('posts');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'reduce'}] });
  smoke.check('Reduced motion disables cover hover transitions', await run("getComputedStyle(document.querySelector('.pr-post-cover img')).transitionDuration==='0s'"));
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
  await metrics(390,844);
  const top = await run("document.querySelector('[data-profile-cover]').getBoundingClientRect().top");
  await run("document.querySelector('[data-profile-scroll]').scrollTop=150");
  smoke.check('Banner and content use one internal page scroller', await run(`document.querySelector('[data-profile-cover]').getBoundingClientRect().top<${top}-100&&document.scrollingElement.scrollTop===0`));
  await run("document.querySelector('[data-profile-scroll]').scrollTop=0");
  await delay(150);
  smoke.check('Visible bundled images decode without broken assets', await run("[...document.querySelectorAll('[data-profile-scroll] img')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.top<innerHeight&&r.bottom>0}).every(e=>e.complete&&e.naturalWidth>0)"));
}
/** 内存夹具回填长昵称和无断点简介后完整刷新，在 320px 下检查截断与主区宽度。 */
/** 内存夹具回填长昵称和无断点简介后完整刷新，在 320px 下检查截断与主区宽度。 */
async function checkLongText() {
  userData.profile.username = '超长中文昵称用于验证个人中心的真实资料溢出处理和对齐';
  userData.profile.bio = 'https://example.test/' + 'long-unbroken-profile-description'.repeat(8);
  await win.reload(); await wait("document.querySelector('.pr-name h1')?.textContent.startsWith('超长中文')");
  await metrics(320,568); await delay(150);
  smoke.check('Long nickname and unbroken bio stay inside a 320px viewport', await run("(()=>{const e=document.querySelector('[data-profile-scroll]'),n=document.querySelector('.pr-name h1');return e.scrollWidth<=e.clientWidth+1&&getComputedStyle(n).textOverflow==='ellipsis'&&document.querySelector('.pr-bio').getBoundingClientRect().right<=innerWidth})()"));
  await shot('profile-long-text-320');
}
/**
 * 在真实外壳内测试六组尺寸，包含 nav、顶栏及手机底栏对可用空间的影响。
 * 两个功能分别检查页面与卡片内部溢出；标签条允许自身横滚，不当作页面溢出。
 * 截图由 capturePage 取真实 Chromium 结果，手机统计另保存滚到图表的位置。
 */
/**
 * 在真实外壳内测试六组尺寸，包含 nav、顶栏及手机底栏对可用空间的影响。
 * 两个功能分别检查页面与卡片内部溢出；标签条允许自身横滚，不当作页面溢出。
 * 截图由 capturePage 取真实 Chromium 结果，手机统计另保存滚到图表的位置。
 */
async function checkLayouts() {
  // 加入宽窗口验证四至五列，六个样例帖子足以实际填充这两种布局。
  // 同一循环保留手机与中等窗口，避免只修桌面而破坏窄屏比例。
  // 隔离窗口模拟尺寸，不覆盖真实账户或远程图片加载。
  for (const [w, h] of [[2560,1440],[1920,1080],[1536,1024],[1440,900],[1280,800],[1024,768],[390,844],[320,568]]) {
    await metrics(w, h);
    for (const current of ['posts','private']) {
      await tab(current); await run("document.querySelector('[data-profile-scroll]').scrollTop=0");
      // 检查整张可见卡片的实际宽高，不能只验证封面的横向比例。
      // 隐藏面板不参与比例统计；所有标签图标在两种状态及全部宽度下均须存在。
      // 全高清以上检查四至五列，同时保留原有头像与溢出检查。
      smoke.check(current + ' ' + w + ': card proportions, grid density and visible tab icons', await run("(()=>{const grid=document.querySelector('.pr-post-grid'),cards=[...grid.querySelectorAll('.pr-post')].map(e=>e.getBoundingClientRect()).filter(r=>r.width>0),columns=getComputedStyle(grid).gridTemplateColumns.split(' ').length;return [...document.querySelectorAll('.pr-tabs button>svg')].every(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0)&&cards.every(r=>r.width/r.height>1&&r.width/r.height<1.1)&&(!cards.length||columns<=5&&(innerWidth<1920||columns>=4))})()"));
      // 宽窗口额外截图，直接核对四至五列与参考卡片比例。
      // 截图使用当前隔离样例，不读取真实用户头像或帖子。
      // 保留原默认截图，两种宽度分别提供独立的验证结果。
      if (current === 'posts' && w >= 1920) await shot('profile-posts-' + w);
      // 以真实封面与头像矩形比较下沉量，同时保留页面和卡片溢出检查。
      // 桌面下移约 10px，手机沿用约 12px；两者都必须保持头像完整位于封面内。
      // 下沉通过布局实现，图像的白边和编辑按钮仍共同参与实际指针命中。
      const result = await run(`(()=>{const root=document.querySelector('[data-profile-scroll]'),grid=document.querySelector('.pr-post-grid'),r=root.getBoundingClientRect(),a=root.querySelector('.pr-avatar').getBoundingClientRect(),b=root.querySelector('[data-profile-cover]').getBoundingClientRect();return {ok:document.documentElement.scrollWidth<=innerWidth&&root.scrollWidth<=root.clientWidth+1&&r.right<=innerWidth+1,avatarDown:(a.top+a.bottom-b.top-b.bottom)/2,avatarInside:a.top>=b.top&&a.bottom<=b.bottom,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,width:root.clientWidth,overflow:[...root.querySelectorAll('.pr-post,.pr-metric,.pr-chart-card')].filter(e=>e.getBoundingClientRect().width&&e.scrollWidth>e.clientWidth+2).map(e=>e.className)}})()`);
      // 直接校验可见几何，不能仅检查 padding 类名，否则旧的居中样式仍可能漏过。
      // 条件随组件真实宽度选择手机参考，避免用窗口宽度忽略 nav 所占空间。
      // 当前使用隔离样例头像；真实账户图片是否可下载不属于本断言的结论。
      smoke.check(`${current} ${w}x${h}: lowered avatar stays inside cover without overflow`, result.ok && !result.overflow.length && result.avatarInside && Math.abs(result.avatarDown-(result.width<=700?12:10))<1, JSON.stringify(result));
      if (w === 390 || w === 320) await shot(`profile-${current==='posts'?'posts':'statistics'}-${w}`);
      if (w === 390 && current === 'private') {
        await run("document.querySelector('.pr-chart-row').scrollIntoView({block:'start'})");
        await shot('profile-statistics-mobile-content');
      }
    }
  }
}
/**
 * 游客权限使用模拟的 401，验证保留真实组件的登录边界，不进行账户联调。
 * 标签来回后比较云端子节点身份，确保失败重试和表单状态不会因切换丢失。
 * 编辑仍打开原来的资料弹窗；封面通过真实 File 输入预览并重置，检查不新增持久化字段。
 */
/**
 * 游客权限使用模拟的 401，验证保留真实组件的登录边界，不进行账户联调。
 * 标签来回后比较云端子节点身份，确保失败重试和表单状态不会因切换丢失。
 * 编辑仍打开原来的资料弹窗；封面通过真实 File 输入预览并重置，检查不新增持久化字段。
 */
async function checkExistingFunctions() {
  await metrics(1440); await tab('cloudImages');
  smoke.check('Cloud images retain the real guest permission boundary', await run("document.querySelector('#profile-panel-cloudImages').textContent.includes('登录')"));
  await run("window.__cloudNode=document.querySelector('#profile-panel-cloudImages').firstElementChild");
  await tab('posts'); await tab('cloudImages');
  smoke.check('Cloud panel survives switching without losing its state', await run("document.querySelector('#profile-panel-cloudImages').firstElementChild===window.__cloudNode"));
  await tab('cloudCollections');
  // 实际模式必须仍展示真实云端文件夹，而不是把八条静态样例当成账户记录。
  // 用原来的公共收藏范围与401夹具触发加载，确认新界面没有移除原始入口。
  // 返回样例模式后控制器继续保留，本测试不向真实账户发送写请求。
  await click('[data-profile-actual]');
  smoke.check('Actual cloud collections remain available without sample cards', await run("(()=>{const p=document.querySelector('#profile-panel-cloudCollections');return !p.querySelector('.pr-cloud').hidden&&p.querySelector('[data-cloud-collections]')!==null&&p.querySelector('[data-profile-collections]').getBoundingClientRect().width===0})()"));
  await click('[data-profile-sample]');
  await tab('posts');
  await click('.pr-cover-actions>button:last-child');
  await wait("document.querySelector('[role=dialog]')");
  smoke.check('Original edit-profile dialog remains wired', await run("document.querySelector('[role=dialog]').textContent.includes('编辑公开资料')"));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await wait("!document.querySelector('[role=dialog]')");
  const bytes = fs.readFileSync(path.join(__dirname,'../apps/next/src/assets/profile/post-1.webp')).toString('base64');
  await run(`(()=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(${JSON.stringify(bytes)}),c=>c.charCodeAt(0))],'cover.webp',{type:'image/webp'}));const e=document.querySelector('[data-profile-cover] input');e.files=dt.files;e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait("document.querySelector('.pr-banner-image').src.startsWith('data:')");
  smoke.check('Cover preview accepts local image without persistence', !userData.profile.cover);
  await click('.pr-cover-actions>button:first-child');
  smoke.check('Cover reset restores bundled reference resource', await run("!document.querySelector('.pr-banner-image').src.startsWith('data:')"));
}
/**
 * 顶栏伸缩回归：重现旧 CSS 在中等窗口吞掉展开效果的问题。
 * 使用已经水合的真实个人中心，不注入 Zustand 状态或替换产品样式。
 * 覆盖 821px 侧栏起点、900/1280px 常用窄窗及 1449/1450px 旧断点两侧。
 * 1536px 同时检查宽屏规则，防止只修中屏却破坏原来的正常状态。
 * 每个尺寸连续点两次，应先切到相反状态，再恢复原始偏好。
 * 事件走 Electron 实际指针路径，因此同时覆盖按钮被 drag 区吞点击的风险。
 * 使用 CSS 坐标中心发出点击；不通过 DOM click 绕过命中测试。
 * 等待 400ms 覆盖原有 300ms 宽度过渡，不把动画中间值当作最终宽度。
 * 断言同时比较 aria-expanded 和几何，避免状态切换而视觉仍被媒体查询锁住。
 * nav 真实宽度应为展开 127px、收起 68px，主内容留白必须同步。
 * 图标恢复原版 16px，展开和收起均须一致，且主导航与底部设置都检查。
 * 820px 以下应用使用移动导航，顶栏伸缩按钮应与桌面 nav 一起隐藏。
 * 截图保留 1280px 的两个状态，便于核对标签、立绘及内容左边缘。
 * 测试不写账户资料；最后一次点击恢复每组尺寸进入时的展开状态。
 */
async function checkNavToggle() {
  for (const width of [821,900,1280,1449,1450,1536]) {
    await metrics(width); const original = await run("document.querySelector('[data-sidebar-toggle]').getAttribute('aria-expanded')==='true'");
    for (const expanded of [!original,original]) {
      const point = await run("(()=>{const r=document.querySelector('[data-sidebar-toggle]').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
      win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point}); win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point}); await delay(400);
      // 个人中心复用当前 127px nav 规范，移除旧 220px 预期以免把现有布局误判为回归。
      // 展开与收起均比较主内容左留白，颜色调整不能破坏导航的实际伸缩行为。
      // 同一指针点击还校验 no-drag，避免视觉改动吞掉顶栏伸缩按钮事件。
      smoke.check(`Nav ${width}px ${expanded?'expanded':'collapsed'} responds to real pointer`, await run(`(()=>{const b=document.querySelector('[data-sidebar-toggle]'),n=document.querySelector('[data-app-nav]'),s=getComputedStyle(document.querySelector('[data-app-content-layout]'));return b.getAttribute('aria-expanded')==='${expanded}'&&n.getBoundingClientRect().width===${expanded?127:68}&&parseFloat(s.paddingLeft)===${expanded?127:68}&&getComputedStyle(b).getPropertyValue('-webkit-app-region')==='no-drag'&&[...n.querySelectorAll('a>svg')].every(i=>i.getBoundingClientRect().width===16&&i.getBoundingClientRect().height===16)})()`));
      if(width===1280)await shot(`profile-nav-${expanded?'expanded':'collapsed'}-1280`);
    }
  }
  for(const width of [820,768,390]) {await metrics(width);smoke.check(`Nav ${width}px hides desktop toggle with desktop navigation`,await run("getComputedStyle(document.querySelector('[data-sidebar-toggle]')).display==='none'&&getComputedStyle(document.querySelector('[data-app-nav]')).display==='none'"));}
}
/** 明暗与语言切换均走真实应用菜单；截图保存实际主题，英文断言覆盖新统计标题。 */
/** 明暗与语言切换均走真实应用菜单；截图保存实际主题，英文断言覆盖新统计标题。 */
/**
 * 收藏交互在隔离样例上运行，不把模拟数据描述为真实账户云端联调。
 * 起点为八张作品；帖子和收藏都必须有公共组件标记，防止重复实现卡片骨架。
 * 先从侧栏选场景，再从主区回到全部，确认两个分类入口共享状态。
 * 搜索通过原生输入事件更新React，检查标题、标签匹配与分类交集。
 * 收藏日期升序后应从最早的第八项开始，不能按当前渲染下标排序。
 * 点赞与撤回比较aria-pressed，收藏移除则同时检查主区和侧栏计数。
 * 封面打开原生详情，取消收藏关闭详情，不能留下已移除作品的模态层。
 * 管理恢复仅操作样例，检查八张恢复而用户文档仍未记录收藏状态。
 * 过滤到无结果后清除筛选，不恢复取消的作品或偷偷修改排序选择。
 * 最后清空输入并恢复默认排序，避免把本用例的筛选传给后续布局测试。
 * 分类计数断言同时读主区span与侧栏small，防止仅卡片数量改变。
 * 样例中的角色与场景分类各有两项，搜索可验证交集而非替代分类。
 * 夜景标签出现在两张场景样例上，标题搜索再把结果缩到一张。
 * no matching artwork确保进入空态，而不是碰巧匹配某个英文标签。
 * 空态清除后old排序应显示2025-10-05的第八项，独立验证排序路径。
 * 点赞检查的是目标卡片内部按钮，不会误点隐藏的帖子卡。
 * 第二次心形点击撤回后才进入详情，两个动作不会共享同一个事件处理器。
 * 原生dialog的open属性证明详情真正进入模态状态，不能只挂一个隐藏节点。
 * 删除详情作品的断言还检查dialog消失，防止留下遮住页面的顶层元素。
 * 最近列表移除使用标题判据，因为五条结果会由下一张自动补足。
 * 管理恢复同时检查内存用户文档未新增saved，避免误接持久化写入。
 * 检查样例恢复时不更改账户登录状态，后续真实云端权限用例仍为游客。
 * 测试不把本地点赞后增加的数字描述为服务器统计更新。
 */
async function checkSavedActions() {
  await metrics(1920,1080); await tab('cloudCollections');
  smoke.check('Posts and eight saved artworks use the shared card component', await run("document.querySelectorAll('[data-profile-artwork=collection]').length===8&&document.querySelectorAll('[data-profile-artwork=post]').length===6&&document.querySelector('[data-collection-category=all] span').textContent==='8'"));
  // 分类从侧栏操作，主区两个场景结果和选中pill应同步；图标不能被文字挤没。
  // 这一步没有搜索条件，计数对应全部剩余收藏，不依赖截图里的128项。
  // 初始场景样例为第二和第六项，后续搜索会进一步取交集。
  await click('[data-collection-side-category=scene]');
  smoke.check('Sidebar categories share main-filter state and counts', await run("document.querySelectorAll('[data-profile-collection]').length===2&&document.querySelector('[data-collection-category=scene]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-collection-side-category=all] small').textContent==='8'"));
  await run("(()=>{const e=document.querySelector('.pr-saved-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'夜景');e.dispatchEvent(new Event('input',{bubbles:true}))})()"); await delay(100);
  smoke.check('Search matches tags within the selected category', await run("document.querySelectorAll('[data-profile-collection]').length===2"));
  // 搜索标题使用中文词条中的唯一片段，过滤后仍不能拉宽剩余单张卡片。
  // 输入不提交URL、HTML或云端查询，所有匹配发生在当前样例上。
  // 清空使用同一个原生value setter，避免直接赋值绕过React受控状态。
  await run("(()=>{const e=document.querySelector('.pr-saved-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'提示词');e.dispatchEvent(new Event('input',{bubbles:true}))})()"); await delay(100);
  smoke.check('Search narrows saved cards by title', await run("document.querySelectorAll('[data-profile-collection]').length===1&&document.querySelector('[data-profile-collection]').dataset.profileCollection==='6'"));
  await run("(()=>{const e=document.querySelector('.pr-saved-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'no matching artwork');e.dispatchEvent(new Event('input',{bubbles:true}))})()"); await delay(100);
  smoke.check('Unmatched saved search offers a usable empty-state reset', await run("!document.querySelector('[data-profile-collection]')&&!!document.querySelector('.pr-saved .pr-empty button')"));
  await click('.pr-saved .pr-empty button'); await setSelect('.pr-saved-toolbar [data-simple-select]>button','old');
  smoke.check('Saved sorting uses dates rather than filtered indices', await run("document.querySelector('[data-profile-collection]').dataset.profileCollection==='8'"));
  // 心形只影响喜欢状态，取消收藏是另一个独立按钮，二者不能相互触发。
  // 两次操作应能恢复未点赞状态；之后从图片进入详情确认公共查看回调。
  // 第八项是新增打包截图素材，详情应指向相同图片而不是默认第一张。
  await click('[data-profile-collection="8"] footer button');
  smoke.check('Saved likes update independent button state', await run("document.querySelector('[data-profile-collection=\"8\"] footer button').getAttribute('aria-pressed')==='true'"));
  await click('[data-profile-collection="8"] footer button'); await click('[data-profile-collection="8"] .pr-post-cover');
  smoke.check('Saved detail uses the existing labelled modal', await run("document.querySelector('dialog[open] h2')?.textContent==='幻想的远方'&&!!document.querySelector('dialog .pr-detail-image')"));
  await click('dialog .pr-choice');
  smoke.check('Unsave closes detail and updates both category totals', await run("!document.querySelector('dialog[open]')&&!document.querySelector('[data-profile-collection=\"8\"]')&&document.querySelector('[data-collection-category=all] span').textContent==='7'&&document.querySelector('[data-collection-side-category=all] small').textContent==='7'"));
  // 在主网格取消第一项，该项也必须从最近收藏中消失，不能只改卡片图标。
  // 最近列表显示五条，移除后由下一条补入，不能依赖固定列表下标验证。
  // 断言标题内容避免把同图不同作品误判为相同资源。
  await click('[data-profile-collection="1"] .pr-bookmark');
  smoke.check('Card unsave updates the recent list without opening detail', await run("!document.querySelector('dialog[open]')&&document.querySelector('[data-collection-category=all] span').textContent==='6'&&![...document.querySelectorAll('.pr-saved-recent strong')].some(e=>e.textContent==='水面之下的少女')"));
  await click('[data-collection-manage]'); await click('dialog .pr-button');
  smoke.check('Manage restores samples without persisting account saves', await run("document.querySelectorAll('[data-profile-collection]').length===8")&&!Object.hasOwn(userData.profile,'saved'));
}
/**
 * 收藏网格沿用帖子网格，但仍须检查实际渲染几何，不能只看同名CSS类。
 * 覆盖宽屏四至五列与手机单列；布局基于真实nav和侧栏占用后的剩余空间。
 * 先量全部卡宽，再筛到一个作品，确认auto-fill保留空轨道而非铺满。
 * 图片懒加载只检查进入视口的卡片，隐藏面板不会被误判为破图。
 * 保存宽屏与手机截图，人工核对搜索、类别、封面按钮及最近列表。
 * 侧栏在窄屏按现有容器断点下移，不覆盖主区卡片或产生横向滚动。
 * 320px断言包括搜索框和排序控件，防止只缩网格却留下宽工具条。
 * 卡片宽高比必须与帖子相同，封面横向不能掩盖整卡纵向变长。
 * 这组不调用任何收藏API，所有素材均由静态构建打包。
 * 使用父页面的真实滚动容器，不给测试额外加覆盖样式来隐藏溢出。
 * width=2560覆盖五列上限，不能随着超宽窗口无限增加卡片列数。
 * width=1920覆盖至少四列，确认仍符合用户要求的宽屏密度。
 * width=1280保留主区与右栏共同压缩的中等宽度场景。
 * width=390与320覆盖工具条换行和侧栏单列，包含实际手机底栏占位。
 * 每组先清滚动位置，避免前一组详情或截图滚动把主要工具条留在视口外。
 * 卡片矩形直接读取浏览器布局，断言1至1.1的宽高比范围。
 * 小数误差允许1px，不把设备CSS像素舍入误当成布局回归。
 * 单项作品筛选选择work，固定夹具中恰好一项，能稳定复现稀疏列表。
 * 筛选后宽度与同组完整列表比较，避免不同窗口尺寸造成无意义比较。
 * 检查后恢复all，下一组尺寸不会沿用单项结果掩盖完整网格问题。
 * 截图在all状态保存，便于同时观察八张卡、分类计数与最近列表。
 * 所有Electron窗口均由本专项创建，测试结束仅销毁自己的窗口。
 * 当前套件和下载专项串行执行，不以并发运行的偶然时序得出稳定性结论。
 */
async function checkSavedLayouts() {
  for(const width of [2560,1920,1280,390,320]) {
    await metrics(width,width<400?844:1080); await tab('cloudCollections'); await run("document.querySelector('[data-profile-scroll]').scrollTop=0");
    const original=await run("document.querySelector('[data-profile-collection]').getBoundingClientRect().width");
    // 八项足够填充宽屏五列，手机仍须保证整张卡片宽大于高。
    // 检查页面与卡片内部溢出，不能通过隐藏横向内容使测试表面通过。
    // 两侧导航与展示区内边距均由生产样式决定，测试不手动扣除宽度。
    smoke.check(`Saved ${width}px: shared proportions, density and no overflow`,await run("(()=>{const p=document.querySelector('[data-profile-scroll]'),g=document.querySelector('.pr-saved .pr-post-grid'),n=getComputedStyle(g).gridTemplateColumns.split(' ').length,c=[...g.children];return p.scrollWidth<=p.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth&&n<=5&&(innerWidth<1920||n>=4)&&c.every(e=>{const r=e.getBoundingClientRect();return r.width/r.height>1&&r.width/r.height<1.1&&e.scrollWidth<=e.clientWidth+2})})()"));
    await click('[data-collection-category=work]');
    smoke.check(`Saved ${width}px: sparse results preserve card width`,await run(`document.querySelectorAll('[data-profile-collection]').length===1&&Math.abs(document.querySelector('[data-profile-collection]').getBoundingClientRect().width-${original})<1`));
    await click('[data-collection-category=all]');
    if(width===1920||width===390) await shot('profile-collections-'+width);
  }
  // 最后回到桌面并恢复主标签，后续权限及主题用例使用各自原始前置条件。
  // 这里不重置样例收藏，因为前一组管理恢复已经验证了八项起点。
  // 截图路径由现有harness隔离目录提供，不写入仓库或真实用户数据目录。
  await metrics(1440); await tab('posts');
}
async function checkAppearance() {
  await click('[data-theme-trigger]'); await wait("document.querySelector('[data-theme-option=dark]')");
  await click('[data-theme-option=dark]'); await require('./lib/sidebar-menu-fixture').closeAppearance(run);
  await wait("document.documentElement.dataset.theme==='dark'");
  await tab('posts'); await shot('profile-posts-dark'); await tab('private'); await shot('profile-statistics-dark');
  await require('./lib/sidebar-menu-fixture').revealSidebarPreference(run,'[data-language-trigger]');
  await click('[data-language-trigger]');
  await run("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='English').click()"); await delay(250);
  smoke.check('New personal-center UI is translated in English', await run("document.querySelector('.pr-stats-heading h2').textContent.includes('Private')&&!/[\u4e00-\u9fff]/.test(document.querySelector('.pr-stats-heading').textContent)"));
  await shot('profile-statistics-english-dark');
  // 收藏界面使用当前英文和深色主题，检查工具条与类别未遗留中文硬编码。
  // 隐藏的真实云端错误不计入样例界面文本，避免测试范围越过当前模式。
  // 主题切换不能清空本地收藏；网格仍有管理恢复后的八项。
  await tab('cloudCollections');
  smoke.check('Saved UI follows English locale and retains state in dark theme', await run("document.querySelectorAll('[data-profile-collection]').length===8&&!/[\u4e00-\u9fff]/.test(document.querySelector('[data-profile-collections]').textContent)"));
  await shot('profile-collections-english-dark');
}
/**
 * 先校验静态导出的源码指纹，再加载 app 协议和真实 preload，避免测到旧构建。
 * 更新公告必须真正出现并关闭后才操作，防止合规的模态锁让后续用例假红。
 * finally 仅关闭本脚本创建的窗口；退出交给 harness，失败不会被 app.quit 丢成成功。
 */
/**
 * 先校验静态导出的源码指纹，再加载 app 协议和真实 preload，避免测到旧构建。
 * 更新公告必须真正出现并关闭后才操作，防止合规的模态锁让后续用例假红。
 * finally 仅关闭本脚本创建的窗口；退出交给 harness，失败不会被 app.quit 丢成成功。
 */
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  const chrome = require("../apps/electron/src/main/core/windows/window-chrome");
  win = new BrowserWindow({ ...chrome.windowChromeOptions(),show:false,width:1440,height:900,webPreferences:{additionalArguments:chrome.windowChromeArguments(),offscreen:true,preload:path.join(__dirname,"../apps/electron/src/preload/index.js"),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false} });
  smoke.attachWebContents(win.webContents); win.webContents.debugger.attach('1.3');
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
  try {
    await win.loadURL('app://app/profile'); await wait("document.querySelector('[data-profile-mode]')");
    await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
    await click('[aria-labelledby=update-announcement-title] button'); await delay(300);
    await metrics(1536,1024); await checkPosts(); await checkSparseCards(); await checkStatistics(); await checkLayouts();
    // 收藏交互与布局独立覆盖，但继续在同一真实Electron专项中顺序执行。
    // 不额外并发启动第二个Electron窗口，避免共享GPU及生命周期抖动干扰判读。
    // 权限检查随后切到实际内容，确认样例复刻没有替换真实云端业务。
    await checkSavedActions(); await checkSavedLayouts();
    await checkAccessibility(); await checkNavToggle(); await checkExistingFunctions(); await checkAppearance(); await checkLongText();
    smoke.check('No hydration or React renderer-state errors', !errors.some(message=>/hydration|while rendering|Minified React error/.test(message)));
  } finally { win.destroy(); }
  console.log('PROFILE_UI_SCREENSHOTS', root); smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error=>{console.error(error.stack);smoke.finish({app,ok:false})});
