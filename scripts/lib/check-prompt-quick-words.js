// 快捷词专项借用正式创建页，只通过公开输入/点击验证分词、移除和清空落盘。
// 像把一张长购物单剪成词卡，删一颗不能顺便丢掉第25颗以后的内容。
const fs = require("node:fs");
const path = require("node:path");

// 隔离窗口的软件绘制表面可能晚于DOM，轻微往返调整尺寸促使它提交当前布局。
// 像刷新投影幕而不改幻灯片内容，恢复原尺寸后才取图，不改变最终测试视口。
// width/height读取窗口本身，不硬编码本机桌面尺寸或改用户正在使用的应用。
// 一像素调整只属于测试窗口，不写入软件设置或创建草稿。
// 先放大再恢复，确保Chromium收到真实resize，而不是给它相同尺寸的空操作。
// 两次有限等待让容器观测与绘制提交，不依赖可能在后台停掉的rAF。
// 截图发生于恢复后，不能拿放大时更宽的侧栏去掩盖原尺寸溢出。
// invalidate再要求一次绘制，避免capturePage只返回最初公告关闭前的缓冲。
// 截图仍取正式窗口表面，不根据DOM另画一份看起来正确的HTML或PNG。
// 不进行图片裁切、拼接或后期去除公告；它必须由正常确认按钮关闭。
// 此助手仅提供视觉证据，标签存在性与边界仍由前面的独立断言负责。
// 保存位置由外层隔离目录指定，不改用户图库和默认下载文件夹。
// 捕获失败会向外抛，不能改用以前的截图冒充本次成功。
// 调整前后的工程数据不被写入，快捷词保存仍只由原用户文档链路负责。
// setSize属于主进程测试窗口能力，不会被加入渲染层产品组件。
// 这里不调用系统鼠标或切换前台，保持用户当前桌面操作不受干扰。
// 这不是人工显示器验收，自动运行和系统缩放限制仍须单列。
// 恢复完成后再读画面，下一阶段清空不能在截图Promise完成前启动。
// 记录的分词截图应与word_0正文、word_29尾项和超长词同时出现的阶段对应。
// 若表面仍过期，交付必须保留证据限制，不能只凭文件名宣称当前画面正确。
async function snapshot(ctx) {
  const [width, height] = ctx.win.getSize();
  ctx.win.setSize(width + 1, height);
  await ctx.delay(200);
  ctx.win.setSize(width, height);
  await ctx.delay(200);
  ctx.win.webContents.invalidate();
  await ctx.delay(300);
  fs.writeFileSync(path.join(ctx.directory, "quick-tags.png"), (await ctx.win.webContents.capturePage()).toPNG());
}

// 测试从创建页高级提示词开关进入，不直接挂载一个脱离AppShell的标签组件。
// 质量词分类是稳定id，中文显示名变化不能让本用例偷偷改选其他分类。
// 初次文档来自隔离临时目录，正文为空，单颗追加的预期才能独立写为word_0。
// 用正式“调整快捷词”入口启用输入框，不直接调用Zustand的setQuickWords。
// 输入一条含30颗词的旧式长段，模拟用户已有的大量逗号内容。
// 30超过旧数组24条上限，能够发现删一颗后后半段被误截断的真实回归。
// 词号从0到29固定生成，不从实际UI返回列表计算预期。
// 英文逗号和中文逗号同段出现，验证模型触发词与创建页采用同一分词口径。
// full-face blush中间的空格属于短语，不能拆成两颗词卡。
// 末尾故意再次写word_0，检查去重而非仅检查逗号能被识别。
// 回车通过公开输入框键盘事件保存，不把测试数组直接赋给React组件。
// 等word_29出现后才检查，防止仅前几颗完成渲染就提前断言。
// word_0的DOM数必须等于1，不能把重复项隐藏或透明当作去重成功。
// 点击word_0后正文只能是它本身，旁边的word_1不应一起追加。
// 正文通过既有readAssembly读取真实textarea，不从按钮文字反推提交结果。
// 删除按钮名称来自正常i18n，是独立兄弟按钮，不能把点击主体当作删除。
// 移除后同时断言目标消失与word_29仍在，避免测试只证明删了东西而未保护其余词。
// 旧存储只有一个长条目，删词必须留在原槽内处理，不能展平后被24条清洗器截短。
// 追加260个无空格字符用于检查最难自动折行的训练词或长标识。
// 这不是单纯缩短标题的截图，渲染文字仍保留全部260个字符。
// 标签父容器的实际left/right作为边界，不使用预设侧栏宽度替代布局。
// 每颗标签都必须位于容器水平边界内，不能只测最后一颗就漏掉旧长段。
// scrollHeight不超过clientHeight说明多行内容真正撑高按钮，而非被固定行高盖住。
// 边界容忍1px用于亚像素舍入，不允许整个删除按钮宽度的溢出被放过。
// 本断言读取计算后的DOM几何，不能用class里存在break-all就声称长词可读。
// invalidate请求当前窗口重绘，随后有限等待让capturePage取得本次布局。
// 截图写入本轮隔离目录，不覆盖用户图片或拿历史参考图当运行证据。
// screenshot包含真实正式创建页和新标签，仍属于自动操作后的UI证据。
// 本用例没有人工点击或系统键盘路径，不能记为人工可访问性验收通过。
// 没有外网模型图片前提，标签行为不应依赖网络是否可达。
// 本组没有发起生成或付费请求，只改隔离用户文档中的创建草稿。
// 长输入使用原生value setter触发React input，未注入自定义合成分词结果。
// 分词和存储回写仍运行产品实现，测试不会复制产品正则来产生期望DOM。
// 场景中默认快捷词仍存在，新增分词不能把用户原有预设无故覆盖。
// 模型详情复制是另一个调用方，需单独模型来源回归，不能由本点击追加外推。
async function checkTags(ctx) {
  // 初次进入会显示更新公告，先通过它自己的确认按钮关闭，截图才是可操作工作区。
  // 不能在遮罩仍在时仅靠DOM.click穿透后宣称真实界面没有遮挡。
  // 公告不存在时允许跳过确认，已有文档不会每次都弹这层引导。
  await ctx.run("[...document.querySelectorAll('[aria-labelledby=update-announcement-title] button')].find(e=>e.textContent.trim()==='知道了')?.click()");
  await ctx.click('[data-advanced-prompt-toggle]');
  await ctx.waitFor("document.querySelector('[data-prompt-assembly]')");
  await ctx.selectTab("quality");
  await ctx.click('[data-prompt-quick-edit]');
  const words = Array.from({ length: 30 }, (_, index) => `word_${index}`);
  await ctx.setInput('[data-prompt-quick-word-input]', words.join(",") + ",full-face blush，word_0");
  await ctx.run("document.querySelector('[data-prompt-quick-word-input]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await ctx.waitFor("document.querySelector('[data-prompt-quick-word=word_29]')");
  ctx.check("Comma variants split into independent deduplicated tags", await ctx.run("document.querySelectorAll('[data-prompt-quick-word=word_0]').length===1&&!!document.querySelector('[data-prompt-quick-word=\"full-face blush\"]')"));
  await ctx.click('[data-prompt-quick-word=word_0]');
  ctx.check("One tag appends only its own text", (await ctx.readAssembly()).activeInput === "word_0");
  await ctx.click('button[aria-label="移除快捷词 word_0"]');
  ctx.check("Removing a tag preserves later words beyond 24", await ctx.run("!document.querySelector('[data-prompt-quick-word=word_0]')&&!!document.querySelector('[data-prompt-quick-word=word_29]')"));
  await ctx.setInput('[data-prompt-quick-word-input]', "x".repeat(260));
  await ctx.run("document.querySelector('[data-prompt-quick-word-input]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  // 必须先见到260字符那一颗，不能在它尚未渲染时让短词几何检查提前通过。
  // 后续every也明确要求目标存在，空查询或旧帧不能形成真空通过。
  await ctx.waitFor("[...document.querySelectorAll('[data-prompt-quick-word]')].some(e=>e.dataset.promptQuickWord.length===260)");
  ctx.check("Long unbroken tag stays inside its panel without overlap", await ctx.run("(()=>{const panel=document.querySelector('[data-prompt-quick-words]'),tags=[...panel.querySelectorAll('[data-prompt-quick-word]')],r=panel.getBoundingClientRect();return tags.some(e=>e.dataset.promptQuickWord.length===260)&&tags.every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1&&e.scrollHeight<=e.clientHeight+1})})()"));
  await snapshot(ctx);
}

// 清空只针对当前质量词快捷列表，正文word_0应逐字保留。
// 不能通过重载页面清空正文后再宣称清空快捷词不影响输入。
// 清空后真实标签DOM数为0，不能只禁用按钮或用透明遮罩掩盖旧词。
// 切到character检查它仍有默认快捷词，保护不同分类状态隔离。
// 再切回quality后再读落盘，确认保存的是清空对象而非当前活跃分类的偶然状态。
// 文件读取来自外层临时userDataFile，不访问用户正式illusion-realm.json。
// 读取的是createForm.promptTabs，验证沿用单文档契约，没有另建快捷词存储文件。
// quickWords必须显式是数组且长度为0，字段缺失不能算清空已保存。
// 单纯内存空列表不能证明重启有效，因此必须等真实JSON提交完成。
// 轮询最多40次，每次100ms，覆盖原300ms节流并保证失败能有界结束。
// 轮询使用主进程delay，不依赖页面rAF，窗口遮挡不应让保存验证永久挂起。
// saved只有读到正确文件内容才变true，不根据UI标签数量提前设置。
// 保存未完成时最终断言失败，不把超时当作可以跳过的环境成功。
// 页面重载通过正式app协议，组件与store都会重新执行原有恢复路径。
// 从源码私有store读取缓存会漏掉本次空数组被默认值覆盖的问题，所以这里不用它。
// 恢复后仍选择quality，防止默认活跃分类变成另一个恰好空的自定义分类。
// 重载后的标签数量与正文值共同检查，避免空快捷词以清空整个表单为代价。
// 默认值恢复只应作用于旧文档缺字段，用户明确[]必须保留。
// 当前测试直接覆盖显式[]的持久化路径，旧文档缺字段兼容另由代码审查确认。
// 按钮失焦、分类切换和路由重载都不应把预设重新写进已清空的数组。
// 本例不删除用户模板，只改创建草稿；模板列表的删除不是本功能的副作用。
// 读取失败向外抛，外层harness报告非零退出，不用空对象把保存失败当作空数组。
// 本函数没有固定等待几秒后假定写盘成功，而是每次重新解析真实文件。
// 输入word_0还在，证明清空快捷来源不会逆向删除已经追加的提示词文本。
// 确认前后都没有接入生成队列，本测试不构成实际模型生成验收。
// 不用localStorage手写一份状态，仍经项目用户文档桥接和版本合并机制。
// 页面重载是自动操作，并非关闭重新安装软件；不外推安装迁移场景。
// 测试结束保留截图目录，外层只销毁自己的窗口，不关闭用户客户端。
// 反证重点是恢复时区分“用户清空”和“字段不存在”，不能只在点击瞬间测零。
// 因为用户文档存在节流，立即重载可能读到上一次数组；有界落盘等待属于必要前提。
// 清空后的正文仍可参与组装，不能把它从最终提示词里一起抹掉。
// 本文的清空范围是当前分类，不是所有分类，因此character检查是业务边界反证。
// 断言其他分类仍有词，不能仅依赖按钮未被点击来推断状态独立。
// 重新选择quality不重新添加预设，若恢复默认词将使最后DOM计数明确失败。
// 质量词id来源固定类别配置，本例不使用翻译后的显示名称定位持久化对象。
// 保存字段有时尚未初始化，optional chaining只处理等待阶段，不把缺失字段视为通过。
// saved为false时最终仍记录FAIL，测试不会因稍后截图正常而丢掉这个失败。
// 当前轮询最多约4秒，不使用无限while等待一个永远不会写出的空列表。
// loadURL会销毁旧页面，不能借旧DOM中的零标签掩盖新页面重新补回默认值。
// readAssembly在load之后重新执行查询，不持有旧textarea节点引用。
// 恢复后同一word_0正文可检验保存的不只是quickWords，而是完整创建草稿仍在。
// 没有修改测试夹具的预设默认词，因此恢复成非空时能明确区分产品行为错误。
// 复用模型分词器是实现选择，测试仍以人工定义的预期word_0和word_29检查。
// 不从实际输出中寻找任何一个剩余标签当作成功，必须是预定尾项仍存在。
// 没有验证跨账号文档迁移，当前独立临时用户只覆盖单账户重载。
// 剪贴板操作在模型详情另测，本例没有把追加提示词称为复制成功。
// 页面语言在此分支保持初始化中文，双语键一致性由公共文案门禁另行核对。
// 这组固定英文训练词不会被翻译，用户看到与追加的值必须相同。
async function checkClear(ctx) {
  await ctx.click('[data-prompt-quick-clear]');
  ctx.check("Clearing shortcuts preserves typed prompt", (await ctx.readAssembly()).activeInput === "word_0" && await ctx.run("document.querySelectorAll('[data-prompt-quick-word]').length===0"));
  await ctx.selectTab("character");
  ctx.check("Other category retains its own shortcuts", await ctx.run("document.querySelectorAll('[data-prompt-quick-word]').length>0"));
  await ctx.selectTab("quality");
  let saved = false;
  for (let attempt = 0; attempt < 40 && !saved; attempt += 1) {
    const tab = JSON.parse(fs.readFileSync(ctx.userDataFile, "utf8")).createForm?.promptTabs?.find(item => item.id === "quality");
    saved = Array.isArray(tab?.quickWords) && tab.quickWords.length === 0;
    if (!saved) await ctx.delay(100);
  }
  ctx.check("Empty shortcut list is actually persisted", saved);
  await ctx.win.loadURL("app://app/create");
  await ctx.waitFor("document.querySelector('[data-prompt-assembly]')");
  await ctx.selectTab("quality");
  ctx.check("Reload keeps cleared shortcuts empty and retains prompt", await ctx.run("document.querySelectorAll('[data-prompt-quick-word]').length===0") && (await ctx.readAssembly()).activeInput === "word_0");
}

// 两个阶段串行，共用同一质量词草稿，清空回归建立在刚才真实追加的正文之上。
// 任一步抛错都交给外层smoke.finish，后续页面加载不能覆盖已有失败退出码。
// 先留长词截图再清空，最终空列表不会抹掉修复长内容排版的视觉证据。
// 这个helper没有单独创建BrowserWindow，遵守一次一个Electron冒烟约束。
// 系统主题、窗口创建、静态产物新鲜度与看门狗仍由原启动脚本负责。
// 本专项不代替原全量提示词排序和模板回归，交付应明确它的执行范围。
// 不接受用户路径作为脚本源码，ctx只注入已有测试工具与隔离目录。
module.exports = async ctx => {
  await checkTags(ctx);
  await checkClear(ctx);
};
