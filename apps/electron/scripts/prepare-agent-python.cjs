/**
 * 打包前准备独立的 Windows Python。它像随程序发的一套工具箱，解释器、标准库和
 * 第三方包放在一起，通过相对路径找到彼此，换安装目录时也无需使用构建机的 Python。
 */
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const PYTHON_VERSION = '3.13.12';
const ARCHIVE = `python-${PYTHON_VERSION}-embed-amd64.zip`;
// 校验值来自 python.org 对应发行页的 Windows 64 位嵌入包。
const SHA256 = '76f238f606250c87c6beac75dccd35ee99070a13490555936abb6cb64ecce3d0';
const BIN = path.resolve(__dirname, '../bin');
const OUTPUT = path.join(BIN, 'agent-python');
const LOCK = path.resolve(__dirname, '../../agent/requirements-windows-x64.txt');

/** 调用构建工具，缺失或超时会终止打包，避免产出缺依赖的安装器。 */
function run(command, args) {
  try {
    execFileSync(command, args, { stdio: 'inherit', windowsHide: true, timeout: 300_000 });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`准备 Agent Python 需要构建工具 ${command}。`, { cause: error });
    }
    throw error;
  }
}

async function matchesArchive(file) {
  const data = await fs.readFile(file).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  return data !== null && createHash('sha256').update(data).digest('hex') === SHA256;
}

/** 下载和验证在临时目录完成，通过后才将 ZIP 留给下次构建。 */
async function getArchive(stage) {
  const cached = path.join(BIN, `agent-${ARCHIVE}`);
  if (await matchesArchive(cached)) return cached;
  const download = path.join(stage, ARCHIVE);
  const url = `https://www.python.org/ftp/python/${PYTHON_VERSION}/${ARCHIVE}`;
  run('curl.exe', ['--fail', '--location', '--retry', '3', '--retry-all-errors',
    '--max-time', '60', '--output', download, url]);
  if (!await matchesArchive(download)) throw new Error('Agent Python 下载文件的 SHA-256 不匹配。');
  await fs.rename(download, cached);
  return cached;
}

/**
 * ._pth 只加载指定路径，避免读到机器上的 Python 设置。
 * 启用 site 处理 pywin32 的 .pth，上一层目录则让两个 Python 子进程都能用 -m 启动。
 */
async function installRuntime(archive, runtime) {
  await fs.mkdir(runtime);
  run('tar.exe', ['-xf', archive, '-C', runtime]);
  await fs.writeFile(path.join(runtime, 'python313._pth'),
    ['python313.zip', '.', 'Lib/site-packages', '..', 'import site', ''].join('\n'));
  run('uv', ['pip', 'sync', '--python', path.join(runtime, 'python.exe'),
    '--target', path.join(runtime, 'Lib/site-packages'), '--link-mode', 'copy',
    '--only-binary', ':all:', LOCK]);
  verifyAgentPython(runtime);
}

/** 运行原生扩展导入检查，同时要求解释器和依赖来自自己的目录。 */
function verifyAgentPython(runtime) {
  const probe = [
    'from pathlib import Path',
    'import sys, mcp, openai, dotenv, pywintypes, win32job',
    'root = Path(sys.executable).resolve().parent',
    'assert Path(sys.base_prefix).resolve() == root, sys.base_prefix',
    'for module in (mcp, openai, dotenv, pywintypes, win32job):',
    '    assert Path(module.__file__).resolve().is_relative_to(root), module.__file__',
  ].join('\n');
  run(path.join(runtime, 'python.exe'), ['-B', '-c', probe]);
}

/** 删除前确认目标是 bin 的直接子目录，且真实路径没有跳出 bin。 */
async function removeBuildDirectory(directory) {
  const resolved = await fs.realpath(directory).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (resolved === null) return;
  const realBin = await fs.realpath(BIN);
  if (path.dirname(directory) !== BIN || resolved !== path.join(realBin, path.basename(directory))) {
    throw new Error(`Agent Python 构建路径超出资源目录：${directory}`);
  }
  await fs.rm(directory, { recursive: true, force: true });
}

/** 只交给 electron-builder 完整通过检查的环境，失败时清理临时文件。 */
async function prepareAgentPython(arch) {
  if (process.platform !== 'win32' || arch !== 'x64') {
    throw new Error('内置 Agent Python 的 Windows 客户端需要在 Windows 上构建 x64 版本。');
  }
  await fs.mkdir(BIN, { recursive: true });
  const stage = await fs.mkdtemp(path.join(BIN, 'agent-python-stage-'));
  try {
    const archive = await getArchive(stage);
    await removeBuildDirectory(OUTPUT);
    // Windows 可能暂时占用刚执行过的程序目录。直接在打包目录准备资源，避免整目录改名。
    try {
      await installRuntime(archive, OUTPUT);
    } catch (error) {
      await removeBuildDirectory(OUTPUT);
      throw error;
    }
  } finally {
    await removeBuildDirectory(stage);
  }
}

module.exports = { prepareAgentPython, verifyAgentPython };
