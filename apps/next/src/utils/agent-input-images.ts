/**
 * 将用户选中的本地预览转换为模型可以读取的图片字节。
 * blob 地址只在当前渲染进程有效，必须在发送前转换为内嵌 data URL。
 * 原生支持的格式保留原始字节，BMP / AVIF 等格式经画布转为 PNG。
 * 转换失败直接阻止发送，不能只发文字并让用户误以为图片也已发送。
 * 本模块不读磁盘路径、不上传第三方图床，也不保存到普通用户文档。
 * 已发送字节由会话保存，后续追问复用同一份图像上下文。
 */
import { AgentImagesSchema, AGENT_IMAGE_MAX_COUNT, AGENT_IMAGES_MAX_CHARS } from '@illusion-realm/shared';
import { t } from '@/i18n';
import type { AgentAttachment } from '@/stores/useAgentStore';
/**
 * FileReader 仅编码已选 Blob，不发网络请求。
 * onerror 与 onabort 都必须拒绝，不能留下永远等待的发送入口。
 * 错误不插入文件名、用户路径或图片内容。
 * MIME 已在调用点归一化，读取结果继续由共享 schema 检查。
 */
function readDataUrl(blob: Blob): Promise<string> {
  // 输出必须包含 MIME 前缀，后端才能构造 image_url 而不是猜扩展名。
  // FileReader 不使用 object URL 作为远端地址，它读取 Blob 的实际字节。
  // 支持格式原样编码，不改 JPEG 品质或去掉 PNG 的透明通道。
  // 数据 URL 留在会话内存，不写入普通用户设置，以免复制配置时带出私人图片。
  // 界面预览依旧使用轻量 object URL，避免把大段 base64 塞进可见 DOM 属性。
  // 异步完成之前外层不会清草稿，编码异常不产生空助手消息。
  // 同一张附件不在工具调用阶段重新编码，后续上下文读取消息缓存。
  // 对结果类型的检查兼容浏览器 API 声明，不用 any 绕过字符串收窄。
  // FileReader 的 result 也可能是 ArrayBuffer，显式收窄而非强制类型断言。
  // Promise 在一次 load/error/abort 后结束，不保留浏览器事件监听到全局状态。
  // 本步骤不会修改原图或覆盖用户文件。
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(t('agent.composer.imageReadFailed')));
    reader.onerror = reader.onabort = () => reject(new Error(t('agent.composer.imageReadFailed')));
    reader.readAsDataURL(blob);
  });
}
/**
 * 兼容图片选择器已有的 BMP / AVIF，不向模型发送伪造 MIME 的原始字节。
 * 转换保持图片比例，最长边上限 4096，避免超大位图占满内存。
 * ImageBitmap 在 finally 关闭，不因取消或编码失败泄漏绘图资源。
 * PNG 编码保留透明像素，不能使用白色底覆盖原图中的透明区域。
 */
async function compatibleBlob(blob: Blob): Promise<Blob> {
  // 浏览器能够展示的格式不一定被聊天接口接收，不能根据缩略图成功推断上传可用。
  // 原生格式判断使用 Blob.type，不用用户可以随意修改的文件扩展名。
  // 空 MIME 走实际解码分支，成功后输出明确的 image/png 类型。
  // 如果浏览器无法解码文件，异常交给统一发送错误而不是发送一个空白占位图。
  // createImageBitmap 解码发生在浏览器内，不导入 Electron 或 Node 图像处理库。
  // 4096 上限仅作用于兼容格式转换，常见 PNG/JPEG/WebP 不会被重采样。
  // 缩小过程中宽高使用同一个比例，避免模型收到被拉伸的图片。
  // 以一像素为最小尺寸，极端纵横比不产生宽或高为零的画布。
  // 画布默认透明，绘制不填充额外背景，原 alpha 会进入 PNG 输出。
  // 不把画布插入 DOM，不影响用户现有编辑器或主工作区尺寸。
  // 该画布没有读取跨域远端图片，输入来自用户选中的本地 Blob。
  // getContext 失败时明确拒绝，不能把未绘制的画布编码为一张假的成功图。
  // toBlob 返回 null 属于编码失败，Promise 不可永远保持 pending。
  // 编码 Promise 在返回之前完成，finally 释放 bitmap 时输出已经独立。
  // bitmap.close 只释放临时解码资源，不撤销聊天记录中的预览地址。
  // 转换后再由共享 schema 核对长度，PNG 膨胀不能绕过单图上限。
  // 不在这个步骤调用模型推理、图床上传或后台保存，转换本身没有远端副作用。
  // GIF 原字节可通过，但帧数和动画理解仍取决于服务商，客户端不作额外保证。
  // 常见三种格式和 GIF 无须重采样，保持用户发送的原图内容。
  // 其他浏览器可解码格式由浏览器实际解码，不能仅改文件扩展名。
  // Canvas 只在此兼容分支创建，正常 PNG 不引入有损转换。
  if (/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const ratio = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d'); if (!context) throw new Error(t('agent.composer.imageReadFailed'));
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(t('agent.composer.imageReadFailed'))), 'image/png'));
  } finally { bitmap.close(); }
}
/**
 * 在清空草稿之前读取附件；任何一张失败都不发送不完整的问题。
 * 只读取本页生成的 blob URL，不能把任意 URL 作为后台请求入口。
 * 八张与长度上限由 shared 校验，超限提示保留原始草稿供用户调整。
 * 本地读取设置十秒超时，不依赖窗口可见性或 rAF。
 * 逐张处理控制临时编码内存，输出顺序与用户所选顺序一致。
 */
export async function prepareAgentImages(attachments: AgentAttachment[], previousImages: string[] = []): Promise<string[]> {
  // attachments 是发送开始时的快照，后续 UI 增删不会偷偷改变本次编码列表。
  // 调用方结束等待后还会比较数组引用，已被用户撤销的图片不会继续发送。
  // previousImages 只用于预算，不在当前 images 数组里重复追加历史内容。
  // 历史图片在自己的 user 消息上发送，避免同一轮重复计费或顺序混乱。
  // 用稳定的公开上限常量，不把主进程默认八张与页面默认数量维护成两套值。
  // 本地 blob fetch 不带 Authorization，不会把 Euzhi 密钥放进浏览器请求头。
  // provider 的选择和秘密存储不属于图片转换职责，本工具可以复用给其他视觉模型。
  // 阻止 HTTP、file 和 localfile 地址输入，不能利用组件把任意远端资源转为附件。
  // fetch 的 signal 有固定超时，输入区不会因为一个失效的 object URL 永久锁住。
  // 读取时不依赖渲染帧，最小化窗口或被遮挡不会阻断转换逻辑。
  // 源文件超过八 MiB 时不进入额外 Canvas 编码，避免先分配另一份大图资源。
  // blob.size 和附件记录中的 size 可能不同，限制以实际读取的 Blob 为准。
  // PNG/JPEG 的原始字节保留，传输测试可比较实际 base64 解码后的内容。
  // 顺序处理没有并行解码大量图片，不会同时持有八个 ImageBitmap。
  // 结果全部成功后才发布，任何失败都会丢弃本次临时编码数组并保留原预览。
  // 每张图片仍有自己的 data URL，不能拼接成一个模型无法解析的长字符串。
  // schema 的异常不透传完整问题对象，避免错误信息意外包含 base64 原图。
  // 对用户显示合并的格式/大小提示，用户可调整附件后再次发送。
  // 大段图片不会成为普通会话标题，标题仍来自用户文字。
  // 本函数不处理工具生成图片，这些产物继续通过本地路径按需展示。
  // 发送成功与否由运行入口判断，编码成功本身不代表模型已接受附件。
  // 用户密钥未配置时调用方先返回，不会为了失败请求提前读取其照片内容。
  // 清空附件或删除会话时的 URL 回收继续由原 store 管理，不能在这里抢先撤销。
  // 关闭页面后已完成的消息数据属于全局会话 store，重新进入可继续追问。
  // 服务商不支持视觉时应保留它的明确错误，不能自动重试为丢图的纯文本请求。
  // 没有附件时返回空数组，文本调用不会进入 Blob 或 Canvas 分支。
  // 网络请求只允许 blob 协议，后端收到的是图片数据，不是这个浏览器地址。
  // 长度检查在转换前后各执行一次，避免无上限读取和 MIME 转换后的膨胀。
  // catch 隐藏底层路径和浏览器错误，展示稳定的可翻译说明。
  // 不在本函数回收 object URL，聊天记录还需要同一 URL 进行缩略图预览。
  try {
    if (attachments.length > AGENT_IMAGE_MAX_COUNT) throw new Error('limit');
    const images: string[] = [];
    for (const attachment of attachments) {
      if (!attachment.previewUrl.startsWith('blob:')) throw new Error('source');
      const response = await fetch(attachment.previewUrl, { signal: AbortSignal.timeout(10000) });
      const blob = await response.blob(); if (blob.size > 8 * 1024 * 1024) throw new Error('limit');
      images.push(await readDataUrl(await compatibleBlob(blob)));
    }
    // 预算包含历史用户图片，超限时仍在清空草稿之前失败。
    // 不压缩或静默删掉旧图，避免用户追问时模型在不知情下丢失上下文。
    // 主进程会再次核对同一预算，页面检查只负责提前提供可恢复的反馈。
    if ([...previousImages, ...images].reduce((sum, value) => sum + value.length, 0) > AGENT_IMAGES_MAX_CHARS) throw new Error('limit');
    return AgentImagesSchema.parse(images);
  } catch { throw new Error(t('agent.composer.imageReadFailed')); }
}
