/**
 * 创建图库移动专项：复用正式静态页、preload、文件 handler 与磁盘移动实现。
 * 仅系统文件夹选择被替换成受控返回值，不访问用户正在操作的资源管理器。
 * 类比给搬家工人一张固定地址纸条，真正搬箱子、避让重名和交接记录仍由正式流程完成。
 * PNG 是真实可解码字节，成功证据检查磁盘，不能只看页面提示“已完成”。
 * 每次运行只在当前冒烟临时根的 history-move 子目录创建文件。
 * 不读取或清理用户真实输出目录，不需要真实模型、账号或 ComfyUI 服务。
 * 本模块只由移动专项开关加载，不改变原布局与生成回归的固定图片列表。
 * 场景切换沿用现有创建页分栏规则，不复制一个测试专用图库。
 */
const fs = require("node:fs");
const path = require("node:path");
const { nativeImage, nativeTheme } = require("electron");
const { registerHandle } = require("../../apps/electron/src/main/ipc/result");
const { IPC_CHANNELS: C } = require("../../apps/electron/src/common/ipc-channels");
const files = require("../../apps/electron/src/main/modules/images/generated-images");

/**
 * 初始化真实输出目录与生产接口，保留外层套件的账号、设置和窗口能力。
 * Source 的两张图用于批量选择，Destination/deep 是可选择的已有嵌套目标。
 * 目标预放一张同名 a.png，之后必须原样保留，不能被移动覆盖。
 * a.png 的旧 JSON 来源写入独立标记，用来确认重名改名后旁车仍跟对图片。
 * 不向生产函数提供特殊测试开关，文件扩展名与实际内容都按普通用户文件处理。
 * 图片字节很小，验证文件管理语义，不做大图库吞吐量或磁盘空间测试。
 * 旧布局夹具只改变列表返回，没有真实文件，因此在这里明确注册生产文件 handler。
 * 注册会替换旧文件读取 handler，渲染图片也从本轮真实 PNG 读取。
 * 不替换目录授权或移动方法，越界和不存在目录仍经过正式错误封装。
 * 目录选择器回调只返回 context.target，取消返回 null，与 preload 正式契约相同。
 * 外层 setOutput 只改隔离用户文档，不在渲染器里注入私有 Zustand 状态。
 * 本次初始化在页面重新加载前完成，启动扫描看到的是一致的真实输出根。
 */
// 输出根来自当前套件创建的临时目录，绝不能把用户输出设置作为夹具写入目标。
// Source 和 Destination 是兄弟目录，覆盖只允许向子孙目录移动的错误限制。
// 目的地再嵌套 deep，证明界面允许选择多级结构中的已存在文件夹。
// 两张源文件采用不同文件名，才能同时验证重名改名与普通路径两种结果。
// PNG 内容相同但路径不同，这次整理按文件身份处理，不按像素相同合并图片。
// 两张文件都被主扫描器发现，不能用手写列表掩盖扫描和移动路径不一致。
// 目标冲突文件故意使用不同字节，覆盖覆盖写入后长度相同仍可能误判的问题。
// 旧 JSON 放在生产 legacySidecarPathForImage 返回位置，旁车命名不由测试猜测。
// 只有 a 带 JSON，b 没有旁车，正式实现不应要求所有 PNG 都附带旧资料。
// 注册文件 handler 后再重新加载页面，避免组件已缓存旧夹具列表。
// 系统目录回执使用 registerHandle，返回 null 和字符串均经过真实结果封装。
// 这不是跨盘性能测试，临时目录内重命名的通过不能证明所有文件系统行为。
function prepare(context) {
  context.output = path.join(context.root, "history-move");
  // 默认短名称继续服务旧移动用例，第二轮排序夹具可显式注入长名称。
  // 只改变目录显示长度，文件仍在相同的受控输出根内，路径授权前提没有放宽。
  // 名称由本脚本写死，不接收用户输入，也不拼成 shell 文件操作命令。
  // 这样可以验证真实 folder.name 撑开标题的情况，而不是临时篡改 DOM 文本。
  context.source = path.join(context.output, context.sourceName ?? "Source");
  context.destination = path.join(context.output, "Destination", "deep");
  fs.mkdirSync(context.source, { recursive: true });
  fs.mkdirSync(context.destination, { recursive: true });
  context.png = nativeImage.createFromBitmap(Buffer.from([42, 100, 200, 255]), { width: 1, height: 1 }).toPNG();
  for (const name of ["a.png", "b.png"]) fs.writeFileSync(path.join(context.source, name), context.png);
  fs.writeFileSync(path.join(context.destination, "a.png"), "existing destination");
  fs.writeFileSync(files.legacySidecarPathForImage(path.join(context.source, "a.png")), '{"fixture":"source-a"}');
  require("../../apps/electron/src/main/modules/images/files.handlers").registerFileHandlers();
  registerHandle(C.DIALOG_SELECT_FOLDER, () => context.target);
  context.setOutput(context.output);
}

/**
 * 从真实按钮进入批量模式，最初无选择时移动必须禁用。
 * 全选只针对当前 Source 目录，不能把目标目录已有同名文件也选中。
 * 选择数量通过真实 aria-pressed 核对，不从组件的内部 Set 推断。
 * 原生目录选择器未显示在桌面上，返回值经正式 preload 请求/响应传递。
 * 函数由宽栏和窄窗口素材页分别调用，检验同一个公共图库组件的两种挂载位置。
 * 两处选择状态独立：新页面必须重新进入批量模式和全选，不能继承旧实例草稿。
 * 未选移动禁用同时避免把零个文件当成一次成功整理。
 * 页面已加载两张真实源图片才调用此函数，不用骨架或假占位做选择。
 * 输入路径来自列表扫描，测试不会按文件名重新拼选中参数。
 * 调用回调只通知用户意图，实际文件变更仍由正式移动方法决定。
 */
// 多选开关通过正式工具栏定位，不直接更改图片按钮的选中 class。
// 未选择时禁用是防呆前置，不能仅依赖点击后主进程返回零个结果。
// 进入模式后全选应恰好匹配两张源图，目标已有 a 不能混入当前浏览目录。
// aria-pressed 表达真实选中状态，缩略图上装饰性的红色圈不能单独作为依据。
// 测试故意不按图片出现顺序逐个勾选，避免列表排序变化影响批量操作范围。
// 宽窄两种调用共享本函数，能发现只在某个布局里出现移动入口的接线遗漏。
// 如果模式按钮不存在，选择器应直接失败，而不是跳过用例写通过。
// 选中图片总数不是目的文件总数，成功后另外使用磁盘清单计算实际完成结果。
// 只有这一步准备选择，后面的错误用例不得重新全选来掩盖选择丢失。
// 原生对话框模拟只控制去哪里，移动参数仍从真实图片列表的选中 Set 获取。
async function selectSource(context) {
  const { click, run, smoke } = context;
  await click('[data-history-toolbar] button[aria-label="批量选择"]');
  smoke.check("Move is disabled with no selected images", await run("document.querySelector('[data-history-move]').disabled"));
  await run("[...document.querySelectorAll('[data-history-sidebar] button')].find(b=>b.textContent.trim()==='全选').click()");
  smoke.check("Move selection contains both source images", await run("document.querySelectorAll('[data-history-grid] > button[aria-pressed=true]').length===2"));
}

/**
 * 宽屏先验证取消，确保打开目标选择器本身不会修改文件。
 * null 是用户取消，不是成功选择一个空路径，界面不能清空勾选。
 * 返回后等待移动按钮恢复，不能在仍在等待原生对话框时读中间状态。
 * 原图存在性检查来自磁盘，避免仅因页面缓存还显示缩略图而误判文件未丢。
 * 截图保留新增移动按钮和现有删除、全选、取消的真实排布。
 * 取消后仍是同一批选择，下一步可以重新打开目标选择器而无需再勾图。
 * 本场景不检查原生窗口布局，系统对话框只有结果边界被模拟。
 * 不以取消 Toast 作为断言，因为产品取消按原约定保持安静。
 * 刷新计数可变化，但不应改生成目标或当前浏览目录。
 * 下一场景进入窄布局前主动退出当前选择，避免两个实例同时显示工具栏。
 */
// 取消前已准备两张源图和一张冲突目标，取消不得消耗其中任何一项。
// 目录返回 null 与返回输出根含义不同，不能把空返回自动补成默认目的地。
// 等待移动按钮重新可用，确认流程结束后才读取当前选中数量。
// 取消保留选择方便用户重选目的地，这也是区别于成功退出多选的重要交互。
// 磁盘检查读取 Source/a 的真实存在性，不用页面仍缓存图片当文件存在证据。
// 截图在取消前取得，确保新增工具栏入口本身可见，不能只有成功后的空态图。
// 退出选择是下一场景的准备动作，与取消目录对话框是不同的产品意图。
// 该退出步骤发生在取消断言后，避免把测试自己的清理当作取消行为。
// 本场景不需要出现成功 Toast，用户没确认目的地就不应收到完成反馈。
// 宽屏操作在原 side 实例中完成，没有创建一个绕过 AppShell 的测试画廊。
async function checkCancellation(context) {
  const { click, run, wait, smoke, shot } = context;
  await selectSource(context);
  await shot("history-move-light");
  context.target = null;
  await click("[data-history-move]");
  await wait("!document.querySelector('[data-history-move]').disabled");
  smoke.check("Cancelling a destination preserves files and selected images", fs.existsSync(path.join(context.source, "a.png")) && await run("document.querySelectorAll('[data-history-grid] > button[aria-pressed=true]').length===2"));
  await click('[data-history-toolbar] button[aria-label="退出选择"]');
}

/**
 * 越界目标位于输出根的父目录，用来证明系统可选择不等于产品允许移动。
 * UI 应给出明确边界提示，并保留原图与勾选，而不是把目标当成新输出根。
 * 不存在目录仍在根内，必须交给真实主进程报失败，不能假建一个目录当成功。
 * 两条错误分别覆盖渲染层提前校验和磁盘层业务失败，不能互相替代。
 * 按钮恢复后才继续下一条，检验 finally 释放移动锁，不靠重新加载页面解锁。
 * 使用同一批选择重复尝试，错误不应让用户每次从头勾选图片。
 * 错误时扫描刷新仍可发生，真实源路径必须继续存在。
 * 目标错误不应更改下一次生成的输出位置，普通用户设置不参与此失败恢复。
 * 服务端错误是 IpcResult 失败，不能作为成功返回的空数组吞掉。
 * 不访问盘外目录，只检查已选源仍在输出根下，越界返回在实际搬运前被拒绝。
 */
// 第一个错误选择临时根，位于真实输出根之外，验证提前边界反馈。
// 第二个错误选择根内 missing，保留边界合法但实际不存在这一独立失败原因。
// 两个目标均不需要创建，失败后源图片保持原位就是期望结果。
// 错误应由正常 Promise 返回后恢复按钮，不重新加载页面替产品释放锁。
// 重复使用同一选择可发现失败处理意外清空 Set 或退出多选的问题。
// 检查 a 存在与两张仍勾选同时成立，不能只看到数量正确就假定文件没移动。
// 本测试不声称模拟了文件权限拒绝，那个错误需要受限目录或专门文件系统环境。
// 不存在目录由正式主进程处理，不能由目标对话框回执直接伪造失败结构。
// 越界目录在渲染层已被拒绝，不代表主进程等价边界可以删除。
// 失败后仍可继续成功场景，能检验异常没有让 ref 锁永久保持忙碌。
async function checkErrors(context) {
  const { click, run, wait, smoke } = context;
  for (const target of [context.root, path.join(context.output, "missing")]) {
    context.target = target;
    await click("[data-history-move]");
    await wait("!document.querySelector('[data-history-move]').disabled");
    smoke.check("Invalid destination preserves source and selection", fs.existsSync(path.join(context.source, "a.png")) && await run("document.querySelectorAll('[data-history-grid] > button[aria-pressed=true]').length===2"));
  }
}

/**
 * 窄窗口使用文件管理子页，仍通过同一个多选工具栏提交真实移动请求。
 * 成功以后 Source 为空，浏览区应显示该目录空态，不能继续缓存旧缩略图。
 * 两张源图都必须从原位置消失；仅在目标新增副本不算移动成功。
 * 同名目标的原始字节必须保留，证明没有直接覆盖用户已有文件。
 * 真正的新 a 文件由扫描得到，不假定重名计数从 1 还是 2 开始。
 * 新图内容与源 PNG 完全一致，字节不应经过重编码或误保存为截图。
 * 旧来源 JSON 跟随最终新文件名，不能仍留在原目录或挂在目标旧图上。
 * b.png 没有重名，应该按原文件名进入嵌套目的目录。
 * 成功后必须退出多选，避免下一次删除还携带已经搬走的源路径。
 * 截图取最终真实空态与目标回执，不把模拟接口的固定成功字样当证据。
 * 文件名重算由正式移动方法完成，测试只检查结果，不复制其改名算法。
 * 所有目录与图片依然在当前冒烟临时根内，运行结束不触碰用户图片。
 */
// 成功选择指向已经初始化的嵌套文件夹，不能因目的不存在而触发与前例相同错误。
// 操作前截图记录窄模式下的批量工具栏，成功后截图记录清空后的源目录。
// 两个源路径均消失才能确认移动；只看目的地增加文件可能只是复制成功。
// 目的有三张图是原冲突目标加两张搬入文件，而不是由 UI 自报完成数量。
// a 的重名结果从生产扫描器读取，测试不复刻产品的计数后缀拼接规则。
// 字节相等能发现图片被误当缩略图重新编码，文件存在性不能覆盖这个问题。
// 原目标的文本标记必须保持，能发现同名覆盖后 UI 仍宣称成功的回归。
// 旁车跟随的是改名后的新图，若落在原 a.png 旁边会造成另一模型资料错挂。
// b 不需要改名，单独源消失断言防止流程只处理第一张便提前返回。
// 空态还应指向 Source，不能通过切到一个新的空文件夹来伪装源已更新。
// 多选工具条消失是成功收尾，不应与按钮暂时 disabled 的中间阶段混为一谈。
// 测试没有修改下一次生成目录，实际验证仍沿用用户文档的固定输出根。
// 本检查覆盖旧式旁车，PNG 自带 Meta 原封不动随文件迁移不需要单独重写。
// 部分完成后异常的回滚不属于既有服务承诺，不能从正常全成功场景推断原子性。
async function checkSuccess(context) {
  const { click, wait, run, smoke, shot } = context;
  context.target = context.destination;
  await shot("history-move-dark-narrow");
  await click("[data-history-move]");
  await wait("document.querySelector('[data-images-empty]')&&!document.querySelector('[data-history-move]')");
  const entries = files.listGeneratedImages(context.output, context.destination);
  const renamed = entries.find(item => item.fileName !== "a.png" && item.fileName !== "b.png");
  smoke.check("Real move removes both source files", !fs.existsSync(path.join(context.source, "a.png")) && !fs.existsSync(path.join(context.source, "b.png")));
  smoke.check("Nested destination preserves collision and original image bytes", entries.length === 3 && fs.readFileSync(path.join(context.destination, "a.png"), "utf8") === "existing destination" && Boolean(renamed && fs.readFileSync(renamed.filePath).equals(context.png)));
  smoke.check("Renamed image carries its legacy JSON", Boolean(renamed && JSON.parse(fs.readFileSync(files.legacySidecarPathForImage(renamed.filePath), "utf8")).fixture === "source-a"));
  smoke.check("Move finishes selection without changing the browsed Source folder", await run("document.querySelector('[data-images-empty]').textContent.includes('Source')"));
  await shot("history-move-success");
}

/**
 * 单窗口顺序执行，先完成宽栏取消，再到窄屏子页执行失败与真实移动。
 * 初次重新进入创建页使隔离输出设置通过正式文档水合，而不是直接调用渲染私有状态。
 * Source 文件夹通过真实双击打开，浏览与生成目录选择仍遵守现有交互。
 * 初次读取须等两张源图出现，不能仅等整个应用骨架挂载就开始点工具栏。
 * 切到 900px 后主区按实际可用宽度进入单栏，文件管理固钉打开同一个图库业务。
 * 窄屏子页中重新全选，验证选择草稿不会在两个图库实例之间共享。
 * 深色主题经真实 nativeTheme 驱动媒体查询，不用 CSS filter 给截图着色。
 * 等待媒体查询生效才截图，避免截图仍是切换前的浅色缓冲。
 * 此模块不安装额外计时器或创建另一个窗口，生命周期由外层 harness 负责。
 * 原布局套件的截图助手依然写入本轮临时根，方便和磁盘结果对应检查。
 * 未覆盖：用户实际操作系统对话框、跨磁盘移动、部分文件失败后的事务回滚。
 * 这些场景不能由本测试的固定目标回调或同一临时磁盘声称通过。
 */
// 运行前先建立夹具再载入路由，保证真实页面从第一次读取就使用正确输出根。
// 等待 Source 文件夹按钮出现，比只等应用骨架更能约束异步扫描的实际完成阶段。
// 双击通过 MouseEvent 进入现有打开文件夹逻辑，不直接修改 openedFolderId。
// 等待两张图片渲染，后续全选不可能只选中骨架或第一批尚未到齐的项目。
// 宽屏场景与窄屏场景串行，两个 Electron 窗口不会争用单实例或系统焦点。
// 缩窄后点击原固钉的文件管理入口，覆盖 main 子页形态的共享组件使用。
// side 的多选已经退出，新的 main 实例必须自己进入选择，证明状态不全局共享。
// 主题从 nativeTheme 修改，等待 matchMedia 读到 dark 再执行错误和成功步骤。
// 原输出目录设置只改本轮隔离文档，不写用户常用 JSON 或另建配置存储层。
// 每个步骤失败都向外拒绝，harness 统一给非零退出码，不能在 finally 中改成成功。
// 本模块不拥有 BrowserWindow，窗口销毁和看门狗由调用方统一管理。
// 截图与临时磁盘目录同根保存，人工复核时能对应真实搬运前后的文件状态。
// 单图入口通过真实右键菜单提交，选择器只有返回值夹具，搬运仍写真实临时磁盘。
// 先取消再成功，确保取消不会提前剪掉原图；成功后检查另一张仍留在源目录。
// 再搬回源目录恢复批量测试前提，不能改旧测试期望来迁就只剩一张的场景。
// 单图用b.png以避开既有a.png目标冲突，重名避让留给后面的原批量反例。
// 仍由生产扫描器给网格提供真实路径，测试只按可访问文件名找到右键目标。
// 页面菜单项必须实际出现后才能点击，不能直接调用动作层ref制造搬运成功。
// contextmenu事件只是自动UI事件证据，不声称人工物理鼠标右键已经测试。
// 第一次选择返回null，与用户取消系统对话框的桥接契约一致。
// 取消后必须在原source目录找到b.png，不能只看缩略图还没刷新就判断保留。
// 菜单截图在点击移动前保存，便于核对新整理项和原删除分隔样式。
// 选择器只控制目标回执，移动handler和文件系统操作完全使用生产实现。
// 成功目标是输出根内已有深层目录，不能由测试成功回执绕过目录边界。
// 点击后等待网格只剩一张，证明刷新不只发生在批量工具栏入口。
// 同时检查源b不存在和目标b存在，复制一份但保留原图不能算移动成功。
// 检查源a仍在，证明单图右键没有错误使用全选列表或默认第一张图。
// 文件内容由prepare生成真实PNG，UI仍通过正式本地媒体协议读取。
// 这里没有让单图移动触发删除确认，剪切粘贴效果由单个磁盘业务请求完成。
// 成功后的文件恢复使用生产moveImagesToFolder，避免为旧用例手工伪造一份数据。
// 恢复只用于测试准备，不是产品自动撤销功能，交付不能声称新增撤销。
// 恢复完成重新载入页面，让图库从磁盘再扫描，不手工插回一个假卡片节点。
// Source文件夹仍用真实双击公开交互打开，不修改openedFolderId私有状态。
// 再等两张卡片出现才进入原批量回归，避免后续用例在缺前提时误判产品错误。
// 单图与批量操作连续完成于一个窗口，能够发现共享hook的busy锁未释放。
// 因为两入口使用同一正式流程，后续越界和原地情况也继续由同一规则处理。
// 本单图用例没有覆盖其他图片已勾选时右键，因为产品多选模式本来禁用自定义右键。
// 不应为了测试不支持的状态去删掉产品imageSelectionMode边界。
// 文件名由aria-label定位，网格缩略图可能没有可见文件名文本，不能用textContent猜身份。
// 固定目录回执不证明用户实际打开和浏览了系统目录选择框，人工项继续未验证。
// 这里只在临时磁盘同卷移动，跨盘复制回退和权限拒绝仍需独立环境测试。
// 原目标a.png的冲突标记不在单图阶段被改动，后续批量断言仍有独立正确答案。
// 每次菜单用同一个按钮快照发出，排序不会把b的请求悄悄改成a。
// 这个helper不自行刷新Zustand版本，空出一张卡完全依赖产品操作的finally通知。
// 自动截图只记录被测窗口，不捕获其他桌面程序或用户私人图片。
// 成功断言以磁盘为准，Toast出现本身不能证明源文件已经被移走。
// 取消断言只检查文件保留，完整取消勾选状态仍由下面原批量测试覆盖。
// 若共享流程重复回调，后面两张重扫与批量入口状态会暴露重复收尾异常。
// 源文件恢复后原JSON旁车仍跟a，b无旁车，保持后续旁车测试前提。
// 不用测试写入空成功数组来跳过动作层回调，所有结果由真实磁盘服务给出。
// 原生系统拖入、生成队列和模型下载不是本整理场景的验收范围。
// 路径拼接只发生于测试自己创建的根，不接收用户提供的任意目标路径。
// 失败不会被重建夹具自动掩盖，原harness仍累计当前断言结果。
// source恢复后才继续原取消用例，保持旧用例的预期数量与实际物理文件一致。
// 浏览状态从正式路由恢复，所以也能发现文件整理后路由水合不能重新读取目录的问题。
// 等待函数有外层单步上限，不因菜单缺失或扫描失败永远阻塞整套测试。
// 不重试实际搬运以掩盖失败，单图取消与成功各执行一次明确意图。
// 截图在真实菜单展示时取得，不通过复制设计稿元素到DOM制造相同视觉。
// 当前目标目录选择没有增加新IPC，回归继续覆盖原registerHandle结果封装。
async function checkSingleMove(context) {
  const { run, click, wait, smoke } = context;
  const open = async () => {
    await run("[...document.querySelectorAll('[data-history-grid] > button')].find(e=>e.getAttribute('aria-label')==='b.png').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:600,clientY:240}))");
    await wait("[...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent.includes('移动到'))");
  };
  context.target = null;
  await open();
  await context.shot("image-context-move");
  await click('[role=menuitem][aria-label="移动到…"]');
  smoke.check("Context move cancellation retains original file", fs.existsSync(path.join(context.source, "b.png")));
  context.target = context.destination;
  await open();
  await click('[role=menuitem][aria-label="移动到…"]');
  await wait("document.querySelectorAll('[data-history-grid] > button').length===1");
  smoke.check("Context move cuts only the right-clicked image", !fs.existsSync(path.join(context.source, "b.png")) && fs.existsSync(path.join(context.destination, "b.png")) && fs.existsSync(path.join(context.source, "a.png")));
  files.moveImagesToFolder(context.output, context.source, [path.join(context.destination, "b.png")]);
  await context.win.loadURL("app://app/create");
  await wait("[...document.querySelectorAll('[data-history-sidebar] button')].some(b=>b.textContent.includes('Source'))");
  await run("[...document.querySelectorAll('[data-history-sidebar] button')].find(b=>b.textContent.includes('Source')).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await wait("document.querySelectorAll('[data-history-grid] > button').length===2");
}

module.exports = async function checkHistoryMove(context) {
  prepare(context);
  await context.win.loadURL("app://app/create");
  await context.wait("[...document.querySelectorAll('[data-history-sidebar] button')].some(b=>b.textContent.includes('Source'))");
  await context.run("[...document.querySelectorAll('[data-history-sidebar] button')].find(b=>b.textContent.includes('Source')).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await context.wait("document.querySelectorAll('[data-history-grid] > button').length===2");
  await checkSingleMove(context);
  await checkCancellation(context);
  await context.metrics(900);
  await context.click("[data-history-pin-option=history]");
  await context.wait("document.querySelector('[data-create-subpage=history]')&&document.querySelectorAll('[data-history-grid] > button').length===2");
  await selectSource(context);
  nativeTheme.themeSource = "dark";
  await context.wait("matchMedia('(prefers-color-scheme: dark)').matches");
  await checkErrors(context);
  await checkSuccess(context);
  // 改名会改变文件身份；重建空出的 Source，不能让它破坏上面的移动断言。
  // 原 Source 此时已经真实搬空，所以新一轮图片不会与旧源文件发生重名覆盖。
  // Destination 保留移动证据；排序只打开新建的长名称目录，不读取目标旧图。
  // 第二轮不复用已移动后的旧路径数组，重新由扫描器得出本轮两张源图。
  // prepare 仍注册同一个正式文件 handler，而不是切到假改名响应。
  // 长名称带中文、空格和连接号，覆盖原截图里目录名称被视图组遮住的真实形态。
  // 两轮都使用同一个外层窗口，避免两个 Electron 测试进程并发争用资源。
  // 回到宽屏后重新加载路由，使新设置通过正式文档读取链路进入页面。
  // 不能仅改外层 context.source 就假定渲染已经浏览该目录。
  // 页面必须通过真实文件夹按钮双击打开长目录，后面的标题省略才有业务前提。
  // 等待和双击都携带完整长名称，不能含糊地命中上一轮留下的空 Source。
  // 等两张图片出现再进入排序，避免动画或扫描未结束导致手柄缺失。
  // 顺序测试放在移动断言全部结束之后，改名不会改变旧移动用例的 a/b 预期。
  // 如果排序失败，前面的移动结果仍保留，但整个套件必须按失败退出。
  // 两类场景共享生产图库 UI，最终日志可以同时观察移动入口与排序入口是否兼容。
  // 新夹具没有构造另一个主区布局，仍依赖创建页容器宽度来选择侧栏或文件管理页。
  // 测试目录不会被设成用户正式输出偏好，setOutput 只修改外层隔离文档。
  // 第二轮 nativeTheme 继承前面的深色，排序 helper 会按自己的步骤检查两套主题。
  // 图像字节继续用原有 PNG 生成，标题长短不会改变图片可解码前提。
  // 用户真实图片不在本临时根下，因此本次改名和移动不影响正在使用的图库。
  // 测试最后没有删除目录，日志中的路径仍可用于人工核对改名结果和旁车。
  context.sourceName = "Source — 这是用于验证标题省略的很长很长的文件夹名称 gallery assets long title";
  prepare(context);
  await context.metrics(1440);
  await context.win.loadURL("app://app/create");
  await context.wait(`[...document.querySelectorAll('[data-history-sidebar] button')].some(b=>b.textContent.includes(${JSON.stringify(context.sourceName)}))`);
  await context.run(`[...document.querySelectorAll('[data-history-sidebar] button')].find(b=>b.textContent.includes(${JSON.stringify(context.sourceName)})).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await context.wait("document.querySelectorAll('[data-history-grid] > button').length===2");
  await require("./check-history-order")(context);
};
