/**
 * 安装服务只处理固定引擎、目标目录和快捷方式，不执行页面提供的命令。
 * Windows 安装采用 NSIS /S /D，文件写入和卸载注册由成熟安装引擎管理。
 * 目标校验在确认页和真正开始前分别执行，避免页面校验成为唯一边界。
 * 安装引擎的 SHA-256 以流读取核对，降低内嵌文件损坏造成的误执行。
 * 不记录用户路径或子进程输出，UI 只接收可恢复的中文错误。
 * 哈希不是代码签名，发布身份验证仍应由签名体系解决。
 */
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { createReadStream, constants } = require('node:fs'), { spawn } = require('node:child_process');
/**
 * 诊断模块只读登记和必要文件，目录边界仍统一由本服务提供。
 * 修复采用原位补件，不调用旧卸载器，也不删除整个文件夹。
 * 与首次安装共用容量、链接、受保护目录和权限检查。
 * 登记路径只供选择本应用原位置，不能授权覆盖任意非空目录。
 */
const diagnosis = require('./diagnosis.cjs');
/**
 * 每次提交都重新读取系统记录，不信任页面缓存的修复状态。
 * 旧盘符断开时返回 blocked，不能以新安装掩盖不可访问的旧数据。
 * 页面不能传入检查器，注入仅存在于模块内部与独立回归脚本。
 * 结果是结构化状态，安装按钮与诊断说明使用同一份判断。
 */
const diagnoseInstallation = key => diagnosis.diagnose(key, { validateSyntax, existingParent });
/**
 * 首次安装和修复共用这个预检入口，避免确认与执行使用不同规则。
 * 类比修房子：旧地址有登记才能进屋补件，陌生非空目录不能接管。
 * repair 参数来自用户选择，但许可仍由重新读取的原生记录决定。
 * 必须明确选择修复，普通安装请求不能悄悄改变成覆盖旧版。
 * 已登记路径不允许改到另一处，防止留下两个安装与不同用户数据。
 * 路径大小写不影响同一 Windows 目录的识别，仍保留规范路径。
 * blocked 是明确故障，不能退化成让用户选空文件夹继续。
 * 预检不写目录，不提前生成卸载器或清理任何旧文件。
 */
async function prepareTarget(input, installedBytes, key, repair = false) {
  const result = await diagnoseInstallation(key);
  if (result.state === 'blocked') throw new Error(result.message);
  const target = validateSyntax(input), hasInstallation = result.state !== 'fresh';
  if (hasInstallation && (!repair || target.toLowerCase() !== result.path.toLowerCase())) throw new Error('请使用一键修复安装，在检测到的原安装位置补回程序。');
  if (!hasInstallation && repair) throw new Error('安装记录已改变，请重新检测后选择安装方式。');
  return { ...await inspectTarget(target, installedBytes, hasInstallation), repair: hasInstallation };
}
// prepareTarget 的返回值是主进程可执行的规范目标，不是 UI 输入的原样回显。
// 普通安装只允许 fresh，防止有登记时绕开修复分支覆盖程序。
// 修复只允许 ready/repair，不能用 true 标记把任意非空目录认领为应用。
// 路径一致性用 Windows 不区分大小写规则比较，不裁掉目录层级。
// 登记出现冲突时 blocked 的原因直接反馈，安装器不替用户猜哪个目录正确。
// 原目录不存在时仍可找到同盘祖先，重建由后续引擎完成。
// 原盘不存在则无法找到可写祖先，这和手动删掉文件夹必须区别处理。
// inspectTarget 继续负责系统目录、链接、权限和可用容量的统一规则。
// repair 只放开原非空目录，不放开受保护目录和软链接边界。
// 用户自己的模型盘可以保留额外文件，但不是任意目录都应当作专用安装根。
// 所需空间按完整发行资源估算，修复不能假定只需缺少的三个文件大小。
// 诊断只列出基本缺件，真正修复会重新释放发行包里的全部应用资源。
// 不把检测发现的文件路径拼进 shell 命令，仍以参数数组启动固定引擎。
// 后续磁盘空间变化由真实写入退出码反馈，预检快照不能保证未来容量。
// 目录验证不创建探测文件，未确认安装前不会写入原应用目录。
// 首次非空目录继续拒绝，避免将用户已有资料纳入未来卸载范围。
// /Repair 标志由此处确认后的返回值决定，而非直接透传页面参数。
// false 与缺省都表示普通安装，字符串 true 不构成合法修复选择。
// 共享服务没有全局 repair 状态，两次独立请求不会继承上一份标记。
// 检查失败通过拒绝 Promise 汇总，外层 handler 负责显示与状态恢复。
/**
 * 安装器拥有独立进程和通道域，不扩展创作客户端的系统权限接口。
 * preload 与 main 从这里取相同常量，防止拼写漂移。
 * 每个 handler 在 main 中统一校验来源并包装 success/error。
 * 所有写操作只有固定方法，页面不能传入 channel 或命令名称。
 */
const CHANNELS = { info: 'installer:info', browse: 'installer:browse', validate: 'installer:validate', install: 'installer:install', finish: 'installer:finish', close: 'installer:close', minimize: 'installer:minimize', diagnose: 'installer:diagnose' };
/**
 * 路径必须是有盘符的本地绝对路径，不支持 UNC、设备路径与相对路径。
 * 禁止根目录、Windows、Program Files 和 ProgramData 等受保护树。
 * 用户目录本身不可选，但其下专用的应用子目录仍可使用。
 * 拒绝保留设备名、尾部点/空格、控制字符和额外冒号，避免 Win32 别名。
 * /D 直接进入 Windows 命令行，拒绝双引号以保证参数边界不被改变。
 * NSIS 路径长度控制在 200 字符内，为应用深层资源路径留出余量。
 * 不调用 path.resolve 来宽容化 ..，可疑输入必须直接拒绝。
 * @param {unknown} input 页面提交的原始路径。
 * @returns {string} 已规范化且通过纯格式校验的路径。
 */
function validateSyntax(input) {
  // 长度上限按 UTF-16 字符计算，与 Windows 常用路径字符串一致。
  // 盘符大小写可混用，规范化不会改变用户选择的实际目录。
  // 不自动 trim，末尾空格是 Windows 别名风险，必须提示用户修正。
  // 正斜杠虽然有些 API 接受，但这里拒绝以保证各层路径判据一致。
  // 引擎本身可能宽容非法字符，预检不能依赖其隐式改写路径。
  // 设备名按每个路径段检查，不只看最终应用文件夹名称。
  // COM0 与 LPT0 也保守拒绝，避免不同 Win32 API 的保留名差异。
  // 用户自定义盘符的专用目录被允许，不硬编码 C 或 D 为唯一磁盘。
  // 系统树限制作用于任意盘符，换盘符不能绕过 Program Files 禁用。
  // 不接受 AppData 父级的空目录假设，实际目录状态在异步预检检查。
  if (typeof input !== 'string' || input.length > 200 || !/^[a-z]:\\[^\\]/i.test(input) || /[<>"|?*\/\x00-\x1f]/.test(input) || input.slice(2).includes(':')) throw new Error('请选择有效的本地专用文件夹，例如 D:\\Apps\\Illusion Realm。');
  const parts = input.slice(3).split('\\');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) throw new Error('安装路径含有 Windows 不支持的目录名称。');
  if (/^[a-z]:\\(?:windows|program files(?: \(x86\))?|programdata)(?:\\|$)/i.test(input) || /^[a-z]:\\users(?:\\[^\\]+)?$/i.test(input)) throw new Error('请勿选择系统或用户根目录，建议使用当前用户的推荐位置。');
  return path.win32.normalize(input);
}
/**
 * 从目标逐级向盘符根查询，找到实际存在的最近父目录。
 * 沿途拒绝重解析链接，防止看似安全的目标转到系统目录或网络位置。
 * lstat ENOENT 只代表该层尚未创建，其他 I/O 错误不能被吞掉。
 * 首个存在目录用于权限与容量检查，不在预检阶段创建目标或探测文件。
 * 安装前会再次检查，但本地同用户恶意并发修改仍不是原子文件事务。
 * 这条限制通过拒绝链接缩小范围，不宣称完全消除所有 TOCTOU 风险。
 * @param {string} target 已通过格式检查的安装路径。
 * @returns {Promise<string>} 最近存在且可作为目录的祖先。
 */
async function existingParent(target) {
  // nearest 只在第一次找到目录时赋值，后续祖先检查不能覆盖它。
  // 即使目标不存在，也要继续检查已存在的祖先是否为 junction。
  // 循环到盘符根即结束，不向 path.dirname 的固定点无限重复。
  // 不使用 realpath 自动跟随链接，以免先接受再隐藏实际重定向。
  // 磁盘未挂载时所有层可能不存在，最终给明确的磁盘不可访问提示。
  // 文件占据某层路径时拒绝，不能自动删除或把文件转换为目录。
  // EACCES 与 EPERM 不作为不存在处理，避免错误地尝试受限位置。
  // 此过程不产生写入副作用，用户返回上一步不会留下测试目录。
  let nearest = '';
  for (let dir = target; ; dir = path.win32.dirname(dir)) {
    try { const stat = await fs.lstat(dir); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('安装位置不能经过链接或普通文件。'); if (!nearest) nearest = dir; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (path.win32.dirname(dir) === dir) break;
  }
  if (!nearest) throw new Error('目标磁盘不存在或暂时不可访问。');
  return nearest;
}
/**
 * 首次安装只允许空目录；修复只允许 prepareTarget 已核对登记的原位置。
 * 修复不先卸载旧版，原位补件不等同于自动回滚或数据迁移。
 * statfs 从操作系统读取目标卷容量，不使用原型中的固定 GB 数值。
 * 预留 64MiB 供卸载器与安装元数据，不把此值说成模型空间。
 * access 检查当前用户权限，受限目录不静默提升整个向导权限。
 * 检查失败返回中文业务错误，底层路径与系统堆栈不穿越 IPC。
 * @param {unknown} input 原始目录。
 * @param {number} installedBytes 构建时实际统计的应用字节数。
 * @returns {Promise<{path:string,freeBytes:number,requiredBytes:number}>} 真实容量与目标。
 */
async function inspectTarget(input, installedBytes, repair = false) {
  // 首次安装拒绝非空目录；内部 repair 只来自原生记录再次核验。
  // 父目录权限与目标卷容量来自同一最近存在目录，避免检查错盘。
  // 新目录尚未创建时 statfs 仍可对其祖先返回正确目标卷数据。
  // bigint 保留文件系统原始数值，转换只在最终容量展示前发生。
  // 当前 Windows 常规卷容量小于 JS 安全整数范围，包清单另有检查。
  // access 不是权限保留锁，真正写入失败仍须从 NSIS 退出码处理。
  // 空间检查只是当前快照，不保证安装期间其他进程不会占用磁盘。
  // 64MiB 为安装器元数据余量，不预分配或写入一个占位大文件。
  // 系统临时目录空间由自解压外壳处理，不用目标盘余量冒充临时空间。
  // 返回只含规范路径与容量，不能返回 fs 对象或 OS 错误堆栈。
  const target = validateSyntax(input), parent = await existingParent(target);
  if (!repair && parent.toLowerCase() === target.toLowerCase() && (await fs.readdir(target)).length) throw new Error('请选择空的专用文件夹；已有安装请使用一键修复安装。');
  await fs.access(parent, constants.W_OK); const volume = await fs.statfs(parent, { bigint: true });
  const freeBytes = Number(volume.bavail * volume.bsize), requiredBytes = installedBytes + 64 * 1024 * 1024;
  if (freeBytes < requiredBytes) throw new Error('目标磁盘空间不足，请更换位置或释放空间后重试。');
  return { path: target, freeBytes, requiredBytes };
}
/**
 * 完整核对摘要后才允许创建安装子进程，损坏引擎不会“先运行再检查”。
 * 输入流由 for-await 释放，读取异常使整个安装失败。
 * 仅接受构建时生成的 64 位十六进制摘要，缺少清单不能退回不校验。
 * 比较内容来自同一个离线包，不能用于验证未经信任的下载来源。
 * @param {string} file 固定内嵌引擎。
 * @param {string} expected 构建清单摘要。
 * @returns {Promise<void>} 不匹配时拒绝执行。
 */
async function verifyEngine(file, expected) {
  // 固定本地引擎由主进程定位，摘要函数不扫描同目录下其他 EXE。
  // 清单 SHA 使用小写输出，因此这里不接受歧义大小写格式。
  // 不匹配时不会调用 runEngine，即使目标路径已经通过预检。
  // 读取错误传播到主进程统一错误包装，不把完整资源路径交给页面。
  // 子进程仅在本函数完成后创建，校验过程不与安装并发。
  // SHA 以字节为输入，不受中文路径、区域设置或换行转换影响。
  const hash = crypto.createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (!/^[a-f0-9]{64}$/.test(expected) || hash.digest('hex') !== expected) throw new Error('安装文件校验失败，请重新获取完整安装包。');
}
/**
 * 页面必须显式同意条款，两个快捷方式必须是布尔值，不能靠 truthy 绕过。
 * /D 必须放最后并且不带引号，遵守 NSIS 的特殊命令行约定。
 * windowsVerbatimArguments 保留 /D 后包含空格的完整目录到命令行末尾。
 * shell:false 不经过 PowerShell/cmd，用户输入中的 $ 与反引号不会执行。
 * 桌面开关使用原生 --no-desktop-shortcut，开始菜单开关由 engine.nsh 消费。
 * 退出 0 和 3010 分别表示完成和完成但需重启，其他退出码均判失败。
 * 不用计时器伪造百分比，也不在写入过程中 kill 引擎以假装取消成功。
 * child error/exit 只结算一次 Promise，不把子进程输出发给页面。
 * @param {string} engine 内嵌 NSIS 路径。
 * @param {{path:string,consent:boolean,desktop:boolean,startMenu:boolean,repair?:boolean}} options 通过 IPC 校验的选项。
 * @returns {Promise<number>} 安装引擎真实退出码。
 */
function runEngine(engine, options) {
  // options.path 已在安装主进程调用 inspectTarget 后规范化。
  // 此函数仍核验显式 consent，避免未来调用者误省略用户确认。
  // 数组参数避免字符串拼接 shell 命令，路径只能占据 /D 的尾部。
  // 中文路径由 Windows Unicode API 传递，不转换成 ANSI 代码页。
  // stdio 忽略避免把 NSIS 内部日志含路径信息返回 UI。
  // windowsHide 防止系统产生额外的控制台窗口，原生错误框不被伪造。
  // 不把退出 null 当成功；被外部终止的安装必须落入失败分支。
  // 3010 不会自动触发重启，仅让上层完成页显示提示。
  if (options.consent !== true || typeof options.desktop !== 'boolean' || typeof options.startMenu !== 'boolean') throw new Error('请阅读许可并确认安装选项。');
  const args = ['/S', ...(options.repair ? ['/Repair'] : []), ...(options.desktop ? [] : ['--no-desktop-shortcut']), ...(options.startMenu ? [] : ['/NoStartMenuShortcut']), `/D=${options.path}`];
  return new Promise((resolve, reject) => {
    const child = spawn(engine, args, { shell: false, windowsHide: true, windowsVerbatimArguments: true, stdio: 'ignore' });
    child.once('error', () => reject(new Error('无法启动安装，请检查安全软件提示后重试。')));
    child.once('exit', code => code === 0 || code === 3010 ? resolve(code) : reject(new Error(code === 11 ? '请先正常关闭 Illusion Realm，再重新修复安装；向导不会强制结束应用。' : '安装未完成。请检查目录权限、空间和应用占用，再重新安装。')));
  });
}
/**
 * 仅导出固定服务函数供 main 与独立回归脚本消费。
 * 不导出 spawn 或文件系统对象，preload 也不会把这些模块暴露到页面。
 * 路径检查与引擎启动分离，便于用无副作用的临时目录做边界验证。
 */
module.exports = { CHANNELS, validateSyntax, existingParent, inspectTarget, verifyEngine, runEngine, diagnoseInstallation, prepareTarget };
