/** 临时素材只属于创建它的窗口和任务；清理只删 mkdtemp 返回的目录，不碰用户源文件。 */
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { resolveTools } = require("./locate");
const { inspectResults, mergeVideo } = require("./upscale-media");
const { planVideo } = require("./upscale-plan");

/** @typedef {{owner: Electron.WebContents, controller: AbortController, directory: string, source: string, tools: {ffmpegPath: string, ffprobePath: string}, prepared?: Awaited<ReturnType<typeof planVideo>>, pending: Promise<unknown>, phase: 'preparing'|'ready'|'merging'|'merged', stop: () => void}} Session */
/** @type {Map<string, Session>} */
const sessions = new Map();

/** @param {Electron.WebContents} owner @param {string} requestId */
function sessionKey(owner, requestId) { return `${owner.id}:${requestId}`; }

/** release 等待正在读写的子进程结束，再移除临时目录，避免 Windows 文件占用和删写竞态。 */
/** @param {Electron.WebContents} owner @param {string} requestId */
async function releaseSession(owner, requestId) {
  const key = sessionKey(owner, requestId), session = sessions.get(key);
  if (!session) return;
  session.controller.abort();
  await session.pending.catch(() => undefined);
  if (sessions.get(key) !== session) return;
  if (session.directory) await fs.rm(session.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  sessions.delete(key);
  owner.removeListener("destroyed", session.stop);
  owner.removeListener("render-process-gone", session.stop);
  owner.removeListener("did-navigate", session.stop);
}

/** 登记先于异步读盘，紧随 prepare 的取消也能命中；一个窗口只允许一个分批会话。 */
/** @param {Electron.WebContents} owner @param {string} requestId @param {string} source */
function createSession(owner, requestId, source) {
  const key = sessionKey(owner, requestId);
  if ([...sessions.values()].some(item => item.owner.id === owner.id)) throw Error("Video upscale busy");
  const tools = resolveTools();
  if (!tools.ffmpegPath || !tools.ffprobePath) throw Error("Video upscale requires FFmpeg and FFprobe");
  /** @type {Session} */
  const session = { owner, controller: new AbortController(), directory: "", source, tools: { ffmpegPath: tools.ffmpegPath, ffprobePath: tools.ffprobePath }, pending: Promise.resolve(), phase: "preparing", stop: () => { void releaseSession(owner, requestId).catch(() => console.error("[video-upscale] cleanup failed")); } };
  sessions.set(key, session);
  owner.once("destroyed", session.stop);
  owner.once("render-process-gone", session.stop);
  owner.once("did-navigate", session.stop);
  return session;
}

/** @param {Session} session @param {number} fps */
async function prepareSession(session, fps) {
  if (!(await fs.stat(session.source)).isFile()) throw Error("Video upscale source unavailable");
  session.controller.signal.throwIfAborted();
  session.directory = await fs.mkdtemp(path.join(os.tmpdir(), "illusion-realm-video-upscale-"));
  session.prepared = await planVideo(session.tools, session.source, session.controller.signal, fps);
  session.phase = "ready";
  return { prepared: { directory: session.directory, ...session.prepared } };
}

/** 合并路径只能来自本次临时目录；应用从生成回包保存的普通文件才能进入拼接。 */
/** @param {Session} session @param {string[]} paths @param {string} outputPath */
async function mergeSession(session, paths, outputPath) {
  if (!session.prepared || paths.some(file => path.dirname(file) !== session.directory || !/^IR_video_[a-zA-Z0-9_]+\.mp4$/.test(path.basename(file)))) throw Error("Video upscale batch ownership mismatch");
  const signal = session.controller.signal;
  await inspectResults(session.tools, paths, session.prepared.batches.map(batch => batch.frames), session.prepared.fps, signal);
  const merged = await mergeVideo(session.tools, paths, session.source, session.directory, session.prepared.sourceRate, session.prepared.totalFrames, signal, session.prepared.fps);
  signal.throwIfAborted();
  await fs.mkdir(outputPath, { recursive: true });
  const savedPath = await publishVideo(merged, session.source, outputPath);
  session.phase = "merged";
  return { savedPath };
}

/** @param {Electron.WebContents} owner @param {string} requestId */
function getSession(owner, requestId) {
  const session = sessions.get(sessionKey(owner, requestId));
  if (!session) throw Error("Video upscale session unavailable");
  return session;
}
module.exports = { createSession, prepareSession, mergeSession, getSession, releaseSession };

/** 默认沿用原文件名前缀；重名加序号，独占复制保证不会覆盖已有成片。 */
/** @param {string} merged @param {string} source @param {string} directory */
async function publishVideo(merged, source, directory) {
  const stem = path.parse(source).name;
  for (let index = 0; index < 10000; index++) {
    const target = path.join(directory, `${stem}SeedVR2${index ? `-${index}` : ""}.mp4`);
    try {
      await fs.copyFile(merged, target, require("fs").constants.COPYFILE_EXCL);
      return target;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    }
  }
  throw Error("Video upscale output names exhausted");
}
