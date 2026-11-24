// 合成台只把“导出到画布”的成片写进 Composition，另存为直接写用户选择的位置。
// 外部网页只提供媒体正文，目录与文件名由主进程决定。
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { BrowserWindow, dialog } = require("electron");
const { allocateWorkspace, DIRECTORIES } = require("./project-assets");
const { ownedDirectory, plainDirectory } = require("./resource-files");

/** @param {string} root @param {import('@illusion-realm/shared').CompositionMediaRequest} request @param {Electron.WebContents} sender */
async function saveMedia(root, request, sender) {
  const owner = BrowserWindow.fromWebContents(sender);
  if (!owner || !/^(app:\/\/app\/|http:\/\/(localhost|127\.0\.0\.1):3000\/)/.test(sender.getURL())) throw Error("composition-caller-denied");
  if (request.download) return downloadMedia(owner, request);
  const workspace = await allocateWorkspace(root, { name: request.name, workspace: request.workspace, files: [] });
  const directory = await compositionDirectory(root, workspace, request.kind);
  const target = path.join(directory, `composition-${randomUUID()}${path.extname(request.fileName).toLowerCase()}`);
  const media = { kind: request.kind, name: request.fileName, path: target, size: request.bytes.byteLength };
  try {
    await fs.writeFile(target, request.bytes, { flag: "wx" });
    await require('./resource-ledger').registerResources(root, workspace, [media], 'generated');
    return { workspace, media };
  } catch (error) { await fs.rm(target, { force: true }).catch(() => {}); throw error; }
}

/** 每层先确认普通目录再进入；不能沿用户后来放入的链接创建成片。 @param {string} root @param {{id:string,folder:string}} workspace @param {'image'|'video'|'audio'} kind */
async function compositionDirectory(root, workspace, kind) {
  let directory = await ownedDirectory(root, workspace);
  for (const part of ['Composition', DIRECTORIES[kind]]) {
    directory = path.join(directory, part);
    await fs.mkdir(directory, { recursive: true });
    await plainDirectory(directory);
  }
  return directory;
}

/** 取消时不分配工程目录；完成只回执成功，不把本地另存为地址登记为工程素材。 @param {Electron.BrowserWindow} owner @param {import('@illusion-realm/shared').CompositionMediaRequest} request */
async function downloadMedia(owner, request) {
  const output = await dialog.showSaveDialog(owner, { defaultPath: request.fileName });
  if (output.canceled || !output.filePath) return null;
  await writeOutput(request.bytes, output.filePath);
  return /** @type {const} */ ({ downloaded: true });
}

// 像先装好新盒子再替换旧盒子，同目录临时写入失败不会截断用户原有成片。
// finally 只清理本次随机临时文件，不删除用户选择的目标。
/** @param {Uint8Array} bytes @param {string} output */
async function writeOutput(bytes, output) {
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, bytes, { flag: 'wx' });
    await fs.rename(temporary, output);
  } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}
module.exports = { saveMedia };
