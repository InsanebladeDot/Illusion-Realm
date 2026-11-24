// 主进程独立检查工程数据，与 shared 规则保持一致，不运行时加载 Zod。
// 像核对装箱单：先验每项格式，再验连接关系；这里只读数据，不操作文件。
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = ["text", "image", "video", "audio", "note", "composition", "scene"];
const EXTENSIONS = { image: ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"], video: ["mp4", "webm", "mov", "m4v", "mkv", "avi"], audio: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"] };

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @param {number} min @param {number} max */
function text(value, min, max) { return typeof value === "string" && value.length >= min && value.length <= max; }
/** @param {unknown} value @param {number} min @param {number} max */
function number(value, min, max) { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
/** @param {unknown} value */
// 只接受单层目录名，避免 Windows 名称歧义；写入前还需检查 .canvas-owner。
function folder(value) { return text(value, 1, 100) && typeof value === "string" && !/[<>:"/\\|?*\x00-\x1f]/.test(value) && !/[. ]$/.test(value); }
/** @param {unknown} value */
function workspace(value) { return object(value) && typeof value.id === "string" && UUID.test(value.id) && folder(value.folder); }
/** @param {unknown} value */
// 卡片大小是画布世界单位，与生成图片的比例和像素无关。
function card(value) {
  return object(value) && typeof value.style === "string" && ["square", "rectangle", "custom", "fit"].includes(value.style) && number(value.width, 160, 1200) && Number.isInteger(value.width) && number(value.height, 100, 900) && Number.isInteger(value.height);
}
/** @param {unknown} value */
// 只接受便签组件现有的装饰与纸色，不允许工程写入任意 CSS。
function noteAppearance(value) {
  return object(value) && Object.keys(value).every(key => ["attach", "color"].includes(key))
    && typeof value.attach === "string" && ["none", "tape", "pin"].includes(value.attach)
    && typeof value.color === "string" && ["yellow", "pink", "blue", "green", "orange"].includes(value.color);
}
/** @param {unknown} value */
// 像核对同一块牌子的编号，重复 ID 会让编辑错位，因此数量与身份一起校验。
function annotations(value) {
  if (!Array.isArray(value) || value.length > 8) return false;
  const valid = value.every(item => object(item) && Object.keys(item).every(key => ["id", "text", "color"].includes(key))
    && text(item.id, 1, 200) && text(item.text, 1, 80) && typeof item.text === "string" && !!item.text.trim()
    && typeof item.color === "string" && /^#[0-9a-f]{6}$/i.test(item.color));
  return valid && new Set(value.map(item => item.id)).size === value.length;
}
/** @param {unknown} value @returns {value is import('@illusion-realm/shared').UserDataInfiniteCanvas['nodes'][number]['data']['media']} */
// 这里只验媒体引用格式，不验文件是否存在，避免丢失一个文件就打不开整张画布。
function media(value) {
  return object(value) && typeof value.kind === "string" && Object.hasOwn(EXTENSIONS, value.kind) && text(value.path, 1, 32767) && text(value.name, 1, 255) && number(value.size, 0, Number.MAX_SAFE_INTEGER) && Number.isInteger(value.size);
}
/** @param {unknown} value */
// LoRA 按节点类型和工作流分别保存；缺字段继承模板，空数组明确清空。
// 单表拒绝重复身份，保留合法的零和负权重；模型是否可用由执行时检查。
/** @param {unknown} value @param {unknown} kind */
function workflowLoras(value, kind) {
  if (value === undefined) return true;
  if (!object(value) || kind !== "image" && kind !== "video") return false;
  const allowed = kind === "image" ? ["anima", "sdxl", "moss", "anima-edit", "minimax-image-edit"] : ["minimax", "minimax-reference"];
  return Object.entries(value).every(([key, items]) => {
    // optional 的 undefined 在内存请求中同样允许；JSON 写盘自然省略它。
    // 先检查键名，未知模板即使给 undefined 也不能绕过 strict 白名单。
    // 其余值仍必须是有限列表，与 schema 的可选字段语义一致。
    if (!allowed.includes(key)) return false;
    if (items === undefined) return true;
    if (!Array.isArray(items) || items.length > 128) return false;
    const imageLora = kind === "image" && key !== "minimax-image-edit";
    const ids = new Set();
    return items.every(item => {
      if (!object(item)) return false;
      const id = imageLora ? item.extensionId : item.id;
      if (!text(id, 1, imageLora ? 33000 : 200) || ids.has(id)) return false;
      ids.add(id);
      return number(imageLora ? item.weight : item.strength, -5, 5) && (imageLora || text(item.name, 1, 32767));
    });
  });
}
// 图片参数按模板保存覆盖项；缺字段继承默认，空负面词表示用户清空。
// 种子保留输入草稿，不在保存时转成随机数；模型和加载槽在执行时再核验。
/** @param {unknown} value @param {unknown} kind */
function imageParameters(value, kind) {
  if (value === undefined) return true;
  if (kind !== "image" || !object(value)) return false;
  const fields = ["model", "modelOverrides", "negative", "steps", "cfg", "sampler", "scheduler", "seed", "seedMode", "size"];
  return Object.entries(value).every(([key, row]) => {
    if (!["anima", "sdxl", "moss", "anima-edit", "minimax-image-edit"].includes(key)) return false;
    if (row === undefined) return true;
    if (!object(row) || Object.keys(row).some(field => !fields.includes(field) && !(key === "moss" && field === "slg"))) return false;
    if (row.slg !== undefined && typeof row.slg !== "boolean") return false;
    if (row.model !== undefined && (!object(row.model) || Object.keys(row.model).some(field => !["modelId", "versionId"].includes(field)) || !text(row.model.modelId, 1, 33000) || !text(row.model.versionId, 1, 33000))) return false;
    if (row.modelOverrides !== undefined && (!object(row.modelOverrides) || Object.keys(row.modelOverrides).length > 64 || !Object.entries(row.modelOverrides).every(([id, name]) => text(id, 1, 200) && text(name, 0, 32767)))) return false;
    if (row.negative !== undefined && !text(row.negative, 0, 4000)) return false;
    if (row.steps !== undefined && (!number(row.steps, 1, 100) || !Number.isInteger(row.steps))) return false;
    if (row.cfg !== undefined && !number(row.cfg, 0, 30)) return false;
    if ([row.sampler, row.scheduler].some(item => item !== undefined && !text(item, 1, 80))) return false;
    if (row.seed !== undefined && (typeof row.seed !== "string" || row.seed.length > 32 || !/^\d*$/.test(row.seed))) return false;
    if (row.seedMode !== undefined && row.seedMode !== "random" && row.seedMode !== "custom") return false;
    return row.size === undefined || imageSize(row.size);
  });
}
// 保存尺寸选择的原始输入，最终像素由原解析器计算；合法整数不代表设备一定支持。
/** @param {unknown} value */
function imageSize(value) {
  return object(value) && Object.keys(value).every(key => ["mode", "aspectRatio", "customWidth", "customHeight", "scale"].includes(key))
    && (value.mode === "preset" || value.mode === "custom") && text(value.aspectRatio, 1, 80)
    && number(value.customWidth, 8, Number.MAX_SAFE_INTEGER) && Number.isSafeInteger(value.customWidth)
    && number(value.customHeight, 8, Number.MAX_SAFE_INTEGER) && Number.isSafeInteger(value.customHeight)
    && (value.scale === undefined || number(value.scale, 0.1, Number.MAX_VALUE));
}
/** @param {unknown} value */
// 视频加载覆盖只属于 MiniMax 模板；缺字段继承，空对象清除覆盖。
// 空名称允许恢复模板默认，加载槽 ID 不能为空；这里不检查本机模型文件。
/** @param {unknown} value @param {unknown} kind */
function videoModelOverrides(value, kind) {
  if (value === undefined) return true;
  if (kind !== "video" || !object(value)) return false;
  return Object.entries(value).every(([key, row]) => ["minimax", "minimax-reference"].includes(key) && (row === undefined || object(row) && Object.keys(row).length <= 64 && Object.entries(row).every(([id, name]) => text(id, 1, 200) && text(name, 0, 32767))));
}
/** @param {unknown} value */
function data(value) {
  if (object(value) && value.mode === "compare" && value.kind !== "image") return false;
  if (!object(value)) return false;
  if (value.promptConversion !== undefined && typeof value.promptConversion !== "boolean") return false;
  if (!require("./prompt-reference-validation").promptReferenceLabels(value.promptReferenceLabels)) return false;
  if (!require("./audio-validation").audioParameters(value.audioParameters, value.kind, media)) return false;
  // 先拒绝错误参数表，下面继续沿用原节点、媒体与导演台契约。
  // 调用仅检查当前值，不写默认项，不创建磁盘文件或后台任务。
  // 与 schema 保持同样边界，不能因 UI 不显示 Wan LoRA 就省略主进程检查。
  if (value.upscale !== undefined && (!["image", "video"].includes(String(value.kind)) || !require("./upscale-validation").upscaleSettings(value.upscale))) return false;
  if (value.composition !== undefined && (value.kind !== "composition" || !require("./composition-validation").composition(value.composition))) return false;
  if (value.remoteImage !== undefined && (value.kind !== "image" || !require("../euzhi-images/validation").configuration(value.remoteImage) || (value.mode !== undefined && (typeof value.mode !== "string" || !["text", "image", "reference"].includes(value.mode))))) return false;
  if (value.inputImages !== undefined && (!["image", "video"].includes(String(value.kind)) || !Array.isArray(value.inputImages) || value.inputImages.length > 8 || !value.inputImages.every(item => media(item) && item?.kind === "image"))) return false;
  // 视频宽高须成对保存为偶数；FPS 是正整数，时长保留一位小数秒。
  // 小数秒容差仅消除浮点误差，不接受更多小数位；保存参数不会改写源视频。
  if (value.videoSteps !== undefined && (value.kind !== "video" || !number(value.videoSteps, 1, 100) || !Number.isInteger(value.videoSteps))) return false;
  if (value.videoFps !== undefined && (value.kind !== "video" || typeof value.videoFps !== "number" || !Number.isSafeInteger(value.videoFps) || value.videoFps < 1)) return false;
  // 严格枚举对应十档菜单，不把字符串、小数尾差或非视频配置静默修成合法值。
  if (value.videoMegapixels !== undefined && (value.kind !== "video" || typeof value.videoMegapixels !== "number" || ![0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].includes(value.videoMegapixels))) return false;
  if (value.videoDuration !== undefined && (value.kind !== "video" || typeof value.videoDuration !== "number" || !number(value.videoDuration, 0.1, Number.MAX_SAFE_INTEGER / 10) || Math.abs(value.videoDuration * 10 - Math.round(value.videoDuration * 10)) > 1e-8)) return false;
  if (value.videoOutput !== undefined && (value.kind !== "video" || !object(value.videoOutput) || Object.keys(value.videoOutput).some(key => !["width", "height"].includes(key)) || ![value.videoOutput.width, value.videoOutput.height].every(side => typeof side === "number" && Number.isSafeInteger(side) && side >= 2 && side % 2 === 0))) return false;
  if (!videoModelOverrides(value.videoModelOverrides, value.kind)) return false;
  if (!workflowLoras(value.workflowLoras, value.kind) || !imageParameters(value.imageParameters, value.kind)) return false;
  // 只接收图片的四种整数数量，不将字符串数字隐式转成任务配置。
  // 旧数据缺值直接放行，不能因为新功能导致旧文本、音频或视频无法打开。
  // null 与省略不同，坏文件不能靠恢复默认掩盖参数损坏。
  if (value.batchSize !== undefined && (value.kind !== "image" || typeof value.batchSize !== "number" || ![1, 2, 4, 6].includes(value.batchSize))) return false;
  // 与 shared 的模板白名单及类型归属等价，手改工程也不能跳过限制。
  // 没有 workflow 的旧节点原样接收，不在导入时偷偷分配任务或访问服务。
  // 这里只验稳定编号，真正的模板依旧由创建页公共构建器提供。
  if (value.workflow !== undefined && (typeof value.workflow !== "string" || !(value.kind === "image" ? ["anima", "sdxl", "moss", "anima-edit", "minimax-image-edit"] : value.kind === "video" ? ["minimax", "minimax-reference", "wan2.2"] : []).includes(value.workflow))) return false;
  // 主进程按shared静态比例表等价手写白名单，不运行时导入TS；契约测试逐项对照源表。
  // 保留旧斜杠格式，不因菜单现在有八项就重写已保存工程的比例或像素。
  // UI和schema只读创作页同一参数表，此处白名单仅承担不可信输入边界验证。
  return typeof value.kind === "string" && KINDS.includes(value.kind) && text(value.title, 0, 80) && text(value.prompt, 0, 4000) && text(value.content, 0, 8000) && typeof value.ratio === "string" && ["1/1", "2/3", "3/2", "3/4", "4/3", "5/6", "9/16", "16/9"].includes(value.ratio) && (value.mode === undefined || text(value.mode, 0, 40)) && (value.createdAt === undefined || number(value.createdAt, 0, Number.MAX_VALUE)) && (value.card === undefined || card(value.card)) && (value.media === undefined || media(value.media) && value.media?.kind === value.kind) && (value.scene === undefined || value.kind === "scene" && require("./director-validation").scene(value.scene));
}
/** @param {unknown} value */
// 节点用独立 ID 识别，允许负世界坐标；重复身份在整图检查中拒绝。
function node(value) {
  if (object(value) && object(value.data) && value.data.annotations !== undefined && !annotations(value.data.annotations)) return false;
  if (object(value) && object(value.data) && value.data.resizeLocked !== undefined && typeof value.data.resizeLocked !== "boolean") return false;
  if (object(value) && object(value.data) && value.data.noteAppearance !== undefined && (value.data.kind !== "note" || !noteAppearance(value.data.noteAppearance))) return false;
  return object(value) && text(value.id, 1, 200) && object(value.position) && number(value.position.x, -10000000, 10000000) && number(value.position.y, -10000000, 10000000) && data(value.data);
}
/** @param {unknown} value */
// 旧边可缺少端口，新端口只允许 out/in；端点存在性和重复连接由 graph 检查。
function edge(value) {
  return object(value) && [value.id, value.source, value.target].every(item => text(item, 1, 200)) && (value.sourceHandle === undefined || value.sourceHandle === "out") && (value.targetHandle === undefined || value.targetHandle === "in");
}

// 像逐层拆纸箱：入度归零就移走，最后拆不开的就是循环；不用递归，避免长链爆栈。
/** @param {import('@illusion-realm/shared').UserDataInfiniteCanvas} doc */
// 同时检查重复身份、缺失端点和连接类型；规则须与渲染侧 connectionError 一致。
// 端点组合用 JSON 作键，避免 ID 内含分隔符时撞名。
function graph(doc) {
  const nodes = new Map(doc.nodes.map(item => [item.id, item.data.kind]));
  const modes = new Map(doc.nodes.map(item => [item.id, item.data.mode]));
  const ids = new Set();
  const pairs = new Set();
  const incoming = new Map(doc.nodes.map(item => [item.id, 0]));
  const outgoing = new Map(doc.nodes.map(item => [item.id, /** @type {string[]} */ ([])]));
  if (nodes.size !== doc.nodes.length) return false;
  for (const item of doc.edges) {
    const from = nodes.get(item.source), to = nodes.get(item.target);
    const pair = JSON.stringify([item.source, item.target]);
    if (!from || !to || item.source === item.target || ids.has(item.id) || pairs.has(pair)) return false;
    const upscale = modes.get(item.target) === "upscale", compare = modes.get(item.target) === "compare";
    // 与渲染侧一致：对比只收两个图片引用，不参与生成输出或跨媒体转换。
    if (modes.get(item.source) === "compare" || compare && (from !== "image" || (incoming.get(item.target) ?? 0) >= 2)) return false;
    if (upscale && (!["image", "video"].includes(from) || (incoming.get(item.target) ?? 0) > 0)) return false;
    if (!upscale && !compare && (from === "note" || to === "note" || from === "composition" && to !== "video" || !(from === "text" || from === to || from === "image" && to === "video" || from === "scene" && to === "image" || from === "composition" && to === "video" || to === "composition"))) return false;
    ids.add(item.id); pairs.add(pair);
    incoming.set(item.target, (incoming.get(item.target) ?? 0) + 1);
    outgoing.get(item.source)?.push(item.target);
  }
  const queue = [...incoming].filter(([, count]) => !count).map(([id]) => id);
  for (let i = 0; i < queue.length; i++) for (const target of outgoing.get(queue[i]) ?? []) {
    incoming.set(target, (incoming.get(target) ?? 0) - 1);
    if (!incoming.get(target)) queue.push(target);
  }
  return queue.length === nodes.size;
}

/** @param {unknown} value @returns {value is import('@illusion-realm/shared').UserDataInfiniteCanvas} */
// 先验每个节点和边的格式，再验整图关系；坏工程整体拒绝，不静默删掉出错项。
function document(value) {
  if (object(value) && value.fixedSize !== undefined && typeof value.fixedSize !== "boolean") return false;
  if (!object(value) || value.version !== 1 || !(value.name === undefined || text(value.name, 0, 80)) || value.workspace !== undefined && !workspace(value.workspace)) return false;
  if (!Array.isArray(value.nodes) || value.nodes.length > 5000 || !value.nodes.every(node) || !Array.isArray(value.edges) || value.edges.length > 10000 || !value.edges.every(edge)) return false;
  return graph(/** @type {import('@illusion-realm/shared').UserDataInfiniteCanvas} */ (value));
}
/** @param {unknown} value @returns {value is import('@illusion-realm/shared').CanvasImportMediaRequest} */
// 空文件列表用于准备工程目录；单个文件失败由导入结果报告，不影响其余成功项。
function importRequest(value) {
  // 缺省模式兼容复制；未知模式必须拒绝，避免误触发原文件删除。
  return object(value) && (value.origin === undefined || value.origin === "imported" || value.origin === "generated" || value.origin === "archive") && (value.mode === undefined || value.mode === "copy" || value.mode === "move") && text(value.name, 0, 80) && (value.workspace === undefined || workspace(value.workspace)) && Array.isArray(value.files) && value.files.length <= 200 && value.files.every(media);
}
module.exports = { document, importRequest, media, workspace, EXTENSIONS };
