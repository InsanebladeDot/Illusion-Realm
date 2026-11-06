/**
 * 构建离线单文件安装入口：先产出 NSIS 引擎，再封装本地 HTML 向导。
 * 临时 staging 放在 release 内，源码目录不接收安装二进制或生成清单。
 * 两层构建都显式 publish:never，运行本命令不会推送或发布版本。
 * 向导使用现有 Electron 发行包，不引入 WebView2 的目标机依赖。
 * 此选择会增加一个向导运行时的体积，换取模板的真实 HTML 布局。
 * 应用安装目录仍只包含正常客户端，向导运行时只在临时目录解压。
 */
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { createReadStream } = require('node:fs'), { build, Platform, Arch } = require('electron-builder');
const root = path.resolve(__dirname, '..'), repo = path.resolve(root, '../..');
// 与 electron-builder 使用同一 UUID 算法，不能另造一个卸载身份。
// createRequire 从 builder 依赖域解析，不新增运行时依赖或手改锁文件。
// 配置解析读取应用实际 appId，后续改名也不会漏掉原生安装标记。
const { prepareRepairEngine } = require('./prepare-repair-engine.cjs');
const builderRequire = require('node:module').createRequire(require.resolve('electron-builder'));
/**
 * 构建输入由三个不同位置组成：客户端配置、向导源码、仓库许可。
 * root 永远指向 apps/electron，不能使用调用命令时的 cwd 作为基准。
 * repo 只用来读取根目录 LICENSE，不枚举用户文档或任意上级目录。
 * Node stream 的 chunk 是 Buffer，hash.update 不执行文本编码转换。
 * 大文件摘要的大小与文件容量无关，最终始终是 64 个十六进制字符。
 * digest 只能调用一次，因此函数不向外暴露可变 Hash 实例。
 * 如果引擎正在被其他进程修改，后续安装校验会拒绝不一致的内容。
 * 构建步骤本身串行生成引擎，正常路径不会发生边写边哈希。
 * 本地引擎与内嵌引擎先复制再复用同一个摘要，禁止临时下载替换。
 * 文本清单以 UTF-8 JSON 保存，不依赖 Windows 本机代码页。
 */
/**
 * 文件哈希使用流，避免数百 MB 安装包一次性读入 JS 堆。
 * 清单中的摘要用于执行安装前校验同包引擎，而非证明发布者身份。
 * 发布者身份仍需要外部代码签名，不能用同包哈希替代。
 * 流读取失败会拒绝构建，不生成缺少摘要的可分发安装器。
 * @param {string} file 要计算摘要的安装引擎路径。
 * @returns {Promise<string>} 小写十六进制 SHA-256。
 */
async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
/**
 * 从当前实际 win-unpacked 文件树求安装容量，不沿用原型的 1.2GB 示例。
 * 只累计普通文件的字节数，不把目录条目的大小算进应用容量。
 * 打包输出不应包含符号链接，遇到链接直接失败以免统计和实际释放不同。
 * 算得的空间不含用户后续下载的模型、缓存或创作输出。
 * 运行期会另留 64MiB 安装余量；临时自解压还需要系统盘空间。
 * @param {string} dir 本轮打包生成的 win-unpacked 目录。
 * @returns {Promise<number>} 应用文件总字节数。
 */
async function treeBytes(dir) {
  // 返回的是展开后文件大小，压缩 EXE 的大小不能用于目标磁盘容量要求。
  // pycache 或其他已进入正式包的文件也计入，不仅仅统计 JavaScript。
  // readdir 由文件系统提供真实列表，不维护容易漏项的手写容量白名单。
  // 这里只扫描本轮构建目录，不扫描开发者的整个模型盘或源代码树。
  // 单文件 stat 错误会终止求和，不能跳过缺少权限的文件而低估容量。
  // 递归结果在 await 后累计，返回前不存在未完成的子目录任务。
  // 路径由 Dirent.name 拼接，未把远程清单内容当作文件名使用。
  // 字节总和作为 JSON number 保存，服务端另行要求 safeInteger。
  // 空目录占用不单列统计，由运行时安装余量覆盖元数据开销。
  // 目录下若出现链接会停止打包，避免打包与统计走不同的解析路径。
  let bytes = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in packaged application');
    const file = path.join(dir, entry.name); bytes += entry.isDirectory() ? await treeBytes(file) : (await fs.stat(file)).size;
  }
  return bytes;
}
/**
 * 每轮都覆盖 staging 清单，不借用上一轮 release 中遗留的安装包。
 * 引擎文件名由本轮 package.version 推导；缺少输出时 fs.copyFile 会失败。
 * 正式 LICENSE 逐字复制，安装提示单独追加，不偷偷替换根目录许可。
 * 角色图片是用户提供模板的本地资源，构建不再依赖用户的临时目录。
 * 源码按白名单复制，避免把日志、截图、源码图或 API 密钥收入安装器。
 * staged package 是生成文件，不新增 pnpm workspace 或依赖锁变更。
 * @param {string} stage 独立向导的临时项目目录。
 * @param {string} version 本轮客户端版本。
 */
async function prepareStage(stage, version) {
  // payload 是 Windows 可执行文件的物理目录，不把 EXE 藏在 asar 路径里。
  // 创建 stage 不删除之前的输出，允许检查失败原因并保留既有手工构建。
  // 复制文件名都是固定常量，安装页面无权要求收集额外开发文件。
  // legal.txt 包含完整许可及通知，两者之间加空行以保持阅读边界。
  // NOTICE 的日期属于说明版本，不替换 LICENSE 自身的许可版本号。
  // 版本来自客户端 package，向导与被安装客户端不各自硬编码版本。
  // 引擎摘要不写到用户账户，也不需要服务器在线验证才能安装。
  // manifest 不保存构建机器的用户名、绝对路径或 API 环境变量。
  // 独立向导 package 没有运行依赖，所有所需 API 都来自 Electron/Node。
  // 文件复制或文本读取失败会中断阶段，不能用上次清单继续封装。
  // 后续 portable 只收 staging 白名单，不携带此构建脚本本身。
  // 角色图为用户提供视觉资源，其授权仍应按第三方素材权利处理。
  await fs.mkdir(path.join(stage, 'payload'), { recursive: true });
  for (const name of ['main.cjs', 'service.cjs', 'diagnosis.cjs', 'preload.cjs', 'renderer.cjs', 'installer.html', 'installer.css', 'character.webp']) await fs.copyFile(path.join(root, 'installer', name), path.join(stage, name));
  const engine = path.join(root, 'release', `illusion-realm-engine-${version}.exe`), payload = path.join(stage, 'payload');
  await fs.copyFile(engine, path.join(payload, 'engine.exe'));
  const license = await fs.readFile(path.join(repo, 'LICENSE'), 'utf8'), notice = await fs.readFile(path.join(root, 'installer/NOTICE.txt'), 'utf8');
  await fs.writeFile(path.join(payload, 'legal.txt'), `${license}\n\n${notice}`);
  // 显式 guid 优先；没有时完全沿用 builder 的命名空间 UUID v5 规则。
  // 向导据此核对已有安装，只有明确修复时才允许原位置补件。
  // registryKey 是固定发布元数据，不接受页面传入或任意注册表路径。
  // 清单只存应用身份，不记录开发机或最终用户的注册表内容。
  // UUID 命名空间来自 builder，与内层引擎生成身份保持配对。
  const config = builderRequire('js-yaml').load(await fs.readFile(path.join(root, 'electron-builder.yml'), 'utf8')), { UUID } = builderRequire('builder-util-runtime');
  const registryKey = config.nsis.guid || UUID.v5(config.appId, UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3'));
  const manifest = { version, registryKey, engineSha256: await sha256(engine), installedBytes: await treeBytes(path.join(root, 'release/win-unpacked')) };
  await fs.writeFile(path.join(payload, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: 'illusion-realm-installer', version, main: 'main.cjs', author: 'Illusion Realm', description: 'Illusion Realm 安装向导' }));
}
/**
 * 先构建引擎并等待退出，随后才计算容量与哈希，两阶段不能并发。
 * x64 是当前客户端及内置 FFmpeg 的发布架构，不误生成 ARM64 外壳。
 * 正式入口目录 setup 只放可分发 EXE；内部引擎与 win-unpacked 留给诊断。
 * 不删除 release 的旧文件或用户目录，避免构建清理误伤已有开发数据。
 * 同版本结果覆盖同名目标，新版本文件可并存供用户手动选择。
 * Electron 运行时沿用本地安装，离线构建不再次获取 Electron zip。
 * 任一步失败立即非零退出，不能留下“构建成功”的输出提示。
 * 外部调用者仍负责先构建 Next，根目录 pnpm build 已包含这一顺序。
 */
async function main() {
  // 显式传入平台和架构，使从其他 shell 调用也不会变成当前平台默认目标。
  // 第一层仍使用现有 beforePack/afterPack，FFmpeg 完整性检查不会被绕过。
  // 客户端 NSIS 的原生卸载逻辑被保留，不在向导里重新发明注册表协议。
  // 第二层 extends 只读取安装向导专属配置，不继承客户端 extraResources。
  // 因此向导不会重复收录整份 Python agent 或 Next 资源树。
  // electronDist 使用绝对路径，stage 改变项目目录后仍能定位本地发行包。
  // electronVersion 对应实际包版本，不能使用源码描述中的历史主版本。
  // icon.ico 由第一层 beforePack 生成，第二层不会碰用户图标源文件。
  // artifacts 由 builder 返回，不能通过扫描旧输出猜测本轮生成了什么。
  // 只复制 exe 到 setup，blockmap、调试 YAML 和展开目录都留在内部输出。
  // 日志只提示固定仓库相对位置，不打印用户安装时选择的文件夹。
  // 默认没有发布配置，publish:never 仍显式传给每次 build 防止未来漂移。
  // portable 构建结束后才复制成品，压缩期间不向 setup 暴露半个 EXE。
  // 交付者只需分发 setup 里的安装 EXE，不应把 stage 和引擎当作附件。
  // 同版本 EXE 被覆盖属于可再生成产物，不影响已安装应用或用户配置。
  // 脚本不调用 git、不上传安装包、不生成发布记录或访问代码托管服务。
  // root pnpm pack 仍用于客户端展开版验证，不被此入口改成安装动作。
  // 后续如接入签名，应先签引擎再求摘要，避免封装后摘要因签名改变。
  // 当前嵌套签名策略必须保留内层引擎原始字节，否则预执行校验会拒绝。
  const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  // 生成脚本严格核对当前 builder 模板，锚点变化必须中止整次打包。
  // 不能失败后自动退回旧引擎，否则向导承诺保留数据却先执行卸载。
  // 文件路径由项目构建脚本固定，不接受命令行传入的任意 NSIS 正文。
  // 此生成只写 release，既不修改 node_modules，也不操作已安装客户端。
  // 输出随本次 build 显式传递，避免扫描目录误取一份旧的修复脚本。
  // 客户端 hooks 仍由原配置继承，FFmpeg 和协议资源定位没有第二套规则。
  // 第二层向导随后封装这一层的真实结果与摘要，不自己重建另一个客户端。
  // publish:never 继续覆盖两层，打包成功不会把未经验收的安装器上传。
  const repairScript = await prepareRepairEngine(path.join(root, 'release/repair-engine.nsi'));
  await build({ projectDir: root, config: { extends: path.join(root, 'electron-builder.yml'), nsis: { script: repairScript } }, targets: Platform.WINDOWS.createTarget('nsis', Arch.x64), publish: 'never' });
  const stage = path.join(root, 'release/installer-stage'); await prepareStage(stage, version);
  const artifacts = await build({ projectDir: stage, targets: Platform.WINDOWS.createTarget('portable', Arch.x64), config: { extends: path.join(root, 'installer/electron-builder.yml'), electronDist: path.join(root, 'node_modules/electron/dist'), electronVersion: require('electron/package.json').version, win: { icon: path.join(root, 'assets/icon.ico') }, directories: { output: path.join(root, 'release/installer-build') } }, publish: 'never' });
  const output = path.join(root, 'release/setup'); await fs.mkdir(output, { recursive: true });
  for (const artifact of artifacts.filter(file => file.endsWith('.exe'))) await fs.copyFile(artifact, path.join(output, path.basename(artifact)));
  console.log('Single-file installer ready in apps/electron/release/setup');
}
/**
 * 导出构建辅助函数便于容量与摘要的独立检查，不在 require 时启动打包。
 * 命令入口只打印可操作的错误摘要，不输出运行期用户路径或任何密钥。
 * 失败保留 staging 供检查，但不会把它当作 setup 成品发布。
 * process.exitCode 保留正常清理机会，构建脚本不是 Electron app.quit 路径。
 */
module.exports = { sha256, treeBytes, prepareStage };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
