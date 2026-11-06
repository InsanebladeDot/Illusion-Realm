/**
 * 从当前 builder 模板派生可原位修复的引擎，不修改 node_modules。
 * 类比装修清单：保留原工序，只把“先拆旧房”变成修复时跳过。
 * 原生解压、登记、快捷方式与卸载流程仍来自同版本 builder。
 * 使用公开 nsis.script 入口，避免运行时篡改构建器的方法或注册表。
 * 自定义脚本不经过 builder 的独立卸载器签名步骤。
 * 因此改用 NSIS WriteUninstaller，仍生成相同的原生卸载逻辑。
 * 当前项目未配置代码签名；将来启用签名须先补齐独立卸载器签名链。
 * 模板每处只允许命中一次，依赖升级导致不匹配时立即停止构建。
 * 不允许失败后回退旧脚本，否则界面会承诺修复却运行破坏式卸载。
 */
const fs = require('node:fs/promises'), path = require('node:path');
const builderRequire = require('node:module').createRequire(require.resolve('electron-builder'));
/**
 * 锚点不是模糊正则，必须与实际模板逐字一致。
 * 先统一 CRLF，再替换，使构建不受安装包解压时换行差异影响。
 * 缺锚点和多锚点同样拒绝，不能只修改第一次后留下另一条卸载通路。
 * 错误只显示固定阶段名，不打印编译输入或开发机目录。
 * 替换只发生在内存和 release 产物中，不把第三方模板复制进源码。
 * @param {string} source 当前模板正文。
 * @param {string} before 固定预期片段。
 * @param {string} after 本项目追加的修复分支。
 */
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('NSIS repair template changed; review installer integration before building.');
  return source.replace(before, () => after);
}
/**
 * 覆盖卸载块包含当前范围和旧 HKCU 范围，不能只跳过其中一次。
 * 无 Repair 标记维持原生逻辑，标记必须由向导的可信预检决定。
 * customInit 在安装 section 之前读命令行，把标记存入 irRepair。
 * 这里的条件包围原生卸载及结果处理，不靠伪造“卸载成功”。
 * 对应用文件的覆盖由原生解压负责，不递归清理未知用户文件。
 * 提取后的注册和快捷方式仍在卸载块之后执行，所以残留入口会被补回。
 * 保留默认文件占用检查，不强制关闭用户客户端或结束其他进程。
 * @param {string} section 当前 builder 的安装 section。
 */
function patchInstallSection(section) {
  const block = '!insertmacro uninstallOldVersion SHELL_CONTEXT\n!insertmacro handleUninstallResult SHELL_CONTEXT\n\n${if} $installMode == "all"\n  !insertmacro uninstallOldVersion HKEY_CURRENT_USER\n  !insertmacro handleUninstallResult HKEY_CURRENT_USER\n${endIf}';
  return replaceOnce(section, block, '${if} $irRepair != "1"\n' + block + '\n${endIf}');
}
/**
 * 自定义脚本由 NSIS 自己写卸载器，仍使用 builder 的原生卸载 section。
 * 卸载器中的宏需要在 BUILD_UNINSTALLER 环境展开，之后立即恢复。
 * common 中的基础变量已经定义，不再次包含整个 installer.nsi。
 * 安装与卸载的函数前缀由原模板处理，不引入另一份 JS 卸载实现。
 * 生成脚本只写在本轮 release 下，构建器通过绝对路径明确使用它。
 * 文件写失败直接让 dist 失败，不继续复用旧 release 的脚本。
 * 下游仍校验内嵌引擎哈希，修复功能不会绕开执行前的完整性检查。
 * @param {string} output 本轮生成脚本的文件位置。
 */
async function prepareRepairEngine(output) {
  const templates = path.join(path.dirname(builderRequire.resolve('app-builder-lib/package.json')), 'templates/nsis');
  const read = async name => (await fs.readFile(path.join(templates, name), 'utf8')).replace(/\r\n/g, '\n');
  const section = patchInstallSection(await read('installSection.nsh'));
  let installer = replaceOnce(await read('include/installer.nsh'), '  File "/oname=${UNINSTALL_FILENAME}" "${UNINSTALLER_OUT_FILE}"', '  WriteUninstaller "$INSTDIR\\${UNINSTALL_FILENAME}"');
  let script = replaceOnce(await read('installer.nsi'), '!include "installSection.nsh"', section);
  const uninstaller = replaceOnce(await read('uninstaller.nsh'), '!insertmacro CHECK_APP_RUNNING', '!insertmacro customCheckAppRunning');
  script = replaceOnce(script, '!ifdef BUILD_UNINSTALLER\n  !include "uninstaller.nsh"\n!endif', '!define BUILD_UNINSTALLER\n' + uninstaller + '\n!undef BUILD_UNINSTALLER');
  script = replaceOnce(script, '!include installer.nsh', installer);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, script);
  return output;
}
// 生成流程依赖当前安装的 builder 模板版本，而不是互联网上的旧模板副本。
// include 文件被内联后仍保留其原有宏与变量约定，仅改变必要修复工序。
// installSection 的替换必须覆盖原卸载和其结果处理，不能留下孤立的错误判断。
// 两种旧卸载范围放在同一 Repair 条件内，避免只跳过 HKCU 的一条路径。
// 没有 Repair 参数时继续走原始安装升级行为，不意外改变普通安装语义。
// 只有可信向导通过原位置预检后才会带这个参数。
// customHeader 先声明标记，customInit 在安装 section 前读取它。
// WriteUninstaller 让同次 NSIS 编译包含原生卸载逻辑，不复制假卸载文件。
// 原 uninstaller.nsh 的 BUILD_UNINSTALLER 环境只在展开对应 section 时开启。
// 展开后 undef 恢复安装环境，避免后续普通安装宏误以为自己在卸载模式。
// CHECK_APP_RUNNING 替换为项目宏，防止同次编译重复声明 CmdPath。
// 自定义占用检查保持退出提醒，不走 builder 默认强制结束应用的路径。
// read 的换行规范化只作用于文本模板，不修改内嵌应用资源字节。
// 每个锚点单次命中是依赖升级的保险丝，变化时要求重新审核而非静默退化。
// 缺失 WriteUninstaller 锚点时不沿用旧的预构建卸载器方案继续构建。
// output 在 release 下，生成文件不作为第三方源码副本提交到仓库。
// mkdir 只创建构建输出父目录，不触及用户已有安装位置。
// writeFile 失败直接传播，不能让下游误用上次留下的引擎脚本。
// 主构建与小型原生回归都 require 此模块，测试的修复工序与正式产物同源。
// require 本身只声明函数，验证模板不会自动执行安装或注册表写入。
// 当前没有签名配置，WriteUninstaller 不应被描述为自动完成卸载器签名。
// 以后启用代码签名需要补独立签名链，不能仅检查外层 Setup 的签名。
// 引擎摘要应在最终签名后计算，封装后改字节会被安装时完整性校验拒绝。
// 公共 nsis.script 是正式配置入口，不篡改 builder 对象的私有方法。
// helper 供正式 dist 和隔离原生安装回归共同使用，避免测试另一份引擎。
// require 本模块不会执行构建，也不会接触已安装客户端的注册表或目录。
module.exports = { prepareRepairEngine, patchInstallSection, replaceOnce };
