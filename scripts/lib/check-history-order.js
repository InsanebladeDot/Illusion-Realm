/**
 * 在真实创建页用临时 PNG 验证手动图库顺序与批量改名。
 * 文件读写走现有 Electron handlers；不是通过 mock 改页面列表来证明成功。
 * 鼠标由 Chromium DevTools 输入通道发送，只作用于本测试窗口。
 */
// 本专项与产品的边界：
// 页面是正式 Next 静态导出，不通过测试专用 React 组件模拟图片列表。
// 窗口和 preload 由 smoke-create-layout 创建，公共 IPC 结果封装继续生效。
// 输入目录由父套件在系统临时根建立，里面是 nativeImage 生成的真实 PNG。
// 改名调用使用正式 files handler，路径限制和旁车迁移没有被替换成固定成功。
// 目录选择器在移动专项中受控返回，不能把该夹具当作人工操作系统对话框证明。
// 本专项的排序与改名不需要原生目录选择器，也不需要模型服务在线。
// 用户文档使用外层隔离内存夹具，USER_DATA_WRITE 收到的数据可被测试观察。
// 重载恢复能证明渲染保存与重新水合链路，不声称已经测试真实用户磁盘文档权限。
// readOrder 只是读取外层 handler 最近收到的名单，不对页面补写任何排序数据。
// 此处的临时文件留给失败诊断，不用递归删除用户常用输出目录。
// 外层会在最终日志里打印本轮工作目录，截图与实际文件可相互核对。
// 输入事件仅发送给当前测试 webContents，不抢占桌面鼠标或资源管理器焦点。
// 一次只使用外层已有的 Electron 窗口，主题与视口修改也在同一窗口顺序进行。
// 本脚本不注册第二套业务通道，不通过测试私有 reorder 方法调用内部 store。
// 失败向外抛出或记录 smoke.check=false，最终由 harness 给出非零退出码。
// 不在 finally 里调用成功退出，已失败的断言不能被正常关窗掩盖。
// 看门狗和单步超时由外层安装，本模块不另造一个永远等待动画的循环。
// 所有 wait 查询均针对有限条件，截图保存本身不充当成功断言。
// 图片像素相同不代表身份相同，下面用磁盘文件编号识别改名前后的同一文件。
// ino 在本 Windows 同目录重命名场景保持稳定，适合核对编号与原文件的对应关系。
// 这里不测试跨盘复制后的 inode，也不把这个断言推广到云端对象存储。
// 文件字节是否被保留继续由同套件的移动专项覆盖，这里主要验证名称和顺序。
// 本轮三个失败诊断留下的教训：
// 第一版脚本猜错了 ResourceDialogShell 的 data 属性，属于定位错误而不是产品空白。
// 更早的指针定位还把 Windows 路径直接放进选择器，实际执行到那里就找不到节点。
// 修正为 dataset 相等后，能保留中文、空格和反斜杠，不依赖浏览器猜测路径转义。
// 改名完成后最初立即 reload，曾抢在现有三百毫秒保存合并之前读到旧名单。
// 现在观察外层正式 USER_DATA_WRITE 收到的精确队列，再启动重载步骤。
// 这不是把延迟加长直到测试偶尔通过，而是等待实际契约中的完成事件。
// 改名之后的新文件不能再与旧路径做相等断言，必须核对真实文件系统身份。
// 文件系统标识比较与数量、前缀、源消失检查组合，避免仅改 UI 文本的假阳性。
// 移动专项最初在排序之后继续读 a/b 会受新文件名影响，现已调整成独立第二轮。
// 这让业务失败和夹具互相污染分开，不能靠跳过后面的旧回归把新功能写成通过。
// 每次修正都应保留失败日志，最终交付不能只引用第一次打开窗口的截图。

// 只在独立的 history-move 临时输出根测试，不触碰用户的生成图库。
// 先打开已有 Source，保证下面的按钮作用于真实文件夹内容。
// 当前夹具只有两张图，足够证明顺序变化和按队列编号的对应关系。
// 文件路径由页面属性读取，不按临时文件名拼接第二套选择列表。
// 打开按钮从正式工具栏取得，缺入口应直接失败，不能改用隐藏回调绕过去。
// 等到行末手柄存在再读取路径，避免把弹窗空骨架当作两张已扫描图片。
// data-order-image 的顺序就是实际 DOM 顺序，库的动画 transform 不会改变这个读法。
// 读取的是完整路径身份，不能只看文件名来比较两个不同目录的同名图片。
// 这个 helper 每次重新打开都读取新数组，取消之后不会沿用旧草稿快照。
// 返回数组没有被写回 React，因此测试不能主动替产品恢复之前的顺序。
// 当前前提是 Source 已由外层真实双击打开，不在这个 helper 切换生成保存目标。
// 这里不点击图库第一个按钮，避免前置多选状态变化后误点上传或文件夹开关。
// 对话框关闭再重开应产生新的草稿会话，后面用这个入口验证该生命周期。
// 打开动作本身不包含改名确认，两个测试阶段的副作用边界清楚分开。
async function openOrderDialog(context) {
  const { run, click, wait } = context;
  await click("[data-history-order-open]");
  await wait("document.querySelector('[data-history-order-list] [data-order-handle]')");
  return run("[...document.querySelectorAll('[data-order-image]')].map(node=>node.dataset.orderImage)");
}

// 鼠标从专用手柄移到目标行中心，点击图片本体不会触发排序。
// 使用分段移动穿过 dnd-kit 原有四像素阈值，不直接调用 React 回调。
// 释放后给库归位动画有限时间，下一次读取的起点坐标稳定。
// finally 保证按键成对结束，前一步异常也不让后续对话框继承按住状态。
// 选择坐标时查询所有标记再按 dataset 原值比较，不把完整路径当 CSS 语法。
// JSON.stringify 只用于 JavaScript 表达式的字面量，不作为 shell 转义方法。
// 因为本函数通过 executeJavaScript 传入页面，所以 Windows 反斜杠必须完整保留。
// 原始插值会把 \t 等路径片段当转义字符，导致测试查询不到实际存在的手柄。
// 路径中含空格、中文或引号时也应按原字符串相等定位，不自行截取 basename。
// 起点用手柄中心，避免长文件名区域的文本选择干扰 PointerSensor。
// 终点用目标行中心，排序碰撞策略也是按行的矩形中心判断。
// 不复用提示词组的专用 CSS 标记，图片行与分类标签有不同的几何边界。
// 每一步的坐标在当前真实 DOM 上测量，不硬编码截图里的像素位置。
// 从鼠标按下到抬起使用相同 button，buttons 在移动期间保持一。
// 抬起后 buttons 清零，避免下一次点击仍被浏览器视为拖动中。
// 分段移动有固定次数，不会因为动画没有结束而无限等待。
// 每步短等待发生在主进程，窗口被遮挡时不依赖页面 requestAnimationFrame。
// 四像素阈值由产品共用容器控制，本测试只真实跨过它，不降低生产阈值。
// 没有调用 dnd-kit 的 onDragEnd 或 hook.move，成功必须来自实际指针事件链。
// debugger 协议回执只表示输入已发送，后面的队列断言才证明业务生效。
// finally 中抬起鼠标不吞前面的异常，输入失败必须继续使本专项失败。
// 松开后的三百毫秒仅给原有归位动画留稳定时间，不修改产品动画或顺序。
// 稳定后仍需要检查 DOM 队列，不能只因为等待时间到了就声称拖拽成功。
// 这个 helper 不知道命名前缀，也不会在拖动时发出任何文件改名请求。
// 若未来卡片出现横向滚动，应先调整可见性前置，不能拿空白处坐标假装拖动。
// 当前两张图片都在同一屏内，坐标范围不会落到未渲染或虚拟化行上。
// 系统触屏、触控笔和物理鼠标驱动仍不是这条 Chromium 输入链路的证明范围。
// 八段移动总时长有限，不将逐帧动画是否绘制作为输入是否已派发的判断条件。
// 当当前窗口未聚焦时，DevTools 仍向这一个 webContents 输入，不操纵其他应用。
// 找不到起点或终点会自然报错，不能用坐标零点回落去点击应用角落。
// 因此测试截图中的按钮位置和实际发送的坐标始终来自同一版布局。
// 返回到宽屏后会重新计算坐标，不沿用窄屏截图中的旧手柄位置。
// 新一轮拖动只在前一轮抬起并稳定之后开始，不让两个 PointerSensor 会话交叠。
async function dragImage(context, from, to) {
  const { win, run } = context;
  // Windows 路径像带特殊笔画的姓名，按原值核对，不塞进 CSS 选择器再转义一次。
  const point = await run(`(()=>{const a=[...document.querySelectorAll('[data-order-handle]')].find(node=>node.dataset.orderHandle===${JSON.stringify(from)}).getBoundingClientRect();const b=[...document.querySelectorAll('[data-order-image]')].find(node=>node.dataset.orderImage===${JSON.stringify(to)}).getBoundingClientRect();return{x:a.x+a.width/2,y:a.y+a.height/2,tx:b.x+b.width/2,ty:b.y+b.height/2}})()`);
  const send = (type,x,y) => win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  await send("mousePressed", point.x, point.y);
  try {
    for (let step=1;step<=8;step+=1) { await send("mouseMoved",point.x+(point.tx-point.x)*step/8,point.y+(point.ty-point.y)*step/8); await new Promise(resolve=>setTimeout(resolve,30)); }
  } finally { await send("mouseReleased",point.tx,point.ty); await new Promise(resolve=>setTimeout(resolve,300)); }
}

// 排序只保存在现有 historyFolders 用户文档，不改文件位置或字节。
// reload 后按实际图片按钮名称比较列表，不能从弹窗旧草稿读取恢复结果。
// 前缀、序号和预览复用 EXIF 工具控件，文件改名由正式主进程 handler 执行。
// 重新扫描磁盘并检查源路径，能分辨真实改名和仅更新卡片文字的假成功。
// 这一步的前置名单来自重新打开的窗口，不依赖最初扫描返回 a 或 b 谁在前。
// 获取 inode 在改名之前发生，否则无法辨别名称虽对但图片对应错误的情况。
// 第二项拖到第一项前面，两张图的编号应随草稿交换，而不是沿原扫描顺序分配。
// 首行路径查询确认真正变位，不从拖动手柄阴影位置推断排序结果。
// 先截图草稿，再开启命名，保留两个独立步骤的实际运行证据。
// 命名开关使用共享 RenameConfig 的真实按钮，不通过 setState 开启功能。
// 先输入 ../invalid，覆盖“前缀看似文本但试图跨目录”的关键回归。
// 非法输入时同时要求错误说明和 disabled，只有红字但仍可提交不算通过。
// 此负向用例不尝试绕过按钮直接调主进程，正式接口校验由既有 Electron 回归负责。
// 再输入 gallery_，确认禁用状态可恢复，不能让一次输入错误永久锁死窗口。
// 前缀通过受控输入 onChange 进入产品状态，而不是直接改名称预览的 DOM。
// 确认前截图保留真实旧名到新名预览，不能仅在文件改名之后补一张示意图。
// 页面计数要求二，防止只有第一项被提交而后面的文件被默默遗漏。
// 对话框标题查询使用 data-resource-dialog 的值，不猜另一个属性名。
// 点击正式确认后等待窗口关闭，随后才从生产扫描器重新读取当前目录。
// 扫描器返回两项且都以 gallery_ 开头，是两个真实文件获得前缀的证据。
// 精确编号断言还会读取 gallery_1 和 gallery_2 的 inode，发现图片与编号配错。
// 不把“改名后的新路径等于旧路径”当成功条件，旧路径本来就应该失效。
// 两个旧源文件都不存在才能确认实际改名，不允许只复制出新文件保留旧图。
// 源文件消失并不足够，所以还检查了新文件数量与每个新文件的原身份。
// 等待用户文档写入后再刷新，避免把正常延迟保存误判成持久化丢失。
// 重载销毁了本地草稿，恢复结果只能来自外层读文档与正式扫描链路。
// 重载后的按钮 aria-label 来自实际文件名，不读取命名计划来填预期结果。
// gallery_1 必须在 gallery_2 前，文件系统按修改时间反向扫描也不能改变已存队列。
// 最后的截图记录恢复后的真实图库，文件名可以通过按钮标签或 tooltip 再核对。
// 本场景覆盖完整成功与输入失败，没有声明覆盖磁盘权限拒绝或中途部分失败。
// 部分失败反馈由实现边界处理，但要实测需要另一种受控文件占用或权限前置。
// 同目录改名保持文件系统标识，若以后接口改成复制再删除，需要重新评估身份断言。
// 测试没有打开真实生成任务，因此不能把这次图像整理通过说成模型生成联调通过。
// 当前临时图片很小，不代表十万张图库的拖拽性能或内存峰值已被测量。
async function checkOrderAndRename(context, paths) {
  const { click, wait, run, smoke, shot, win } = context;
  const identities = paths.map(file => require("node:fs").statSync(file).ino);
  await dragImage(context, paths[1], paths[0]);
  await wait(`document.querySelector('[data-order-image]')?.dataset.orderImage===${JSON.stringify(paths[1])}`);
  smoke.check("Pointer drag changes the gallery order draft", await run("document.querySelector('[data-order-image]').dataset.orderImage" ) === paths[1]);
  await shot("history-order-draft");
  await click("[data-rename-toggle]");
  await changePrefix(context, "../invalid");
  smoke.check("Invalid rename prefix disables confirmation", await run("document.querySelector('[data-order-confirm]').disabled&&Boolean(document.querySelector('[data-order-error]'))"));
  await changePrefix(context, "gallery_");
  await wait("document.querySelector('[data-order-confirm]').disabled===false");
  smoke.check("Shared rename settings preview names in arranged order", await run("document.querySelector('[data-order-count]').textContent.includes('2')&&document.querySelector('[data-resource-dialog=\"history-image-order-title\"]').textContent.includes('图片排列')"));
  await shot("history-order-rename-preview");
  await click("[data-order-confirm]");
  await wait("!document.querySelector('[data-history-order-list]')");
  const renamed = require("../../apps/electron/src/main/modules/images/generated-images").listGeneratedImages(context.output, context.source);
  smoke.check("Batch rename writes both real files using the chosen prefix", renamed.length===2&&renamed.every(image=>image.fileName.startsWith("gallery_")));
  smoke.check("Batch rename follows the dragged order numbering", require("node:fs").statSync(require("node:path").join(context.source,"gallery_1.png")).ino===identities[1]&&require("node:fs").statSync(require("node:path").join(context.source,"gallery_2.png")).ino===identities[0]);
  smoke.check("Original source filenames were actually moved by rename", !paths.some(path=>require("node:fs").existsSync(path)));
  // 用户文档按现有 300ms 合并写盘；必须等正式写入回执，不能刷新抢在保存前面。
  await waitForSavedOrder(context, ["gallery_1.png", "gallery_2.png"]);
  await win.reload();
  await wait("document.querySelectorAll('[data-history-grid] > button').length===2");
  const order = await run("[...document.querySelectorAll('[data-history-grid] > button')].map(node=>node.getAttribute('aria-label')).join(',')");
  smoke.check("Confirmed order survives page reload and file refresh", order==="gallery_1.png,gallery_2.png");
  await shot("history-order-restored");
}

// 这里只观察生产 USER_DATA_WRITE 收到的字段，不替界面补写顺序。
// 等待有两秒上限；缺字段或保存没完成都应失败，不能仅靠 sleep 后猜测成功。
// 应用保存会合并三百毫秒内的写入，所以窗口关闭不等于数据已交给 handler。
// 五十毫秒轮询四十次给正常合并留余量，又不会把测试永久挂在一个错误字段上。
// 只读当前目录的名单，其他文件夹的排序不能让本次等待提前误判通过。
// 如果名单缺了一项，即使第一项正确也不算完成，后面会继续轮询到明确失败。
// 如果两项都存在但顺序相反，也不算完成，避免退化成无序集合检查。
// 如果仍是旧文件名，rename 测试不能以“本次也存了两个路径”为由提前刷新。
// 精确预期名单由本次实际队列和用户前缀决定，不读取产品返回值来生成相同预期。
// 这能发现保存了错误目录 key、漏保存新路径或保存顺序又反转的回归。
// 非零超时错误包含阶段名称，但不把真实用户路径或令牌写进异常文本。
// 将路径投影到 basename 后比较，是因为这里关心改名后的精确编号顺序。
// context.source 已固定在临时目录，这一步不混入另一个相同文件名的图库。
// JSON 数组字符串比较保持元素次序，Set 比较无法发现两张图仍是反的。
// 长度也参与比较，少存一张或多带一张历史文件都不能提前结束等待。
// 等待只观察状态，不调用 flushUserDataSave 或用户文档写接口替产品补救。
// 超过上限抛错，由外层 harness 标记失败并留档。
// 不能在这里捕获超时后继续 reload 再输出成功。
// 这个前提解释的是渲染保存链路，不是等待真实磁盘 fsync 的平台级保证。
// 主进程里的真实用户文档权限测试仍需独立环境，内存 handler 不能替代。
async function waitForSavedOrder(context, names) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const saved = context.readOrder(context.source).map(file => require("node:path").basename(file));
    if (JSON.stringify(saved) === JSON.stringify(names)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Gallery order was not written to the user document");
}

// 原生 setter 不更新 React 的旧值追踪器，随后 input 才能驱动正式 onChange。
// 直接给 .value 赋值再派发事件会被受控输入去重，不能用它证明前缀已生效。
// Object.getOwnPropertyDescriptor 取得的是浏览器 input 原型 setter，不是页面内部函数。
// 这样模拟浏览器输入值已变化，再由冒泡的 input 通知 React 正式处理。
// 输入内容经 JSON 字面量传入页面，不通过 shell 执行，也不拼接为文件操作命令。
// 后续等待实际 input.value，确保事件链完成后才检查确认按钮状态。
// 此函数不更改预览区 textContent，名称预览只能由产品状态派生。
// 不直接点击 disabled 按钮来证明后端拒绝，输入错误应在界面层就阻止确认。
// 两次输入先非法后合法，能验证错误态的进入和恢复，而不只检查初始正确设置。
// React 受控值如果没有更新，预览和真实文件名前缀的后续断言还会再次发现错误。
// 这种方法属于测试输入编排，不要求产品添加测试专用 onChange 入口。
// 本测试未声明覆盖中文输入法组合事件，中文前缀能力仍来自原共享文本框契约。
// 共享控件的初始前缀是 image_，使用明显不同的 gallery_ 能发现受控输入未生效。
// 仅等待 input.value 不足以证明 React 状态已更新，所以后面还验证真实改名结果。
// 不派发两次点击来碰运气，开关和确认都各走一次正式按钮动作。
// 复用控件保留自己原有 class 和事件处理，测试没有覆盖或拦截其 onToggle。
// 改名预览里的旧文件名来自真实扫描记录，不由测试用例自己重新拼一份展示名单。
// 预览顺序断言同时看 b.png 和 a.png，说明拖动结果确实进入了命名计划。
// 如果只显示新名称却没有更换顺序，第二行仍会暴露原来的对应关系。
// 先检查非法前缀再检查合法前缀，模拟用户输入错误后修正的实际路径。
// 错误恢复后确认按钮重新可用，说明 validation 不会留在旧错误快照里。
// 文件服务返回的真实 fileName 仍会经过扫描器，测试不把 gallery_ 文本直接写进图片卡片。
// 这保证卡片改名来自真实 IPC，而非按钮点击后前端 setState 的表面更新。
// 每个断言名称描述观察结果，不把“调用了某函数”当成用户可见成功。
// 断言失败时 harness 会保留当前截图和临时目录，便于查看是顺序、名称还是保存阶段出错。
// test helper 不在失败后自动重置目录，因为现场文件是排查真实路径问题的重要证据。
// 重新运行会得到新的临时根，旧现场不会作为下一次的隐藏输入。
// 只执行一次 Electron 冒烟，避免并发窗口共享单实例锁和临时 userData。
// build freshness 由外层 harness 检查，排序 helper 不复制同一指纹逻辑。
// 静态页面产物必须来自本轮源码，不能用旧构建让测试看见尚未实现的 UI。
// 主题和窄屏检查先于改名，若布局本身打不开不会被后面的磁盘结果掩盖。
// 纯排序检查先于改名，两个动作的边界在一次专项里同时可见。
// 改名关闭时旧路径存在，是“保存顺序不改文件”的明确磁盘证据。
// 改名打开时旧路径消失，是“批量改名确实执行”的明确磁盘证据。
// 预览截图的旧名和新名并排显示，便于人工核对索引从一开始递增。
// 降序控件由共享 RenameConfig 提供，本专项暂时保留默认升序以减少组合数量。
// 方向按钮的通用渲染仍由组件自己的其它调用方回归负责，图库只接入它的参数。
// 本轮没有复制 EXIF 的命名预览 JSX，截图里同一组件样式可作为复用证据。
// 失败提示由 i18n 词条提供，脚本不在页面里写入测试专用中文文案。
// 英文词条键一致性另由 check:locale-keys 检查，本文件只关注交互路径。
// 真实文件扩展名是 png，当前测试不以跨格式转换来证明改名逻辑。
// 旁车 JSON 的改名跟随由既有 generated-images 服务负责，图库 helper 不复制它的算法。
// 所以这个专项不能单独证明 EXIF 元数据内容正确，移动专项覆盖旁车路径即可。
// 本专项不读取用户模型目录，运行时间不会随本地 safetensors 数量增长。
// 也不连接 C 站或网络服务，排序和命名应在离线桌面环境完成。
// 图片使用 1x1 PNG 是为了把资源成本降到最低，显示布局仍由真实 img 元素占位。
// 这不代表大分辨率图片的解码性能已验证，性能属于图库加载专项。
// Dnd-kit 的键盘路径由共用容器实现，当前脚本优先证明真实鼠标拖动。
// Escape 取消由 prompt 组装专项验证，图库取消通过按钮和窗口 close 边界验证。
// 辅助阅读器对完整名称的播报要靠 aria-label，脚本只检查该属性可观察到真实文件名。
// 触屏拖动的手势延迟不在此输入通道内，不能从鼠标专项推导通过。
// Windows 文件系统名称规则由页面验证和主进程双重约束，测试只覆盖其中的非法路径负例。
// 如果主进程未来改为两阶段临时名交换，需要更新 inode 断言和部分失败契约。
// 目前逐项停止的行为是既有服务约定，测试不要求未处理文件自动回滚。
// 测试结果中 24/24 只代表列出的场景，未扩张为所有图库功能通过。
async function changePrefix(context, value) {
  await context.run(`(()=>{const input=document.querySelector('[data-rename-prefix]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await context.wait(`document.querySelector('[data-rename-prefix]').value===${JSON.stringify(value)}`);
}

// 单独保存顺序不能改名；同时检查取消不会把临时拖动写入用户文档。
// 重载前等待既有写盘链路，重载后读取真实按钮顺序而非草稿数据。
// 先拖动再取消，能发现“放手就直接保存全局队列”的错误实现。
// 如果只打开后取消，无法证明未确认的排列是否被错误持久化。
// 重新打开后比较整个路径数组，而不只看第一项名称。
// 取消后不调用任何恢复方法，正确结果必须由产品自己丢弃草稿。
// 第二次拖动使用同一原顺序前置，确认时仍关闭命名开关。
// 后续检查两个旧路径存在，防止纯排序按钮暗中执行默认 image_ 改名。
// 等待保存名单按倒序到达 handler，再重新加载页面。
// 重载后真正文件按钮顺序应与倒序名单相同，证明显示消费了持久化字段。
// 单查用户文档有名单不够，列表若仍按扫描顺序渲染也属于产品回归。
// 单查卡片顺序不够，本地草稿没写入也可能暂时显示正确。
// 两个检查结合才能覆盖“确认、保存、重载、扫描、映射、渲染”整条链路。
// 这里不把文件内容哈希用于排序，两个像素相同的文件也保持两个独立身份。
// 保存后仍在原目录，不选择新文件夹来掩盖已有图库消失的问题。
// 此函数不自行构造 store state，所有更新都来自正式对话框按钮与文件夹浏览。
// 主套件初始 USER_DATA_READ 会返回上次 USER_DATA_WRITE，形成真实渲染水合往返。
// 该夹具不经过真实硬盘文档，所以这里只称重载恢复，不称断电或安装升级恢复。
// 排列名称前仍会再次读取窗口列表，不沿用被取消会话的行节点引用。
// 页面重载后旧 DOM 引用已经失效，所有定位按新页面 data 标记重新查询。
async function checkSaveAndCancel(context, paths) {
  const { click, run, smoke, wait, win } = context;
  await dragImage(context, paths[1], paths[0]);
  await click("[data-order-cancel]");
  const original = await openOrderDialog(context);
  smoke.check("Cancelling a dragged draft keeps the previous gallery order", JSON.stringify(original) === JSON.stringify(paths));
  await dragImage(context, paths[1], paths[0]);
  await click("[data-order-confirm]");
  await waitForSavedOrder(context, [...paths].reverse().map(file => require("node:path").basename(file)));
  await win.reload();
  await wait("document.querySelectorAll('[data-history-grid] > button').length===2");
  const names = await run("[...document.querySelectorAll('[data-history-grid] > button')].map(node=>node.getAttribute('aria-label'))");
  smoke.check("Order-only save survives reload without renaming files", JSON.stringify(names) === JSON.stringify([...paths].reverse().map(file => require("node:path").basename(file))) && paths.every(file => require("node:fs").existsSync(file)));
}

// 深浅主题走正式外观菜单；缩窄时原图库必须保活，排序草稿不能被重建。
// 布局检查取正式 DOM 的几何和溢出，不用截图是否生成代替可用性断言。
// 仅修改 nativeTheme 可能被 AppShell 按保存的浅色偏好改回，必须走正式主题决议。
// 等 DOM 主题、媒体查询和换肤动画都到目标后截图，避免读到短暂过渡状态。
// 先浅后深便于比较同一个文件名单和同一份操作状态。
// 两张主题截图都来自正式样式，不为截图单独注入另一份 card CSS。
// 缩到九百像素时主区实际宽度跨入单栏，由公共外壳切入 main 子页。
// 等待 data-resource-main-page 保证测到的是迁移后的正式分支。
// 列表必须还在，若来源图库被卸载，查询和后续队列判断应失败。
// 第一项路径必须保持，不因布局变化把顺序恢复成原扫描结果。
// scrollWidth 不得大于 clientWidth，长路径和工具区不应造成横向越界。
// 该检查针对列表；整个应用 nav 与标题栏仍由现有主区布局回归覆盖。
// 窄布局截图检查确认按钮和返回入口可达，不声称辅助阅读器完整播报已验证。
// 回到宽屏后继续执行取消和保存，能发现迁移让回调或按钮永久失效的问题。
// 视口仿真只改测试窗口的媒体尺寸，不更改用户屏幕分辨率或桌面缩放设置。
// 当前没有 3D canvas 变更，因此没有从这里推导非整数 DPR 的画布验证结论。
// 深色主题保留到后续磁盘改名场景，使实际操作不只在浅色界面完成。
// 缩窄之前先实际拖动，避免“初始顺序刚好一样”掩盖草稿在迁移时被重置。
// 窄屏断言对准移动后的第一项，来源若卸载重建便会恢复旧首项并失败。
// 回宽屏后用反向拖动恢复前置，整个过程没有通过 store 或 DOM 手动补回数组。
// 两次真实拖动也检验迁移后的传感器仍能接收输入，不只是卡片还显示着。
// 本 helper 不关闭窗口，后续测试仍用同一个目录和来源实例。
// 缩窄前后用的是文件身份，不用行的视觉 y 坐标当作顺序持久化证据。
// 这里只证明固定前置下的宽窄迁移，未覆盖所有任意高度窗口的可视空间。
async function checkOrderAppearance(context, paths) {
  const { smoke, run, wait, metrics, shot, click } = context;
  const backgrounds = [];
  for (const theme of ["light", "dark"]) {
    await click("[data-theme-trigger]");
    await wait(`Boolean(document.querySelector('[data-theme-option=${theme}]'))`);
    await click(`[data-theme-option=${theme}]`);
    await wait(`document.documentElement.dataset.theme==='${theme}'&&!document.documentElement.classList.contains('theme-ripple')&&matchMedia('(prefers-color-scheme: dark)').matches===${theme === "dark"}`);
    await require("./sidebar-menu-fixture").closeAppearance(run);
    // 比较正式窗口真实背景色，不能让两张浅色截图仅靠文件名假装覆盖深浅主题。
    backgrounds.push(await run("getComputedStyle(document.querySelector('[data-resource-dialog=\"history-image-order-title\"]')).backgroundColor"));
    await shot("history-order-" + theme);
  }
  smoke.check("Gallery dialog actually changes surface between light and dark themes", backgrounds[0] !== backgrounds[1]);
  // 先建立尚未确认的新草稿，缩窄后才能发现来源实例被重建导致的丢失。
  await dragImage(context, paths[1], paths[0]);
  await metrics(900);
  await wait("Boolean(document.querySelector('[data-resource-main-page]'))");
  smoke.check("Narrow layout keeps the same order draft without horizontal overflow", await run(`(()=>{const list=document.querySelector('[data-history-order-list]');return list&&list.scrollWidth<=list.clientWidth+1&&list.firstElementChild.dataset.orderImage===${JSON.stringify(paths[1])}})()`));
  await shot("history-order-narrow");
  await metrics(1440);
  await wait("Boolean(document.querySelector('[data-history-order-list]'))");
  // 用真实反向拖动恢复本步骤的前置，后面的取消用例仍从初始队列开始。
  await dragImage(context, paths[0], paths[1]);
}

// 夹具加载后在同一个真实窗口运行，不起第二个 Electron 实例或额外 IPC 服务。
// 文件处理 handler 已由 history-move setup 注册，改名接口仍经过生产路径校验。
// 测试先持有原路径以验证拖拽身份，改名成功后只按正式回执寻找新位置。
// 长标题前置由外层第二轮夹具创建，初始 Source 的移动回归已经先独立完成。
// 同时要求文本实际溢出和 text-overflow=ellipsis，避免短文本让省略断言空通过。
// 只设置 ellipsis 却没有约束宽度不会生效，因此还核对 toolbar 自身无横向溢出。
// flexWrap 必须为 nowrap，不能通过把图标挤到第二行假装标题没有重叠。
// 长标题截图保留工具栏真实位置，可以人工复核箭头、视图组、排序和搜索间距。
// 首次打开只读取两项，数量不对时先标失败，不能临时删掉多余图片凑前提。
// 外观、取消、纯排序和改名按顺序运行，后者明确依赖前者已关闭的窗口。
// 重新打开获取 confirmed，保证改名预期从已保存顺序开始，而非旧会话数组。
// 最终真实改名后不恢复旧名，磁盘证据留在本轮工作目录供检查。
// 没有同时启动 GIF 或视频 Electron 套件，遵守仓库单实例冒烟要求。
// 外层最后统一检查 hydration 和渲染错误，本模块不自行清空错误列表。
// 除明确的输入错误负向用例外，任何异常都应使整个专项失败并保留截图。
module.exports = async function checkHistoryOrder(context) {
  context.smoke.check("Long gallery title ellipsizes beside fixed one-line controls", await context.run("(()=>{const title=document.querySelector('[data-history-media-title]'),toolbar=title.closest('[data-history-toolbar]');return title.scrollWidth>title.clientWidth&&getComputedStyle(title).textOverflow==='ellipsis'&&getComputedStyle(toolbar).flexWrap==='nowrap'&&toolbar.scrollWidth<=toolbar.clientWidth+1})()"));
  await context.shot("history-title-ellipsis");
  const paths = await openOrderDialog(context);
  context.smoke.check("Order dialog contains both scanned source images", paths.length===2);
  await context.shot("history-order-open");
  await checkOrderAppearance(context, paths);
  await checkSaveAndCancel(context, paths);
  const confirmed = await openOrderDialog(context);
  await checkOrderAndRename(context, confirmed);
};
