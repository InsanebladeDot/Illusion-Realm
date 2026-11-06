/**
 * 本地模型资料补全事务：授权路径 → 流式摘要 → 精确查询 → 无覆盖 sidecar。
 * 与下载器共用文件夹锁、来源格式和封面保存器，不改模型本体。
 * 失败只返回稳定状态，底层文件路径和网络凭据不经过异常日志泄漏。
 */
const fs = require("node:fs/promises"), path = require("node:path");
const { configuredPaths } = require("./downloads/model-download-paths");
// 已有 JSON 还须经过同一个只读规范化入口，文件存在不代表可读取。
// 格式错误或未来版本应保留并明确报告，不能趁补全操作覆盖用户资料。
// 配置根与真实路径授权继续复用原有策略。
const { authorizedModel, readLocalModelMetadata } = require("./local-model-metadata");
// 完成标准是扫描器实际选中的图片可解码，不是后缀名像图片即可。
// 这项检查也用于重试已有来源但缺少 logo 的模型。
// 它不改变用户自定义封面或删除损坏图片。
const { hasLocalModelCover } = require("./local-model-cover");
const { reserveFolders } = require("./model-folder-locks");
const { openModelHash } = require("./local-model-hash");
const { lookupCivitaiHash } = require("../civitai/hash-lookup");
const { saveDownloadMetadata } = require("./downloads/model-download-metadata");
const { remoteLogo, saveLogo } = require("./downloads/model-download-transfer");
// 服务层统一协调权限、资源锁和无覆盖提交，渲染层没有文件写入能力。
// 不新增第二套元数据格式，后续 LoRA 触发词消费者可直接读取结果。
// 这些依赖不在模块加载时执行网络操作，注册 IPC 不会触发模型扫描。
/**
 * 仅限制本功能，不改变下载器队列；防止不同窗口同时哈希整棵模型库。
 * 计数在任何 await 之前增加，失败和成功都从 finally 归还。
 * 按需识别单文件，不在扫描模型时自动读取所有 GB 级模型。
 */
let active = 0;
/**
 * IPC 仅接受一个绝对文件路径，真实目录权限稍后异步检查。
 * 字符串上限与现有本地元数据请求一致，不接受对象或批量请求。
 * 主进程手写检查对应 shared Zod tuple，不把 Zod 引入 asar 运行时。
 * @param {unknown[]} args
 */
function validateRecoveryArgs(args) {
  return args.length === 1 && typeof args[0] === "string" && args[0].trim().length > 0 && args[0].length <= 4096 && path.isAbsolute(args[0]) ? null : "Invalid model recovery request";
}
/**
 * 现有 sidecar 无论有效、旧版或手工编辑都保留，包括悬空链接。
 * lstat 避免把指向不存在目标的链接误认为可安全覆盖的位置。
 * 真正写入还采用 hardlink 的 no-overwrite 提交，覆盖异步竞争窗口。
 * @param {string} target
 */
async function exists(target) {
  // lstat 判断路径占位而非目标可读性，坏 JSON 也属于应保留的用户文件。
  // 只有 ENOENT 是确实不存在；权限失败应让整个事务失败。
  // 不将 EACCES 当缺失后尝试写入，否则会误报 existing 或破坏意图。
  try { await fs.lstat(target); return true; }
  catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false; throw error; }
}
/**
 * 扫描器可将目录内任意图片当封面，因此不能只检查 logo.png。
 * 已有可解码封面保留；损坏同名 logo 不覆盖，并反馈图片补全失败。
 * 图片失败不撤销已经保存的文本，界面能区分封面缺失与识别失败。
 * 下载和图片解码复用现有大小限制、格式校验与原子保存逻辑。
 * 30 秒限制包含图片传输；已有 logo 的并发写入仍由无覆盖链接保护。
 * 每个候选最多等待十秒，全组仍受三十秒上限约束，坏首图不挡住后续图片。
 * 候选按顺序尝试，不并行占用多份图片缓冲，也不循环重试同一个地址。
 * @param {string} folder 授权模型所在目录。 @param {string[]} urls 同版本且符合当前偏好的有限候选。
 * @returns {Promise<import('@illusion-realm/shared').LocalModelRecoveryResult['cover']>}
 */
async function recoverCover(folder, urls) {
  try {
    // 文件名或 scanner 的 iconPath 不足以证明图片真的可以展示。
    // 同一验证器同时用于已有图片和下载后的图片，判定口径一致。
    // 不依赖前端扫描缓存，检测当前磁盘上真正选中的封面。
    if (await hasLocalModelCover(folder)) return "preserved";
    if (!urls.length) return "none";
    // 可选预览仍设置独立超时，不能让文字资料已提交后无限等待封面。
    // 整组截止信号传给每个候选，下一张不能重新获得完整三十秒。
    // 单张请求的计时器和监听由 tryRecoverCover 的 finally 清理。
    const signal = AbortSignal.timeout(30000);
    // replace=false 使用 hardlink 提交，意外出现的 logo.png 不会覆盖。
    // remoteLogo 校验网络来源及响应大小，saveLogo 校验实际图片数据。
    // 本地保存为 PNG，后续模型扫描无需新增网络图片加载逻辑。
    // 保存之后还检查页面实际选中的封面，不能只凭 write 成功归类完成。
    // 若外部并发改图或目录中有遮挡文件，返回 unavailable 让用户处理。
    // 不删除已有损坏文件以强行制造一次成功结果。
    for (const url of urls) {
      if (signal.aborted) break;
      if (await tryRecoverCover(folder, url, signal)) return "saved";
    }
    return "unavailable";
  // 预览不是模型身份依据；失败单独报告，不删除已经保存的来源 JSON。
  // 原始异常可能含 URL 或系统路径，所以不向外传播其文本。
  // 用户可以继续使用恢复的触发词，并通过原有入口手工换封面。
  } catch { return "unavailable"; }
}
/**
 * 一次只拥有一个图片请求，像先检查一张照片，不能用就放下再看下一张。
 * remoteLogo 继续限制二十 MiB，saveLogo 仍检查真实图片并原子写入。
 * 子控制器把单张超时和整组截止连在一起，任何一个先到都会停止读取。
 * finally 始终中断自己的读取、移除总信号监听并清除计时器。
 * 不把这个子控制器交给其他候选，失败信号不能污染下一张正常图片。
 * 图片下载成功还要经扫描器复核，只有真实可用才能返回 true。
 * 无覆盖提交继续保护用户封面；失败不会删掉损坏文件或改写来源 JSON。
 * 网络错误、非图片正文和图片解码失败都会进入下一候选，而非误报无图。
 * 下载结束时若总期限已到，不再开始磁盘写入，避免取消后继续提交。
 * 原始异常可能带签名地址，只返回布尔值，不输出网络细节与用户路径。
 * 文件本体和模型摘要不在这层修改，候选回退只影响封面选择。
 * 总信号像关门时间，子计时器像每位顾客的办理时限，两者取先到的一项。
 * 十秒只限制单张连接和读流，原下载器的九十秒停滞保护仍作为内部兜底。
 * 不能直接给总信号调用 abort，否则一张失败会让整个候选集合永久取消。
 * 先建立监听再检查总信号，覆盖上层期限恰好在启动候选前到达的情况。
 * abort 监听只注册一次，结束后主动移除，不让候选数变多时积累回调。
 * finally 中再次 abort 是幂等清理，已正常读取结束的响应不受影响。
 * 保存器不接收取消参数，因此在进入保存前再次检查自己的信号。
 * 图片解码与原子提交开始之后由保存器负责完成，不能在中途删掉目标文件。
 * 保存失败包含目录权限、图片损坏或同名文件竞争，均不能计为 saved。
 * hasLocalModelCover 读取扫描器实际优先的图片，防止保存成功却被坏图遮住。
 * 返回 false 只允许外层继续有限列表，不在此递归重试或增加网络来源。
 * 原有 JSON 可在封面失败后继续提供触发词，这里不回滚文字恢复成果。
 * @param {string} folder 原模型目录。 @param {string} url 当前候选。 @param {AbortSignal} signal 全组共享的截止信号。
 */
async function tryRecoverCover(folder, url, signal) {
  // 当前请求拥有自己的控制器，下一张图片会获得全新的未取消信号。
  // 原下载器接收的是控制器而非独立计时器，读流会随此控制器中止。
  // 不改变下载器公用函数签名，模型权重下载的行为不受本轮影响。
  const controller = new AbortController();
  // stop 不携带 URL 或系统异常，避免取消原因经其他日志泄漏图片签名。
  // 一次候选的两条取消来源共用此动作，不需维护额外的请求状态变量。
  // 已结束后再次触发也不会恢复或重复执行下载。
  const stop = () => controller.abort();
  signal.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, 10000);
  try {
    // 已过总期限时不发请求；监听无法追溯派发此前已经发生的 abort 事件。
    // 这项同步检查与上面的注册配合，封住候选切换间的取消空隙。
    // false 会让外层看见总信号已停止，结束本组而不是再发下一张。
    if (signal.aborted) return false;
    // 仍走专用 Chromium session、跳转白名单和图片二十 MiB 累计限制。
    // 与权重的流式落盘不同，封面允许有限缓冲供原生解码器读取。
    // 当前候选结束后才开始下一个，不同时持有多份封面缓冲。
    const bytes = await remoteLogo(url, controller);
    controller.signal.throwIfAborted();
    await saveLogo(folder, bytes, false);
    // 以可解码为完成条件，不能把 HTML 错误页写成 logo 就报告完成。
    // 检查失败时保留用户目录现状，修复不会自行清除已有自定义图片。
    // 下载成功、写入成功、扫描可用三者均满足，才返回给外层 saved。
    return await hasLocalModelCover(folder);
  } catch { return false; }
  finally { clearTimeout(timer); signal.removeEventListener("abort", stop); controller.abort(); }
}
/**
 * 对需要补资料或补图的模型完成一次真实哈希查询，旧 JSON 始终不覆盖。
 * existing 只用于控制是否需要写来源，不能让缺 logo 的模型提前跳过。
 * 查询后再次校验文件身份，沿用原有模型改写检测。
 * 网络或图片失败允许保留刚写好的 JSON，下一次仍能重试缺失封面。
 * noPreview 与 coverFailed 是未完成原因，单个和批量入口共享此判定。
 * 打开句柄归本函数所有，无论外层如何返回都在 finally 释放。
 * @param {string} model @param {string} filePath @param {string[]} roots
 * @param {boolean} existing @param {{sha256:string}} context
 * @returns {Promise<import('@illusion-realm/shared').LocalModelRecoveryResult>}
 */
async function recoverMissingAssets(model, filePath, roots, existing, context) {
  const signal = AbortSignal.timeout(15 * 60 * 1000), opened = await openModelHash(model, signal);
  try {
    context.sha256 = opened.sha256;
    const request = await lookupCivitaiHash(context.sha256, require("../civitai/secret").resolve().key, signal);
    if (await authorizedModel(filePath, roots) !== model) throw new Error("changed");
    await opened.verify(); if (signal.aborted) throw new Error("timeout");
    if (!existing) await saveDownloadMetadata(model, request);
    const cover = await recoverCover(path.dirname(model), request.previewUrls);
    const status = cover === "none" ? "noPreview" : cover === "unavailable" ? "coverFailed" : existing ? "existing" : "recovered";
    return { status, sha256: context.sha256, cover };
  } finally { await opened.release().catch(() => undefined); }
}
/**
 * 对授权模型持有目录锁和打开句柄，跨过本地读取及远程查询的等待期。
 * 关闭页面不会取消主进程事务，重新进入后可读取已保存的 sidecar。
 * 摘要上限 15 分钟用于慢磁盘；网络每来源另有 30 秒限时。
 * 写之前重新验证真实路径及文件状态，拒绝识别过程中发生的修改。
 * key 只从主进程密钥服务取得，渲染进程不传入也不接收原值。
 * sidecar 复用下载器版本 1 格式，因此触发词等已有功能无需迁移。
 * EEXIST 保留并发写入者资料且报告未完成，不能删除用户文件后重试。
 * 其余 I/O 错误统一为 io；不将系统异常中的本地路径返回 UI。
 * 只有来源可读且实际封面可解码才报告完成；文字资料可以先保留供重试。
 * @param {string} filePath
 * @returns {Promise<import('@illusion-realm/shared').LocalModelRecoveryResult>}
 */
async function recoverLocalModel(filePath) {
  // 用户意图是恢复下载器能保存的公开来源资料，而不是重新下载权重。
  // 成功结果意味着 sidecar 可读且有封面，不能仅凭远程查询成功就返回。
  // 模型文件权限保持只读，不尝试修复格式或写入其 safetensors 头。
  // 摘要按完整内容计算，不采用开头若干字节的快速但不精确匹配。
  // 大文件只占用固定缓冲，事务持有的主要资源是句柄及目录锁。
  // 网络读取有独立上限，不会把远程 JSON 的无限正文装入内存。
  // 模型目录缺少写权限时返回 io，不在别处悄悄保存另一份来源。
  // 根目录授权与普通扫描配置相同，用户无需重复配置模型位置。
  // 新来源文件命名按本地实际文件路径追加 .civitai.json。
  // 该命名保证不同版本即使共用一个模型目录也不会串用资料。
  // 封面仍是目录级资产，自动补图不能覆盖已有目录图片。
  // 来源写入一次；已有来源而没有图片时仍允许重新哈希并查询封面。
  // 没找到资料时不创建空 sidecar，用户后续重试仍可进行实际查询。
  // 所有资源清理必须发生在返回之前，避免已显示完成却仍阻挡分类操作。
  // 全局计数覆盖并发中的授权和查询，不仅覆盖实际读取循环。
  // 同一个事件循环内先检查再递增，中间没有 await 竞争窗口。
  // busy 的调用没有获得资源，不需要进入下面的 finally 归还。
  if (active >= 2) return { status: "busy", sha256: "", cover: "none" };
  active++;
  // 外层负责目录锁与计数，子事务负责打开的模型句柄，所有权不交叉。
  // context 保留已经算出的摘要，查询失败后仍允许用户独立复核。
  // 空摘要表示尚未真正读取模型，不能声称已经完成校验。
  const context = { sha256: "" }; let release = () => {};
  try {
    // 配置由主进程持久化服务读取，不接受 renderer 给出的根目录。
    // authorizedModel 同时检查扩展名、绝对路径及 realpath 所在根。
    // 根不可用、路径不存在或链接越界都不能触发远程查询。
    const roots = Object.values(configuredPaths()).filter(Boolean), model = await authorizedModel(filePath, roots);
    if (!model) return { status: "invalid", sha256: "", cover: "none" };
    // 锁粒度是模型文件夹，与下载、分类移动及回收操作保持一致。
    // reserveFolders 还处理真实路径身份，避免不同拼写绕过互斥。
    // 加锁后再检查 sidecar，防止先读取缺失状态再等待其他写操作。
    release = reserveFolders([path.dirname(model)]);
    // JSON 文件存在不等于资料可读，更不代表 logo 存在。
    // 先检查旧格式可读性，坏文件保留并说明原因，不自动覆盖用户内容。
    // 只有来源与封面都已具备才能提前结束，避免旧版丢失封面重试机会。
    const existing = await exists(model + ".civitai.json");
    if (existing && (await readLocalModelMetadata([model]))[0]?.status !== "ready") return { status: "metadataInvalid", sha256: "", cover: "none" };
    if (existing && await hasLocalModelCover(path.dirname(model))) return { status: "existing", sha256: "", cover: "preserved" };
    return await recoverMissingAssets(model, filePath, roots, existing, context);
  } catch (error) {
    // 所有底层异常先在服务内转换，避免 registerHandle 打印真实用户路径。
    // 已认可的错误原因来自本模块或查询器，不附带远程正文及堆栈。
    // 未知 I/O 原因默认 io，不能把意外异常当作恢复成功。
    const reason = error instanceof Error ? error.message : "io";
    // 另一个外部写入者可能在 exists 检查后创建来源文件。
    // 并发创建 sidecar 的 EEXIST 不再伪装成已完成，因为未必有 logo。
    // 返回 io 让用户重试，由下一轮的只读与封面校验重新判定。
    // 来源文件始终保留，不为了成功统计而删除另一个写入者的资料。
    // 类型不适配保留独立原因，不能将它误报成网站不存在或无写权限。
    // 允许批量用户分辨“不在 C 站”与“当前插件尚不支持此类型”。
    // 其他未知异常仍归入 io，禁止抛出底层文件路径。
    const status = ["notFound", "auth", "network", "invalid", "changed", "busy", "timeout", "unsupportedType"].includes(reason) ? /** @type {import('@illusion-realm/shared').LocalModelRecoveryResult['status']} */ (reason) : "io";
    // 失败时没有自动回滚删除任何已存在文件，模型本体始终只读。
    // 摘要可能已算出而资料未保存，返回它不表示版本已被确认。
    // cover=none 避免在身份匹配失败后尝试图片下载。
    return { status, sha256: context.sha256, cover: "none" };
  // 优先关闭句柄，再释放目录锁，让下一项操作看到完整提交结果。
  // 关闭失败不应覆盖已经保存的业务结果，但锁与计数必须仍然归还。
  // finally 包含所有提前返回路径，包括 existing、invalid 和查询失败。
  // 模型句柄已由子事务关闭，这里必须始终释放目录锁及全局名额。
  // 批量运行会顺序调用此入口，异常不能阻挡所有后续文件。
  // 返回未完成状态不影响下一项独立模型继续识别。
  } finally { release(); active--; }
}
// IPC 只注册单文件事务和参数检查器，不暴露可自由调用的文件写入原语。
// 主进程回归直接使用同一事务，覆盖持久化及互斥而不复制实现。
// 页面批量队列逐个调用本入口，普通扫描仍不自动触发全库哈希。
module.exports = { recoverLocalModel, validateRecoveryArgs };
