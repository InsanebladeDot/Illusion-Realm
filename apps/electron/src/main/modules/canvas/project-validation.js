// 主进程对工程请求做等价手写校验，不运行时引入 shared 的 TypeScript 或 Zod。
// 校验像验收装箱单：先检查每一项形状，再检查身份、端点和循环关系。
// 所有入口接收 unknown；坏值只返回 false，不能在统一 IPC 捕获之前抛异常。
// 校验不依赖浏览器，恶意 IPC 也必须经过这一层。
// 先检查形状再读字段，null 不能冒充普通对象。
// 数组虽然 typeof 为 object，仍不能冒充请求对象。
// 这些检查只读输入，不替调用方偷偷修改字段。
// 校验器返回布尔值，不在参数检查期间启动文件操作。
// 错误信息使用固定标记，不串接用户提供的绝对路径。
// UUID 用于工程目录归属，不作为访问其他工程的密码。
// 媒体类型白名单同时约束导入目录与播放器类别。
// 后缀白名单不保证解码成功，不能代替浏览器媒体事件。
// 不把 MIME 声明当权限，外部 File 的类型可能为空。
// 注入空字符串或超长文本都应在业务读取前结束。
// 不允许 NaN 和 Infinity 进入位置或尺寸字段。
// 坐标范围是画布世界单位，不是屏幕像素范围。
// 界面缩放不改变保存坐标的合法区间。
// 有效小数坐标要保留，不能因整数校验让拖动变得跳跃。
// 卡片尺寸相反要求整数，防止持久化无限精度草稿。
// 主进程没有 React Flow，只检查纯数据契约。
// node.type 是运行时外壳，读盘后由渲染适配器补齐。
// 选中和测量字段不参与本次图校验与归档语义。
// 额外字段不会使它们成为可执行能力或新的文件路径。
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = ["text", "image", "video", "audio", "note", "composition"];
const EXTENSIONS = { image: ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"], video: ["mp4", "webm", "mov", "m4v", "mkv", "avi"], audio: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"] };

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @param {number} min @param {number} max */
function text(value, min, max) { return typeof value === "string" && value.length >= min && value.length <= max; }
/** @param {unknown} value @param {number} min @param {number} max */
function number(value, min, max) { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
/** @param {unknown} value */
// 工程目录名只允许单层名称。
// 拒绝盘符冒号，调用者不能指定另一块磁盘。
// 拒绝两种目录分隔符，不能插入父级或子级。
// 拒绝尾部点空格，避免 Windows 名称规范化歧义。
// 目录名最长一百字符，为根路径和资产文件名留余地。
// 空名称不能直接成为目录，分配服务会给显示空名一个安全名字。
// 这个函数只验已有归属名，首次创建还有保留设备名替换。
// 合法名称不代表有写入权，后续必须核对 .canvas-owner。
// 归属标记内容是 UUID，不使用用户可重复填写的标题。
// 因此两份同名作品可以独立存在，不靠标题判断同一个工程。
function folder(value) { return text(value, 1, 100) && typeof value === "string" && !/[<>:"/\\|?*\x00-\x1f]/.test(value) && !/[. ]$/.test(value); }
/** @param {unknown} value */
function workspace(value) { return object(value) && typeof value.id === "string" && UUID.test(value.id) && folder(value.folder); }
/** @param {unknown} value */
// card.style 是视觉方案名，不是图片生成 ratio。
// 正方形与长方形只是预设，自定义仍使用同一宽高字段。
// 宽度下限保障导入按钮和端口保留可点空间。
// 高度下限防止媒体内容和控件全部被挤掉。
// 上限限制坏工程一次创建过大的交互覆盖面。
// 宽高的单位是节点内部 CSS 世界单位。
// 屏幕放大后节点看起来更大，不需要回写这个值。
// 布尔值不能因数值转换成为零或一。
// 字符串数字也不会被主进程隐式接受。
// 界面负责把输入草稿确认成数值，再提交到文档。
function card(value) {
  return object(value) && typeof value.style === "string" && ["square", "rectangle", "custom"].includes(value.style) && number(value.width, 160, 1200) && Number.isInteger(value.width) && number(value.height, 100, 900) && Number.isInteger(value.height);
}
/** @param {unknown} value @returns {value is import('@illusion-realm/shared').UserDataInfiniteCanvas['nodes'][number]['data']['media']} */
// media 是只读引用描述，不是上传文件正文。
// kind 必须属于 own property，避免继承属性名命中白名单。
// path 保留平台原始写法，协议层才负责 URL 编码。
// name 作为原文件基本名供卡片显示，不使用它直接拼目录。
// 名称与路径用途不同，不能把短标题上限套到原文件名。
// size 按字节计，不能接受负数或丢失精度的整数。
// 零字节允许登记，浏览器解码会给出真实失败。
// 这里只查数据形状，磁盘是否存在属于实际导入流程。
// 恢复草稿时文件可能暂时被移走，不应因此丢弃整个作品。
// 媒体分类与外层节点类别还要在 data 中核对。
// 路径不在这个函数被执行，不支持脚本协议或命令解释。
// 文件名后缀的导入允许集在 copyAsset 再次检查。
// 复制到受管目录后 size 采用磁盘 stat 的实际值。
// 渲染层不能通过伪造 size 要求任意内存分配。
// 此处不保存 HTMLMediaElement 或 File 对象。
// 跨 IPC 的结构应保持可序列化，重开应用才能恢复引用。
function media(value) {
  return object(value) && typeof value.kind === "string" && Object.hasOwn(EXTENSIONS, value.kind) && text(value.path, 1, 32767) && text(value.name, 1, 255) && number(value.size, 0, Number.MAX_SAFE_INTEGER) && Number.isInteger(value.size);
}
/** @param {unknown} value */
// kind 决定节点的合法业务形态。
// 文本与便签可以保存正文，不需要伪造 media。
// composition 仍可保存空态参数，不表示媒体合成引擎已接通。
// title 和 prompt 有各自上限，不因卡片放大而扩大磁盘契约。
// content 可容纳较长手写文字，UI 是否截断由展示层处理。
// ratio 是原有生成参数，不能用它替代卡片宽高。
// mode 是可选的模式代码，缺少字段兼容旧草稿。
// createdAt 是可选数值，旧数据不需要编造创建时间。
// 时间戳非负有限，避免损坏值进入排序和展示。
// card 缺失时沿用原节点布局，不强制迁移所有旧卡。
// media 缺失代表尚未选择来源，不当作坏数据。
// media 存在时必须与 kind 一致，音频不能塞进图片标签。
// 普通文本内容不会解析成脚本或节点组件名。
// 这个函数不改变输入的 title 空格或 prompt 标点。
// 保存与归档应保留用户实际输入，不能在校验阶段偷偷润色。
// 对未知 kind 拒绝，而不是默默回落成一个空图片节点。
function data(value) {
  if (!object(value)) return false;
  return typeof value.kind === "string" && KINDS.includes(value.kind) && text(value.title, 0, 80) && text(value.prompt, 0, 4000) && text(value.content, 0, 8000) && typeof value.ratio === "string" && ["1/1", "16/9", "9/16", "4/3"].includes(value.ratio) && (value.mode === undefined || text(value.mode, 0, 40)) && (value.createdAt === undefined || number(value.createdAt, 0, Number.MAX_VALUE)) && (value.card === undefined || card(value.card)) && (value.media === undefined || media(value.media) && value.media?.kind === value.kind);
}
/** @param {unknown} value */
// 节点身份不使用数组索引，排序不会改变连接对象。
// id 不能为空，连接端点必须能明确找到它。
// id 长度有限，反复复制不能无限追加名称造成膨胀。
// position 必须同时给出 x 和 y。
// 位置表示图引擎世界坐标，允许卡片在初始视野外。
// 负坐标合法，向左或向上移动不能被误判为坏工程。
// 只有位置和数据合法还不够，整个图还会检查重复身份。
// 此函数不读取标题推断身份，重名卡片可以独立存在。
function node(value) {
  return object(value) && text(value.id, 1, 200) && object(value.position) && number(value.position.x, -10000000, 10000000) && number(value.position.y, -10000000, 10000000) && data(value.data);
}
/** @param {unknown} value */
// 边有独立 id，删除连接不要求删除两端节点。
// source 与 target 都是节点身份，不是标签文字。
// 端点为空会让图引擎产生悬空边，必须先拒绝。
// 已保存旧边可以不带 handle，恢复时补固定端口。
// 带 handle 时只允许 out 和 in，不能指向不存在的界面端口。
// 结构合法的端点仍可能不存在，由 graph 进一步查关系。
// 同端点重复边也在 graph 拒绝，不能靠换 edge.id 绕过。
// 边不携带播放器或任务结果，连接只是本地引用关系。
function edge(value) {
  return object(value) && [value.id, value.source, value.target].every(item => text(item, 1, 200)) && (value.sourceHandle === undefined || value.sourceHandle === "out") && (value.targetHandle === undefined || value.targetHandle === "in");
}

// 有向图用入度逐层剥离，像先搬走最外层纸箱；剩下无法搬走的一圈就是循环。
// 不递归访问五千层链，避免手改工程让校验器栈溢出。
/** @param {import('@illusion-realm/shared').UserDataInfiniteCanvas} doc */
// 关系校验像检查单向道路，合法路牌不代表道路不会绕圈。
// nodes Map 先登记身份对应的 kind，后续查端点不猜标题。
// Map 的大小小于节点数组说明存在重复身份。
// ids 单独登记边身份，防止同一个 id 对应两条连接。
// pairs 记录有序端点组合，A 到 B 与 B 到 A 不是同一对。
// 组合用 JSON 而非随意分隔字符串，节点名含分隔符也不会碰撞。
// incoming 统计每张卡还有几条前置关系。
// outgoing 登记从每张卡可到达的后续节点。
// 边的两端必须都在图中，缺失端点直接失败。
// 自己指向自己属于最短循环，不需要等遍历才发现。
// 便签不提供生成引用端口，任何涉及便签的连接都拒绝。
// 合成器当前可接收引用，但不能作为输出来源。
// 文本可提供描述，因此允许连向其他可接收节点。
// 同种媒体引用保留原有行为，不新增转码承诺。
// 图片可向视频提供参考，反向关系没有被自动放开。
// 图检查与渲染层 connectionError 保持同一关系规则。
// 合法边先登记入度再登记邻接，统计对象始终是当前文档。
// 队列最初只包含没有前置引用的卡片。
// 取出一张卡等于移走它发出的依赖，目标入度相应减少。
// 目标入度归零就加入队尾，之后继续检查其后续连接。
// 这相当于逐层拆积木，最后剩下拆不开的部分就是循环。
// 使用数组游标而非 shift，长链不会反复搬移队首元素。
// 不采用递归，五千层合法链不会耗尽 JavaScript 调用栈。
// 全部节点都进过队列才合法，孤立节点也会被计入。
// 此过程不重新排列作品节点，仅使用临时检查容器。
// 失败时既没有删边，也没有替用户自动修补一份不同工程。
function graph(doc) {
  const nodes = new Map(doc.nodes.map(item => [item.id, item.data.kind]));
  const ids = new Set();
  const pairs = new Set();
  const incoming = new Map(doc.nodes.map(item => [item.id, 0]));
  const outgoing = new Map(doc.nodes.map(item => [item.id, /** @type {string[]} */ ([])]));
  if (nodes.size !== doc.nodes.length) return false;
  for (const item of doc.edges) {
    const from = nodes.get(item.source), to = nodes.get(item.target);
    const pair = JSON.stringify([item.source, item.target]);
    if (!from || !to || item.source === item.target || ids.has(item.id) || pairs.has(pair)) return false;
    if (from === "note" || to === "note" || from === "composition" || !(from === "text" || from === to || from === "image" && to === "video" || to === "composition")) return false;
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
// 文档版本和工程包版本分别校验，二者不能互相替代。
// 旧草稿允许没有 name；渲染 schema 会把它规范成空标题。
// 主进程分配目录时也给缺失标题提供明确回落。
// workspace 可选，兼容未导入素材的纯文本画布。
// 节点最多五千，边最多一万，导入不是无界数据入口。
// 数组先逐项验形状，再进入依赖关系算法。
// 因此 graph 可以安全读取 data.kind 与 position 等已知字段。
// 文档不要求存在媒体，空画布也是可交换的合法工程。
// 校验不自动移除坏节点，坏工程必须整体报告失败。
// 用户现有图的保留由渲染请求边界负责，不由校验器回写。
function document(value) {
  if (!object(value) || value.version !== 1 || !(value.name === undefined || text(value.name, 0, 80)) || value.workspace !== undefined && !workspace(value.workspace)) return false;
  if (!Array.isArray(value.nodes) || value.nodes.length > 5000 || !value.nodes.every(node) || !Array.isArray(value.edges) || value.edges.length > 10000 || !value.edges.every(edge)) return false;
  return graph(/** @type {import('@illusion-realm/shared').UserDataInfiniteCanvas} */ (value));
}
/** @param {unknown} value @returns {value is import('@illusion-realm/shared').CanvasImportMediaRequest} */
// 本地媒体导入是一批文件加一个目标工程归属。
// 每批一到二百份，空选择由界面取消路径处理。
// name 是工程标题，不是每个媒体的文件名。
// 已有 workspace 则尝试继续使用已拥有的目录。
// 没有 workspace 则由分配服务创建新归属。
// files 只接收普通媒体描述，不跨 IPC 传 File。
// 每项形状合法之后仍可能因磁盘读取失败被逐项拒绝。
// 请求形状错误与某一文件失效是不同层面的失败。
// 前者返回 INVALID_ARGUMENT，不开启任何复制。
// 后者由导入结果列出 rejected，不清空其他已导入素材。
function importRequest(value) {
  // 主进程也验模式，不能只相信前端单选按钮；缺省兼容历史复制请求。
  // null、布尔值和拼错的字符串都拒绝，避免错误请求触发原文件删除。
  // 校验阶段不碰磁盘，返回 false 会由 registerHandle 产生 INVALID_ARGUMENT。
  return object(value) && (value.mode === undefined || value.mode === "copy" || value.mode === "move") && text(value.name, 0, 80) && (value.workspace === undefined || workspace(value.workspace)) && Array.isArray(value.files) && value.files.length > 0 && value.files.length <= 200 && value.files.every(media);
}
// 这些导出只给主进程业务服务和独立格式回归使用。
// renderer 不运行 require 读取它们，也不把未知对象直接绕过 IPC。
// EXTENSIONS 同时用于复制和归档，避免两个入口接受范围漂移。
// media 只表达数据形状，workspace 只表达归属形状。
// importRequest 把两者组合后，仍需实际目录所有权检查。
// document 比节点 schema 多一层图关系约束。
// 因此主进程入口不能只调用 media 就认为整份工程合法。
// 导出的校验器不修改任何模块级图缓存。
// 每次 graph 创建临时 Map，两个窗口的验证互不污染。
// 无跨请求状态也便于纯 Node 反证直接调用真实生产逻辑。
// 未来改变节点类型时应同步 renderer connectionError 与本图检查。
// 不能只在一边放开连接，然后让保存后的工程无法重新打开。
module.exports = { document, importRequest, media, workspace, EXTENSIONS };
