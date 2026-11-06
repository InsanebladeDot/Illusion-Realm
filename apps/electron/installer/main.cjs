/**
 * 独立安装向导进程：只加载随包页面，不接收远程页面或创作客户端 IPC。
 * 系统安装交给 NSIS，界面与进程生命周期在此集中管理。
 * 只有一个窗口与一个安装状态，重复打开不会并行写入两次。
 * 写入期间阻止退出，但保留最小化；不承诺无法实现的原子回滚。
 * 错误统一返回 success/error，底层路径与堆栈不发给页面。
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), { pathToFileURL } = require('node:url');
const { CHANNELS, verifyEngine, runEngine, diagnoseInstallation, prepareTarget } = require('./service.cjs');
const html = path.join(__dirname, 'installer.html'), pageUrl = pathToFileURL(html).href;
let win, busy = false, installed = '', allowClose = false, manifest, legal;
/**
 * 正式环境只从 resources/payload 读取；源码预览使用已构建的 staging。
 * 不允许页面提供 payload 路径，也不从网络临时下载安装引擎。
 * staging 尚未构建时启动失败并显示缺少安装文件，而不伪装成功。
 * 所有路径都由当前进程的固定资源位置推导。
 */
const payload = app.isPackaged ? path.join(process.resourcesPath, 'payload') : path.join(__dirname, '../release/installer-stage/payload');
/**
 * 当前安装向导与客户端分开，app.getPath('userData') 也有独立应用身份。
 * 单实例锁只防止同时运行两个向导，不阻止用户启动已安装客户端。
 * manifest 和 legal 在窗口创建前加载，UI 不会先展示过期的条款占位。
 * pageUrl 由 Node URL 工具编码中文路径，来源比较不手工替换空格。
 * busy 只代表安装调用正在等待，不是可由渲染端设置的状态字段。
 * installed 只在真实引擎成功后赋值，页面切换本身不能造出安装完成。
 * allowClose 初始关闭，系统 Alt+F4 与自定义关闭按钮遵循同一条件。
 * 安装完成前没有 launch 路径，finish 不能提前启动 staging 引擎。
 * 运行时不会从程序参数读取任意 HTML 或安装源地址。
 * 临时资源由 portable 外壳管理，本模块不递归清理父目录。
 */
/**
 * 单入口包装器限制来源为当前窗口的顶层本地页面。
 * frame 与 sender 同时检查，拒绝 iframe、DevTools 或其他 WebContents。
 * handler 拒绝的错误只显示明确的业务提示，其余统一隐藏底层细节。
 * 所有异步方法都由 try/catch 接住，IPC 不跨边界抛异常。
 * IPC 入参由各服务校验，不因可信本地页面而省略写操作约束。
 * @param {string} channel 固定通道名。
 * @param {Function} action 对应安装动作。
 */
function handle(channel, action) {
  // 每个通道在本进程只注册一次，独立应用不复用客户端 handler 表。
  // 校验发生在 action 之前，非法发送者不能触发目录枚举或浏览对话框。
  // senderFrame 只允许 mainFrame，页面内嵌内容不继承安装权限。
  // 窗口加载时 URL 必须精确匹配，不接受同目录下其他 HTML 文件。
  // result 不包含 Error 对象，否则序列化可能暴露内部错误属性。
  // success:true 与 data 缺省也可表示窗口动作成功，不伪造安装成功。
  // 主进程服务已使用中文描述可处理问题，其余系统错误统一降敏。
  // Promise rejection 与同步 throw 都在同一个 try/catch 路径处理。
  // 错误不写用户路径日志，故障反馈以界面文案为准。
  ipcMain.handle(channel, async (event, value) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== pageUrl) return { success: false, error: '安装请求来源无效。' };
    try { return { success: true, data: await action(value) }; }
    catch (error) { return { success: false, error: /[\u4e00-\u9fff]/.test(error.message) ? error.message : '操作失败，请检查文件夹权限、安装文件和磁盘空间。' }; }
  });
}
/**
 * 开始安装立刻锁住状态，在任何等待之前拒绝重复请求。
 * options 必须是普通对象；consent 与布尔参数在服务中再次验证。
 * 再次预检目标后核对引擎摘要，页面的确认页不能跳过这些步骤。
 * 成功必须同时满足进程退出成功和目标 EXE 存在，不能只相信动画。
 * 失败清除 busy 允许重选目录，但不自动删除可能部分写入的目标。
 * 完成页启动路径完全来自此处的可信结果，不接受页面提供的 EXE。
 * 重启要求通过返回字段展示，不尝试自行重启 Windows。
 * @param {unknown} options 用户已确认的安装设置。
 */
async function install(options) {
  // 先锁 busy，再检查磁盘和哈希；双击不会在预检阶段启动第二个引擎。
  // 拒绝空值与标量对象前不访问 options.path，避免动态参数崩溃。
  // 用户同意在 runEngine 中再次检查，DOM 禁用状态不是授权凭据。
  // 同一次窗口完成安装后不能再次写入其他目录，需重新启动向导。
  // 规范化目标来自 inspectTarget，不从渲染层的 summary 字符串解析。
  // 构建清单中的 installedBytes 决定容量要求，不信任客户端传入大小。
  // engine 路径固定为同包资源，用户选择的目录不能替换要运行的程序。
  // hash 完成前不创建安装进程，失败不会在目标目录释放应用文件。
  // 退出码成功仍需验证固定可执行文件，而不以目录存在判断安装完成。
  // stat 发现目标 EXE 不存在时保持 installed 为空，完成页不能启动它。
  // finally 在成功与失败路径都解除 busy，避免永久锁住错误页面。
  // 此处不会删除失败残留，重新检测后可继续修复已登记的原位置。
  // 安装选项仅传入路径与开关，不从 UI 接受环境变量或启动参数。
  if (busy || installed) throw new Error('安装正在进行或已经完成，请勿重复提交。');
  if (!options || typeof options !== 'object') throw new Error('安装选项无效。');
  busy = true;
  try {
    // 检测与目录页共用同一预检，安装前重读防止使用过期状态。
    // repair 必须显式为 true，不能从 renderer 随意声明旧目录归属。
    // 磁盘消失、记录冲突或原位置改变均在启动引擎前阻断。
    const target = await prepareTarget(options.path, manifest.installedBytes, manifest.registryKey, options.repair === true), engine = path.join(payload, 'engine.exe');
    await verifyEngine(engine, manifest.engineSha256); const code = await runEngine(engine, { ...options, path: target.path, repair: target.repair });
    const status = await diagnoseInstallation(manifest.registryKey);
    if (status.state !== 'ready' || status.path.toLowerCase() !== target.path.toLowerCase()) throw new Error('安装尚未完整写入，请重新检测并修复。');
    const exe = path.join(target.path, 'Illusion Realm.exe');
    installed = exe; return { path: target.path, rebootRequired: code === 3010 };
  } finally { busy = false; }
}
// 主进程是最终写入边界，renderer 的 disabled/readOnly 只能帮助用户理解。
// prepareTarget 在安装前重新读注册记录，抵御确认页打开期间位置发生变化。
// 只有目标与登记位置相同且可访问时才带 Repair 启动原生引擎。
// manifest 的安装身份随包构建，不接受页面传入 appId 或卸载键名。
// installedBytes 是发行资源大小，不能把用户模型大小当作必须重装的资源。
// verifyEngine 完整流读取内嵌引擎，字节不一致时不执行任何安装进程。
// verifyEngine 通过只证明资源未损坏，不等于已经验证发布者数字签名。
// runEngine 的错误由统一 handler 转成可见失败，安装页不会收到 Error 堆栈。
// Repair 模式不会先运行旧卸载器，避免原生清理把目录内的用户文件带走。
// 解压结束仍重新 diagnoseInstallation，不能只凭子进程退出零就显示完成。
// 目标登记必须与预检目录一致，防止引擎实际上把软件装到了另一个地址。
// 三个必要文件都齐全才进入 ready，卸载器丢失不能被主程序存在掩盖。
// installed 只在最后校验通过时赋值，完成页不能启动部分写入的程序。
// 用户配置、缓存和下载队列不是安装校验清单，不会被读出作为错误报告。
// 没有自动结束运行中的客户端；占用退出码会提醒用户正常关闭。
// 失败 finally 解除 busy，允许用户保留路径重新检查，而非强制重启安装器。
// 若用户在系统外终止安装进程，不会得到一个假“安装成功”的回包。
// 新安装与修复共用许可校验，修复不是绕过同意条款的隐藏入口。
// 安装器关闭不会删除部分写入文件，避免错误回滚扩大损失范围。
// 正常退出和重启要求分别处理，程序不会自动重启 Windows。
/**
 * 取消与标题栏关闭共用原生确认，避免两条退出路径有不同清理行为。
 * 写入中明确拒绝关闭，不杀掉 NSIS 或错误地宣称所有文件已回滚。
 * await 对话框期间窗口仍由 Electron 管理，二次关闭不会破坏引擎。
 * 用户确认后才放行 close 事件，不在最外层无条件 app.quit。
 * 完成页直接退出，无需重复询问是否放弃尚未开始的安装。
 */
async function requestClose() {
  // 主进程读取 busy 保证 DOM 隐藏按钮不能绕过写入保护。
  // 等待提示不提供强制终止，用户可最小化后等待安装完成。
  // 普通取消确认默认聚焦继续设置，Escape 不误触发退出。
  // 完成后的关闭不启动客户端，只有 finish(true) 会执行启动动作。
  // close 事件再入时 allowClose 放行，避免确认后的递归弹窗。
  // 未执行安装时退出不创建或清理目标目录，因为预检没有写入。
  // 对话框只有固定文本，不插入完整用户路径或底层错误细节。
  if (busy) { await dialog.showMessageBox(win, { type: 'info', message: '安装正在写入文件，请等待结束后关闭。', buttons: ['继续等待'] }); return; }
  if (installed || (await dialog.showMessageBox(win, { type: 'question', message: '要退出安装向导吗？', detail: '退出后不会开始新的安装。', buttons: ['继续设置', '退出'], defaultId: 0, cancelId: 0 })).response === 1) { allowClose = true; win.close(); }
}
/**
 * 安装信息包含正式许可全文和真实容量，展示层不能自己编造版本或空间。
 * 浏览只选目录，不会创建用户选择的目录或要求任意文件权限。
 * 校验与写入共用服务；进入安装阶段后禁止打开其他目录选择器。
 * finish 只接受布尔启动标记，默认不允许接收命令行或 URL。
 * shell.openPath 的错误会阻止退出，让用户知道启动未成功。
 * 最小化仅影响当前向导，不控制用户已经打开的创作客户端。
 */
function registerHandlers() {
  // info 返回许可字符串和版本，不返回 manifest 中的安装引擎位置。
  // 默认目录在用户可写 Local Programs 下，不能使用开发者磁盘路径。
  // 路径输入仍允许其他盘的空专用目录，推荐位置不是硬性限制。
  // browse 取消返回 null，使渲染端可以保留之前的输入。
  // createDirectory 是用户主动的文件夹选择操作，不是后台扫描。
  // validate 是无副作用读操作，不提前创建安装目录或测试文件。
  // finish 的布尔参数是唯一可变启动选项，不提供附加参数数组。
  // shell.openPath 只读取先前确认存在的客户端路径，不打开任意 URI。
  // 启动失败时仍保留安装成功结果，让用户可以选择不启动而关闭。
  // 窗口按钮不能传入窗口 ID，操作范围固定到当前向导。
  handle(CHANNELS.info, () => ({ version: manifest.version, installedBytes: manifest.installedBytes, legal, defaultPath: path.join(app.getPath('home'), 'AppData/Local/Programs/Illusion Realm') }));
  handle(CHANNELS.browse, async () => { if (busy) throw new Error('请等待当前安装结束。'); const result = await dialog.showOpenDialog(win, { title: '选择应用专用文件夹', properties: ['openDirectory', 'createDirectory'] }); return result.canceled ? null : result.filePaths[0]; });
  handle(CHANNELS.diagnose, () => diagnoseInstallation(manifest.registryKey));
  handle(CHANNELS.validate, value => prepareTarget(value?.path, manifest.installedBytes, manifest.registryKey, value?.repair === true)); handle(CHANNELS.install, install);
  handle(CHANNELS.finish, async launch => { if (!installed || typeof launch !== 'boolean') throw new Error('安装尚未完成。'); if (launch) { const error = await shell.openPath(installed); if (error) throw new Error('安装已完成，但启动失败，请通过快捷方式打开应用。'); } allowClose = true; win.close(); });
  handle(CHANNELS.close, requestClose); handle(CHANNELS.minimize, () => win.minimize());
}
/**
 * 固定尺寸与模板的 1040px 画布一致，小屏时由 CSS 重排而非裁掉按钮。
 * contextIsolation 开启，Node 在页面禁用；preload 只暴露固定安装动作。
 * sandbox:false 用于 preload require 本地通道表，遵守项目现有边界约定。
 * 页面 CSP 禁止网络、eval 与内联脚本，安装无远程 HTML 执行入口。
 * 拒绝跳转与新窗口，外部地址不能继承向导的系统操作权限。
 * 窗口加载错误向顶层 catch 汇总，不在失败时继续显示空白安装器。
 * backgroundThrottling:false 使遮挡窗口仍能刷新真实异步安装结果。
 */
async function createWindow() {
  // 初始高度包含标题栏和底栏，正文使用剩余空间保持页脚可见。
  // 用户可以缩放窗口；窄屏时仅隐藏左侧插画，不隐藏安装选项。
  // frame:false 配合页面拖动区域，避免两套窗口控制叠在一起。
  // 没有 titleBarOverlay，因此主题或窗口状态改变不会绘制原生按钮。
  // 没有 nodeIntegrationInSubFrames 或 webSecurity:false 等扩大权限设置。
  // preload 是固定本地模块，不能由 HTML 标签覆盖加载路径。
  // 导航事件始终取消，页面不能离开受校验的本地安装文档。
  // 新窗口拒绝，不把窗口权限借给用户条款中的外部链接。
  // 真实安装期间允许最小化，后台节流关闭保证异步结果仍能呈现。
  // 关闭确认被拒绝时保留窗口，而不让 portable 清除正在执行的引擎。
  win = new BrowserWindow({ width: 1040, height: 700, minWidth: 600, minHeight: 620, frame: false, resizable: true, backgroundColor: '#f3f8ff', autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('close', event => { if (!allowClose) { event.preventDefault(); requestClose().catch(() => {}); } });
  registerHandlers(); await win.loadFile(html);
}
/**
 * 独立 appId 和单实例锁不会与创作客户端互斥，也不主动停止用户进程。
 * 资源清单格式或容量不合法时立即终止，不使用任意默认摘要运行引擎。
 * 加载法律正文和清单失败时显示明确错误，不能跳过许可页面继续安装。
 * 主进程不写安装日志，以免把目录和个人信息输出到开发控制台。
 * Windows 所有窗口关闭后退出，portable 外壳再清理它的临时资源。
 * 捕获启动异常并非零退出，不把空白窗口或缺少引擎判为安装成功。
 */
if (!app.requestSingleInstanceLock()) app.exit(0);
// 第二实例没有开始安装，所以正常退出不表示某次安装已成功。
// 主实例 ready 后才访问系统对话框与 BrowserWindow，遵守 Electron 生命周期。
// UTF-8 读取法律文件，避免不同 Windows 区域设置造成乱码。
// 清单容量必须为正 safeInteger，拒绝 NaN、负值和失真超大数。
// 版本只用于显示，安装行为不从版本字符串构造 shell 命令。
// 启动失败统一显示资源不完整，不向普通用户暴露开发机路径。
// second-instance 只聚焦现有向导，不把第二进程参数转交为安装选项。
// minimized 时先恢复再 focus，使用户能找到仍在等待的安装窗口。
// window-all-closed 只会在允许关闭后触发；安装中已有 close 拦截。
// 应用退出后外层自解压资源生命周期结束，不需要自行删除系统临时根。
else app.whenReady().then(async () => {
  manifest = JSON.parse(await fs.readFile(path.join(payload, 'manifest.json'), 'utf8')); legal = await fs.readFile(path.join(payload, 'legal.txt'), 'utf8');
  if (!Number.isSafeInteger(manifest.installedBytes) || manifest.installedBytes <= 0 || typeof manifest.version !== 'string') throw new Error('Invalid installer manifest');
  await createWindow();
}).catch(() => { dialog.showErrorBox('安装向导无法启动', '安装资源不完整，请重新获取完整安装包。'); app.exit(1); });
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
