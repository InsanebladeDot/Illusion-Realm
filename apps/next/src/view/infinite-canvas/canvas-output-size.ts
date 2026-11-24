// 输出像素由节点的原尺寸附表驱动，画质标签、提交参数与保存恢复共用它。
// 尺寸数据只有一处事实来源，画质组件不维护另一份 width 状态作为确认值。
// 这里复用原 imageSize 工具，因此页面预设与画布请求都遵守图片八像素规则。
// 函数返回新对象方便调用方比较，不缓存上一次节点的数据。
// 同一模块被多张卡使用时不会因为模块级可变对象串尺寸。
// 输出尺寸计算是同步纯逻辑，不触发模型扫描、网络请求或本地文件读取。
// 这让旧工程可以在离线时展示参数，服务连接不是查看尺寸的前提。
// 远端和本地的持久化位置不同，读取时按来源选择，写入时拒绝跨界。
// 原字段保持轻量，工程导出仍是标准可验证 JSON，而不是嵌入 DOM 或函数。
// 比例约定在此说明，不能在一个菜单按长边、另一个菜单按面积解释相同档位。
// 自定义输出若刚好长边为两千零四十八，摘要归入两千档，完整宽高仍可查看。
// 这种摘要分类不丢失原数值，下一次提交依旧使用真实 size。
// 新增档位无需迁移历史 size，它仍使用同一个最终像素解析入口。
// 历史预设不强制转换为自定义，只有用户明确选择新档位才生成补丁。
import { clampImageSide, resolveImageDimensions } from "@/utils/imageSize";
import type { CanvasData } from "./canvas-model";
import { canvasMegapixelDimensions, isCanvasMinimax } from "./canvas-video-resolution";

// 同一个图片节点可以来回选择模板，尺寸因此按模板身份存放，而不是按显示名称存放。
// SDXL 和图片编辑各自拥有覆盖项；没有明确身份的旧图片继续按 Anima 解释。
// 服务来源另由 remoteImage 判定，不能把非本地模型名称塞进本地模板键。
// 模板映射只处理图片，视频尺寸读写在下方按类型分流，不占用图片模板。
export function canvasImageWorkflow(data: CanvasData) {
  return data.workflow === "sdxl" || data.workflow === "moss" || data.workflow === "anima-edit" || data.workflow === "minimax-image-edit" ? data.workflow : "anima";
}

// 1K/2K 以长边为准，短边按所选比例计算后对齐扩散模型的八像素单元。
// 比例是尺寸意图，不能从当前导入图片或卡片DOM测量反推。
// 旧工程的非法比例由既有schema挡住，这里仍为缺省比例提供正方形回落。
// 这里的 K 表示长边像素档位，不是文件字节，也不是百万像素预算。
// 例如十六比九的一千零二十四档输出一千零二十四乘五百七十六。
// 竖屏九比十六交换两条边，长边仍是一千零二十四。
// 两千零四十八档先按比例计算，再分别对齐，不能把已经取整的短边再翻倍。
// 四比三在两档下分别得到一千零二十四乘七百六十八和两千零四十八乘一千五百三十六。
// 对齐复用图片原规则；视频使用的其他步进不应混入这张计算表。
// 宽高比接收旧斜杠和原创建页冒号两种写法，返回值始终是数值像素。
// 无效分母不能参与除法；回落正方形避免把 Infinity 交给工作流。
// 这层不读取导入图的自然尺寸，导入一张大图不会偷偷提高生成预算。
// 它也不读取页面缩放，画布缩到百分之五十仍应产生相同输出像素。
// 浮点比例经过公共对齐后可能轻微偏离数学比值，这是 latent 单元的要求。
// 因此界面判断比例时允许很小误差，不应把所有非整除比例都写成自定义。
// 函数不修改 ratio，输出边长由调用方在明确确认时写回。
// 选择档位与选择卡片外形是两个动作，不能借尺寸补丁改变节点世界坐标。
// 图片档位按长边，视频p档按短边；像两种尺子，刻度相同但测量的边不同。
// video只注入尺寸规则，不读取或修改任何节点、媒体与工作流状态。
// 视频的1080p必须保留1080，不能走图片八像素对齐后变成1088。
// 竖屏与横屏使用同一公式，交换比例即交换两边，不另建竖屏预设表。
// 偶数取整最多产生一个像素级比例误差，像素读数显示实际确认值。
// 极端比例下最小边保留二像素，防止出现零高或零宽配置。
// 本函数只计算下一次输出意图，不声明MiniMax接受任意比例或分辨率。
export function canvasPresetDimensions(ratio: string, side: number, video = false) {
  const [width, height] = ratio.split(/[/:]/).map(Number);
  const valid = width > 0 && height > 0 && Number.isFinite(width / height);
  const aspect = valid ? width / height : 1;
  const align = video ? (value: number) => Math.max(2, Math.round(value / 2) * 2) : clampImageSide;
  const outputWidth = video ? (aspect >= 1 ? side * aspect : side) : (aspect >= 1 ? side : side * aspect);
  return { width: align(outputWidth), height: align(outputWidth / aspect) };
}

// 已明确保存的尺寸优先；没有附表的旧节点使用1K，不偷偷生成一份默认表。
// 远端尺寸从实际服务配置读回，不能把本地附表标签套到远端请求上。
// 读取顺序决定了界面和请求是否说的是同一件事。
// 远端先读取供应商配置中实际能够提交的 size，而不是页脚上一次选择的本地档位。
// 本地有 size 时交回原解析器，历史预设、倍率和自定义都继续生效。
// 缺少 size 才采用本轮一千零二十四长边默认，不能用空表覆盖原预设。
// 返回对象不携带 mode，展示方不应为读取宽高而改写工程模式。
// 原解析器会应用一次倍率；本函数不能再乘一次，否则尺寸会平方增长。
// 在读取时构造默认表会让打开菜单变成一次编辑，因此这里保持纯读取。
// 工程恢复、生成提交和画质显示都可调用本函数，避免三处各自猜默认值。
// 旧节点的卡片尺寸可能是长方形；它并不构成已有输出比例的证据。
// 视频优先读取独立确认尺寸；MiniMax缺省按1.0百万像素，其他视频保留720p回落。
// 输出配置不会取导入视频的自然尺寸；源素材像素与下一次生成意图是两件事。
// MiniMax按32像素对齐，旧的明确宽高原样保留，直到用户主动选择面积或比例。
// 返回副本而非原对象，调用方不能通过改返回值污染历史快照。
export function canvasOutputDimensions(data: CanvasData) {
  if (data.kind === "video") return data.videoOutput ? { ...data.videoOutput } : isCanvasMinimax(data) ? canvasMegapixelDimensions(data.ratio, data.videoMegapixels ?? 1) : canvasPresetDimensions(data.ratio, 720, true);
  if (data.remoteImage) {
    const [width, height] = data.remoteImage.size.split("x").map(Number);
    return { width, height };
  }
  const size = data.imageParameters?.[canvasImageWorkflow(data)]?.size;
  const result = size ? resolveImageDimensions(size) : canvasPresetDimensions(data.ratio, 1024);
  // H3 潜空间要求32像素步进；面板显示和执行使用同一结果，避免3:2等预设无法提交。
  return data.workflow === "minimax-image-edit" ? { width: Math.max(32, Math.round(result.width / 32) * 32), height: Math.max(32, Math.round(result.height / 32) * 32) } : result;
}

// 旧在线节点固定提交方图，ratio 可能还留着切换模型前的本地比例。
export function canvasOutputRatio(data: CanvasData, dimensions: { width: number; height: number }) {
  return data.remoteImage && dimensions.width === dimensions.height ? "1/1" : data.ratio;
}

// 最终像素写回原size字段，不新增与生成参数容易漂移的“画质”副本。
// 保留其他模板、模型与采样设置，复制节点后更新一张不会原地修改另一张。
// 像给当前模板换一张工作单：保留整张模板目录，只替换当前这一页的尺寸栏。
// 外层展开保留其他模板；内层展开保留当前模型、负面词和采样设置。
// size 整体替换，防止旧预设 mode 与新自定义宽高混用。
// scale 固定一，表示传入的宽高已经是最终像素，不再附加旧倍率。
// aspectRatio 保留用户的比例意图；自定义数值是否匹配由显示层判断。
// 不原地修改 data.imageParameters，历史快照与复制节点继续保持独立。
// 这不是通用图片缩放器，它不会读取或重编码已有媒体文件。
// 调用方负责数值草稿校验；这里的类型只约束两个数，不等于 runtime 校验器。
// 生成构建边界仍有自己的合法参数检查，不能依赖只从按钮入口调用。
// 视频写到自己的输出字段，仍经同一父级事务进入撤销、复制与原保存器。
// 没有增加一个全局画质状态，同源两个节点可保留不同输出规格。
// 尺寸补丁不包含ratio，用户输入自由宽高后界面按实际像素识别为自定义比例。
// 只有显式选快捷比例才同时更新ratio，两者在同一笔事务里提交。
export function canvasSizePatch(data: CanvasData, width: number, height: number): Partial<CanvasData> {
  if (data.kind === "video") return { videoOutput: { width, height } };
  // 在线尺寸写入请求使用的 size，避免菜单显示的宽高和发出的参数不一致。
  if (data.remoteImage) return { remoteImage: { ...data.remoteImage, size: `${width}x${height}` } };
  const workflow = canvasImageWorkflow(data);
  return { imageParameters: { ...data.imageParameters, [workflow]: { ...data.imageParameters?.[workflow], size: {
    mode: "custom", aspectRatio: data.ratio.replace("/", ":"), customWidth: width, customHeight: height, scale: 1,
  } } } };
}
