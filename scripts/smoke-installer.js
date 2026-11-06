/**
 * 安装向导专项：真实本地 HTML、preload、主进程目录校验和法律资源。
 * 不加载 Next out，所以不以 Next 构建指纹判断这个独立页面的新旧。
 * 截图直接取本次源码，安装清单须先由 electron dist 生成。
 * 实际写入由可控 IPC 替身代替，不能把此脚本通过说成真实安装通过。
 * 目录、哈希和错误分支使用真正 fs 与服务函数，不访问账户或模型。
 * 浏览器缓存和测试文件位于本轮临时目录，不触碰用户现有安装。
 * 看门狗与失败退出码沿用公共 harness，失败不能被 app.quit 吞掉。
 */
const fs = require('node:fs/promises'), syncFs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { app, BrowserWindow, ipcMain } = require('electron');
const service = require('../apps/electron/installer/service.cjs'), smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'installer', timeoutMs: 90000 });
const root = syncFs.mkdtempSync(path.join(os.tmpdir(), 'ir-installer-')); let win, releaseInstall, installRequest;
// 使用一次性 UUID 标记模拟旧安装，不触碰正式应用的注册表身份。
// 所有 reg.exe 调用都是固定参数数组，不通过 shell 拼接命令。
// 标记在 finally 清除，断言失败也不留下模拟安装信息。
const execFile = require('node:util').promisify(require('node:child_process').execFile);
/**
 * 自动诊断必须区分无记录与残留记录，不能只按记录存在拒绝。
 * 独立随机 UUID 保证测试键与实际客户端及其他软件不同。
 * 先对不存在的键验证首次安装，再写入残留标记验证明确修复。
 * 标记只写当前用户范围，不要求管理员权限，也不修改机器级状态。
 * 安装路径仅为本轮临时目录的占位，不注册真正的卸载命令。
 * 清理只删除本轮刚创建且已知 GUID 的键，不递归扫描并删除软件项。
 * reg.exe 删除由系统注册表工具执行，不跨 shell 组合文件删除操作。
 * 预检读取 32/64 视图，测试将标记放在真实客户端的 64 位视图。
 * 普通提交仍拒绝覆盖；只有明确的修复请求可以复用已登记目录。
 * 不调用已有卸载器，因此此测试不代表原生卸载行为已经覆盖。
 * finally 在断言后也运行，防止成功样本本身影响下一次测试。
 * 随机键已经存在的概率可忽略，仍不会复用应用固定 GUID。
 * 查询前后都由实际服务处理，避免只测试一个 mock 的布尔值。
 * 删除只针对刚生成的 UUID，不接受来自页面或环境变量的键名。
 * 诊断路径必须与刚写入的临时位置一致，避免只断言状态字符串。
 * 这条回归独立于 NSIS 解压，失败时可以直接定位已有安装检测层。
 * @returns {Promise<void>} 旧安装标记保护的正反例验证结果。
 */
async function registryChecks() {
  const unicodePath = path.join(root, '中文 空间'); await fs.mkdir(unicodePath);
  const key = crypto.randomUUID(), registry = `HKCU\\Software\\${key}`;
  check('no records means fresh installation', (await realDiagnose(key)).state === 'fresh');
  try {
    await execFile('reg.exe', ['add', registry, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', unicodePath, '/f', '/reg:64'], { windowsHide: true });
    const result = await realDiagnose(key);
    check('stale record allows repair at original location', result.state === 'repair' && result.path === unicodePath);
    let rejected = false; try { await realPrepare(unicodePath, 1024, key, false); } catch { rejected = true; }
    check('normal install cannot silently become repair', rejected);
    check('explicit repair preflight accepts registered nonempty directory', (await realPrepare(unicodePath, 1024, key, true)).repair);
  } finally { await execFile('reg.exe', ['delete', registry, '/f', '/reg:64'], { windowsHide: true }); }
}
/**
 * 本测试的落盘只发生在系统临时目录，目录名含随机后缀避免碰撞。
 * 真实客户端的 user/illusion-realm.json 不会被读取或迁移。
 * 模型目录不参与目录容量测试，避免扫描大磁盘耗时与暴露路径。
 * 测试不调用 NSIS，可在已安装正式应用的机器上重复运行。
 * releaseInstall 只控制 IPC 替身，不控制真实安装子进程。
 * 安装器独立窗口加载后才替换写入 handler，保留完整 preload 链路。
 * 计数由 harness 记录，截图文件存在并不代表相应断言通过。
 * 有任意断言失败，后续流程中止而不是继续收集一组成功截图。
 */
/**
 * 浏览器 userData 在主进程启动前隔离，单实例锁不会锁住真实客户端。
 * GPU 禁用只用于稳定截图，产品安装器不因此改变用户 GPU 配置。
 * 被测独立主进程负责真实窗口、导航限制和 IPC 来源校验。
 * 测试移除其自动退出监听，收尾交给 harness 统一判读退出码。
 * 不全局杀 Electron，也不停止用户正在使用的应用或下载进程。
 */
app.setPath('userData', path.join(root, 'browser')); app.disableHardwareAcceleration(); smoke.setWorkDir(root); smoke.installWatchdog(app);
const realDiagnose = service.diagnoseInstallation, realPrepare = service.prepareTarget;
let uiDiagnosis = { state: 'fresh', path: '', message: '未发现已有安装，可正常安装。' };
service.diagnoseInstallation = async () => uiDiagnosis;
service.prepareTarget = (input, bytes, _key, repair) => service.inspectTarget(input, bytes, repair && input === uiDiagnosis.path);
require('../apps/electron/installer/main.cjs'); app.removeAllListeners('window-all-closed');
/**
 * check 失败立即停止后续交互，同时把失败登记到统一护栏。
 * 有界轮询在主进程计时，不等待页面 rAF 或 CSS 动画完成。
 * 轮询失败携带步骤名，避免只得到笼统的外部看门狗超时。
 * executeJavaScript 只运行固定测试表达式，不拼入用户提供的输入。
 * @param {string} label 当前断言的可读含义。
 * @param {boolean} ok 观察到的真实结果。
 */
function check(label, ok) { smoke.check(label, ok); if (!ok) throw new Error(label); }
/**
 * 等待主进程建立窗口或页面状态变化，有明确的十秒上限。
 * hidden 窗口与 foreground 窗口使用同一轮询，避免环境遮挡造成假超时。
 * 异常直接向调用者传播，不用空 catch 把错误当成未就绪。
 * @param {Function} predicate 主进程或页面的状态读取函数。
 * @returns {Promise<void>} 满足条件或明确失败。
 */
async function until(predicate) { for (let i = 0; i < 200; i += 1) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('Installer state wait timed out'); }
/**
 * 格式负向样本覆盖 UNC、根目录、设备名、混合斜杠与引号。
 * 这些路径只走纯格式函数，不创建目录或尝试权限提升。
 * 正向样本包含中文与空格，避免为了安全误禁正常本地用户路径。
 * 文件系统样本创建在临时根下，统计容量来自实际目标磁盘。
 * 非空目录必须拒绝，里面的标记文件应仍存在，不能预检时清空。
 * 模型流式哈希与安装引擎共用机制，但本测试只用小文件夹具。
 * 错误摘要必须可区分成功与失败，不验证未签名程序的发布者身份。
 * 缺少用户同意在创建子进程前拒绝，fixture EXE 根本不会运行。
 */
async function serviceChecks() {
  // 根目录负例确保用户不能把卸载器安装到整个盘符的作用范围。
  // UNC 负例确保网络共享不冒充具有本地容量与权限语义的目录。
  // Windows 树负例确保低权限向导不需要悄悄升级为管理员。
  // 点段和混合分隔符负例覆盖路径规范化前后的歧义。
  // 设备名负例覆盖 Win32 非普通目录，不能只检查路径是否绝对。
  // 双引号负例保护 NSIS /D 的尾部命令行边界。
  // 中文与空格正例防止把“只允许 ASCII”误当作安全路径规则。
  // Empty 目录由测试新建，里面没有用户作品或已有程序。
  // 容量断言只要求实际可用空间超过小测试要求，不断言机器固定数值。
  // 写入 keep.txt 后再次检查，验证预检不会为了安装清理已有文件。
  // 原样读取 keep.txt 是数据保留证据，不只相信 readdir 抛过错误。
  // 正确摘要样本验证哈希函数真正接受已知字节，不是恒拒绝实现。
  // 错误摘要与正确摘要配对，防止校验函数变成始终返回成功。
  // consent:false 使用不存在的 EXE 路径，验证拒绝发生在进程启动前。
  // 函数异常被逐项捕获后登记成断言，不把预期拒绝当作整个脚本崩溃。
  for (const input of ['C:\\', '\\\\server\\app', 'C:\\Windows\\App', 'C:\\apps\\..\\app', 'C:\\apps/../Windows', 'C:\\apps\\con', 'C:\\apps\\bad"dir']) { let rejected = false; try { service.validateSyntax(input); } catch { rejected = true; } check(`reject unsafe path ${input.startsWith('C:') ? input.slice(3) : 'UNC'}`, rejected); }
  check('Unicode and spaced local path accepted', service.validateSyntax('D:\\Apps\\幻境 工具') === 'D:\\Apps\\幻境 工具');
  const empty = path.join(root, 'Empty 应用'); await fs.mkdir(empty); const inspected = await service.inspectTarget(empty, 1024); check('real disk capacity exceeds required bytes', inspected.freeBytes > inspected.requiredBytes);
  const marker = path.join(empty, 'keep.txt'); await fs.writeFile(marker, 'keep'); let rejected = false;
  try { await service.inspectTarget(empty, 1024); } catch { rejected = true; } check('nonempty folder rejected without removing data', rejected && await fs.readFile(marker, 'utf8') === 'keep');
  const hash = crypto.createHash('sha256').update('keep').digest('hex'); await service.verifyEngine(marker, hash); check('streaming hash accepts correct content', true);
  try { await service.verifyEngine(marker, '0'.repeat(64)); rejected = false; } catch { rejected = true; } check('modified engine is rejected', rejected);
  try { service.runEngine('missing.exe', { path: empty, consent: false, desktop: true, startMenu: true }); rejected = false; } catch { rejected = true; } check('consent rejected before process creation', rejected);
}
/**
 * 此处替换仅两个写入入口，读取许可、路径预检和窗口安全仍走正式实现。
 * 可控 Promise 让测试观察等待页并验证重复点击没有第二个提交。
 * finish 替身记录启动选择，不打开用户应用、不发起生成请求。
 * 替身通过 success/data 表达真实 IPC 契约，失败场景同样提供 success:false。
 * 开始安装参数被记录用于断言，而不是直接调用页面函数来替代按钮交互。
 */
function installFixture() {
  // 替身只在当前测试进程注册，不会修改已运行应用的 IPC handlers。
  // 保留 info 的真实法律正文，不能用一行“同意条款”假装覆盖许可。
  // 保留 validate 的真实文件系统，不能用固定空间数字伪装 OS 检查。
  // 安装 Promise 不自动完成，等待页截图确实在异步结果返回之前。
  // finish 不开新客户端，避免测试退出时留下真实应用孤儿进程。
  // 成功和失败都使用生产返回形状，避免只测到错误的兼容分支。
  ipcMain.removeHandler(service.CHANNELS.install); ipcMain.removeHandler(service.CHANNELS.finish);
  ipcMain.handle(service.CHANNELS.install, (_event, options) => { installRequest = options; return new Promise(resolve => { releaseInstall = resolve; }); });
  ipcMain.handle(service.CHANNELS.finish, (_event, launch) => ({ success: true, data: launch }));
}
/**
 * 所有六步通过真实按钮前进，不使用设计原型的 jump 或直接改变 page。
 * 首先验证许可未勾选无法继续，再输入不可用目录观察原生预检错误。
 * 失败后更换空目录应恢复，确认摘要必须与实际提交路径一致。
 * 关闭两个快捷方式验证“不创建”的显示与底层布尔参数保持一致。
 * 待安装时进度条没有 aria-valuenow，不能伪称获得真实百分比。
 * 多次点击被禁用的主按钮不产生第二个安装请求。
 * 失败替身回目录页后再次使用新空目录，避免假设引擎已回滚原目录。
 * 成功替身只证明完成页状态转换，真实 NSIS 安装需另外验证。
 * @param {Function} run 已绑定当前页面的 executeJavaScript。
 */
async function flowChecks(run) {
  // 点击的是页面里的 next 按钮，不直接调用 renderer.next 绕过禁用属性。
  // terms 阶段 disabled 必须由 DOM 状态反映，而不只验证 page 变量。
  // LICENSE 标识证明当前许可全文已接入，设计占位应完全移除。
  // 非法目标提交后仍停留设置页，不能只显示错误却继续到确认。
  // 中文带空格的目标对安装参数和摘要都应逐字保留。
  // 两个快捷方式都关闭是合法选择，不能默认至少创建一个。
  // 下层提交必须带 consent:true，不能用任何 truthy 字符串替代。
  // 进度无 aria-valuenow 是未知比例的语义，不应标成 0 或 100。
  // 失败替身用于验证状态机恢复，不代表真的复现某种磁盘故障。
  // 重新提交使用仍为空的夹具目录，因为替身没有产生残留文件。
  // 第二次成功才能显示完成，不因第一次请求已经发出就提前祝贺。
  // completePath 来自成功返回，断言它与本轮目标相同。
  // 此处未点完成启动真实程序，产品启动需打包实测单独记录。
  // 每个截图等待界面提交一小段主进程时间，避免 capturePage 取到旧帧。
  // 等待不依赖 requestAnimationFrame，不会因隐藏或遮挡无限挂起。
  await run("document.getElementById('next').click()"); check('terms require explicit consent', await run("document.getElementById('next').disabled"));
  check('full license is present without design placeholders', await run("document.getElementById('legal').textContent.includes('LicenseRef-Illusion-Realm-NC-NM-1.0') && !document.getElementById('legal').textContent.includes('内容占位预览')"));
  await shot('terms'); await run("document.getElementById('consent').click();document.getElementById('next').click();document.getElementById('installPath').value='C:\\\\Windows\\\\App';document.getElementById('next').click()");
  await until(() => run("!document.getElementById('pathError').hidden")); check('invalid target stays on settings with error', await run("!document.querySelector('[data-page=\"2\"]').hidden"));
  const target = path.join(root, '安装 空间'); await fs.mkdir(target);
  await run(`document.getElementById('installPath').value=${JSON.stringify(target)};document.getElementById('desktop').checked=false;document.getElementById('startMenu').checked=false;document.getElementById('next').click()`);
  await until(() => run("!document.querySelector('[data-page=\"3\"]').hidden")); check('confirmation reflects real path and disabled shortcuts', await run(`document.getElementById('summaryPath').textContent===${JSON.stringify(target)} && document.getElementById('summaryShortcuts').textContent==='不创建'`)); await shot('confirm');
  await run("document.getElementById('next').click()"); await until(() => Boolean(installRequest)); check('submitted actual consent and both shortcut flags', installRequest.consent === true && !installRequest.desktop && !installRequest.startMenu);
  check('installation waits with indeterminate progress', await run("!document.querySelector('[data-page=\"4\"]').hidden && !document.querySelector('[role=progressbar]').hasAttribute('aria-valuenow')")); await shot('installing');
  releaseInstall({ success: false, error: '测试写入失败，请更换目录。' }); await until(() => run("!document.querySelector('[data-page=\"2\"]').hidden")); check('failure is not shown as completed', await run("document.getElementById('pathError').textContent.includes('测试写入失败')"));
  installRequest = null; await run("document.getElementById('next').click()"); await until(() => run("!document.querySelector('[data-page=\"3\"]').hidden")); await run("document.getElementById('next').click()"); await until(() => Boolean(installRequest)); releaseInstall({ success: true, data: { path: target, rebootRequired: false } });
  await until(() => run("!document.querySelector('[data-page=\"5\"]').hidden")); check('completion appears only after successful result', await run(`document.getElementById('completePath').textContent===${JSON.stringify(target)}`)); await shot('complete');
}
/**
 * 这里验证自动检测和修复按钮确实驱动正式 renderer，而非只存在于 HTML。
 * 诊断读取替身仅限测试进程，真实注册表检查在 registryChecks 单独覆盖。
 * 写入入口仍用原有可控 Promise，不能把界面成功当成原生修复成功。
 * 原位置是本轮临时目录，里面的 keep 文件用于证明预检不会清空目录。
 * 占用和断盘情形以 blocked 状态显示，禁止下一步绕过诊断。
 * 点击修复需要已有条款同意，复用第一次流程中的授权状态。
 * 修复提交必须带 repair:true，不能只改变按钮上的文字。
 * 回归截图展示实际页面，路径不包含真实用户模型或凭据。
 * 失败后返回设置，重新检测恢复到可操作状态，不留下禁用死锁。
 * 夹具不会启动程序或生成 Windows 卸载记录。
 */
async function repairFlowChecks(run) {
  const target = path.join(root, 'Repair 应用'); await fs.mkdir(target); await fs.writeFile(path.join(target, 'keep.txt'), 'keep');
  uiDiagnosis = { state: 'repair', path: target, message: '检测到安装残留：主程序与卸载器缺失。可以一键修复安装。' };
  await run('page=2;render();document.getElementById("rescan").click()');
  await until(() => run('!pending && !document.getElementById("repair").disabled'));
  check('repair locks original location', await run('document.getElementById("installPath").readOnly && document.getElementById("browse").disabled'));
  await shot('repair-detected'); await run('document.getElementById("repair").click()');
  await until(() => run('page===3 && !pending'));
  check('repair action requires final confirmation', await run('document.getElementById("next").textContent.includes("一键修复")'));
  installRequest = null; await run('document.getElementById("next").click()'); await until(() => Boolean(installRequest));
  check('repair uses original target and explicit flag', installRequest.repair === true && installRequest.path === target);
  releaseInstall({ success: false, error: '测试安装失败，请重新检测。' }); await until(() => run('page===2 && !pending'));
  check('preflight preserves existing user files', await fs.readFile(path.join(target, 'keep.txt'), 'utf8') === 'keep');
  uiDiagnosis = { state: 'blocked', path: '', message: '原安装磁盘不可访问，请连接磁盘后重新检测。' };
  await run('document.getElementById("rescan").click()'); await until(() => run('!pending'));
  check('inaccessible installation cannot continue or repair', await run('document.getElementById("next").disabled && document.getElementById("repair").disabled'));
  await shot('repair-blocked');
}
// 本组前提是第一次许可流程已确认，修复没有单独绕过 consent 的通道。
// 目标目录在本轮 root 下创建，里面只包含测试自己的 keep.txt。
// uiDiagnosis 注入 repair 让正式 renderer 呈现确定的缺件状态。
// 这份注入不能证明 Windows 注册表读取正确，所以 registryChecks 另行执行。
// page/render 的测试切换只用于重返设置页，不直接调用 chooseRepair。
// 真正修复由 repair 按钮触发，确保界面事件已经绑定到正确流程。
// 先等待 pending 结束再读取 disabled，避免把请求中禁用当成最终不可用。
// 原位置锁定同时检查 readOnly 和 browse disabled，堵住两种改路径入口。
// reset 的锁定由同一渲染状态控制，正式目录预检仍会再次比对位置。
// capturePage 在缺件检测完成后执行，运行图不是硬编码的设计截图。
// 点击修复后先等待确认页，不能直接从设置页跳到成功完成。
// 确认按钮包含一键修复文案，用户知道即将执行覆盖补件而非首次安装。
// 安装请求记录下来后，repair 必须是布尔 true，不能只是 truthy 字符串。
// path 必须逐字等于诊断原位置，不能被默认推荐地址替换。
// 模拟失败通过生产 success:false 形状返回，覆盖真正 renderer 的错误恢复。
// 错误返回后等待 page=2 且 pending=false，两个条件缺一不可。
// 仅页码恢复但 pending 仍为 true 会把用户困在无法再次检测的设置页。
// keep.txt 逐字为 keep，说明预检没有把原非空目录清空作为安装准备。
// 这项只证明预检不写，原生安装不删文件由独立 NSIS 测试证明。
// 随后 blocked 模拟原安装盘不可访问，不用删除用户真实盘符制造故障。
// blocked 的 path 为空，页面不能继续提交旧 checkedPath。
// next 和 repair 都应 disabled，防止用户绕开危险状态走普通安装。
// 重新检测仍可用，用户修复环境后无需重新下载或重开 Setup。
// blocked 截图保留原因文本，可以核对不是一个无法解释的灰色按钮。
// 测试不点击系统目录选择对话框，以免操控用户桌面或产生新目录。
// 模拟写入不会生成卸载键，所以实际注册残留用随机 GUID 夹具单独测试。
// 这项分层避免界面测试因本机是否已装产品而时好时坏。
// 测试不启动真实客户端，也不会停止用户当前下载、生成或 Agent 会话。
// 失败时 check 抛错，后续窄屏截图不能覆盖已经登记的失败结果。
// 当前主窗口仅属于测试，结束 destroy 不枚举关闭其他 Electron。
// 修复操作的实际进度未知，界面仍采用不定进度而非虚构百分比。
// 失败不会显示“已回滚”，因为替身和真实引擎都没有完整事务回滚承诺。
// 安装前后注册读取同样重要，最终 ready 必须由实际主进程验证。
// 此 UI 组没有检查所有程序文件哈希，不能把它叫作全面完整性扫描。
// ready 状态的主动修复和缺件状态使用同一按钮，不另建维护模式窗口。
// 法律文本保留真实随包内容，但测试通过不构成法律审查结论。
// 空白错误区不能被当作成功，页面阶段与请求参数都有明确断言。
// 快捷方式选项沿用前面流程的用户选择，不因修复自动全部重新勾选。
// 不自动删除 AppData 中的任何产品目录，缓存治理不属于这份修复测试。
// 若安装器未来增加迁移功能，应另有明确请求和保留数据的验收步骤。
// 执行强制修复不意味着强制结束进程，占用时应正常提示关闭客户端。
// 原盘重新挂载的真正设备行为未在这里模拟，blocked 只验证界面处理。
// 中文路径已由 registryChecks 和服务正例配对覆盖，不能以 ASCII 路径截图代替。
// 一个残留记录既无地址也无卸载命令时应该 blocked，而非选择任意新目录。
// 检测错误和安装错误分别发生在不同阶段，界面应保留相应操作上下文。
// 诊断是只读的，重复检测不应留下额外软件卸载条目。
// 安装写入只有最终确认才开始，测试明确观察该阶段边界。
// 提供修复入口后仍保留取消和最小化，不把用户锁进无法离开的自动流程。
// 真正写入中禁止关闭的产品边界不通过模拟成功来绕过。
// 本组截图和断言都不依赖外部网络，适合离线安装包的目标场景。
// 终端输出里的临时目录只用于本地开发诊断，不返回给产品用户。
// 临时路径含中文空格是特意的编码反例，不能为让测试通过改成全英文路径。
// 如果 UI 日后更改标签，测试应改稳定钩子而非依赖布局中的第几个按钮。
// 现有固定 id 在独立安装窗口唯一，不与客户端页面中的同名元素混用。
// 安装器和客户端的 userData 临时路径分离，不争抢用户实例锁。
// 回归的成功范围是向导交互与预检，真实包释放由另外的原生用例补证。
/**
 * 截图只包含本轮临时路径和测试内容，输出放临时目录不加入仓库。
 * 字体与本地图片加载完成后才截图，避免把未解码插画误判为布局缺失。
 * 使用真实 capturePage 输出，不用手绘图来代替程序运行结果。
 * @param {string} name 不带路径的固定截图名。
 */
async function shot(name) { await new Promise(resolve => setTimeout(resolve, 150)); await fs.writeFile(path.join(root, `${name}.png`), (await win.webContents.capturePage()).toPNG()); }
/**
 * 先跑无 UI 的真实安全边界，再进入独立窗口执行用户流程。
 * 初始页面使用正式 preload，因此 Node 隔离与桥接都被覆盖。
 * 桌面和窄窗口各检查是否横向溢出，以及主按钮是否在窗口范围内。
 * 浏览选择器不做自动点击，避免操作用户桌面；手工验收另列此项。
 * 窗口销毁不发起真实取消对话框，所有测试退出均交公共 harness。
 * 任意异常仍产生非零退出码，不能因未完成流程而静默通过。
 * 本专项不启动第三方服务、不调用模型、不消耗 API 额度。
 * 测试结果不会被描述为完整目标机兼容性或法律效力审查。
 */
async function main() {
  // ready 之前的窗口等待由有界 until 覆盖，主进程启动失败会明确红灯。
  // 等 version 出现说明 preload、info 和 renderer 初始化都已成功。
  // 检查 require/process 都未暴露，不能仅检查 nodeIntegration 配置对象。
  // 图片 decode 对本地角色插画执行，防止截图时仍处于加载空白。
  // 先完整走桌面流程，再缩到 640px 覆盖隐藏插画的 CSS 分支。
  // footer 边界检查防止窄窗口下完成按钮在可视区外。
  // 横向溢出检查包含完整文档，不只看某一张摘要卡的宽度。
  // 测试结尾 destroy 只销毁被测窗口，不枚举并关闭用户其他窗口。
  // harness.finish 汇总失败退出码，不在异常路径自行 app.quit。
  // 输出目录打印到测试控制台便于审图，它不写入产品日志。
  // 截图全部使用测试夹具目录名，不含真实账户资料或密钥。
  // 与外部 API 无关，因此通过不表示模型服务、网络或登录功能正常。
  await app.whenReady(); await serviceChecks(); await registryChecks(); await until(() => Boolean(BrowserWindow.getAllWindows()[0])); win = BrowserWindow.getAllWindows()[0];
  const run = source => win.webContents.executeJavaScript(source); await until(() => run("document.getElementById('version').textContent.startsWith('v')"));
  await run('document.fonts.ready;Promise.all([...document.images].map(image=>image.decode()))'); installFixture();
  check('renderer cannot access Node', await run("typeof require==='undefined' && typeof process==='undefined'")); await shot('welcome');
  await flowChecks(run); await repairFlowChecks(run); win.setSize(640, 660); await new Promise(resolve => setTimeout(resolve, 150));
  check('narrow layout has no horizontal overflow', await run('document.documentElement.scrollWidth<=innerWidth')); check('narrow footer stays in window', await run("document.getElementById('next').getBoundingClientRect().bottom<=innerHeight")); await shot('narrow');
  console.log('Installer screenshots:', root); win.destroy(); smoke.finish({ app, ok: true });
}
main().catch(error => { if (win) win.destroy(); smoke.finish({ app, ok: false, error }); });
