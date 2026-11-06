/**
 * 模型识别专项：真实文件读取、真实 IPC 注册、模拟 Civitai 响应。
 * 所有模型、来源 JSON、封面及密钥路径都位于新建临时目录。
 * 不访问实际模型库；模拟服务验证容错，不能当作线上 API 可用性证据。
 * 从仓库根运行 pnpm exec electron scripts/verify-local-model-recovery.js。
 * 本脚本使用 Electron 原生图片解码，因此不能直接用普通 node 代替执行。
 * 不读取 apps/next/out；纯服务检查不需要以静态构建为前置条件。
 * 页面点击与旧 LoRA 消费链在 smoke-local-model-metadata 中独立验证。
 * 两个测试脚本应分别启动，避免 Electron 生命周期互相干扰。
 * 服务测试只检查公开 JSON 字段及文件完整性，不推断训练参数是否正确。
 * abc 夹具不具备真实模型权重，但对按字节计算摘要的算法是有效输入。
 * 固定块长检查针对读取接口，不能解释成对操作系统页缓存的内存统计。
 * 没有进行 GB 级实际磁盘吞吐基准，不将小文件耗时外推为用户机器性能。
 * 不覆盖断电或文件系统损坏下的 crash consistency。
 * junction 负向用例验证授权边界，不要求 Windows 文件符号链接特权。
 * 跨 IPC 的浏览器进程消息传输另由页面冒烟执行，这里只验证注册与封装。
 * 模拟接口不验证线上密钥权限，实际 key 仍由主进程凭据服务管理。
 * 默认路径全部位于系统临时目录，运行失败不应到真实模型库寻找测试文件。
 */
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { app, nativeImage, ipcMain } = require("electron");
// 使用系统临时目录，避免测试产物污染 docs、模型库或 Next 静态导出。
// mkdtemp 为每次执行产生独立目录，前一次失败不会改变本轮缺失状态。
// 目录创建在任何服务加载之前，生产配置读取只会看到隔离后的根。
// Electron 的 userData 也指向夹具，不能借用用户已保存的界面偏好。
// 测试不会创建或修改用户真实的下载队列持久化文件。
// 清理只处理本轮创建的 root 和显式创建的 outside 临时根。
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-model-recovery-"));
/**
 * 在加载依赖前隔离用户配置，避免读取真实模型目录或密钥。
 * 生产 configuredPaths 仍执行原有逻辑，仅它的持久化输入是夹具。
 * 测试失败时保留临时目录供复核，成功后才清理本轮目录。
 */
app.setPath("userData", path.join(root, "browser")); process.env.ILLUSION_CIVITAI_SECRET_DIR = path.join(root, "secrets");
require("../apps/electron/src/main/storage/user-data").readUserData = () => ({ data: { settings: { paths: { searchPath: root }, civitaiContentAccess: contentAccess } }, filePath: "", isNew: false });
// 密钥服务替换为固定测试值，不在真实凭据文件写任何数据。
// 断言检查授权头及落盘 JSON，覆盖“可用于请求但不可泄漏到来源”的边界。
// 这只是测试密钥，不会发送到外部网站，默认 fetcher 已完全由夹具替换。
require("../apps/electron/src/main/modules/civitai/secret").resolve = () => ({ key: "fixture-test-key", protection: "" });
/**
 * abc 的 SHA-256 采用公开已知向量，避免实现与测试共用同一摘要算法产生恒真。
 * 远程返回使用大写摘要，确认与 PowerShell 常见展示方式兼容。
 * 所有查询必须使用实际算出的摘要，而不能按本地文件名匹配。
 */
const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
let mode = "ok", calls = 0, mutated = "", unblock, preview, contentAccess = null;
// contentAccess 模拟用户文档里的既有偏好，产品代码仍通过原存储函数读取。
// 同一进程依次开启再关闭，能发现生产适配器是否错误缓存了旧值。
// previewRequests 只记录图片，不将父模型详情请求误算成封面重试。
// 每个需要检查顺序的用例先清空记录，避免前一组的请求干扰期望。
// 记录保存在测试内存中，不修改下载队列或写入生产日志。
const previewRequests = [];
// mode 的生命周期由顺序执行的检查组控制，避免并发组之间互相改响应。
// calls 用来证明提前拒绝的请求没有偷偷访问远程接口。
// mutated 只允许指向当前夹具文件，不从外部输入接收任意写入路径。
// unblock 表示 fetcher 已进入等待，检查组无需根据猜测延迟开始断言。
// preview 在 app.ready 后创建，符合 Electron nativeImage 的调用前提。
// 所有模拟状态仅存于测试进程，不向生产服务新增调试全局变量。
/**
 * 夹具按 URL 区分版本与父模型；不会把一个万能对象用于所有响应。
 * 模拟覆盖 404、鉴权、坏 JSON、超大响应和错误哈希。
 * hold 模式延迟真实事务，用于检查并发上限和文件夹锁。
 * changed 模式在哈希完成后的请求期间修改原文件。
 * logo 模式提供真实 PNG 字节，验证现有图片转换与无覆盖提交。
 * 所有响应均走生产 readJson/lookup/recovery，不替换业务判断。
 */
require("../apps/electron/src/main/modules/models/downloads/model-download-network").downloadFetch = async (url, options) => {
  // 每一次调用都会被记录，包括主站回退和可选封面请求。
  // omit 是生产网络边界的一部分，测试必须明确检查而非仅忽略参数。
  // URL 不含本地文件路径，远端识别只需要文件摘要。
  calls++; assert.equal(options.credentials, "omit");
  if (url.includes("preview")) {
    // 即使请求返回错误也先记录，这样能证明首张确实失败后才尝试第二张。
    // 只看 saved 状态无法排除跳过首图或并发请求全部候选的错误实现。
    // 这里的域名来自固定夹具；测试没有连接该公网地址。
    previewRequests.push(url);
    // 第一种失败是正常 HTTP 404，没有抛异常也应由生产下载器判为失败。
    // 第二种是 HTTP 200 的坏正文，必须走到图片解码才会被拒绝。
    // 两类失败分别覆盖网络状态与媒体内容校验，不能用同一个 mock 异常替代。
    if (mode === "coverFail" || url.includes("preview-missing")) return new Response("", { status: 404 });
    // 有效分支返回 nativeImage 生成的字节，不是伪装成 PNG 的字符串。
    // 失败分支没有 content-type 帮忙提前识别，保存器必须检查真实内容。
    // 所有读取仍通过 Response.body，覆盖实际下载器的逐块读取路径。
    return new Response(url.includes("preview-invalid") ? "not an image" : preview);
  }
  // API 请求必须把凭据放入 header，不能塞进用于落盘的 URL。
  // 图片请求在上方独立返回，它不应借用模型 API 的授权头。
  // 对主站与镜像都执行相同断言，覆盖回退来源的鉴权行为。
  assert.equal(options.headers.Authorization, "Bearer fixture-test-key"); assert.ok(!url.includes("fixture-test-key"));
  if (mode === "hold") await new Promise(resolve => { unblock = resolve; });
  // 修改发生在服务已完成哈希后，此时第一次文件状态检查已经通过。
  // 追加一字节避免依赖文件系统毫秒时间戳的分辨率。
  // mode 立即恢复，防止父模型请求再次修改同一文件混淆失败原因。
  if (mode === "changed") { fs.appendFileSync(mutated, "x"); mode = "ok"; }
  // 两个固定来源使用相同模拟 HTTP 错误，保证回退后仍保留对应原因。
  // 403 是权限拒绝，不能当作模型未收录的 404。
  // 空响应体可以正常取消，测试不依赖网站返回的 HTML 错误页内容。
  if (mode === "notFound" || mode === "auth") return new Response("", { status: mode === "auth" ? 403 : 404 });
  // 连接失败没有 HTTP 状态码，不能被当作 404 或 JSON 格式错误。
  // 使用无敏感信息的异常作为模拟网络断连，生产层负责稳定原因收敛。
  // 两个来源都失败后必须明确返回 network，不创建来源文件。
  if (mode === "network") throw new Error("connection fixture");
  // HTTP 200 不保证 JSON 有效，模拟代理错误页面仍被标记为 invalid。
  // 超大响应不提供 Content-Length，迫使生产代码执行逐块大小累计。
  // 两类错误均不能创建空的来源文件当作“已处理”。
  if (mode === "malformed") return new Response("<html>not JSON</html>");
  if (mode === "oversized") return new Response(" ".repeat(2 * 1024 * 1024 + 1));
  const hash = url.split("/").pop();
  // 版本夹具包含重复词，保存端应去重而不是把两份提示词带回 UI。
  // 返回的文件名故意与本地 renamed 不同，证明名称不是身份依据。
  // SHA256 转大写只改变表示形式，不能导致真实相同的摘要被拒绝。
  // mismatch 改为另一个完整合法摘要，排除仅检查正则格式就通过的错误。
  // 作者与模型说明只在父模型响应里，强制查询器完成第二次关联读取。
  // wrongModel 让父模型 ID 与版本不同，不能借模型名相近而接受。
  // 预览使用白名单主机，模拟响应字节来自实际 PNG 编码器。
  // 基础模型固定 Anima，用于验证新入口复用当前模型信息展示字段。
  // 无预览仍然是有效模型响应，必须与模型不存在或图片下载失败分开。
  // 只移除 images，版本和完整 SHA-256 仍准确匹配。
  // 确保新的完成规则确实包含 logo，而不只是模型身份查询成功。
  const version = { id: 43, modelId: 42, name: "Matched version", baseModel: "Anima", description: "Version description", trainedWords: ["alice", "alice", "fixture style"], files: [{ name: "remote-name.safetensors", hashes: { SHA256: mode === "mismatch" ? "f".repeat(64) : hash.toUpperCase() } }], images: mode === "noPreview" ? [] : [ { type: "image", nsfwLevel: 1, url: "https://image.civitai.com/preview.png" } ] };
  // VAE 等类型可能出现在当前筛选，失败原因不能伪装为没有查到模型。
  // 模拟类型不支持而 SHA-256 与父模型 ID 仍然合法的配对输入。
  // 这样可以区分身份校验失败和来源适配器能力不足。
  const model = { id: mode === "wrongModel" ? 99 : 42, type: mode === "unsupportedType" ? "VAE" : "LORA", name: "Recovered model", creator: { username: "Fixture author" }, description: "Model description" };
  // 在 API 对象序列化前修改，生产适配器收到的是 JSON 而不是测试对象引用。
  // 版本接口与父模型接口每次各生成一份，但模式保持相同。
  // 因此同版本补图不能靠第二次请求碰巧读取到第一次对象的内存变更。
  adjustPreviewFixture(version, model);
  return Response.json(url.includes("by-hash") ? version : model);
};

/**
 * 图片夹具只变更远端 JSON，真实哈希、PNG 解码和文件保存继续走生产代码。
 * 缺字段模拟旧版接口，高等级模拟用户已开启内容偏好的实际返回。
 * 这些图片只用同一份无人物的单像素 PNG，不从网络获取内容。
 * parent 模式故意让其他版本排前面，防止实现偷偷借用错误版本的图。
 * fallback 同时放入失联地址和坏字节，必须真正试到第三张可解码 PNG。
 * 除图片字段外不修改文件哈希与父模型 ID，避免身份校验掩盖图片回归。
 * 缺 nsfwLevel 和缺 type 分开设置，便于定位是哪一项兼容处理失效。
 * restricted 使用数值 4，而不是字符串，确认走的是明确分级过滤。
 * 所有候选的 HTTPS 域名都在生产白名单内，失败不能来自域名不允许。
 * fixture URL 没有鉴权查询参数，封面请求不应该继承版本查询使用的 Bearer 头。
 * 图片响应失败时主模型身份依然有效，候选调整不会改写 files[].hashes。
 * 每次父模型查询也调用此函数，若未来改为复用响应缓存仍需保持两个接口语义。
 * 测试不承诺 C站在所有请求中同时提供这两份图片数组，只验证任意一处可缺省。
 * 数组成员是普通 JSON 对象，不依赖类实例原型或 Electron 特殊序列化。
 * JSON 里的图片顺序由夹具明确给定，不能从文件系统的目录枚举顺序推断。
 * 封面条目不携带模型文件路径，远端服务不能通过图片字段指定本地保存位置。
 * 这些夹具也不携带 inline Base64，防止绕过既有网络白名单和读流限制。
 * 其他版本 ID 为 99，精确版本为 43，固定数字不从生产选择结果推导。
 * videoOnly 保留 .png 后缀，用来反证显式视频类型不会被后缀覆盖。
 * 无人物像素图仅作为解码素材，分级等级用于测试偏好逻辑而非描述图像内容。
 * @param {Record<string, unknown>} version 模拟哈希接口响应。 @param {Record<string, unknown>} model 模拟父模型详情，按当前模式补足同版本图片。
 */
function adjustPreviewFixture(version, model) {
  // 各模式从同一正常图片派生，保证唯一差异是当前要测试的字段。
  // 不在此创建 logo 文件，否则恢复过程可能直接走“已存在封面”捷径。
  // 正常图片的字节只在网络替身收到图片请求时才返回。
  const image = { type: "image", nsfwLevel: 1, url: "https://image.civitai.com/preview.png" };
  if (mode === "missingLevel") version.images = [{ type: "image", url: image.url }];
  if (mode === "legacyImage") version.images = [{ url: image.url }];
  if (mode === "restricted") version.images = [{ ...image, nsfwLevel: 4 }];
  if (mode === "fallback") version.images = [{ ...image, url: image.url.replace("preview", "preview-missing") }, { ...image, url: image.url.replace("preview", "preview-invalid") }, image];
  if (mode === "parentImages") {
    // 哈希接口完全没有图片，迫使查询器读取详情中对应版本的 images。
    // 错误版本排第一，用来发现无条件采用 modelVersions[0] 的实现。
    // 两个候选的地址不同，后面的请求记录可以识别究竟下载了哪一版。
    version.images = [];
    model.modelVersions = [{ id: 99, images: [{ ...image, url: image.url.replace("preview", "preview-wrong-version") }] }, { id: 43, images: [image] }];
  }
  if (mode === "videoOnly") version.images = [{ ...image, type: "video" }];
}

/**
 * 旧接口缺失 nsfwLevel 或 type 的两种情况都应该真的生成本地 logo。
 * 使用独立目录，防止前一个用例留下的图片让后续提前返回 existing。
 * 最终图片由 nativeImage 再次解码，不能把路径存在当成可显示证据。
 * 模型原字节仍是 abc，补图不能修改或重命名用户权重。
 * 这是确定性服务回归，不声称该模拟接口验证了公网可达性。
 * API 地址和正文为夹具，凭据边界仍由原 fetcher 断言覆盖。
 * 两种缺省字段各运行完整事务，不只测试私有过滤函数返回是否非空。
 * 模型使用独立目录，保存成功必须是本轮新增的 logo，不能借用兄弟目录。
 * 当前测试不要求图片保留原文件格式，生产会统一转换为 PNG。
 * 解码器是 Electron 实现，运行普通 Node 不能替代这项检查。
 */
async function checkLegacyPreviewFields() {
  // 固定列出两个模式，不从适配器内部支持项推导，避免测试与实现一起漏项。
  // setting 同时用于目录名和断言消息，失败后可准确定位是哪一种旧响应。
  // 所有异步恢复逐个 await，防止模式在前一事务尚未结束时就被切换。
  for (const setting of ["missingLevel", "legacyImage"]) {
    mode = setting;
    const file = fixture(setting), result = await recoverLocalModel(file);
    // saved 是额外封面的真实提交状态，单纯文本 recovered 不足以满足本组。
    // 目录里本来无图，因此 preserved 也不能通过这条断言。
    // 用 setting 标注失败原因，而不打印用户或测试模型的完整路径。
    assert.equal(result.cover, "saved", setting);
    // 再独立从磁盘解码，不复用服务返回的缓冲或 image 对象。
    // 文件存在但内容损坏时 nativeImage.isEmpty 会为 true，必须导致测试失败。
    // 权重原内容校验与封面校验独立，补图不能靠改动模型文件完成。
    assert.equal(nativeImage.createFromPath(path.join(path.dirname(file), "logo.png")).isEmpty(), false);
    assert.equal(fs.readFileSync(file, "utf8"), "abc");
  }
  mode = "ok";
}

/**
 * 默认关闭、已确认开启与失效授权用相同远程图片形成配对对照。
 * 未开启时仍不能下载受限图，不能把修复丢图扩大为绕过现有偏好。
 * 开启后必须真的落盘，防止只改 previewUrl 而保存流程依旧失败。
 * 再次关闭后新模型不能沿用上一次读取的偏好缓存。
 * 无效时间和旧协议版本分别验证，与 shared 的确认规则保持等价。
 * 已保存来源而缺图的项目重试，确认不因 JSON 存在直接跳过封面。
 * 重试后逐字比较来源 JSON，作者资料不会因补图被覆盖。
 * 第一次明确没有确认记录，远端模型存在也不应突破本地偏好获取图片。
 * 失败只允许保存可读的文字资料，不能抛弃来源或把模型说成未收录。
 * 第二次继续用同一模型，重点覆盖“有 JSON、没有图”的恢复入口。
 * acceptedAt 使用当前毫秒时间，仅代表测试确认，不读取真实用户协议记录。
 * 负向时间取 -1，避免零值在不同默认值处理下产生含糊的测试前提。
 * 旧版本取 0，明确区别于当前版本 1，而不是把版本字段省略。
 * 最后恢复 null，后续非偏好用例不能借用上一条已经开启的状态。
 * 这组像同一本相册先锁住再解锁，模型身份没变，改变的只是能查看哪些图片。
 * 限制发生在下载前，不能先保存受限图片再依靠 UI 隐藏它。
 * 第一轮创建的 sidecar 是后续重新恢复封面的依据，但不能取代重新查询。
 * 首轮缺封面的结果不算完成，批量入口才会把它保留在可重试项目中。
 * 第二轮成功时 JSON 的语义可能相同，逐字比较还能捕获保存时间等意外变动。
 * 测试不接受开启后只返回已有来源状态而没有封面，必须明确 cover=saved。
 * 失效授权用新文件验证，是因为已保存的用户图片按产品规则应继续保留。
 * 不能用删除旧封面的方式测试关闭偏好，那会违反本轮不改用户图片的边界。
 * 同进程多次读取可暴露模块初始化时缓存偏好的错误，无需重载 CommonJS 模块。
 * 真实协议确认交互由已有内容访问页面承担，本组不模拟用户点击同意按钮。
 */
async function checkContentPreference() {
  mode = "restricted";
  const file = fixture("restricted-preview");
  // 返回 noPreview 而非 notFound，说明哈希查到了模型但当前没有合适封面。
  // 原 JSON 的字节保存下来，补图重试后不能改变来源链接、作者或保存时间。
  // 这比只比较 metadata.versionId 更严格，能捕获无必要的整份重写。
  assert.equal((await recoverLocalModel(file)).status, "noPreview");
  const original = fs.readFileSync(file + ".civitai.json", "utf8");
  contentAccess = { enabled: true, agreementVersion: 1, acceptedAt: Date.now() };
  // 只改模拟用户设置，不删除 JSON、重建模型或手工放入封面。
  // 若 existing 分支仍然错误短路，这里只能返回 none 而无法得到 saved。
  // 成功证明偏好读取、图片选择和真实保存已连通，不只是设置对象变了。
  assert.equal((await recoverLocalModel(file)).cover, "saved");
  assert.equal(fs.readFileSync(file + ".civitai.json", "utf8"), original);
  for (const accepted of [null, { enabled: true, agreementVersion: 0, acceptedAt: 1 }, { enabled: true, agreementVersion: 1, acceptedAt: -1 }]) {
    // 每次使用新目录，之前已保存的封面不能让失效确认看上去仍然能补图。
    // calls 在请求时增长，用它区分夹具名，不参与业务期望值的计算。
    // 如果生产缓存了上次开启状态，这些项目会保存图片并立即失败。
    contentAccess = accepted;
    assert.equal((await recoverLocalModel(fixture(`restricted-${calls}`))).status, "noPreview");
  }
  contentAccess = null; mode = "ok";
}

/**
 * 首图 404、第二张坏图片、第三张有效，三个请求顺序必须与候选一致。
 * 只看最后 saved 不足以证明回退，因此另外核对实际请求地址。
 * 真正 PNG 保存前的解码异常会被下一候选接住，不保留半截临时文件。
 * 成功后扫描器要能发现 logo.png，保证列表刷新有真实图片来源。
 * parent 模式验证 by-hash 没图时可补同版本详情中的图片。
 * 其他版本的图片不得被访问，即使它在数组第一项也不例外。
 * 全部只有视频时仍返回 noPreview，不把视频字节交给图片保存器。
 * 三张候选都属于同一版本，失败回退不能通过换成其他模型的图来通过。
 * 文件集合包含模型、来源和封面，任何 .part 遗留都会使精确集合断言失败。
 * 不验证并发下载速度，生产设计明确为逐张尝试以控制内存与请求量。
 * 父模型用例切换前清空图片记录，避免误把上一组的成功图当作当前证据。
 * 视频用例放最后，正常可下载的图片字节仍在替身中可用，拒绝来自类型判定。
 * 这项负向对照防止简单“取第一条 URL”修复遗漏类型边界。
 * 回退像检查一叠照片，前两张不能用才翻第三张，而不是把坏照片盖住好照片。
 * 第一次 404 应在写入前结束，第二次解码失败也应在创建目标文件前结束。
 * 如果失败候选留下 logo.png，第三张会受到无覆盖保护而无法正常完成。
 * 因而最终 saved 与精确文件集合配对，也覆盖失败候选不能阻挡后续提交。
 * 候选错误不应重新计算权重哈希，所有尝试仍属于同一文件的单次事务。
 * 这里没有人为改变文件内容或释放重启任务，回退来自生产恢复器自身。
 * 父版本补图依旧经过 by-hash 的 SHA256 校验，不支持绕过身份检查直接找图片。
 * 错版候选虽然排列靠前，但必须在网络请求之前排除，不能下载后再丢弃。
 * 元数据中的 previewUrl 仍可记录当前首图，本组不要求下载失败后重写 JSON。
 * 版本回退仅指同版本响应中的其他图片，不涉及模型版本降级或自动更新。
 */
async function checkPreviewFallback() {
  // URL 的顺序是固定独立期望，不能从生产 collectPreviewUrls 的结果复制。
  // 每条地址只应出现一次，失败项被重复请求也会导致 deepEqual 失败。
  // 失败时保留测试目录，以便区分下载、解码和落盘哪一步产生异常。
  mode = "fallback"; previewRequests.length = 0;
  const file = fixture("preview-fallback");
  assert.equal((await recoverLocalModel(file)).cover, "saved");
  // 仅比较路径去掉共同域名，仍保留能够区分三种模拟响应的完整图片身份。
  // 第三项出现说明前两次失败没有直接放弃；没有第四项说明成功后及时结束。
  // 顺序断言不替代下面的磁盘检查，请求三张不意味着真正保存了一张。
  assert.deepEqual(previewRequests.map(url => new URL(url).pathname), ["/preview-missing.png", "/preview-invalid.png", "/preview.png"]);
  assert.deepEqual(fs.readdirSync(path.dirname(file)).sort(), ["logo.png", "renamed.safetensors", "renamed.safetensors.civitai.json"]);
  mode = "parentImages"; previewRequests.length = 0;
  // 详情的同版本图片可用，即使 by-hash 的 images 是空数组也应成功。
  // 错误版本图片在网络替身中同样能返回有效字节，不能靠下载失败淘汰它。
  // 因此检查从未请求 wrong-version 才能证明版本关联在下载前生效。
  assert.equal((await recoverLocalModel(fixture("parent-images"))).cover, "saved");
  assert.equal(previewRequests.some(url => url.includes("wrong-version")), false);
  mode = "videoOnly";
  // 视频 URL 故意保留 PNG 后缀，任何仅看扩展名的实现都会错误下载成功。
  // noPreview 明确表示没有图片候选，而非下载坏视频后的 coverFailed。
  // 这一区别让用户理解应该换封面而不是反复重试相同媒体。
  assert.equal((await recoverLocalModel(fixture("video-preview"))).status, "noPreview");
  // 模式恢复后后续授权、并发和 IPC 测试仍要成功，避免图片组改变全局行为。
  // 临时文件夹只由本脚本管理，不会替用户批量重试真实模型库。
  // 所有失败正文只在内存夹具中，不保存为模型来源或界面诊断文本。
  // 这里未模拟超慢 CDN，十秒单候选与三十秒总期限的实时时序不算已覆盖。
  mode = "ok";
}

const { openModelHash } = require("../apps/electron/src/main/modules/models/local-model-hash");
const { recoverLocalModel, validateRecoveryArgs } = require("../apps/electron/src/main/modules/models/local-model-recovery");
// 测试直接引入生产事务，不能另写一个仅按假对象返回成功的恢复实现。
// 网络替换已在服务加载之前完成，CommonJS 解构绑定能得到夹具 fetcher。
// 哈希模块始终使用真实 fs，读取长度和文件状态都是实际文件系统结果。
// 参数校验器与 IPC handler 共用，不复制一份测试专用的校验规则。
// 模块装载本身不发网络请求，避免夹具状态尚未准备好就开始识别。
// 所有成功保存都经过 saveDownloadMetadata，覆盖真实 sidecar 格式。
/**
 * 每个用例创建独立模型文件夹，避免已有 sidecar 让失败路径提前返回。
 * 模型内容相同且文件名不同，用来证明来源匹配依靠字节摘要。
 * 默认 abc 只用于验证识别链路，不是一个可在 ComfyUI 加载的模型。
 */
function fixture(name, content = "abc") { const file = path.join(root, name, "renamed.safetensors"); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; }
/**
 * 模型本体不允许 readFile；通过 open/read 检查每次请求最多 1 MiB。
 * 使用超过五个块的文件确保不是仅在极小夹具上满足流式要求。
 * 独立已知向量验证结果正确性；大文件用例只验证 I/O 的内存上界。
 * 原函数在 finally 恢复，避免污染后续 Node 模块行为。
 * release 后再次打开写入，确认哈希句柄没有泄漏 Windows 文件占用。
 */
async function checkStreaming() {
  // 第一条检查是当前实现的已知答案，不将另一次同算法计算当成期望值。
  // verify 与 release 都真实调用，不能只检查摘要字符串后遗忘句柄。
  // 小文件测试提供算法正确性基线，大文件测试再验证分块机制。
  const small = fixture("hash"), opened = await openModelHash(small, AbortSignal.timeout(5000));
  assert.equal(opened.sha256, ABC); await opened.verify(); await opened.release();
  // 最后一块只有 17 字节，覆盖不能把缓冲剩余内容也送入摘要的边界。
  // 记录 read 调用的 length，而不是观察进程总内存这种不稳定指标。
  // 进程内其他依赖加载可能改变 RSS，所以这里不以 RSS 阈值作断言。
  const large = fixture("large", Buffer.alloc(5 * 1024 * 1024 + 17, 42)), original = fs.promises.open; let reads = 0, largest = 0;
  fs.promises.open = async (...args) => { const handle = await original(...args), read = handle.read.bind(handle); handle.read = async (...values) => { reads++; largest = Math.max(largest, values[2]); return read(...values); }; return handle; };
  // 拦截只包一层生产 FileHandle.read，不提供伪造的文件字节或长度。
  // 如果实现改用整文件 readFile，这里无法观察到六次分块读取并会失败。
  // 文件仍以真实异步读取执行，能发现 offset 或短块处理的基本错误。
  try { const largeHash = await openModelHash(large, AbortSignal.timeout(5000)); await largeHash.release(); }
  finally { fs.promises.open = original; }
  // 六次读取对应五个完整块和一个尾块，最大请求严格为 1 MiB。
  // append 在 release 后运行，避免把“句柄还开着”的问题藏在进程退出里。
  // 此检查不声称磁盘断电一致性，只验证当前进程的读取与释放行为。
  assert.equal(reads, 6); assert.equal(largest, 1024 * 1024); fs.appendFileSync(large, "x");
}
/**
 * 边界检查不使用真实等待，所有取消信号都在操作前明确设为 aborted。
 * 空模型是下载占位文件的常见形态，不能查询它的空内容摘要。
 * 取消后应关闭已打开句柄，随后还能删除或写入同一个临时文件。
 * 查询超时通过明确已中止信号和模拟抛错验证分类，不依赖网站速度。
 * 此检查证明错误映射与资源回收，不声称模拟了磁盘硬件永久阻塞。
 * 正常下载器文件格式判断与本功能无关，本组不尝试加载模型权重。
 * 返回超时与网络失败必须不同，以便界面提供准确的重试原因。
 */
async function checkBoundaries() {
  // 两个失败输入都使用 openModelHash 的真实打开与关闭路径。
  // 没有以假的 hash 函数替代实际读取，因此异常资源回收仍可受测。
  // 取消模型和空模型各使用独立文件夹，不依赖前一次错误留下的状态。
  // AbortSignal.abort 不引入真实网络等待，结果在本机速度变化时也确定。
  // 查询错误优先级需要单独验证，文件超时检查无法证明网络错误映射正确。
  // 最后的模拟传输不会返回 JSON，确保走查询器 catch 而非适配成功分支。
  // 若查询器把底层异常直接穿透，断言会因错误文本不为 timeout 而失败。
  // 显式写空字符串创建零字节夹具，避免 fixture 默认 abc 隐藏空文件路径。
  // 生产实现必须在任何哈希循环之前拒绝它。
  // 不接受返回空内容的标准 SHA-256 来伪装成一个可识别模型。
  await assert.rejects(openModelHash(fixture("empty", ""), AbortSignal.timeout(5000)), { message: "invalid" });
  // 使用已取消信号，测试不需要设置毫秒级 sleep 或等待定时器竞争。
  // 非空文件可确保失败来自取消检查，而不是上面的空文件检查。
  // 标准化错误必须是 timeout，而非 Node DOMException 的长文本。
  await assert.rejects(openModelHash(fixture("aborted"), AbortSignal.abort()), { message: "timeout" });
  // 查询器使用生产方法，但传输只负责抛出模拟底层中断异常。
  // 外层信号已取消应优先归类超时，不能被底层 network 文本覆盖。
  // 摘要采用合法已知向量，排除输入格式错误影响错误分类。
  const lookup = require("../apps/electron/src/main/modules/civitai/hash-lookup").lookupCivitaiHash;
  await assert.rejects(lookup(ABC, "", AbortSignal.abort(), async () => { throw new Error("transport abort"); }), { message: "timeout" });
}
/**
 * 完整恢复执行真实 hash、元数据适配、原子 sidecar 与 PNG 转换。
 * 查询返回不同文件名，保存仍针对被选中的原模型，不能创建远程命名的模型。
 * JSON 不包含模拟密钥；触发词去重且版本/作者/基础模型均正确。
 * 对保存后的模型再校验摘要，确认恢复不会改动模型本体。
 * 第二次调用应在网络前返回 existing，并逐字保留来源与封面。
 */
async function checkSuccess() {
  // 新文件夹保证 sidecar 缺失，避免恢复入口提前走 existing 的捷径。
  // 成功必须同时有准确摘要、已保存来源与成功 PNG 封面三个证据。
  // 文件名与远程不同是正常情况，不能被当成身份不匹配。
  const file = fixture("success"), result = await recoverLocalModel(file);
  // recovered 仅说明文本已保存；cover=saved 单独说明可选图片也写成功。
  // 这组明确检查二者，其他组分别检查图片失败及已有自定义图片。
  // SHA-256 应与固定 abc 向量相等，不能信任接口原样回显的任意字符串。
  assert.equal(result.status, "recovered"); assert.equal(result.sha256, ABC); assert.equal(result.cover, "saved");
  const raw = fs.readFileSync(file + ".civitai.json", "utf8"), metadata = JSON.parse(raw), before = calls;
  // 读取真实磁盘文件而不是服务返回的对象，证明提交完成后才报告成功。
  // 原始内容保留给重复调用比对，捕获不必要的重写时间戳等变更。
  // 作者来自父模型、触发词来自版本，两个来源层级不能交叉取错。
  assert.deepEqual(metadata.trainedWords, ["alice", "fixture style"]); assert.equal(metadata.versionId, 43); assert.equal(metadata.creator, "Fixture author");
  // 检查基础模型及摘要，确保新入口生成的字段与下载器约定一致。
  // 模型本体逐字仍为 abc，不能通过改模型文件来“修复”哈希不匹配。
  // 远程名称只进入来源记录，不将本地文件悄悄重命名为服务器文件名。
  assert.equal(metadata.baseModel, "Anima"); assert.equal(metadata.sha256, ABC); assert.equal(fs.readFileSync(file, "utf8"), "abc");
  // sidecar 复用 writer 之后仍不能包含密钥、签名或内部请求头。
  // 检查原始文本，不仅检查规范化读取后的结果，避免过滤器掩盖落盘泄漏。
  // 生成 URL 只包含版本 ID，与传输 header 中的 key 分离。
  assert.ok(!raw.includes("fixture-test-key")); assert.equal(metadata.downloadUrl, "https://civitai.red/api/download/models/43");
  assert.equal((await recoverLocalModel(file)).status, "existing"); assert.equal(calls, before); assert.equal(fs.readFileSync(file + ".civitai.json", "utf8"), raw);
  // calls 不变证明 existing 在联网之前返回，避免每次打开详情都消耗请求。
  // raw 完全相同证明没有改写已知来源，而不只是语义字段恰巧相同。
  // 本组结束后句柄及锁已释放，后续独立事务仍能正常开始。
}
/**
 * 每种失败都经由实际查询器，两个固定来源均返回对应模拟错误。
 * 错误哈希和错误父模型不能保存成“恢复成功”。
 * 404 与网络/鉴权保持独立，方便用户决定配置密钥还是稍后重试。
 * 文件变更发生在哈希之后，确保测试触发提交前复核而非初次读取失败。
 * 任何失败后都不允许出现 sidecar、logo 或临时文件。
 */
async function checkFailures() {
  // 每个 setting 各生成一个夹具目录，不允许上一个成功文件短路本组。
  // 期望列表写死而不是从服务状态枚举推导，防止恒真对照。
  // 每次检查同时覆盖返回状态与目录内容，拒绝“失败却遗留半份资料”。
  // 类型能力不足同样是一项明确未完成，不得中断后面的独立模型检查。
  // 与不匹配摘要的 invalid 做区分，防止一条笼统“失败”掩盖实际原因。
  // 所有失败项都断言目录没有部分产物，现有资料保留由独立组验证。
  for (const [setting, expected] of [["notFound", "notFound"], ["auth", "auth"], ["network", "network"], ["mismatch", "invalid"], ["wrongModel", "invalid"], ["malformed", "invalid"], ["oversized", "invalid"], ["unsupportedType", "unsupportedType"], ["changed", "changed"]]) {
    mode = setting; const file = fixture(setting); mutated = file;
    // 服务完整执行哈希和查询，失败发生在对应响应处理或最终复核阶段。
    // 比较具体状态而不是仅判断不等于 recovered，避免错误分类漏检。
    // setting 作为断言消息，失败时可立即知道是哪条负向对照。
    assert.equal((await recoverLocalModel(file)).status, expected, setting);
    // 目录中只能剩下模型本体：不允许 sidecar、logo 或 .part 残留。
    // 检查整个目录而不是只判断 sidecar，覆盖临时提交文件清理。
    // changed 夹具的模型内容会变化，但文件名集合仍应保持单个模型。
    assert.deepEqual(fs.readdirSync(path.dirname(file)), [path.basename(file)], setting);
  }
  mode = "ok";
  // 失败组恢复默认响应，避免后续保留策略测试被错误 HTTP 状态污染。
  // 事务异常路径都必须归还并发名额，接下来的成功组会再次实际运行。
  // 模拟失败验证的是处理策略，不代表已对线上所有服务错误进行实测。
}
/**
 * 自定义封面和手工/未来版本来源 JSON 都是用户数据，不能以补全为由覆盖。
 * 文本恢复成功但图片请求失败时，独立 cover 状态必须说明部分结果。
 * 事务结束后对同一目录重试 existing，证明文件夹锁已经释放。
 */
async function checkPreservation() {
  // 使用不叫 logo 的 JPG，覆盖扫描器可能把任意图片作为封面的情形。
  // 图片必须可解码；伪装后缀的坏文件另设负向用例，不得算作已有 logo。
  // 现有用户文件是权威输入，补全器不能为了生成 PNG 而删除它。
  // 使用真实 PNG 字节而名称仍为 JPG，确认判据使用解码而非只认后缀。
  // 沿用扫描器自定义封面名称，不要求用户重命名为固定 logo.png。
  // 比对字节证明未用远程预览覆盖原有可显示图片。
  const file = fixture("custom"), cover = path.join(path.dirname(file), "my-cover.jpg"); fs.writeFileSync(cover, preview);
  assert.equal((await recoverLocalModel(file)).cover, "preserved"); assert.deepEqual(fs.readFileSync(cover), preview);
  // 未来版本来源没有当前格式的完整字段，也必须作为已有文件保留。
  // 不把无法读取的来源解释成“可以覆盖”，格式迁移不属于识别职责。
  // 检查文本相等，确保保留的是原文件而非重建一个相似对象。
  const old = fixture("existing"); fs.writeFileSync(old + ".civitai.json", '{"version":999}');
  // 保留旧资料不能算作补全成功，版本不受支持需要给出具体原因。
  // metadataInvalid 不会触发覆盖或静默清理，用户仍能备份原文件。
  // 同时检查原始文本，确保状态改变没有破坏来源文件保留策略。
  assert.equal((await recoverLocalModel(old)).status, "metadataInvalid"); assert.equal(fs.readFileSync(old + ".civitai.json", "utf8"), '{"version":999}');
  mode = "coverFail"; const noCover = fixture("cover-fail"), result = await recoverLocalModel(noCover); mode = "ok";
  // 远端版本仍然匹配，只有可选图片请求返回 404。
  // JSON 提交成功后图片失败不能把整体状态变成未找到模型。
  // 随后的 existing 调用还能检验失败图片路径是否释放了目录锁。
  // 文字已落盘但图片失败必须返回未完成，不能仍用 recovered。
  // 重试时已有 JSON 不能短路，必须继续将缺少的 logo 真正保存下来。
  // 覆盖上一版本最关键的 existing 缺口，确保失败可恢复。
  assert.equal(result.status, "coverFailed"); assert.equal(result.cover, "unavailable");
  const retried = await recoverLocalModel(noCover); assert.equal(retried.status, "existing"); assert.equal(retried.cover, "saved");
}
/**
 * 配对负向检查：模型存在但没有预览时不能计作完成。
 * 文字资料先保留，下一次仍可重新匹配并补 logo。
 * 损坏的 logo 文件不能仅凭后缀被识别成有效封面。
 * 已有损坏文件也不擅自删除，用户手动更换后再验证成功。
 * 检查的是扫描器实际选择的图片，而非随意找到另一个同目录图片。
 * 使用真实 PNG 与明确坏数据，不依赖网站图片或线上账号。
 */
async function checkLogoRequired() {
  // noPreview 不是接口 404，完整 SHA-256 仍然与模型文件一致。
  // 因此 JSON 可以保存，但是否完成必须由最终封面结果决定。
  // 第一轮返回后立即检查真实磁盘内容，不能用页面提示代替文件证据。
  mode = "noPreview"; const file = fixture("no-preview"), result = await recoverLocalModel(file); mode = "ok";
  assert.equal(result.status, "noPreview"); assert.equal(result.cover, "none");
  const original = fs.readFileSync(file + ".civitai.json", "utf8");
  // 切回正常预览后调用相同文件，确认 existing 分支继续进行补图。
  // 图片保存路径保持原目录，不能另建一个无法被扫描器找到的缓存文件。
  // 同时比对原 JSON 文本，不允许为了重试封面改写来源字段或时间戳。
  const retried = await recoverLocalModel(file); assert.equal(retried.status, "existing"); assert.equal(retried.cover, "saved");
  assert.equal(fs.readFileSync(file + ".civitai.json", "utf8"), original);
  // 损坏的 logo.png 在扫描器中优先于其他候选，能准确复现空白封面卡片。
  // 下载器的 no-overwrite 提交必须保留它，返回 coverFailed 让用户处理。
  // 手工替换成有效 PNG 后重试应立即发现完整，不再哈希或联网获取新图。
  const broken = fixture("broken-logo"), logo = path.join(path.dirname(broken), "logo.png"); fs.writeFileSync(logo, "not an image");
  const failed = await recoverLocalModel(broken); assert.equal(failed.status, "coverFailed"); assert.equal(fs.readFileSync(logo, "utf8"), "not an image");
  fs.writeFileSync(logo, preview); assert.equal((await recoverLocalModel(broken)).status, "existing");
}
/**
 * 路径不在配置目录时，不允许发出任何请求，即便文件扩展名符合模型格式。
 * Windows junction 不要求文件 symlink 权限，用它验证真实路径防越界。
 * 临时目录之外的夹具单独创建并在 finally 移除，不触碰用户路径。
 * 入参校验拒绝目录、额外参数和不正确类型在 IPC 层的旁路请求。
 */
async function checkAuthorization() {
  // outside 与 root 都是本轮创建的临时根，不能使用任何实际模型路径。
  // 真实模型文件存在且扩展名正确，使拒绝原因只能是授权目录不符。
  // 检查 calls 不变可发现“先查询后判断权限”这种顺序错误。
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ir-outside-model-")), file = path.join(outside, "x.safetensors"), before = calls;
  try {
    // 先直接调用越界文件，再通过配置根内的 junction 别名调用同一文件。
    // 两次都必须在 hash/网络之前拒绝，不能只检查路径字符串前缀。
    // Windows 目录链接是本项目常见模型存储方式，需要显式反向覆盖。
    fs.writeFileSync(file, "abc"); assert.equal((await recoverLocalModel(file)).status, "invalid");
    fs.symlinkSync(outside, path.join(root, "junction"), "junction"); assert.equal((await recoverLocalModel(path.join(root, "junction", "x.safetensors"))).status, "invalid");
    assert.equal(calls, before);
  // Windows 将 junction 当目录；rmdir 只移除链接，不递归遍历目标。
  // 外部夹具仍在其独立临时根中，由下面的清理负责。
  // 即使授权断言抛错也必须恢复这条链接，避免残留影响后续组。
  } finally { fs.rmdirSync(path.join(root, "junction")); fs.rmSync(outside, { recursive: true, force: true }); }
  for (const args of [[], [1], ["relative.safetensors"], [fixture("args"), "extra"]]) assert.ok(validateRecoveryArgs(args));
  // 缺参、错误类型、相对路径和多余参数分别覆盖不同校验维度。
  // 参数形状通过也不代表已授权，真正授权仍由 recoverLocalModel 执行。
  // 使用同一生产 validator，防止测试检查与 IPC 入口规则不一致。
}
/**
 * 两个独立文件夹的事务可并行等待；第三个任务立即 busy 而不是排队读盘。
 * 同一文件夹内另一个版本同样 busy，防止与移动/删除/封面写入交错。
 * hold 回调收集两个实际请求，不用固定 sleep 假定事务已到达检查点。
 * 放行后两条任务均应成功，最后的重试必须证明计数器归还。
 */
async function checkConcurrency() {
  // 文件夹锁与全局名额是两个不同机制，必须分别安排输入才能辨别。
  // 同目录重复请求没有新模型文件写入，因此最终结果不会受覆盖竞争影响。
  // 独立目录并行允许两个任务完成各自 sidecar，证明限制不是全局串行锁。
  // 一个失败的锁请求不应占住名额，第二个等待点提供这个反向证据。
  // 模拟父模型返回立刻完成，放行后的等待只剩真实文件提交与图片转换。
  // 全部 Promise 都被 await，主进程不会在后台还写文件时开始清理夹具。
  // 下一组 IPC 恢复在同一进程继续运行，再次间接检查全局资源已归还。
  // 三个文件位于不同文件夹，第三项 busy 必须来自总并发限制而非同目录锁。
  // 第一个任务进入 fake fetch 后才测同目录请求，保证它已经持锁。
  // 完成后恢复 mode 再放行，父模型响应不会再次进入 hold 状态。
  const a = fixture("busy-a"), b = fixture("busy-b"), c = fixture("busy-c"), releases = [];
  mode = "hold"; const first = recoverLocalModel(a);
  while (!unblock) await new Promise(resolve => setTimeout(resolve, 5)); releases.push(unblock); unblock = null;
  // 同目录请求虽短暂进入服务，但无法取得目录锁，应立即归还计数。
  // 第二个独立目录仍应能进入等待，证明失败加锁没有泄漏并发名额。
  // 如果 busy 请求遗漏 finally 递减，本组的第二任务将无法到达 fetcher。
  assert.equal((await recoverLocalModel(a)).status, "busy");
  const second = recoverLocalModel(b); while (!unblock) await new Promise(resolve => setTimeout(resolve, 5)); releases.push(unblock);
  assert.equal((await recoverLocalModel(c)).status, "busy"); mode = "ok"; releases.forEach(release => release());
  // 放行后两个任务都必须实际保存，而不是仅返回“没有失败”的空结果。
  // 第三个文件随后能成功，证明并发计数从满额回到了可用状态。
  // 没有对 pending 任务使用取消，资源归还只依赖生产事务收尾。
  assert.equal((await first).status, "recovered"); assert.equal((await second).status, "recovered"); assert.equal((await recoverLocalModel(c)).status, "recovered");
}
/**
 * 使用生产 handler 注册链，先截获 Electron 的注册函数再调用真实回调。
 * 这里验证注册助手的 IpcResult 包装与 INVALID_ARGUMENT，不模拟成功结果。
 * 页面端 preload 到主进程的实际传输由独立 UI 冒烟覆盖。
 * 测试最后恢复 ipcMain.handle，避免影响 Electron 正常退出。
 */
async function checkIpc() {
  // 截获的是注册回调，不是业务函数，因此 registerHandle 的校验仍会执行。
  // 恢复 handle 后直接调用捕获的回调，检查其标准 IpcResult 包装。
  // 测试事件只传空对象，因为此 handler 不依赖窗口身份或测试会话。
  const original = ipcMain.handle, callbacks = new Map(); ipcMain.handle = (channel, handler) => callbacks.set(channel, handler);
  try { require("../apps/electron/src/main/modules/models/models.handlers").registerModelHandlers(); }
  finally { ipcMain.handle = original; }
  const invoke = callbacks.get(require("../apps/electron/src/common/ipc-channels").IPC_CHANNELS.MODELS_RECOVER_METADATA);
  // 无效类型必须在执行任何文件操作前得到 INVALID_ARGUMENT。
  // 合法请求则实际创建 sidecar，不能只有 handler 存在就视为链路通过。
  // 若频道常量或注册遗漏，invoke 未定义会直接让本组非零失败。
  const invalid = await invoke({}, 1); assert.equal(invalid.success, false); assert.equal(invalid.code, "INVALID_ARGUMENT");
  const valid = await invoke({}, fixture("ipc")); assert.equal(valid.success, true); assert.equal(valid.data.status, "recovered");
}
/**
 * 总看门狗防止模拟 hold 编写错误造成静默挂死，失败强制非零退出。
 * 先生成真实单像素 PNG，封面测试不依赖仓库素材或网络资源。
 * 各组依次运行，确保 mode 不会在尚未完成的事务之间串扰。
 * 测试汇总仅打印组数，不输出用户路径、API Key 或模型内容。
 */
async function main() {
  // 45 秒是整个确定性测试上限，不作为具体业务步骤正确性的判据。
  // app.exit(124) 区分外部等待失控与普通断言失败的退出码 1。
  // 正常路径明确 exit(0)，不依赖 app.quit 对 process.exitCode 的处理。
  const timer = setTimeout(() => { console.error("model recovery verification timed out"); app.exit(124); }, 45000);
  try {
    // nativeImage 只用于现有封面转换链路，不创建可见窗口或运行 GPU 推理。
    // 测试组没有真实网络请求，成功不能替代生产网络可用性的单独核实。
    // 顺序运行保证所有夹具 mode 在下一组开始前已经稳定恢复。
    await app.whenReady(); preview = nativeImage.createFromBitmap(Buffer.from([40, 100, 200, 255]), { width: 1, height: 1 }).toPNG();
    // 边界组在正常事务前运行，保证取消路径没有泄漏句柄或影响后续模型识别。
    // 连接失败与 HTTP 错误在失败组内区分；UI 链路仍由独立冒烟负责。
    // 只打印检查组名称作为汇总，详细参数留在断言定义中供维护者复核。
    // logo 标准在完整服务事务中验证，不以 UI 图标存在代替可解码图片。
    // noPreview/coverFailed 已落盘文字资料，对它们重试是本轮必需回归。
    // 其余授权及分块检查继续保留，补图分支不能绕过真实文件校验。
    for (const check of [checkStreaming, checkBoundaries, checkSuccess, checkFailures, checkPreservation, checkLogoRequired, checkLegacyPreviewFields, checkContentPreference, checkPreviewFallback, checkAuthorization, checkConcurrency, checkIpc]) { await check(); console.log("PASS", check.name); }
    // 清理目标是本轮 mkdtemp 返回的绝对路径，不由用户输入或远程数据计算。
    // 全部断言通过后才删除夹具，失败时保留用于排查实际落盘结果。
    // timer 在退出前清除，避免正常完成后仍触发超时失败。
    fs.rmSync(root, { recursive: true, force: true }); clearTimeout(timer); app.exit(0);
  // 测试失败显式非零退出，CI 不能把打印错误后退出零误判为通过。
  // 这里的路径均是隔离夹具路径，没有读取真实用户文件或真实密钥。
  // 顶层 catch 也保留非零兜底，防止 main 的异常脱离测试退出路径。
  } catch (error) { clearTimeout(timer); console.error(error); app.exit(1); }
}
main().catch(() => app.exit(1));
