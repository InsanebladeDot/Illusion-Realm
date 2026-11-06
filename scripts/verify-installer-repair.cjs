/**
 * 原生安装回归：真正执行小型 NSIS 安装包，不安装正式客户端。
 * 随机 appId 派生独立 GUID，不碰 Illusion Realm 的真实卸载记录。
 * 类比用模型房验收施工：同一工序与引擎，里面只有测试砖块。
 * 假 EXE 仅用于验证文件释放，绝不作为程序启动。
 * UI 冒烟只能证明按钮，故另用此脚本证明“不先卸载”的原生行为。
 * 临时安装目录内放配置、队列与作品标记，再逐字核对修复后的内容。
 * 不下载模型、不运行 Agent，也不读写用户账户与真实 AppData。
 * 测试所需缓存与快捷方式采用随机名称，清理范围可以明确限定。
 */
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const execFile = require('node:util').promisify(require('node:child_process').execFile);
const electronRequire = require('node:module').createRequire(path.resolve(__dirname, '../apps/electron/package.json'));
const { build, Platform, Arch } = electronRequire('electron-builder');
const { prepareRepairEngine } = require('../apps/electron/scripts/prepare-repair-engine.cjs');
const { runEngine } = require('../apps/electron/installer/service.cjs');
const builderRequire = require('node:module').createRequire(electronRequire.resolve('electron-builder'));
const { UUID } = builderRequire('builder-util-runtime');
/**
 * 只执行明确的本轮构建结果，禁止从 release 随便挑一个旧 EXE。
 * 真实 engine 的退出码和用户同意校验复用生产服务。
 * 修复标志进入同一个 /Repair 开关，不能用模拟复制证明原生行为。
 * 桌面和开始菜单选项关闭，测试不得占用正式产品快捷方式。
 * 目录包含中文空格，覆盖 Windows 原生命令行路径传递。
 * 子进程运行失败直接抛出，不能靠后面的 stat 把失败误判为通过。
 * @param {object} fixture 隔离安装身份与路径。
 * @param {boolean} repair 是否走原位修复分支。
 */
const install = (fixture, repair) => runEngine(fixture.engine, { path: fixture.target, consent: true, desktop: false, startMenu: false, repair });
/**
 * 使用 prepackaged 测试目录，只装几个字节，不再压缩整份 AI 客户端。
 * 原生模板与正式 dist 同源，任何模板锚点变化都会中止这次构建。
 * 客户端同名注册身份不参与测试，随机 GUID 是第一道隔离边界。
 * productName 也随机，防止快捷方式和安装器缓存与正式产品冲突。
 * 测试 appId/name 均用小写，遵守 builder 及 Windows 缓存命名规则。
 * 文件名使用 builder productName 规则，假程序仅以普通文本形式保存。
 * npmRebuild 关闭，因为夹具没有依赖；不影响正式构建的打包钩子。
 * 当前 Electron 版本只用于构建元数据，实际夹具没有 Electron 运行时。
 * 压缩选择 store，测试的是行为而非压缩算法或最终包大小。
 * 始终 publish:never，随机测试产物不会进入版本发布。
 * 生成的卸载器仍是真正的 NSIS 程序，最后会校验可以执行卸载。
 * 构建失败保留临时文件用于诊断，不递归删除未知根目录。
 */
async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ir-native-repair-'));
  const name = `ir-repair-${crypto.randomBytes(6).toString('hex')}`, appId = `test.${name}`;
  const app = path.join(root, 'app'), productName = name;
  await fs.mkdir(path.join(app, 'resources'), { recursive: true });
  await fs.writeFile(path.join(app, `${name}.exe`), 'fixture program');
  await fs.writeFile(path.join(app, 'resources/app.asar'), 'fixture resources');
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name, version: '1.0.0', description: 'Isolated native repair test', author: 'test' }));
  const script = await prepareRepairEngine(path.join(root, 'engine.nsi'));
  const artifacts = await build({ projectDir: root, prepackaged: app, targets: Platform.WINDOWS.createTarget('nsis', Arch.x64), publish: 'never', config: {
    appId, productName, electronVersion: electronRequire('electron/package.json').version, npmRebuild: false, compression: 'store',
    directories: { output: path.join(root, 'release') }, win: { signAndEditExecutable: false },
    nsis: { script, include: path.resolve(__dirname, '../apps/electron/installer/engine.nsh'), oneClick: true, perMachine: false, runAfterFinish: false, deleteAppDataOnUninstall: false, differentialPackage: false, artifactName: 'fixture.exe' },
  } });
  const guid = UUID.v5(appId, UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3'));
  return { root, name, guid, engine: artifacts.find(file => file.endsWith('.exe')), target: path.join(root, '安装 空间'), uninstaller: `Uninstall ${name}.exe` };
}
// 夹具身份的反证：不得把正式 appId 改几个文件名后继续用其 GUID。
// UUID 采用与 builder 相同的 namespace 派生，卸载键才对应本次随机包。
// name 随机但格式受控，不能由用户输入拼出其他软件的缓存名。
// root 是 mkdtemp 返回的绝对目录，不使用当前工作目录作为安装目标。
// app 子目录只包含假主程序和假资源包，测试不会运行客户端逻辑。
// productName 与 exe 名字一致，保证 NSIS 能正确释放并登记假应用。
// 假主程序是文本，不是一个会在用户机器上执行的测试服务。
// prepackaged 跳过整份 Electron 文件复制，大幅缩小行为测试耗时。
// 这不会跳过 NSIS 的注册、覆盖与卸载流程，它们仍由实际引擎执行。
// compression store 不验证压缩率，避免把包大小波动混成修复逻辑回归。
// differentialPackage 关闭，测试不需要生成与修复无关的更新差分资源。
// runAfterFinish 关闭，首次安装也不能自动启动假程序。
// perMachine 为 false，随机记录限定在当前用户范围。
// include 指向正式 engine.nsh，修复标记和快捷方式处理不会另写测试版本。
// prepareRepairEngine 同样读取本机已安装 builder 模板，锚点失败会阻断测试。
// script 使用这次生成的绝对地址，不扫描 release 挑选历史文件。
// win.signAndEditExecutable 关闭只适用于文本夹具，不代表正式包签名已验证。
// 不申请证书、不上传公证，也不访问发布服务。
// publish never 确保测试身份不会变成用户可见的正式版本。
// artifactName 固定 fixture.exe，结果从本次 builder 返回列表取得。
// 结果缺少 exe 会让后续启动失败，不静默使用旧包继续跑。
// 中文 target 同时含空格，覆盖 /D 末尾参数传递的重要路径场景。
// target 是 root 的直接子目录，后续递归清理会复核这一关系。
// 卸载器名称由随机 productName 得出，不与真实产品卸载器重名。
// 测试会执行这个卸载器，故不能仅把一个空文件当成生成成功。
// 当前平台不是 Windows 时 main 返回缺前提，不试图在其他系统模拟注册表。
// 构建工具失败应抛出原错误，不能把未产出引擎归为测试通过。
// 保留临时 build 目录便于检查 NSIS 文本，不覆盖正式发布 staging。
// app.asar 的文本只证明文件覆盖，不能证明真实资源包可以被 Electron 挂载。
// 因此客户端启动与页面行为另由真正 Electron 冒烟承担。
/**
 * 保存的三个标记分别代表用户配置、未完成下载状态与已生成作品。
 * 包内完全不含 user、models 或 outputs，因此原位解压不应触碰它们。
 * 在应用目录内放标记是故意的强回归：即使放在这里也不能先卸载。
 * 配置标记中的文本无真实密钥，不会在失败日志中泄漏用户数据。
 * 返回相对文件表供后续逐字读取，不只断言目录是否还存在。
 * UTF-8 中文用于发现代码页或文件复制导致的数据变化。
 * 创建目录只在本轮隔离根中进行，不修改开发者现有 user 文件夹。
 * @param {object} fixture 本轮测试上下文。
 */
async function seedPersonalFiles(fixture) {
  const files = { 'user/illusion-realm.json': '{"settings":{"locale":"zh-CN"}}', 'downloads/queue.json': '{"pending":["未完成"]}', 'outputs/keep.png': 'artwork bytes', 'models/keep.safetensors': 'model bytes' };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(fixture.target, name);
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content);
  }
  return files;
}
// user/illusion-realm.json 代表安装目录内的单文件配置，而非测试真实账户。
// downloads/queue.json 代表关闭客户端后仍应保留的未完成任务信息。
// outputs/keep.png 仅是字节标记，不拿扩展名宣称它是可解码图片。
// models/keep.safetensors 同样是标记，不加载也不校验真实模型格式。
// 四个相对路径都由源码固定，测试参数不能指向安装根以外。
// mkdir recursive 只创建这些已知标记的父目录，不扫描其他磁盘。
// 每个 content 各不相同，避免一个文件复制到四处也能误通过。
// 配置和队列带中文，逐字比较可以暴露编码或错误覆盖。
// 返回对象保存的是期望原文，不从修复后的文件重新计算预期。
// 所有标记都不在发行夹具里，所以原位解压没有理由覆盖它们。
// 如果任何标记丢失，说明某处仍然执行了旧卸载或递归清理。
// 文件都写在 fake 客户端安装目录里，测试比只保留外部 AppData 更严格。
// 测试不生成访问令牌、API key、聊天记录或真实下载链接。
// 日志不打印四个文件内容，失败时只有断言信息与隔离路径。
// seed 只在首次正常安装后执行，避免拿预先存在的非空目录绕过首次校验。
// 首次包确实成功释放后，才有资格进行“修复保留用户文件”的对照。
// keep 文件在故障模拟前存在，修复后不是由测试重新创建再假称保留。
// 这项顺序防止出现实现先删掉所有内容、测试又自动补回的恒真验证。
// 标记表是后续逐项读取依据，不仅检查父目录还在。
// 新增任何个人文件类别时需明确它是否受原位解压保护，不猜测自动迁移。
/**
 * 先确认首次安装能产出程序与卸载器，避免只验证已有坏目录的特殊分支。
 * 删除主程序与卸载器后保留注册标记，模拟用户手动删除部分文件。
 * 修复后必须同时补回它们，且每个个人文件内容都原样保留。
 * 再删除整份隔离应用目录，模拟用户已经把程序文件夹整个删掉。
 * 完整目录删除仅发生在经 mkdtemp 生成的 root 内，不接收外部路径。
 * 最后再修一次，验证有登记、无目录的情况能够直接重建。
 * 原生修复写的卸载入口必须指向新卸载器，不能只补一个 EXE。
 * 每次安装等待子进程真实退出，不使用固定延时猜测文件已经写完。
 * 此测试不执行假客户端，因此没有“启动成功”结论。
 * app.asar 标记只证明资源文件释放，不证明客户端资源包可以加载。
 * 正式安装器的 UI 流程由 smoke-installer 单独验证。
 */
async function verifyRepair(fixture) {
  await install(fixture, false);
  const personal = await seedPersonalFiles(fixture), exe = path.join(fixture.target, `${fixture.name}.exe`);
  const uninstaller = path.join(fixture.target, fixture.uninstaller);
  await fs.unlink(exe); await fs.unlink(uninstaller);
  await install(fixture, true);
  assert.equal(await fs.readFile(exe, 'utf8'), 'fixture program');
  assert.ok((await fs.stat(uninstaller)).isFile());
  for (const [name, content] of Object.entries(personal)) assert.equal(await fs.readFile(path.join(fixture.target, name), 'utf8'), content);
  const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${fixture.guid}`;
  const { stdout } = await execFile('reg.exe', ['query', key, '/v', 'UninstallString', '/reg:64'], { windowsHide: true });
  assert.ok(stdout.includes(fixture.uninstaller));
  assert.equal(path.dirname(fixture.target), fixture.root);
  await fs.rm(fixture.target, { recursive: true });
  await install(fixture, true);
  assert.ok((await fs.stat(exe)).isFile()); assert.ok((await fs.stat(uninstaller)).isFile());
  await install(fixture, true);
  await execFile(uninstaller, ['/S', `_?=${fixture.target}`], { windowsHide: true, timeout: 30000 });
  console.log('PASS native repair: missing files, missing folder, intact repair, personal files preserved, real uninstaller');
}
// 场景一先走非 Repair 首次安装，确认标准路径没有被修复改造破坏。
// 然后故意删除 exe 和卸载器，保留 registry，复现用户手工删文件的现象。
// app.asar 留着，避免只测整目录丢失而漏掉部分损坏的常见情况。
// 第二次 install 必须显式 repair，不能靠目录非空自动识别来绕过 UI 契约。
// 修复后的 exe 内容必须等于发行夹具，不能只是存在一个空壳。
// 卸载器必须是普通文件，目录同名或链接同名不能算补回成功。
// 四个个人标记按原文逐项读取，任何覆盖和删除都应立刻失败。
// 注册检查读取真实 Windows 卸载键，不检查测试自己造的 JSON 记录。
// UninstallString 应包含本次随机卸载器名，证明入口不是旧残留。
// 查注册键只对随机 GUID 执行，不读取正式客户端的安装地址。
// 中文路径输出可能采用本机代码页，因此这里只比较随机 ASCII 名称。
// 产品 Unicode 诊断由另一个使用 Registry API 的用例单独覆盖。
// 场景二在确认 target 直属 root 后删除整个 fake 安装目录。
// 这一步模拟用户把程序文件夹整体移除，登记仍留在系统的情况。
// 被删掉的个人标记不会被恢复，测试也不对此作出虚假承诺。
// 第三次 repair 应重新创建主程序和卸载器，不能再被已有登记永久挡住。
// 再修一次完整目录，确认完整性检测不会禁止用户主动补回其他发行资源。
// 场景三执行真实卸载器，确保 WriteUninstaller 生成的内容可以运行。
// _? 参数固定指向本次 target，避免卸载器猜测目录或执行正式产品清理。
// 卸载子进程有三十秒上限，不能以后台一直运行当作成功。
// 这份夹具没有真正用户数据，卸载验证不用于评估所有版本迁移场景。
// 子进程非零会拒绝 Promise，后续 PASS 文案不会被执行。
// PASS 打印位于全部断言之后，不先输出成功再尝试关键删除场景。
// 修复安装不重启操作系统，3010 在服务中只作为待重启结果处理。
// 本测试没有制造被占用的客户端，正常关闭提示由界面与服务检查覆盖。
// 真正安全软件拦截、磁盘断开和权限拒绝仍需要目标环境人工验收。
// 假资源包不能用于客户端启动，所以不把这组称作完整安装运行测试。
// 真实 Setup 的打包成功另行核对，不以小型夹具的体积代替正式安装包。
// 配置保留结论仅针对原位修复，不代表能找回用户已经手动删除的作品。
// 若模板升级重新引入卸载调用，个人标记对照应直接暴露回归。
/**
 * 清理只接触随机 GUID 的两处登记，不扫描 Windows 的软件清单。
 * 旧卸载器可能已清掉键，exit 1 表示无需再次删除，并非清理失败。
 * 其他错误必须让进程失败，不能用空 catch 隐藏留在系统中的测试标记。
 * 缓存名称与测试 package.name 配对，不使用正式产品缓存目录。
 * 测试输出保留在临时目录供失败诊断，不用宽泛 glob 删除临时根。
 * 快捷方式沿用设置不开启，原生 engine.nsh 也删除测试开始菜单项。
 * 此处没有遍历所有 AppData，也不删除真实用户配置或浏览器缓存。
 * @param {object} fixture 本次自己创建的身份。
 */
async function cleanup(fixture) {
  for (const key of [`HKCU\\Software\\${fixture.guid}`, `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${fixture.guid}`]) {
    try { await execFile('reg.exe', ['delete', key, '/f', '/reg:64'], { windowsHide: true }); }
    catch (error) { if (error.code !== 1) throw error; }
  }
  const cache = path.join(process.env.LOCALAPPDATA, `${fixture.name}-updater`);
  assert.ok(path.basename(cache).startsWith('ir-repair-'));
  await fs.rm(cache, { recursive: true, force: true });
}
// finally 清理是测试自身卫生，不是产品修复的一部分。
// 产品不能照搬这份 reg delete 去盲删用户的真实安装记录。
// 两个键分别是 builder 地址记录和 Windows 应用列表记录。
// 清理固定 64 位视图，因为夹具明确构建 x64，不宽泛扫描所有视图。
// reg 返回一表示键已经不在，可能已被真实卸载器正常清理。
// 其他错误说明清理没有完成，必须使测试退出失败而非空 catch。
// cache 名由随机 package.name 派生，不从任意外部路径读取。
// 删除前校验 basename 前缀，限制当前递归删除只触及测试 updater。
// LOCALAPPDATA 用于定位测试产生的 builder 缓存，不在其中枚举其他产品。
// force 只处理缓存不存在，不吞掉权限错误或路径异常。
// 临时构建根保留，便于失败时检查原生脚本和产物，不使用宽泛 glob 清空 Temp。
// 桌面和菜单选项已经关闭，因此不需要遍历桌面删同名快捷方式。
// 测试并发可能产生多个随机身份，各自只清自己的 GUID 和缓存。
// 正式产品 GUID 完全不参与变量生成，不会与测试记录碰撞。
// 清理异常由 main 最外层捕获，不能把失败现场只写日志后返回零。
// 如果 makeFixture 自身失败，尚未开始安装，不需要假定已经有登记可删。
// 如果 install 中途失败，finally 仍会尝试移除本次随机登记。
// 退出码保留清理失败，让 CI 不会把污染系统的测试称为通过。
// 用户不需要执行本脚本，它要求开发依赖与 NSIS 构建环境。
// 最终用户仍只使用 Setup 中的自动检测和修复入口。
/**
 * 建包与安装严格串行，避免 NSIS 的同应用安装锁影响回归。
 * finally 无论通过还是失败都删除随机登记，不污染下次真实安装。
 * 异常进入顶层 catch 设置非零退出，不用“截图存在”代替成功。
 * 平台不满足用退出二表示缺前提，不虚构 Windows 安装验证结果。
 * 日志只给出夹具路径供开发定位，没有真实用户的模型或账户内容。
 * 用户不需要运行此开发脚本，产品入口仍是一个完整 Setup EXE。
 * 夹具不是分发物，不提交到仓库也不复制到正式 release/setup。
 */
async function main() {
  if (process.platform !== 'win32') { process.exitCode = 2; return; }
  const fixture = await makeFixture(); console.log('Native fixture:', fixture.root);
  try { await verifyRepair(fixture); }
  finally { await cleanup(fixture); }
}
// 顶层 Promise 必须接住构建错误、子进程错误和断言失败。
// 不调用 app.quit；本脚本是普通 Node，exitCode 能保留失败状态。
main().catch(error => { console.error(error); process.exitCode = 1; });
