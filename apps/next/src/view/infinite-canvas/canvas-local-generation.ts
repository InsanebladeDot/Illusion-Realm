// 本地图片执行只适配原图片/文字改图队列与画布受管目录，不引入另一条推理请求链。
// 队列拥有服务端任务；画布拥有结果节点，二者通过落盘路径交接。
// 本地适配只有三项职责：确认图片输入、调用原队列、接收真实落盘路径。
// 它不持有窗口、导航或提示词弹窗状态，不改变创建页常驻订阅。
// 浏览器 File 是上传输入，媒体路径是工程引用，不能将二者当同一类持久化对象。
// File 只保留在本次异步工作单，工程 JSON 不包含文件字节或函数闭包。
// 文件名供原上传协议使用，不让它决定磁盘目的目录。
// 目的目录由既有画布受管服务分配，节点标题不能作为任意绝对路径使用。
// 生成直接写工程目录，之后登记原路径；登记失败仍须反馈，不能冒充回填完成。
// 已落盘成果保留在工程目录，不能因图回填失败自动删除。
// 共享队列调度保证同一服务不会被画布另开任务通道绕过。
// 单张编辑调用没有批量参数，适配器通过顺序组合尊重原契约。
// 每笔单张编辑仍会出现在原任务队列，数量不是仅在节点里变成六。
// 控制器负责批次的后续动作，服务取消负责当前远端任务，两者各有范围。
// 读参考失败属于输入准备失败，还没开始推理，不应以模型异常计一次生成结果。
// 结果文件由原保存器写 Meta，登记不重编码，也不再保存一份图库副本。
// 读取原图也不借用截图，避免显示缩放或主题色进入参考内容。
// 只读取明确连接或导入的图片，其他画布图像不会因同一目录而被批量上传。
// 文件 access 与 decode 两步都可能失败，二者均通过 promise 拒绝恢复忙碌状态。
import { t } from "@/i18n";
import { cancelImageGeneration, enqueueImageGenerationJob } from "@/utils/image-generation-queue";
import { enqueueAnimaEdit } from "@/utils/anima-edit-queue";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { loadMaskImage } from "@/utils/mask-image";
import { unwrapIpc } from "@/utils/ipcResult";
import { canvasImageBatchSize, canvasImageInputs, canvasInputRule, canvasIsTextToImage } from "./canvas-input-rules";
import { canvasEditParameters, canvasImageParameters } from "./canvas-image-parameters";
import { canvasOutputTarget } from "./canvas-output-target";
import type { CanvasDocument, CanvasNode } from "./canvas-model";

// 输入不足允许用户继续编辑，但提交必须拒绝；已生成结果不自动成为自己的参考图。
// 同时检查连线和加号导入，两条路径不能分别合法却合起来超出一张。
// 文生图不收图片；Anima 一张，H3 最多八张，先查数量再读字节。
// 直接上游只取图片与场景预览，文本连接不增加图片张数。
// 空图片节点仍占一个输入名额，但没有真实媒体就不能提交。
// 先合并连线与加号导入，再一次性校验，避免两处各允许一张最终上传两张。
// 文生图忽略已保存的图片输入，切回编辑时再使用，不读取或上传这些图片。
// 文字改图要求恰好一张，不自动挑第一张来掩盖超量错误。
// 规则对象来自原画布约束，不在执行器硬编码另一份不同的数量。
// 返回媒体引用不读取文件字节，合法路径能否访问由下一阶段确认。
// 旧工程仍可打开和修正，输入不足只阻止提交，不删除用户连线。
// 错误由统一任务入口显示，不能用假生成结果补足缺少的参考图。
export function localImageInputs(node: CanvasNode, document: CanvasDocument) {
  if (canvasIsTextToImage(node.data)) return [];
  const linked = canvasImageInputs(node.id, document).map(item => item.data.media);
  const inputs = [...linked, ...(node.data.inputImages ?? [])];
  const rule = canvasInputRule(node.data)!;
  if (inputs.length < rule.min || inputs.length > rule.max || inputs.some(image => image?.kind !== "image")) throw Error(t("canvas.remoteInputInvalid"));
  return inputs;
}

// 编辑输入的 File 读取真实本地媒体，不生成占位透明图，也不使用结果卡的旧封面。
// fetch 走生产 localfile 协议；调用方的取消信号覆盖读文件和下一项排队。
// 只为原编辑队列提供它需要的自然尺寸，CSS缩放不参与 MP 计算。
// 媒体地址必须经过现有 localFileUrl 转换，原文件路径不能直接交给浏览器 fetch。
// 协议与 CORS 权限由 Electron 原处理器决定，本模块不降低网页安全设置。
// 先检查 HTTP 状态，再读 blob，失联图片不能作为空文件上传。
// 读取的是原始字节，不把缩略图重新截图后冒充原参考图。
// File 名称保留素材名称供原上传器识别，实际服务名仍以服务器回包为准。
// 文件 MIME 来自协议响应，不从用户输入框猜测格式。
// 自然宽高由真实解码得到，节点卡片的 CSS 宽高不具备图片尺寸语义。
// 不通过 Canvas 重编码原图，避免透明通道或元数据在读取时被改写。
// 取消信号覆盖 fetch，解码结束后再检查一次，阻止期间取消后继续排队。
// loadMaskImage 自身有等待上限，损坏图片不能让任务永久忙碌。
// 这里不创建额外对象 URL，解码用已有只读媒体地址，因此无需 revoke 输入地址。
// 返回对象满足原 EditSource，后续上传、模型校验和保存继续走原执行器。
// 同源多节点可以引用同一个文件，读取并不改变源文件所有权。
// 用户删除原媒体时允许真实失败，不拿旧封面缓存假装参考图仍可访问。
async function editSource(node: CanvasNode, document: CanvasDocument, signal: AbortSignal) {
  const images = localImageInputs(node, document);
  const result = [];
  for (const image of images) result.push(await readEditImage(image!, signal));
  return result;
}

/** 读取每张受控媒体，取消或坏图中止整批，不用第一张代替其余参考。 */
async function readEditImage(image: NonNullable<CanvasNode["data"]["media"]>, signal: AbortSignal) {
  const url = buildLocalFileUrl(image.path)!;
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error(t("canvas.remoteInputInvalid"));
  const blob = await response.blob();
  const decoded = await loadMaskImage(url); signal.throwIfAborted();
  return { file: new File([blob], image.name, { type: blob.type }), url, width: decoded.naturalWidth, height: decoded.naturalHeight };
}

// 每批只把最后确认的文件登记进画布，主进程重新 stat，不信任这里的零占位字节数。
// 结果直接落在画布工程，便携导出不依赖图库路径。
// 任一文件被拒绝就报错，不能少了几张却显示本批全部成功。
// 模型任务先完成工程目录落盘，画布再登记这些已确认的文件路径。
// 把路径交给 canvasImportMedia 复用归属、扩展名和实际文件校验；本工程文件直接登记。
// 传入 size 为零只是接口占位，主进程必须 stat，不能信任渲染层字节数。
// copy 模式保留外部来源；已经位于同工程分类目录的文件不再复制。
// 受管目标位于当前工程分类目录，便携导出不依赖图库外部位置。
// 全部输入和输出数量比较，部分拒绝不能报告请求张数全部成功。
// 没有路径直接失败，不创建没有真实媒体的额外卡片。
// window.electronAPI 缺失也失败，普通浏览器不能伪装完成本地磁盘保存。
// unwrapIpc 保留统一错误边界，不把 success=false 当作空成功处理。
// 本函数不回写节点，文件接收和图事务由不同层负责。
// 若登记失败，工程内已生成文件仍存在；不自动删除用户成果。
// 文件副作用不宣称能随画布撤销回滚，撤销只恢复工程引用。
export async function importGeneratedImages(document: CanvasDocument, paths: string[], kind: "image" | "video" | "audio" = "image") {
  const api = window.electronAPI;
  if (!api || !paths.length) throw Error(t("canvas.generationFailed"));
  const files = paths.map(path => ({ kind, path, name: path.split(/[\\/]/).pop()!, size: 0 }));
  const result = unwrapIpc(await api.canvasImportMedia({ name: document.name, workspace: document.workspace, files, mode: "copy", origin: "generated" }));
  if (result.media.length !== paths.length || result.rejected.length) throw Error(t("canvas.generationFailed"));
  return result;
}

// 文生图保留批次，图片编辑只入队一次；取消只作用于当前任务。
// 取出落盘路径后释放编辑预览，错误交给节点任务入口处理。
export function startLocalImageGeneration(node: CanvasNode, document: CanvasDocument) {
  localImageInputs(node, document);
  let current: string | null = null;
  const controller = new AbortController();
  const promise = (async () => {
    const { target, workspace } = await canvasOutputTarget(document, "image");
    controller.signal.throwIfAborted();
    if (node.data.workflow !== "anima-edit" && node.data.workflow !== "minimax-image-edit") {
      const job = enqueueImageGenerationJob(canvasImageParameters(node.data), canvasImageBatchSize(node.data), target);
      current = job.id; return { paths: (await job.promise).savedPaths, workspace };
    }
    const [source, ...references] = await editSource(node, document, controller.signal);
    controller.signal.throwIfAborted();
    const job = enqueueAnimaEdit(source, canvasEditParameters(node.data), () => {}, references, target); current = job.id;
    const result = await job.promise;
    URL.revokeObjectURL(result.image.objectUrl);
    return { paths: result.savedPaths, workspace };
  })();
  return { promise, cancel: async () => { controller.abort(); if (current) await cancelImageGeneration(current); } };
}
