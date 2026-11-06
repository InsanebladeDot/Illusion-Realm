/**
 * UI-03 的真实素材面板回归，复用既有 Electron 窗口和静态导出。
 * 素材选择像给货架原件贴标签，不能挪动时间轴上的片段副本。
 * 测试同时核对列表变化和时间轴不变，避免仅看高亮就误判通过。
 * 默认五项与样板异常数据都由产品组件渲染，不修改 React 内部状态。
 * 场景按钮只切换固定夹具，不将其当作真实探测完成。
 * 所有输入走 DOM 输入事件或 Chromium 按键，不调用组件回调作捷径。
 * 等待和截图使用外层有上限的主进程节拍，不依赖后台 rAF。
 * 该 helper 不创建新进程，不读取真实素材，也不清理用户目录。
 */
const fs = require("node:fs"), path = require("node:path");
// 主工作区只有一个 R02；样板需要带 A/B 作用域，防止总是操作首个实例。
// 稳定素材 ID 用于定位，文件名仍可变长或按搜索条件改变。
// 选择器全部由测试常量组成，不把外部网络数据拼进表达式。
const MAIN = "[data-video-editor-ui] [data-editor-region=R02]";
// MAIN 不匹配独立样板页，路由跳转后误用它会失败而非命中别的素材行。
// sample 的边界是整个素材面板样例，不是 UI-02 的字段样例 A/B。
// 两种样板虽然都叫 A/B，data 属性不同，测试不能跨组混用选择器。
// 用 data 标记代替中文标题，语言切换不应该改变元素身份。
// 文件名只用于核对展示结果，不用作查询选择器的 CSS 拼接片段。
// “voice”身份与“voice_01.wav”名称分开，重命名不会改变行归属。
// 这也避免包含空格、方括号或中文的文件名破坏定位表达式。
// MAIN 的宿主限制保留旧版工具的独立性，不会选中 legacy 列表。
const sample = id => `[data-editor-media-sample=${id}]`;

// 输入 setter 配合 input 事件走 React 的受控字段通路。
// 文本 JSON 编码只用于 executeJavaScript，不作为 shell 命令拼接。
// 输入前主动聚焦，可以接着测试 Escape 清词与可见焦点。
// wait 后再读结果，避免同一任务里先读到旧受控值。
// 不直接修改筛选结果 DOM，否则无法验证实际过滤逻辑。
async function search(ctx, scope, value) {
  // 原生 setter 避开 React 对值的追踪缓存，随后仍必须派发 input。
  // 只写 e.value 而不发事件会改外观却不更新受控 query，不能用作有效测试。
  // 本 helper 不直接调整类型，查询变化应与先前按钮条件共同生效。
  // 参数 scope 指向面板，因此多个搜索框存在时不会误输入到 B。
  // value 完整保留空白，规范化应由产品过滤逻辑处理而非测试预处理。
  // 等待输入值后，调用方继续验证结果项，单看输入回显不足以证明搜索有效。
  // 大写用例不通过测试先转小写，避免把应验证的大小写规则搬进测试。
  // 本轮不模拟中文输入法组合事件，其支持范围在交付限制中明确保留。
  // 搜索结果由面板重新计算，测试不读取或缓存上一次 results 数组。
  // 如果组件没有受控更新，后面的结果数量断言会直接失败。
  await ctx.run(`(()=>{const e=document.querySelector('${scope} input[type=search]');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ctx.wait(`document.querySelector('${scope} input[type=search]').value===${JSON.stringify(value)}`);
}
// 同一入口用于全部、视频、音频、图片，验证公共按钮的回调与 pressed。
// 固定顺序来自确认稿，测试不按翻译文字寻找按钮。
// 分类是纯 UI，不调用导入服务或切换节目预览。
// 短等待只用于让已触发的同步界面更新提交，不等待未知业务成功。
async function filter(ctx, scope, index) {
  // role=group 将分类按钮与顶部导入、状态恢复按钮区分开。
  // index=0 对应全部，不是当前可见结果的第一项。
  // 切换类型必须立即改变列表，而不能等一次真实导入才刷新。
  // 六十毫秒不是网络超时预算，只用于提交已经发生的本地状态更新。
  // 若结果仍错误，后续数量与身份断言会明确失败，不增加重试轮数。
  // 不在按钮点击后直接改 aria-pressed，状态必须由面板真实渲染。
  // 类型条件不应修改文件名，因此断言仍使用原来的稳定素材 ID。
  await ctx.run(`document.querySelectorAll('${scope} [role=group] button')[${index}].click()`);
  await ctx.delay(60);
}
// 原生 Enter 需要字符事件才能覆盖按钮默认激活，而非仅 React 键事件。
// Escape 没有字符输入，不能向搜索词插入控制字符。
// keyUp 必须配对，避免下一步误认为按键仍按住。
// 事件只发送给隔离窗口，不影响用户当前应用。
// 每一步最终由实际 DOM 断言判读，按键发送成功本身不算通过。
async function key(ctx, name) {
  // 焦点由调用方提前放到目标控件，不用合成 click 来代替按键。
  // Enter 用于验证图片行能从键盘选择，与鼠标 click 路径互补。
  // Escape 用于验证搜索清词，不应该把类型一并恢复为 all。
  // 本轮没有新增全局播放快捷键，搜索中的按键不负责时间线走带。
  // 隐藏窗口的焦点语义由原套件调试设置维持，不修改产品事件处理器。
  // 发送完成后读 ARIA 和值，不能以调试协议没有抛错作为通过依据。
  ctx.win.webContents.sendInputEvent({ type: "keyDown", keyCode: name });
  if (name === "Enter") ctx.win.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
  ctx.win.webContents.sendInputEvent({ type: "keyUp", keyCode: name });
  await ctx.delay(60);
}
// capturePage 保存当前运行像素，不复制设计图冒充运行证据。
// 截图前留给合成器一个有限间隔，主题过渡另外由条件等待负责。
// 文件名由内部测试提供，输出归隔离临时目录所有。
// 本函数不裁切或修图，窗口外壳与滚动边界会完整保留。
// 所有断言仍独立于图片写入成功与否。
async function shot(ctx, name) {
  // root 由外层临时目录生成，本函数不会猜测 Downloads 或用户桌面。
  // 每个状态使用不同文件名，浅色和深色证据不会互相覆盖。
  // capturePage 包含当前滚动位置，因此调用方要明确定位欲检查的样板。
  // 截图尺寸来自真实调试视口，不把小图放大后声称测了宽屏。
  // 软件渲染的图像能够验证布局，但不能代表硬件解码或 GPU 性能。
  // 捕获失败向外层传播，不能丢掉截图还给出一份“已验证”报告。
  await ctx.delay(200);
  fs.writeFileSync(path.join(ctx.root, `${name}.png`), (await ctx.win.webContents.capturePage()).toPNG());
}

// 从返回后的默认工程开始，先测可见双栏宽度，再恢复大布局。
// 三种类型由同一个素材列表渲染，图片次行不能显示虚构源时长。
// 选择基准之外的图片，能发现错误绑定右侧属性或时间轴状态的问题。
// 保存内容快照而非仅比较节点引用，防止节点不换却偷偷改了属性。
// 搜索输入含大写和两端空白，预期命中 voice_01.wav 一项。
// 加入类型条件后取交集，不能忽略音频分类而显示同名视频。
// 查询无结果不能回退到全部，否则用户会以为搜索条件已生效。
// 清除按钮恢复全部五项，并保留图片的选中 ID。
// Escape 只清词；当前音频分类必须仍为 pressed。
// 键盘原生 Enter 选择图片，不让自动化仅覆盖鼠标点击路径。
// 焦点轮廓从计算样式读取，证明 CSS Module 在运行页面实际生效。
// 导入按钮仍 disabled，原因必须关联实际存在的说明节点。
// 选择动作前后没有新时间轴片段，固定 clip-02 仍为选中。
// 节目画面 src 和属性文本也必须完全一致，不能只核对片段数量。
// 搜索/分类/选择都局限本面板，测试不接受隐藏的播放元素。
// 图片无源时长的反证读取次行文本，不靠文件后缀推断。
// 默认行数严格为五项，异常夹具不应混进正式演示工程。
// 选择筛选外素材后隐藏它，取消条件时不能改成首项高亮。
// 同时检查清词后的搜索输入为空，避免只切回类型而留下不可见条件。
// 错误消息属于下一组显式样板，不在默认工作区人为注入异常。
// 本组不声明真实素材预览已完成，节目仍为静态 scene-02。
// 输入事件不触发保存，因此不会写游客文档中的项目内容。
// 所有比较基于用户可见身份和 ARIA，不访问 React fiber 或内部 hook。
// 测试恢复完整五项后截图，便于与已确认原图对照。
async function mainFlow(ctx) {
  // 1280 是实际编辑器主区宽度，浏览器还包含导航和宿主边界。
  // sizeHost 自行量取 inset，不能把总窗口宽度误当作 R02 可用宽度。
  // baseline 中包含片段 ID 与 pressed 两部分，能发现新增片段与串选两类问题。
  // 属性文本包含数值，不只比较“片段属性”标题有没有变化。
  // 节目 src 比较的是解码用地址，不能只读 alt 中未变的文件名。
  // 图片项的时长反证在中文环境执行，次行不应包含秒单位 s。
  // 搜索无结果时会检查行数为零，避免只增加提示却仍保留不匹配内容。
  // 恢复五项时也检查 background 高亮，防止清除条件顺带清空选择。
  // 导入提示使用 aria-describedby 查实际节点，不能只确认有 title 装饰。
  // 默认五项里既有配音又有音乐，清词后应恰好返回两条音频。
  await ctx.sizeHost(1280, 800);
  ctx.smoke.check("Media search is enabled while real import has its own disabled reason", await ctx.run(`(()=>{const p=document.querySelector('${MAIN}'),b=p.querySelector('[data-editor-action]');return !p.querySelector('input').disabled&&b.disabled&&document.getElementById(b.getAttribute('aria-describedby')).textContent.includes('导入与探测')})()`));
  await ctx.run("window.__mediaBaseline={inspector:document.querySelector('[data-editor-region=R04]').textContent,preview:document.querySelector('[data-editor-region=R03] img').src,clips:[...document.querySelectorAll('[data-editor-clip]')].map(e=>[e.dataset.editorClip,e.getAttribute('aria-pressed')])}");
  await filter(ctx, MAIN, 3);
  await ctx.run(`document.querySelector('${MAIN} [data-editor-asset=background]').focus()`); await key(ctx, "Enter");
  // 用户要求焦点改为单根一像素线，旧用例的至少两像素期望与新视觉契约冲突。
  // 这里改为精确一像素，不能放宽为零或仅检查focus属性存在。
  // 原选中对象、A/B独立性和源时间断言继续保留，样式变化不应弱化业务回归。
  // 计算样式来自当前静态构建真实DOM，未在测试里直接给元素添加outline。
  ctx.smoke.check("Keyboard selects image with visible focus and no invented source duration", await ctx.run(`(()=>{const e=document.querySelector('${MAIN} [data-editor-asset=background]');return e.getAttribute('aria-current')==='true'&&parseFloat(getComputedStyle(e).outlineWidth)===1&&!e.querySelector('small').textContent.includes('s')})()`));
  await filter(ctx, MAIN, 2); await search(ctx, MAIN, "  VOICE  ");
  ctx.smoke.check("Case-insensitive filename search intersects audio type", await ctx.run(`document.querySelectorAll('${MAIN} [data-editor-asset]').length===1&&!!document.querySelector('${MAIN} [data-editor-asset=voice]')`));
  await key(ctx, "Escape");
  ctx.smoke.check("Escape clears only search and retains the audio filter", await ctx.run(`document.querySelector('${MAIN} input').value===''&&document.querySelectorAll('${MAIN} [data-editor-asset]').length===2&&document.querySelectorAll('${MAIN} [role=group] button')[2].getAttribute('aria-pressed')==='true'`));
  await search(ctx, MAIN, "not-present");
  ctx.smoke.check("No matches differs from an empty library and offers reset", await ctx.run(`document.querySelector('${MAIN} [data-editor-media-results]').textContent.includes('没有符合')&&document.querySelectorAll('${MAIN} [data-editor-asset]').length===0`));
  await ctx.run(`document.querySelector('${MAIN} [data-editor-media-results] [data-editor-action]').click()`); await ctx.delay(60);
  ctx.smoke.check("Reset restores five items and previously hidden selection", await ctx.run(`document.querySelectorAll('${MAIN} [data-editor-asset]').length===5&&document.querySelector('${MAIN} input').value===''&&document.querySelector('${MAIN} [data-editor-asset=background]').getAttribute('aria-current')==='true'`));
  ctx.smoke.check("Asset selection never changes inspector, program or clip state", await ctx.run("window.__mediaBaseline.inspector===document.querySelector('[data-editor-region=R04]').textContent&&window.__mediaBaseline.preview===document.querySelector('[data-editor-region=R03] img').src&&JSON.stringify(window.__mediaBaseline.clips)===JSON.stringify([...document.querySelectorAll('[data-editor-clip]')].map(e=>[e.dataset.editorClip,e.getAttribute('aria-pressed')]))"));
  await ctx.sizeHost(1600, 1000); await shot(ctx, "ui-03-media-light");
}

// 场景切换使用页面真实按钮，不设置 DOM 属性伪造 disabled 或状态。
// A/B 的外层控制区与内层面板按钮分别定位，避免点错导入入口。
// 每次切换只重置当前样板；B 的查询和选中在另一组另外断言。
// 场景集合由产品显式给出，不通过后端响应延迟制造不稳定超时。
async function scenario(ctx, index) {
  // :first-of-type 限定的是样例外部场景操作区，内部类型按钮不在其中。
  // 选择错误场景时后续占位断言会失败，不根据按钮文本自动修正索引。
  // 本 helper 固定操作 A，便于用 B 作为始终未变的反例。
  // 每次切换使用产品自己的 key 重建规则，测试不手动卸载组件。
  // 错误页保留原五项输入但不显示行，可暴露错误状态还允许旧数据交互的问题。
  // 场景之间没有真实请求，不能用此结果宣称已经覆盖网络取消竞态。
  await ctx.run(`document.querySelectorAll('${sample("A")} > div:first-of-type [data-editor-action]')[${index}].click()`);
  await ctx.delay(60);
}
// 整库 loading 应显示等待占位与 aria-busy，不允许继续搜索旧数据。
// error 应呈现独立错误说明，不允许把失败来源显示成空库。
// loading/error 都不给出假重试，也不会自动推进到成功状态。
// 空库则保留可用搜索，且没有“清除条件”伪恢复按钮。
// 无搜索结果在主区已验证，此处用真正的空数组作反例。
// 连续场景切换还核对 B 保持五项，防止共享状态污染其他实例。
// 不仅检查占位 data 标记，还读取输入 disabled 和实际文本。
// error 的 alert 来自既有 EditorPlaceholder，不新增一套反馈组件。
// loading 的 busy 属于整个面板，单行探测另在长列表测试。
// 原 five-items 起点用于下一组，确保错误状态离开后不残留禁用属性。
// 所有夹具为纯 UI，真实业务调用计数由外层再次断言为零。
// 场景按钮自身始终可用，否则用户无法在独立预览页查看其他状态。
// 状态变化不需要重新进入路由，也不写任何工程素材数据。
// 只在 A 操作，B 的未变是跨实例共用组件的实际证据。
async function libraryStates(ctx) {
  // loading 夹具不是空数组，因此零行必须由整库状态优先级产生。
  // error 同样携带旧素材，确保失败不会意外回退成可选旧列表。
  // B 的五项检查防止场景变量被错误提升到两个实例的共同父层。
  // empty 场景单独传空数组，和带条件的零结果有不同的数据前提。
  // 空库不展示清除按钮，因为清除条件无法凭空恢复不存在的素材。
  // 从空库恢复 ready 后继续运行搜索，能发现 input.disabled 残留。
  // 错误截图发生在 error 场景，文件名不会把 loading 状态误标成错误。
  // 错误文字与等待文字分别来自面板参数，行级缺图不应触发整库反馈。
  for (const [index, state] of [[1, "loading"], [3, "error"]]) {
    await scenario(ctx, index);
    ctx.smoke.check(`Media library ${state} blocks stale rows and search`, await ctx.run(`!!document.querySelector('${sample("A")} [data-editor-media-results] [data-editor-placeholder=${state}]')&&document.querySelector('${sample("A")} input').disabled&&document.querySelectorAll('${sample("A")} [data-editor-asset]').length===0&&document.querySelectorAll('${sample("B")} [data-editor-asset]').length===5`));
  }
  await shot(ctx, "ui-03-media-error"); await scenario(ctx, 2);
  ctx.smoke.check("Empty media library is searchable and has no false recovery action", await ctx.run(`document.querySelector('${sample("A")} [data-editor-media-results]').textContent==='没有素材'&&!document.querySelector('${sample("A")} input').disabled&&!document.querySelector('${sample("A")} [data-editor-media-results] button')`));
  await scenario(ctx, 0);
}

// 两个实例起初内容相同，先只筛 A，再检查 B 的原始五项仍存在。
// B 选择 voice 后，A 的默认 scene-02 不应被替换。
// 主区已验证筛选隐藏后恢复选择，此处补充不同实例与异常素材。
// 长列表同时包含可选缺图、不可选探测中与不可选错误行。
// 加载与错误都传入真实回调，仍由 MediaItem 的原生 disabled 阻止操作。
// 缺图行则有回调且可选，不能把所有异常统一禁用。
// 长文件名必须省略并保留全名提示，不增加横向整页滚动。
// 实际设置列表 scrollTop，标题位置保持不变，证明滚动归属正确。
// 列表包含多份同类音频，稳定 ID 不能因重复类型而合并。
// 截图先恢复顶部，保留长名、探测、错误和缺图在同一实例中的证据。
// 样板页滚动只用于把两个面板带入视口，不改变面板内部选择。
// B 在 A 场景切换时仍保留音频选中，这项检查覆盖数据替换的隔离边界。
// 不比较样板内的假成功消息，因为产品根本不提供这种消息。
// 单行探测不会把整个面板输入禁用，整库等待则在前组另验。
// 不检查文件是否真实存在，这些名称只对应独立静态演示内容。
// 本组不声称已覆盖千级素材库性能或真实音频波形生成。
// 列表外壳复用与主区相同，窄列长名仍走同一个 minmax/ellipsis 规则。
// title 核对全名，避免 CSS 截断时同时丢失辅助查看途径。
// 滚动前后只比较标题 top，不能仅凭 overflow:auto 源码宣布通过。
// 行固定高度保证缺图占位不把后续内容推到工具栏上面。
// 选中标记仍按稳定 ID，过滤后的位置不参与选择计算。
// 音频显示相同波形不意味着同一素材对象，ID 区分每份演示资源。
// UI-02 样板的片段选择保持独立，外层已有对应回归继续运行。
// 这里没有拖动素材入时间轴的实现，不派发拖放事件伪造剪辑能力。
// 错误和加载行的 disabled 由 MediaItem 计算，测试不注入 disabled 属性。
// 主区的五项仍是默认数据，样板长列表不能改变默认演示素材顺序。
// 清除条件只验证面板内的纯 UI，不调用应用级搜索或模型接口。
// 窄窗口断言只检查本面板能滚动，不能替代 UI-07 的全部收缩验收。
// 不根据主题颜色判断可用性，实际 disabled 与 ARIA 才是断言依据。
// 错误行保留原始名称，状态占位不会把整行变成无法识别的空白。
async function sampleFlow(ctx) {
  // voice-0 到 voice-11 是独立条目，列表超出高度后才有可测的滚动距离。
  // probing 与 unavailable 使用视频封面，但显式状态必须优先于已有图片。
  // no-cover 使用图片类型的 null 封面，不能被显示成音频波形。
  // no-cover 与 voice 分属两个实例，选中结果不能由媒体类型共用变量。
  // 单行禁用读原生 disabled，CSS 变灰并不能阻止调用 onSelect。
  // 长名检查 scrollWidth 大于 clientWidth，确保确实触发省略而非只写了样式。
  // title 应仍包含 final_revision，辅助查看不能拿到已截断的显示文本。
  // 标题 top 在列表滚动前后相等，排除整个面板在一起滚动的伪通过。
  // scrollTop 必须大于零，空列表即使 overflow:auto 也不能通过这项反证。
  // scrollWidth 不超过 clientWidth，说明长名没有造成内部横向漂移。
  const a = sample("A"), b = sample("B");
  await filter(ctx, a, 3); await search(ctx, a, "bg");
  await ctx.run(`document.querySelector('${b} [data-editor-asset=voice]').click()`); await ctx.delay(60);
  ctx.smoke.check("Media panel instances have independent filters, queries and selection", await ctx.run(`document.querySelectorAll('${a} [data-editor-asset]').length===1&&document.querySelectorAll('${b} [data-editor-asset]').length===5&&document.querySelector('${b} input').value===''&&document.querySelector('${b} [data-editor-asset=voice]').getAttribute('aria-current')==='true'`));
  await scenario(ctx, 4);
  ctx.smoke.check("Probing and invalid media are disabled but missing covers remain selectable", await ctx.run(`document.querySelector('${a} [data-editor-asset=probing]').disabled&&document.querySelector('${a} [data-editor-asset=unavailable]').disabled&&!document.querySelector('${a} [data-editor-asset=no-cover]').disabled&&!!document.querySelector('${a} [data-editor-asset=no-cover] [data-editor-placeholder=missing]')`));
  await ctx.run(`document.querySelector('${a} [data-editor-asset=no-cover]').click()`); await ctx.delay(60);
  ctx.smoke.check("A missing-cover image can be selected without changing B's audio selection", await ctx.run(`document.querySelector('${a} [data-editor-asset=no-cover]').getAttribute('aria-current')==='true'&&document.querySelector('${b} [data-editor-asset=voice]').getAttribute('aria-current')==='true'`));
  ctx.smoke.check("Long filenames ellipsize while retaining their complete title", await ctx.run(`(()=>{const e=document.querySelector('${a} [data-editor-asset=scene-01]'),s=e.querySelector('strong');return e.title.includes('final_revision')&&getComputedStyle(s).textOverflow==='ellipsis'&&s.scrollWidth>s.clientWidth})()`));
  ctx.smoke.check("Only media results scroll while media tools stay fixed", await ctx.run(`(()=>{const p=document.querySelector('${a}'),list=p.querySelector('[data-editor-media-results]'),before=p.querySelector('h2').getBoundingClientRect().top;list.scrollTop=200;return list.scrollTop>0&&p.querySelector('h2').getBoundingClientRect().top===before&&list.scrollWidth<=list.clientWidth+1})()`));
  await ctx.run(`document.querySelector('${a} [data-editor-media-results]').scrollTop=0;document.querySelector('${a}').scrollIntoView({block:'center'})`);
}

// 同一页面切主题，不重新创建实例，才能暴露主题切换时重置选择的问题。
// 主题使用原有外观菜单，不给根节点写 data-theme 作为测试捷径。
// 等待主题转场结束后关菜单，运行图不会被弹层遮挡。
// 窄视口保留样板素材栏，默认工作区的收缩策略不在 UI-03 提前改写。
// 测试最后返回原工程，确认样板选择不污染静态选中片段。
// 外层继续运行 legacy/GIF 宿主检查与渲染错误汇总。
// 两个 helper 串行共用一个窗口，不触发 Electron 单实例冲突。
// 宽屏和窄屏都保持同一份演示内容，而非替换为简化移动页面。
// 工具栏仍位于各面板顶部，窄屏整页可纵向滚动到第二实例。
// 隔离目录仅保存截图，返回不会触发项目保存或媒体导出。
// 深浅截图采用同一个选择结果，方便比较主题下的可读性。
// 波形与缩略图不做颜色反转，继承的是外壳语义色。
// 真实 Windows 缩放、遮挡与读屏不由这组 offscreen 测试冒充通过。
// 若路由没加载，wait 必须超时失败，不能截旧页面冒充素材状态页。
// 这里启用的焦点模拟属于前面的 UI-02 调试设置，不进入产品运行配置。
// UI-04–UI-08 仍需独立验收，素材回归通过不改变后续任务状态。
async function checkVideoUiMedia(ctx) {
  // 前一个 helper 已回到默认工程，这里不另 loadURL 绕过路由清理。
  // 素材样板通过实际工作栏链接打开，用户也能访问同一个状态入口。
  // 首次定位 A 后再切场景，截图不会停留在原 UI-02 字段样板顶部。
  // 深浅主题之间保持同一份 EDGE_ASSETS，比较的是颜色而非数据变化。
  // 主题转场完成条件防止截到一半深色一半浅色的动画中间帧。
  // 窄窗口宽度为 700，触发应用移动导航；不是仅改变素材栏内联宽度。
  // 回宽屏先量外壳新占位，避免把移动导航高度用于桌面布局尺寸期望。
  // 返回后断言仍是五个演示片段，样板长列表不应追加任何时间线对象。
  await mainFlow(ctx);
  await ctx.run("document.querySelector('a[href=\"/tools/video/editor/samples\"]').click()");
  await ctx.wait("document.querySelector('[data-editor-media-sample=A]')");
  await ctx.run(`document.querySelector('${sample("A")}').scrollIntoView({block:'center'})`);
  await libraryStates(ctx); await sampleFlow(ctx); await shot(ctx, "ui-03-media-samples-light");
  await ctx.run("document.querySelector('[data-theme-trigger]').click()"); await ctx.wait("document.querySelector('[data-theme-option=dark]')");
  await ctx.run("document.querySelector('[data-theme-option=dark]').click()"); await ctx.wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')");
  await ctx.run("document.querySelector('[data-theme-trigger]').click()"); await ctx.wait("!document.getElementById('appearance-popover')");
  ctx.smoke.check("Theme switch preserves separate media selections", await ctx.run(`document.querySelector('${sample("A")} [data-editor-asset=no-cover]').getAttribute('aria-current')==='true'&&document.querySelector('${sample("B")} [data-editor-asset=voice]').getAttribute('aria-current')==='true'`));
  await shot(ctx, "ui-03-media-samples-dark");
  await ctx.win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 700, height: 850, deviceScaleFactor: 1, mobile: false }); await ctx.delay(200);
  await ctx.run(`document.querySelector('${sample("A")}').scrollIntoView({block:'start'})`);
  ctx.smoke.check("Narrow media samples retain internal scroll boundaries without page overflow", await ctx.run(`(()=>{const h=document.querySelector('[data-editor-samples]'),p=document.querySelector('${sample("A")} [data-editor-region=R02]');return h.scrollWidth<=h.clientWidth+1&&p.getBoundingClientRect().width>0&&p.querySelector('[data-editor-media-results]').scrollHeight>p.querySelector('[data-editor-media-results]').clientHeight})()`));
  await shot(ctx, "ui-03-media-samples-narrow");
  await ctx.run("document.querySelector('[data-editor-samples] > a').click()"); await ctx.wait("document.querySelector('[data-video-editor-ui]')"); await ctx.win.loadURL('app://app/tools/video/editor/samples/project'); await ctx.wait("document.querySelector('[data-video-editor-ui=\"UI-04\"]')");
  await ctx.sizeHost(1600, 1000); await shot(ctx, "ui-03-media-dark");
  ctx.smoke.check("Returning from media samples retains the original project clip", await ctx.run("document.querySelector('[data-editor-clip=clip-02]').getAttribute('aria-pressed')==='true'&&document.querySelectorAll('[data-editor-clip]').length===5"));
}
module.exports = { checkVideoUiMedia };
