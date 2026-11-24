/** 汇总内置和用户角色音色，用户文件以目录分类、文件名作台词。 */
const { app } = require("electron");
const { constants } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { getAppRootDir } = require("../../core/paths");
const { EXTENSIONS } = require("./project-validation");

const USER_VOICES_DIRECTORY = "Character Voices";
const BUNDLED_EXTENSIONS = [...EXTENSIONS.audio, "aif", "aiff"];
const RESERVED = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])\s*(?:\.|$)/iu;

/** @param {string} dir @param {readonly string[]} [extensions] */
async function entries(dir, extensions) {
  const items = await fs.readdir(dir, { withFileTypes: true }).catch(error => {
    if (error?.code === "ENOENT") return [];
    throw new Error("voice-catalog-unavailable");
  });
  return items.filter(item => extensions
    ? item.isFile() && extensions.includes(path.extname(item.name).slice(1).toLowerCase())
    : item.isDirectory()).map(item => item.name).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

/** @param {string} file @param {string} source @param {string} role @param {string} tone @param {boolean} custom @returns {Promise<import('@illusion-realm/shared').CanvasReferenceVoice|null>} */
async function readVoice(file, source, role, tone, custom) {
  const stat = await fs.lstat(file).catch(() => null);
  if (!stat?.isFile() || !stat.size) return null;
  return { source, role, tone, ...(custom ? { custom: true } : {}), media: { kind: "audio", path: file, name: path.basename(file), size: stat.size } };
}

/** @param {string} root @param {string} source @param {boolean} custom */
async function scanSource(root, source, custom) {
  const result = [];
  // 像按文件柜的两层抽屉找录音：先按角色分组，再按语气分组，扫描时不跟随链接。
  for (const role of await entries(root)) {
    for (const tone of await entries(path.join(root, role))) {
      const directory = path.join(root, role, tone);
      for (const name of await entries(directory, custom ? EXTENSIONS.audio : BUNDLED_EXTENSIONS)) {
        const voice = await readVoice(path.join(directory, name), source, role, tone, custom);
        if (voice) result.push(voice);
      }
    }
  }
  return result;
}

/** @param {string} base */
async function listReferenceVoices(base) {
  const publicDir = app.isPackaged ? path.join(process.resourcesPath, "next-out") : path.join(getAppRootDir(), "apps", "next", "public");
  const bundled = path.join(publicDir, "reference-audio");
  const custom = path.join(base, USER_VOICES_DIRECTORY);
  const [sources, stat] = await Promise.all([entries(bundled), fs.lstat(custom).catch(() => null)]);
  const scans = sources.map(source => scanSource(path.join(bundled, source), source, false));
  if (stat?.isDirectory() && !stat.isSymbolicLink()) scans.push(scanSource(custom, USER_VOICES_DIRECTORY, true));
  return (await Promise.all(scans)).flat();
}

/** @param {string} transcript */
function transcriptFileStem(transcript) {
  // Windows 不能把半角问号等写入文件名，用对应的全角标点留住原意。
  const stem = transcript.replace(/[<>:"/\\|?*]/gu, char => String.fromCharCode(char.charCodeAt(0) + 0xfee0));
  return RESERVED.test(stem) || stem.startsWith(".") ? `＿${stem}` : stem;
}

/** @param {string} base @param {string[]} segments */
async function voiceDestination(base, segments) {
  await fs.mkdir(base, { recursive: true });
  let directory = base;
  for (const segment of segments) {
    directory = path.join(directory, segment);
    await fs.mkdir(directory).catch(error => { if (error?.code !== "EEXIST") throw error; });
    const stat = await fs.lstat(directory);
    // 某层若被替换成链接，后续创建不能借这层跳出音色库。
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error("voice-storage-unavailable");
  }
  return directory;
}

/** @param {string} base @param {import('@illusion-realm/shared').CanvasVoiceRequest} request @param {string} selected */
async function saveReferenceVoice(base, request, selected) {
  const extension = path.extname(selected).toLowerCase();
  const stat = await fs.lstat(selected).catch(() => null);
  if (!EXTENSIONS.audio.includes(extension.slice(1)) || !stat?.isFile() || !stat.size) throw Error("voice-invalid-file");
  const role = request.role.trim();
  const tone = request.tone.trim();
  const stem = transcriptFileStem(request.transcript.trim());
  try {
    const destination = await voiceDestination(base, [USER_VOICES_DIRECTORY, role, tone]);
    const file = path.join(destination, `${stem}${extension}`);
    // 同名时保留原录音，台词文件名不会被悄悄改成带序号的文本。
    await fs.copyFile(selected, file, constants.COPYFILE_EXCL);
    const voice = await readVoice(file, USER_VOICES_DIRECTORY, role, tone, true);
    if (!voice) throw Error("voice-storage-unavailable");
    return voice;
  } catch (error) {
    // 只透出固定类别，避免文件系统异常把用户路径写入 IPC 日志。
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") throw Error("voice-already-exists");
    throw Error("voice-storage-unavailable");
  }
}

module.exports = { listReferenceVoices, saveReferenceVoice };
