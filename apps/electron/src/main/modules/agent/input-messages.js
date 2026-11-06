/**
 * Agent 跨进程图片与历史消息校验，与 shared 的 agent-messages schema 保持等价。
 * 只接受内嵌图片，不让模型尝试访问用户的本机路径或浏览器 blob 地址。
 * 限制只针对输入图片，不改变工具生成图片的本地预览协议。
 * 校验发生在启动 Python 之前，非法入参不能产生一个半启动任务。
 * 错误不拼入图片字节、文件名或用户路径，避免回显私人数据。
 * 主进程不引入渲染端 Zod 依赖，继续遵循现有手写校验器约定。
 */
const IMAGE = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
/**
 * 可选字段 undefined 兼容旧客户端；null、对象和字符串不是图片数组。
 * 每条最多八张，单图十二 MiB 字符，总请求三十二 MiB 字符。
 * 纯文本历史长度不在图片预算中，避免误伤原有长文本会话。
 * @param {unknown} value
 */
function imageChars(value) {
  // 十二 MiB 是编码文本的限制，不是模型输入 token 数或图片像素数。
  // base64 比二进制更大，渲染端还会在编码前执行八 MiB 源文件限制。
  // 这里只验证传输形状，不把 MIME 声明当作真实模型视觉能力证明。
  // PNG、JPEG、WebP、GIF 的匹配区分大小写，与浏览器生成的规范 MIME 一致。
  // 不执行 URI 解码，避免把经过百分号转义的路径误当成图片内容。
  // 没有 base64 字节的 data URL 不合法，空图片不能作为有效附件提交。
  // 等号只允许出现在尾部，不能将任意字符串用 data 前缀包装后通过。
  // 不使用 Buffer 分配一份二进制副本，校验大图不额外扩大主进程内存占用。
  // 数组内重复图片是合法输入，用户可能有意发送两个相同文件用于对照。
  // 本函数不去重，否则 UI 所示图片数量会与实际模型输入不一致。
  // 任何单项非法都使整条消息非法，不能只跳过失败图片继续处理剩余项。
  // 累计长度使用字符串 length，与 shared 和 Python 中的 ASCII base64 长度一致。
  // 返回 -1 表示非法，不能把非法值当零张图片静默丢弃。
  // 正则在长度检查之后执行，超限 base64 不进入较昂贵的扫描。
  // 不接受 URL，页面不能利用这个接口上传任意本地文件路径。
  if (value === undefined) return 0;
  if (!Array.isArray(value) || value.length > 8) return -1;
  let length = 0;
  for (const image of value) {
    if (typeof image !== 'string' || image.length > 12 * 1024 * 1024 || !IMAGE.test(image)) return -1;
    length += image.length;
  }
  return length;
}
/**
 * 当前输入与所有历史输入共同计量，不能靠拆成多轮绕过请求预算。
 * 历史只允许 user / assistant，不能由页面注入 system 或 tool 身份。
 * 仅用户历史携带图片，助手的工具产物仍采用既有事件链路。
 * @param {unknown} options
 * @returns {string|null}
 */
function validateMessageImages(options) {
  // 历史图片保留对话含义，但同时会增加请求体，所以必须与当前图片合并预算。
  // 文本历史允许空字符串，是否有意义由消息来源决定，不在这里擅自改写。
  // 历史 images 缺失与空数组都合法，兼容尚未支持附件的旧会话。
  // 助手携带空 images 也不会引入输入图片，只有非空图片内容才需要拒绝。
  // role 的允许集独立于图片数量，即便不含图片也不允许 system 或 tool。
  // content 必须仍是字符串，多模态数组由 Python 构造，页面不能传任意协议块。
  // 允许的字段只在后续构造器中读取，历史额外属性不会成为远端消息属性。
  // 当前 config 里的 provider 验证仍由外层负责，不根据图片类型切换供应商。
  // 同样不根据图片名称选择模型，当前用户选择决定本次请求的远端模型。
  // 未配置密钥是另一条错误分支，图片合法不代表账户权限已经核实。
  // 该检查不发起 /models 或其他联网请求，启动任务不会被额外网络检查阻塞。
  // 只检查用户明确选取的图片字节，不会扩大 Agent 的本地工具目录白名单。
  // 多轮图片只是上下文，不是工具输出，不能伪造 tool_artifacts 事件送给页面。
  // 主进程在任何 sidecar 进程创建之前执行这里，失败不会留下孤儿 Python。
  // 返回 null 明确表示通过，不能把长度为零与非法标记 -1 混用。
  // 预算只累加图片字节，重复的同一图片每次出现都计量，符合实际请求体积。
  // 超过预算不会自动裁剪早期消息，避免模型在用户不知情下丢失图像上下文。
  // renderer 也提前核对预算，通常会在清草稿前给出可恢复的错误。
  // 主进程仍要重复验证，不能依赖按钮状态或 TypeScript 类型作为安全边界。
  // 不在错误中返回第几张图的内容，保持任何用户数据都不会被错误日志回显。
  // 图片允许集未来扩展时应同步修改 shared schema 和 Python 构造器。
  // 参数校验测试同时覆盖正式 validateRunArgs，确保此 helper 没有变成孤立实现。
  // 外层运行校验器会检查 question/config，本函数只负责消息与图片形状。
  // 先收窄对象，避免将 null 当作可解构值。
  // 数组本身不是 options，不能靠数字字段伪造一次运行。
  if (!options || typeof options !== 'object' || Array.isArray(options)) return 'Invalid Agent messages';
  const { images, history } = /** @type {{images?:unknown,history?:unknown}} */ (options);
  let chars = imageChars(images);
  if (chars < 0 || (history !== undefined && !Array.isArray(history))) return 'Invalid Agent images';
  for (const item of /** @type {unknown[]} */ (history || [])) {
    // 历史在另一端还会构造标准 messages；主进程也必须先拒绝非法角色。
    // 不依赖 TypeScript 接口保护 IPC，旧客户端与手工调用同样经过本检查。
    // 非法图片不能被替换为空数组，否则会重新造成“有图但模型看不到”。
    if (!item || typeof item !== 'object') return 'Invalid Agent history';
    const row = /** @type {{role?:unknown,content?:unknown,images?:unknown}} */ (item);
    const size = imageChars(row.images);
    if ((row.role !== 'user' && row.role !== 'assistant') || typeof row.content !== 'string' || size < 0 || (row.role !== 'user' && size > 0)) return 'Invalid Agent history';
    chars += size;
  }
  return chars > 32 * 1024 * 1024 ? 'Agent image context is too large' : null;
}
// 入口与契约测试共用同一个校验器，不能由测试另写一份宽松复制品。
// 导出不增加 preload 能力，页面仍只能使用原 runAgent 接口。
// 字节内容只在 stdin payload 流转，不在本模块落盘或记录日志。
module.exports = { validateMessageImages };
