/**
 * 蒙版文档的像素层和撤销历史。编辑坐标始终以原图像素为单位。
 * 原图、RGB 绘画和蒙版覆盖率分别存储；界面颜色不写入蒙版数据。
 * 文档只存在渲染进程内，页面切换可以复用，不写进用户账户 JSON。
 */
import { encodeMaskPng, loadMaskImage, type MaskExports } from './mask-image';
import { t } from '@/i18n';

// 三张 canvas 必须保持同样的自然尺寸，所有变换以整个文档为单位。
// mask 的 RGB 固定白色，alpha 表示覆盖强度；导出黑白图再转为灰度。
// painted 只保存新增颜色，原图不随画笔操作修改，方便独立导出。
// original 保留原图颜色；整图几何与选区 Delete 可改变它的尺寸或 alpha。
// painted 为透明背景，不需要为了擦除画笔而复制原始颜色。
// mask 的透明值是无覆盖，与最终上传文件的透明含义恰好相反。
// 这一层分离使隐藏蒙版、换显示颜色都无需修改导出格式。
export interface MaskLayers { original: HTMLCanvasElement; painted: HTMLCanvasElement; mask: HTMLCanvasElement }
// 快照用独立字节副本，后续画笔不会反向修改历史记录。
// 宽高属于快照，旋转后的撤销必须同时恢复尺寸和三层像素。
// saved 是显式保存的编辑检查点，取消只回到它，不删除导入图片。
// 快照包含三份完整 ImageData，而非对原 Canvas 缓冲的视图。
// 同一历史条目不保存 DOM、文件路径或当前缩放倍率。
// 保存点和撤销栈可以引用相同只读快照，恢复时始终复制像素。
// 几何操作必须先记录快照，否则裁掉的区域无法通过 undo 找回。
// 历史只在本次进程存活，关闭应用不承诺恢复这些大图缓冲。
// 预算限制的是撤销栈条目；当前文档、保存点和滤镜缓冲还会额外占内存。
// 大图至少保留一条历史的策略会超过软预算，不能宣称内存严格限于96MiB。
// 导入上限仍负责限制单文档规模，预算不代替输入校验。
// 没有把画布对象写入 Zustand 持久化插件或用户 JSON。
// 页面卸载不主动清文档，因此同进程路由返回时仍可继续编辑。
// 快照没有压缩，历史深度与原尺寸的内存代价直接相关。
// 删除文档引用后其历史一并回收，不保存跨素材全局撤销栈。
export interface MaskSnapshot { width: number; height: number; pixels: [ImageData, ImageData, ImageData] }
// file 保留导入文件的原始字节，模型读取依赖其中的工作流元数据。
// 旋转后的 canvas 不重新编码覆盖 file，否则原工作流可能被丢弃。
// name 只用于展示素材标识，不作为唯一身份或导入竞争的判据。
// past 和 future 保存操作边界，saved 则独立于撤销游标。
export interface MaskDocument extends MaskLayers { file: File; name: string; past: MaskSnapshot[]; future: MaskSnapshot[]; saved: MaskSnapshot }

/**
 * 创建透明像素面；尺寸只能来自已验证的图片或已有文档。
 * 不将 CSS 宽高写进绘图缓冲，系统缩放不会改变导出尺寸。
 * context 不存在时明确报错，不能继续返回一张假空蒙版。
 */
// Canvas 构造只发生在浏览器事件或 effect 中，静态预渲染不调用。
// 宽高属性先设置再获取 context，避免初始内容被 resize 清除。
// 返回元素不插入 DOM，允许文档离开当前页面后仍然保留像素。
// 工具不依赖 Electron 的 nativeImage，因此不会跨进程暴露文件 API。
export function maskCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
}
// willReadFrequently 对导出、选色、历史快照等读取用途给浏览器提示。
// 提示不是持久缓存保证，调用者仍需按正确文档身份获取像素。
// 不设置全局颜色或合成模式，具体工具必须自己保存并恢复状态。
// 错误沿用已有翻译词条，外层动作会捕获并显示可读说明。
export function maskContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error(t('create.maskEditor.exportFailed'));
  return context;
}

/**
 * 文件先经浏览器解码，并沿用旧蒙版的 16MP/8192 边长上限。
 * 失败释放临时 URL，旧文档由调用者保留，不能半途覆盖有效素材。
 * 解码完成后复制到自有像素层，文档不依赖临时图片对象存活。
 * 原图层保留单独副本，RGB 画笔与擦除只作用于其他层。
 * 初始保存点对应未修改的图片，首次取消编辑恢复导入状态。
 */
// 文件字节只用于首次解码和保留源 Meta；后续像素编辑读取三张自有画布。
// 导入异步竞争由 store 的版本门闩处理，本函数不决定哪张图片是最新选择。
// 成功返回前建立初始 saved 快照，首次取消也有确定目标。
// JPEG 没有 alpha 时按解码后的不透明原图处理，输出统一为 PNG。
// WebP 静态解码后的宽高同样需要像素检查，不能只信任 MIME。
// 临时 URL 在 finally 释放，解码或分配失败都不会遗留浏览器 URL 引用。
// 返回值没有服务器路径，用户必须显式生成后才会上传图片。
// 解码器的超时和错误保留现有翻译提示，失败不会覆盖旧工作区。
export async function createMaskDocument(file: File): Promise<MaskDocument> {
  // MIME 与字节上限在解码前拒绝，减少恶意大文件的解码开销。
  // 扩展名不参与判断，改名为 PNG 的文本仍会在解码步骤失败。
  // 25MiB 是文件大小限制，与下面的像素限制分别处理两种资源压力。
  // 原格式支持范围保持 PNG/JPEG/WebP，不悄悄扩展到动态图或矢量文件。
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 25 * 1024 * 1024) throw new Error(t('create.animaEdit.invalidFile'));
  const url = URL.createObjectURL(file);
  try {
    // 自然尺寸来自实际解码结果，不能相信文件名或调用方传入的尺寸。
    // loadMaskImage 自带超时，坏图片不会让导入永久停在 busy。
    // 像素检查发生在创建三张大 canvas 前，避免先分配再发现超限。
    // 16MP 对应已有蒙版约束，文字改图更高的上限不能在此自动沿用。
    const image = await loadMaskImage(url), width = image.naturalWidth, height = image.naturalHeight;
    if (width * height > 16_777_216 || Math.max(width, height) > 8192) throw new Error(t('create.maskEditor.tooLarge'));
    // 原图绘入后立即生成初始快照，空蒙版和空绘画也纳入同一保存点。
    // 三层不共享 context，擦除用的合成状态不会泄漏到原图。
    // 文档完全建立后才返回，调用方可以原子替换旧素材。
    // file 不经过 Canvas 转码，保留图片内嵌元数据供模型快捷加载。
    const layers = { original: maskCanvas(width, height), painted: maskCanvas(width, height), mask: maskCanvas(width, height) };
    maskContext(layers.original).drawImage(image, 0, 0);
    return { ...layers, file, name: file.name, past: [], future: [], saved: snapshotMask(layers) };
  } finally { URL.revokeObjectURL(url); }
}

/**
 * 历史容量按实际字节估算，避免大图每一笔无限累积内存。
 * 96MiB 是撤销栈预算；超大单步仍保留一个，以保证最近一步能撤销。
 * 保存检查点和当前三层另占空间，不冒充总内存限制。
 * 一次连续按下到抬起只记一条，鼠标移动不会创建成百上千快照。
 * 新操作会清 redo；只调整颜色或视图不调用此函数。
 * past/future 都受同样的步数限制，左右翻转历史不会无限增长。
 */
// 快照读取三层同一尺寸，任一层尺寸不一致都属于文档不变量被破坏。
// ImageData 拥有副本，后续 putImageData 不会引用正在绘制的 canvas 缓冲。
// 同步读取保证一份快照里不会混入两次用户操作的不同阶段。
// 这里不保存工具和颜色；撤销只改变内容，不改变用户当前笔刷偏好。
export function snapshotMask(layers: MaskLayers): MaskSnapshot {
  const { width, height } = layers.original;
  return { width, height, pixels: [layers.original, layers.painted, layers.mask].map(canvas => maskContext(canvas).getImageData(0, 0, width, height)) as MaskSnapshot['pixels'] };
}
// 恢复先设每层尺寸，这会清空旧像素和 Canvas 合成状态。
// putImageData 按原始像素写入，不经过 CSS 缩放或图片插值。
// 因而连续旋转再撤销仍能回到相同字节，而不是一张被重新采样的图。
// saved 被视为只读快照，取消后继续编辑不会改变下次取消的目标。
export function restoreMask(doc: MaskDocument, value: MaskSnapshot): void {
  [doc.original, doc.painted, doc.mask].forEach((canvas, index) => { canvas.width = value.width; canvas.height = value.height; maskContext(canvas).putImageData(value.pixels[index], 0, 0); });
}
// 只在文档真正发生内容操作之前调用，未导入图片时不建立空历史。
// 一个快照约占 width×height×4×3 字节，预算据此估算。
// 删除最老条目保持最近操作可撤销；不把保留数量固定为大图不可承受值。
// 计算上限至少为一，因此极大图的实际内存可能超过 96MiB。
// 这是一项明确的内存取舍，页面不会声称拥有无限撤销深度。
// future 清空发生在新分支开始时，避免 redo 把刚画的新内容覆盖掉。
export function rememberMask(doc: MaskDocument): void {
  doc.past.push(snapshotMask(doc)); doc.future = [];
  const limit = Math.max(1, Math.min(20, Math.floor(96 * 1024 * 1024 / (doc.original.width * doc.original.height * 12))));
  if (doc.past.length > limit) doc.past.splice(0, doc.past.length - limit);
}
// 撤销先把当前内容存入反向栈，再恢复目标，重做因此与撤销对称。
// 空栈是合法无操作，工具按钮也会禁用，但底层不依赖按钮守卫。
// restore 不调用 remember，避免在历史导航时创建新的历史分支。
// 栈只在当前文档上操作，换图建立的新文档不会继承旧素材历史。
export function travelMask(doc: MaskDocument, redo: boolean): void {
  const from = redo ? doc.future : doc.past, to = redo ? doc.past : doc.future, value = from.pop();
  if (value) { to.push(snapshotMask(doc)); restoreMask(doc, value); }
}

/**
 * 导出独立黑白蒙版、原图带反向 alpha，以及独立 RGB 合成通道。
 * 预览颜色、图层显隐、缩放和显示透明度均不参与导出。
 * mask.alpha=255 表示完全重绘，对应提交 PNG 的 alpha=0。
 * 软笔刷中间灰度逐字节保留，不二值化成硬边。
 * 原图 RGB 直接复制，再改 alpha，透明区域不会被 canvas 编码清零。
 * composite 是原图加 RGB 绘画；image 始终仍是原图加蒙版。
 * 工作流使用 composite 的编辑合成与反向 alpha；image 保留为原图透明通道导出。
 * 独立 mask 始终不透明；黑为保留，白为重绘。
 * 所有结果使用同一版本的尺寸和覆盖率，不异步读取可变画布。
 */
// composite 同时用于工作流输入与合成下载，不能丢弃独立绘画层的颜色修改。
// painting 不应用蒙版，用于检查独立 RGB 修饰的效果。
// 四个 Blob 编码使用同一轮同步读取，不能把不同操作阶段混成一组。
// 全透明处的原 RGB 由直接字节编码保留，不交回 Canvas.toBlob 二次预乘。
// 导出是内存计算，不写用户目录，不隐式创建 ComfyUI 任务。
// 文件名、下载入口和上传时机由 UI 或执行器决定。
// 输入蒙版的覆盖率与上传alpha互为补值，两者不通过UI显示色推断。
export function exportMaskDocument(doc: MaskDocument): MaskExports & { composite: Blob; painting: Blob } {
  const { width, height } = doc.original, combined = maskCanvas(width, height), context = maskContext(combined);
  context.drawImage(doc.original, 0, 0); context.drawImage(doc.painted, 0, 0);
  // 先取得独立字节副本再改 alpha，不能直接写回原图或绘画 canvas。
  // painting 在施加蒙版前复制，用于不带蒙版的 RGB 合成下载。
  // 原图透明区域的 RGB 尽量按浏览器解码结果保留；浏览器输入解码仍有自身约束。
  // 对本工具新产生的透明蒙版区域，直接 PNG 编码避免额外预乘损失。
  const original = new Uint8Array(maskContext(doc.original).getImageData(0, 0, width, height).data);
  const composite = new Uint8Array(context.getImageData(0, 0, width, height).data), painting = composite.slice();
  const mask = maskContext(doc.mask).getImageData(0, 0, width, height).data, gray = new Uint8Array(original.length);
  // 每个灰度像素重复三通道并固定不透明，其他软件也能直接将它当 mask 读取。
  // 反向 alpha 使用整数补值，连续导出不会产生重复乘透明度的衰减。
  // composite 与 image 各自保留输入 alpha，再乘同一份反向蒙版覆盖率。
  // 显示层的 opacity 不出现在这条路径，黑色蒙版显示也照样产生白色覆盖。
  // 不检查可见图层；隐藏操作是检查图像的方法，而不是生成输入开关。
  // encodeMaskPng 已有 PNG chunk 与压缩实现，沿用它避免再造另一种格式。
  // 保留编辑位图已有 alpha，再叠加反向重绘覆盖率，Delete 透明区域不能复活。
  // 不透明原图仍逐字节得到原来的 255-mask，旧工作流契约不变。
  // 独立 painting 已在施加蒙版前复制，能够直接导出选区删除后的结果。
  // 原图与绘画合成的 alpha 分开计算，不能把一方强制覆盖成另一方。
  for (let i = 0; i < gray.length; i += 4) { gray[i] = gray[i + 1] = gray[i + 2] = mask[i + 3]; gray[i + 3] = 255; original[i + 3] = Math.round(original[i + 3] * (255 - mask[i + 3]) / 255); composite[i + 3] = Math.round(composite[i + 3] * (255 - mask[i + 3]) / 255); }
  return { width, height, mask: encodeMaskPng(gray, width, height), image: encodeMaskPng(original, width, height), composite: encodeMaskPng(composite, width, height), painting: encodeMaskPng(painting, width, height) };
}
