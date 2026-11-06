/**
 * 安装诊断把注册记录与磁盘实物对照，不再把一张旧收据当成完整安装。
 * 类比找房子：登记地址只是线索，必须确认道路可达，再检查房屋是否缺件。
 * 本模块只读本应用的固定身份，不删除注册表、不清理 AppData。
 * 没有登记且目录非空时仍由原有目录校验拒绝，不能认领陌生文件夹。
 * 所有查询都使用参数数组，页面不能传注册表键或执行命令。
 * HKLM 记录只用于提醒，当前用户安装器没有修复其他用户安装的权限。
 * 诊断结果不包含凭据、注册表原文、进程输出或异常堆栈。
 * 文件检查是存在性检查，不能宣称扫描了程序全部文件或校验了旧版哈希。
 */
// Electron 会把 app.asar 当虚拟目录；检查磁盘缺件必须绕开该透明挂载。
// original-fs 只用于主进程诊断实物，普通 Node 回归仍走同等文件系统接口。
const fs = process.versions.electron ? require('original-fs').promises : require('node:fs/promises');
const path = require('node:path');
const execFile = require('node:util').promisify(require('node:child_process').execFile);
// 诊断契约只返回状态与可展示原因，不向页面开放注册表句柄。
// fresh 是确认未发现登记，不能用一次查询异常代替这个判断。
// ready 仅表示基本发行文件存在，并不承诺应用内部所有功能正常。
// repair 表示已确认原位置且发现缺件，允许用户选择原位补回。
// blocked 表示无法安全确定目标，重新检测可以恢复但不能强制覆盖。
// HKCU 与 HKLM 同时存在时，不默认选择最近修改或最短的那个路径。
// 32 位和 64 位视图都查询，以兼容旧安装器留下的记录。
// 四处登记是同一产品的不同线索，不是四个用户数据存储位置。
// 安装地址键与 Windows 卸载键可能只剩一个，因此不能只看其中之一。
// 原卸载器被删不会执行失败：诊断只解析它的固定名称作为地址线索。
// 解析卸载命令不等于执行命令，参数中的其他内容不会传给 shell。
// 系统目录验证由服务注入，诊断不建立另一份更宽松的允许列表。
// 原位置断开时，existingParent 应失败，而不是从不存在的盘退回系统盘。
// 路径权限不足和文件缺失是两类问题，只有缺件可以直接补回。
// lstat 检查链接本身，避免沿着 app.asar 链接把别处资源认作安装内容。
// Electron 的虚拟 asar 读取不适合实物检查，所以限定使用 original-fs。
// 普通 Node 校验脚本没有 original-fs，使用等价 promises 接口即可。
// 该分支基于运行时能力，不依赖页面设置或用户可输入的开关。
// 未识别异常统一变成不可访问原因，不向 UI 泄露系统错误堆栈。
// 诊断不检查网络，不需要服务器账户、API key 或 ComfyUI 在线。
// 检测时间主要来自本机注册表与少量文件存在性读取，不哈希大型模型。
// 调用者应在开始安装前再次执行，检测快照不能充当长期写入许可。
/**
 * Windows reg.exe 在中文系统按本机代码页输出，默认 UTF-8 解码会损坏目录。
 * 使用系统 Registry API 读取 Unicode 字符串，再明确用 UTF-8 JSON 返回。
 * 类比快递地址：不能先把中文写错再去找门牌，编码必须从读取端固定。
 * 脚本内容固定，唯一插入值先经过标准 UUID 检查，不接受页面脚本。
 * EncodedCommand 是传输 PowerShell 正文，不执行注册表中的命令或路径。
 * 四个固定视图都读本应用的地址键与卸载键，兼容只剩一个键的残留。
 * DoNotExpandEnvironmentNames 保留原始地址，无法校验的值不能自动猜测。
 * 缺键正常跳过，权限或 API 故障退出二，不能伪装成未安装。
 * 对每个 RegistryKey 使用 finally Dispose，避免句柄在多次检测后累积。
 * OpenBaseKey 不遍历其他软件，不读取模型目录或账户凭据。
 * PowerShell 最长十五秒，检测不能永久锁住向导的按钮。
 * JSON 完整解析失败也会阻断，不从半截输出里猜一个可修复的位置。
 * 注册表只有软件名而没有可确认地址时仍返回记录，供后续说明无法修复。
 * 两个有效地址冲突不覆盖其中一个，而是保留错误让用户确认。
 * 这里只读记录，不执行旧 UninstallString，也不删除损坏登记。
 * @param {string} guid 构建清单中的客户端 UUID。
 */
async function readRecords(guid) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(guid)) throw new Error('安装身份清单无效，请重新获取安装包。');
  const script = `$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$rows=@();try { foreach($h in @('CurrentUser','LocalMachine')) { foreach($v in @('Registry32','Registry64')) {
$base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$h,[Microsoft.Win32.RegistryView]::$v)
try { foreach($sub in @('Software\\${guid}','Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}')) {
$entry=$base.OpenSubKey($sub);if($null -eq $entry){continue};try {
$rows+=@{hive=$h;view=$v;location=$entry.GetValue('InstallLocation','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);command=$entry.GetValue('UninstallString','');display=$entry.GetValue('DisplayName','')}
}finally{$entry.Dispose()} } }finally{$base.Dispose()}
} };ConvertTo-Json -InputObject @($rows) -Compress -Depth 3 }catch{exit 2}`;
  try {
    const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
    return recordsFromValues(JSON.parse(stdout.replace(/^\uFEFF/, '')));
  } catch { throw new Error('无法读取安装记录，请检查系统权限后重新检测。'); }
}
// 系统脚本的输入只有经校验 UUID，因此无法选择其他软件的注册键。
// EncodedCommand 使用 UTF-16LE 是 PowerShell 命令传输规范，不是隐藏授权。
// 注册表值保持 Unicode，中文盘符后目录和空格都能完整返回。
// 输出 UTF-8 的约定两端一致，避免本机默认代码页决定诊断是否准确。
// NoProfile 不加载用户自定义启动脚本，减少检测时的意外副作用。
// NonInteractive 使系统查询不能停在等待用户输入的控制台提示上。
// windowsHide 避免一次重新检测闪出黑色终端窗口。
// timeout 保护界面，系统组件卡住时应报告诊断失败而不是永久等待。
// JSON 数组包装保证零项、一项、多项都采用相同返回形状。
// 解析前只去掉可能的 BOM，不从杂乱输出里用正则猜测注册路径。
// 查询异常统一拒绝，不把空 stdout 当成注册表不存在。
// GetValue 不自动展开环境变量，不能让登记中的特殊变量悄悄改写目标。
// 句柄在嵌套 finally 中释放，某一项读取失败也不会漏掉 base key。
// 仅 OpenSubKey 读取，没有 CreateSubKey 或 DeleteSubKey 修复动作。
// 自动检测不会要求用户执行手写 reg delete 命令。
// 相同 GUID 的多个视图记录全部保留，后续再比较路径是否一致。
// 原记录包含命令仅供服务内部提取地址，页面不会收到整段命令行。
// 模块不持久缓存诊断结果，用户重新接上磁盘后可以立即再检测。
// 只有应用固定 GUID 能进入此读取函数，不允许页面指定任意根键。
// 系统脚本返回失败时，中文提示指向权限和重新检测而非伪称软件不存在。
/**
 * 系统 API 返回逐个键，合并前不把不同地址压成同一个空值。
 * 地址缺失时只认本应用带引号的卸载文件，不执行其中任何参数。
 * 某个键只剩名称时依然构成残留，不能直接走首次安装。
 * 只有三个字段都为空的键视为无有效记录，避免空壳键阻塞新安装。
 * 非字符串值属于无效登记，强制让目录格式校验阻断。
 * 同视图的地址冲突由 inspectRecords 比较全部结果发现。
 * hive 转成内部的 HKCU/HKLM 标记，不让页面决定安装范围。
 * 最终每项只留下范围和地址，原始卸载命令不返回 renderer。
 * @param {Array<object>} values 系统注册表 API 返回的 JSON。
 */
function recordsFromValues(values) {
  if (!Array.isArray(values)) throw new Error('Invalid registry response');
  return values.filter(item => item.location || item.command || item.display).map(item => {
    const derived = typeof item.command === 'string' && item.command.match(/^"(.+\\Uninstall Illusion Realm\.exe)"(?:\s|$)/i)?.[1];
    return { hive: item.hive === 'CurrentUser' ? 'HKCU' : 'HKLM', path: typeof item.location === 'string' && item.location || (derived ? path.win32.dirname(derived) : '') };
  });
}
// 如果安装位置可用，优先采用该字段，不根据软件显示名猜目录。
// 卸载字符串回退只识别带引号且名称固定的 Illusion Realm 卸载器。
// 不识别任意 EXE、批处理文件、协议地址或带前置命令的字符串。
// 只有软件显示名而无地址时保留空路径，随后阻断并解释残留不明确。
// 空壳键完全没有应用信息才忽略，避免无关空项长期挡住首次安装。
// 非字符串地址不被强制 String 化，否则数字或对象可能变成貌似有效目录。
// 每条记录只留 hive/path，避免原生输出在后续日志和 IPC 中扩散。
// CurrentUser 之外的来源按 HKLM 对待，未知范围不能被当成低权限安装。
// 数组结构错误直接拒绝，不能继续以对象属性拼接路径。
// 返回值仍未授权写入，inspectRecords 才负责检查一致性与路径边界。
/**
 * 必要文件缺失可以修，读取被拒绝不能当成文件被删除。
 * lstat 不跟随文件链接，缺件列表也会包含非普通文件的位置。
 * 这里不递归扫描模型、下载缓存或用户作品，因此启动检测不会读大文件。
 * 必要文件清单只用来描述症状，修复仍覆盖发行包中的全部程序文件。
 * 文件存在不代表内容完好，所以完整状态也允许用户主动修复。
 * 底层 I/O 错误交给诊断外层转成可见原因，不写含路径的日志。
 * @param {string} target 经目录安全检查后的已登记位置。
 */
async function missingFiles(target) {
  const missing = [];
  for (const file of ['Illusion Realm.exe', 'resources/app.asar', 'Uninstall Illusion Realm.exe']) {
    try { const stat = await fs.lstat(path.join(target, file)); if (!stat.isFile() || stat.isSymbolicLink()) missing.push(file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; missing.push(file); }
  }
  return missing;
}
/**
 * 多张登记收据必须指向同一处，避免替用户选择其中一份安装。
 * 用户机器上的全用户安装不能由低权限的当前用户向导悄悄接管。
 * 路径合法性与沿途链接检查复用原服务，避免另建一套宽松规则。
 * existingParent 会一直查到盘符：盘不存在时不能误报“文件已删”。
 * 此结果可传回页面作为解释，但真正执行前主进程必须重新诊断。
 * 诊断失败是 blocked 数据，让界面仍能展示原因与重新检测按钮。
 * 没有旧记录就是 fresh，不因为推荐目录存在便宣称属于本应用。
 * ready 表示三项基本文件存在，不表示应用必然能启动或无需修复。
 * repair 表示至少一项缺失，允许原位补回且不先运行旧卸载器。
 * @param {Array<{hive:string,path:string}>} records 本次查询得到的原生记录。
 * @param {{validateSyntax:Function,existingParent:Function}} checks 复用的路径边界。
 */
async function inspectRecords(records, checks) {
  if (!records.length) return { state: 'fresh', path: '', message: '未发现已有安装，可正常安装。' };
  try {
    if (records.some(record => record.hive !== 'HKCU')) throw new Error('检测到全用户安装，请使用管理员维护原版本；本向导不会修改它。');
    const targets = records.map(record => checks.validateSyntax(record.path));
    if (new Set(targets.map(target => target.toLowerCase())).size !== 1) throw new Error('发现多个不同的安装位置，请联系支持确认后再修复。');
    const target = targets[0]; await checks.existingParent(target);
    await fs.access(await checks.existingParent(target));
    const missing = await missingFiles(target);
    return { state: missing.length ? 'repair' : 'ready', path: target, missing, message: missing.length ? `检测到安装残留或文件缺失：${missing.join('、')}。可以一键修复安装。` : '检测到已有安装，可以原位修复程序文件与卸载入口。' };
  } catch (error) {
    return { state: 'blocked', path: '', message: /[\u4e00-\u9fff]/.test(error.message) ? error.message : '原安装位置无法访问，请连接原磁盘并检查目录权限后重新检测。' };
  }
}
// 多地址比较忽略 Windows 大小写，但不删除路径段或更改目录归属。
// 每个地址都先经过 validateSyntax，某个非法项不能被另一个正常项掩盖。
// 必须全部记录指向同处才允许修复，不替用户挑一份“看起来较新”的安装。
// HKLM 安装由管理员维护，当前用户向导不会为绕过错误而删除全用户记录。
// existingParent 检查可访问祖先，已删安装目录可在同盘安全重建。
// fs.access 不能保证后续写入成功，真正执行仍复用服务的权限与空间预检。
// 基本文件存在时也可修复，因为本检查没有读取所有程序文件的内容摘要。
// 缺件列表明确列出发行文件，不混入用户模型和生成作品。
// 基本文件检查仅覆盖程序、资源包和卸载器，不自动恢复被删除的个人作品。
// 返回 blocked 时 path 为空，防止 UI 把未核验目标继续填入安装参数。
// 返回 ready/repair 时保留规范目标，用户不能选择另一处冒充原位修复。
// 原盘不可访问时提示重连磁盘，不能误显示“旧目录已删，可安装到其他盘”。
/**
 * 只把路径检查以参数注入，模块自身不反向 require service 造成循环依赖。
 * Windows 查询失败转为 blocked，与真实无记录的 fresh 状态保持区别。
 * 页面能重试诊断，但不能用选择新空目录绕过不明的旧安装记录。
 * 本模块没有写操作，因此不需要“取消后恢复注册表”的事务补丁。
 * 类比维修前验房：检测只是出检查单，点击确认后才交给安装引擎施工。
 * @param {string} guid 客户端固定身份。
 * @param {object} checks 目录校验函数。
 */
async function diagnose(guid, checks) {
  try { return await inspectRecords(await readRecords(guid), checks); }
  catch (error) { return { state: 'blocked', path: '', message: error.message }; }
}
// 导出的细分函数供隔离回归检查真实登记和文件状态，不对页面开放。
// preload 只转发主进程固定动作，不能让用户指定其他软件的 UUID。
module.exports = { diagnose, inspectRecords, readRecords };
