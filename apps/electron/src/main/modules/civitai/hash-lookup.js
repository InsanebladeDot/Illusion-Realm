/**
 * 用本地 SHA-256 查询 Civitai 的具体文件版本，并转换为现有下载来源契约。
 * 只允许固定 API 来源；逐块读取有大小上限的 JSON，不接受任意 URL 入参。
 * 网络使用现有 Chromium 下载传输，沿用重定向校验与授权头隔离。
 */
const { downloadFetch } = require("../models/downloads/model-download-network");
// 图片候选独立适配，摘要与模型身份校验继续只在当前文件执行。
// 复用当前内容偏好和下载白名单，不把网络字段的缺省值误判成无图。
const { collectPreviewUrls } = require("./preview-images");
// 这里复用专用 session，保留下载器对重定向和授权头的边界约束。
// 不使用全局 session，避免网页登录 cookie 混入模型识别请求。
// key 只在固定 Civitai 主机发送，不附加在 URL 上。
/**
 * 外部 JSON 一律从 unknown 缩窄，数组和 null 不能当普通对象。
 * 缺失字段回落为空对象，让后续必填字段验证响亮失败。
 * 这里只做形状读取，不执行来自作者说明的任何 HTML。
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? /** @type {Record<string,unknown>} */ (value) : {}; }
/**
 * 说明文本与触发词限制长度，与既有 sidecar 的读取上限保持相容。
 * 非字符串不强转，避免将对象意外保存成作者说明。
 * 纯数据文本后续由现有界面转换成安全的纯文字展示。
 * @param {unknown} value @param {number} [limit]
 */
function text(value, limit = 4096) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
/**
 * API 可能返回错误页或超大说明；响应最多读取 2 MiB。
 * 无 Content-Length 时仍逐块累计，不能仅依赖响应头。
 * reader 在成功、JSON 解析失败和超限时均取消并释放。
 * 单次来源的 30 秒限制覆盖响应体读取，而不只是连接阶段。
 * 404 与鉴权错误使用稳定原因；原始响应正文不进入日志或 IPC。
 * @param {string} url 固定来源下由数字 ID 或摘要组成的 API 地址。
 * @param {string} key 已保存密钥，只放在授权头中。
 * @param {AbortSignal} signal @param {typeof downloadFetch} fetcher
 */
async function readJson(url, key, signal, fetcher) {
  // fetcher 的生产实现还会验证所有跳转目标，不止最初的 API URL。
  // credentials=omit 与专用 session 配合，使请求不借用浏览器账户会话。
  // signal 覆盖连接和响应体读取，慢响应不能无限占住模型目录锁。
  const response = await fetcher(url, { signal, headers: key ? { Authorization: `Bearer ${key}` } : {}, credentials: "omit" });
  // 在取 reader 之前处理 HTTP 错误，错误页面不当作模型 JSON 解析。
  // 取消错误响应体，防止无用正文继续传输占用连接。
  // 只有 404 才代表该来源没有该摘要，不能把 403 混成未收录。
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(response.status === 404 ? "notFound" : [401, 403].includes(response.status) ? "auth" : "network");
  }
  const reader = response.body.getReader(), chunks = []; let size = 0;
  // Buffer.concat 只用于已经限长的 API JSON，不能拿来拼接模型文件。
  // 没有 Content-Length 的分块响应同样受到累计大小限制。
  // 两个 API 顺序读取，前一个响应的 reader 已释放后才读取下一个。
  try {
    // 逐块检查大小，不等 response.json 完整分配一个未知长度的对象。
    // 任何超限都会进入 finally，后续来源可按正常策略回退。
    // 上限与本地元数据读取上限相同，避免保存后本应用无法再读取。
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length; if (size > 2 * 1024 * 1024) throw new Error("invalid");
      chunks.push(Buffer.from(chunk.value));
    }
    // JSON 语法失败属于返回数据无效，而非用户模型没有被收录。
    // 只返回稳定原因，不把远程错误页正文送进日志。
    // 即使解析失败，finally 仍负责回收流读取器。
    try { return object(/** @type {unknown} */ (JSON.parse(Buffer.concat(chunks).toString("utf8")))); }
    catch { throw new Error("invalid"); }
  // 正常 EOF 后 cancel 是无操作；异常时用于中止未读完的正文。
  // cancel 自身失败不覆盖更有意义的语法错误或大小超限原因。
  // 无论取消成功与否都释放 reader 锁，让传输层完成资源回收。
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
/**
 * 即使 by-hash 返回成功，也再次对照 files[].hashes.SHA256。
 * 不按 primary、文件名或相近版本猜测，否则会恢复错误的触发词。
 * 父模型响应必须与版本的 modelId 相同，防止错误响应混入别的说明。
 * 未返回的参数保留为空，不推测采样器、步数或 LoRA 使用权重。
 * 下载 URL 在此重新生成，不保存远程签名或 token 查询参数。
 * 封面遵循现有内容偏好；没有合适图片时仍可恢复文本资料。
 * @param {Record<string, unknown>} version @param {Record<string, unknown>} model
 * @param {string} sha256 @param {string} origin
 * @returns {import('@illusion-realm/shared').ModelDownloadRequest & {previewUrls:string[]}} 兼容原来源保存器的请求，另带仅供恢复器使用的有限封面候选。
 */
function toRequest(version, model, sha256, origin) {
  // SHA-256 是调用者实际读取出的摘要，不能被远程 JSON 改写。
  // 远程文件不匹配时，即便版本名称看起来合理也拒绝整个响应。
  // 此函数没有磁盘副作用，校验完成前不会创建来源文件。
  // 模型 ID 用于主页链接，版本 ID 用于指向准确版本，不混用两个 ID。
  // 上游缺少作者等可选信息时保留空值，界面可以自然隐藏对应行。
  // 描述长度限制适配现有最大 2 MiB sidecar，不保留完整 API 对象。
  // JSON 总体大小限制在网络读取时生效，文本限制在字段适配时生效。
  // 文件的大小与扩展名不是身份依据，仅完整摘要一致才通过。
  // 同版本包含多个精度或格式文件时，只接受摘要相同的那个文件。
  // 不将训练详情自动解释成生成参数，两者不具有等价含义。
  // 推荐参数若仅存在于作者说明，会作为说明保留供用户查看。
  // modelId 来自版本接口，随后父模型必须返回相同 ID。
  // 使用 API 的模型类型，不从本地目录名字猜测 Checkpoint 或 LoRA。
  // 返回格式只覆盖既有下载器支持的三类模型，其余类型显式拒绝。
  const id = version.id, modelId = version.modelId, modelType = model.type;
  // 数组元素逐个缩窄，null 和错误类型不会中断整个进程。
  // API 没提供 files 时也不能用版本本身的名称代替文件身份。
  // file 是匹配 SHA-256 的那个文件，即使它不是 primary。
  const files = Array.isArray(version.files) ? version.files.map(object) : [];
  const file = files.find(item => text(object(item.hashes).SHA256).toLowerCase() === sha256);
  // 大小写无关比较适配 PowerShell 与 API 常见的十六进制大小写差异。
  // ID 只允许正的安全整数，防止字符串插入路径或数值精度丢失。
  // 不能因为模型名称相同就跳过父模型 ID 的一致性校验。
  if (!file || typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || typeof modelId !== "number" || !Number.isSafeInteger(modelId) || modelId <= 0 || model.id !== modelId) throw new Error("invalid");
  // 批量范围可能包含 VAE、工具模型等，而现有来源适配器只支持下载器三类。
  // 类型不支持与 SHA-256 不匹配分开，让用户知道模型存在但当前插件不适配。
  // 不擅自把其他类型保存成 Checkpoint，以免后续选择器误用模型。
  if (modelType !== "LORA" && modelType !== "Checkpoint" && modelType !== "TextualInversion") throw new Error("unsupportedType");
  // 预览只作为附加资料，不能影响文件版本身份的判定。
  // 保存全部有限候选供封面下载失败后回退，不能只挑第一张后丢掉其他图。
  // 候选适配器同时核对同版本、内容偏好、媒体类型和 HTTPS 主机。
  const previewUrls = collectPreviewUrls(version, model);
  // 触发词来自准确版本而非父模型的其他版本，保持用户可复用性。
  // 去掉空字符串，并限制数量以兼容既有来源 schema 的上限。
  // 描述可包含 HTML，但存储它不等于执行；显示层继续使用纯文字适配。
  const words = Array.isArray(version.trainedWords) ? version.trainedWords.map(value => text(value)).filter(Boolean).slice(0, 256) : [];
  // 使用现有 ModelDownloadRequest 只为复用 sidecar writer，不启动模型下载。
  // category 为空，因为识别保留原文件位置，不按返回的模型名字移动目录。
  // fileName 是来源记录，不用它决定本地保存路径，防止远程文件名越界。
  // modelName/versionName/creator 按下载来源契约的长度约束保存。
  // 不复制上游 downloadUrl，避免把 API Key 或短期签名写进来源 JSON。
  // 预览缩略图沿用在线卡片的 width=640 策略，避免获取原始大图。
  // 版本说明与模型说明分别保留，已有来源详情可以独立呈现两部分。
  // trainedWords 去重仅影响重复词，不凭模型名称编造不存在的提示词。
  // baseModel 使用 API 返回值，本地文件名通常不能可靠确定模型架构。
  return { modelType, baseModel: text(version.baseModel), modelName: text(model.name, 240), fileName: text(file.name), category: "", sha256,
    previewUrl: previewUrls[0] || "", previewUrls, downloadUrl: `${origin}/api/download/models/${id}`,
    source: { modelId, versionId: id, versionName: text(version.name, 240), creator: text(object(model.creator).username, 240), trainedWords: [...new Set(words)], description: text(model.description, 200000), versionDescription: text(version.description, 200000) } };
}
/**
 * 镜像优先，与在线模型页来源顺序一致；主站作为失败后的回退。
 * 测试可注入 fetcher 检查错误响应，不改动生产传输策略。
 * 每处来源共享一次有上限的信号，避免两个 API 各自无限等待。
 * 父模型读取失败也不会提前保存半份来源资料。
 * 网络和解析错误归一化，不能把含凭据的 URL/错误堆栈返回界面。
 * 两处都返回 404 才声明未找到；混合失败保留可重试的原因。
 * @param {string} sha256 @param {string} key @param {AbortSignal} signal
 * @param {typeof downloadFetch} [fetcher]
 */
async function lookupCivitaiHash(sha256, key, signal, fetcher = downloadFetch) {
  // 默认 notFound 只有在没有更具体错误时保留。
  // 一处网络失败、另一处 404 时仍应提示网络问题，不能断言全站不存在。
  // 成功返回立即结束，不额外查询另一个来源增加等待和暴露面。
  let reason = "notFound";
  // 来源固定，用户只能选择本地文件，无法通过这条能力访问任意接口。
  // 与本项目在线模型功能共用镜像/主站，不新增第三方查询服务。
  // 摘要是唯一文件内容派生值，模型权重字节从不上传到 Civitai。
  for (const origin of ["https://civitai.red", "https://civitai.com"]) {
    // 总事务超时和每来源超时取任意一个先发生的信号。
    // 不分别给两个 API 重置超时，防止来源持续拖延持锁时间。
    // AbortSignal.timeout 不需要额外清理定时器，也不会把 key 写入原因。
    const timed = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
    try {
      // by-hash 给出版本与父模型 ID，是恢复来源的身份起点。
      // 后续请求路径只插入已验证的正整数，而不使用任意远程链接。
      // 不把被删除或未发布版本猜成该模型的最新版本。
      const version = await readJson(`${origin}/api/v1/model-versions/by-hash/${sha256}`, key, timed, fetcher);
      if (typeof version.modelId !== "number" || !Number.isSafeInteger(version.modelId) || version.modelId <= 0) throw new Error("invalid");
      // 父模型 API 用于补足作者及模型级说明，版本接口仍决定触发词。
      // toRequest 会再次检查父模型 ID 与版本关联，拒绝错误页面伪装成功。
      // 两个响应均通过后才返回可保存对象，读取阶段没有本地写副作用。
      return toRequest(version, await readJson(`${origin}/api/v1/models/${version.modelId}`, key, timed, fetcher), sha256, origin);
    } catch (error) {
      // 网络实现可能抛出含主机等细节的异常，不能直接穿过 IPC。
      // timed.aborted 的原因优先，因为底层可能将取消包装成 network。
      // 仅保留本模块认可的稳定原因，其余都归一化为可重试网络失败。
      // unsupportedType 保留为准确业务原因，不能在镜像回退时吞成网络失败。
      // 模型存在却无法由当前适配器保存，与网站未收录是不同问题。
      // 其余未知异常仍统一为 network，不泄漏服务响应正文。
      const message = timed.aborted ? "timeout" : error instanceof Error && ["notFound", "auth", "invalid", "unsupportedType"].includes(error.message) ? error.message : "network";
      if (message !== "notFound") reason = message;
      // 整体已超时就没有必要启动下一来源，返回操作超时即可。
      // 单来源失败仍可回退，兼容主站不可达但镜像可用的实际环境。
      // 不打印重试 URL 或 Authorization，保持密钥仅存在于请求内存中。
      if (signal.aborted) break;
    }
  }
  throw new Error(reason);
}
// 只导出按摘要识别能力，不把底层通用 fetch 或 JSON reader 暴露给 UI。
// 测试通过 fetcher 参数提供可控响应，生产默认始终走现有安全传输。
// 调用者负责保存和资源锁，这里保持纯网络读取及数据适配。
module.exports = { lookupCivitaiHash };
