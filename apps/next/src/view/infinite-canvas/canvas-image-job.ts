// 把两种图片服务接成同一张工作单；服务鉴权与文件保存仍留在原来的执行器。
// 像不同工厂使用相同收货单：画布只接收受管图片，不接收密钥或服务端正文。
// 这个适配器的输入是完整节点与当前图关系，输出统一为受管媒体结果。
// 服务端文件名不能直接成为画布媒体地址，必须经过所属执行器的文件确认。
// 本地与远端都直接落工程分类目录，执行器分别保持自己的保存机制。
// 因此只统一宿主需要的结果外形，不把两边内部步骤强行合并。
// 取消也是一张统一动作单，而不是承诺两家服务支持相同回滚能力。
// 任务标识不保存进图结构，重开恢复的是作品参数，不会重新提交上次收费请求。
// request ID 每次显式生成，使同一节点连续重试仍能区分旧回包。
// 图片输入顺序来自图契约，不能由服务上传并发完成顺序重新排序。
// 专用远端 schema 同时约束 provider、model、size、quality 和 mode。
// 这比只判断有一个 API Key 更严格，避免将不匹配的服务参数发出。
// 普通图片和参考编辑不能自动互相降级，缺图应失败而不是改成文生图。
// 返回路径的归属在主进程验证，渲染层不能靠更改 workspace 指向任意目录。
// 主进程返回的 workspace 可用于随后自动保存，不能从文件路径截取猜测。
// 生成成功但节点已被删除时由宿主拒绝回填，本层不会凭结果重建旧图。
// 任务异常是 promise 拒绝，不返回一个带 error 字段却仍被当成功的媒体数组。
// 图片数量以结果数组为准，不能预先制造 n 个空媒体等待以后填充。
// 远端少量返回仍由结果契约表达，通知同时带实际与请求数量。
// 本地部分编辑完成保留工程内成果，不保证在图中逐张提交部分结果。
// 用户停止后仍可能有磁盘文件，图事务和文件副作用不能混为一个撤销系统。
// 画布宿主只拿最小工作单，不暴露底层 HTTP 客户端或任意文件写入句柄。
import { enqueueMediaUpscale, startCanvasUpscaleJob } from "./canvas-upscale-job";
import { canvasOutputTarget } from "./canvas-output-target";
import { startCanvasVideoJob } from "./canvas-video-job";
import { startCanvasAudioJob } from "./canvas-audio-job";
import { EuzhiImageRequestSchema } from "@illusion-realm/shared";
import { cancelImageGeneration } from "@/utils/image-generation-queue";
import { cancelEuzhiImage, generateEuzhiImage } from "@/utils/euzhi-images";
import { canvasImageBatchSize, canvasImageInputs, canvasIsTextToImage } from "./canvas-input-rules";
import { importGeneratedImages, startLocalImageGeneration } from "./canvas-local-generation";
import type { CanvasDocument, CanvasNode } from "./canvas-model";
import { canvasCustomPromptNode } from "./canvas-prompt-conversion";

// 直接连线优先，且编号、缩略图与实际上传采用同一个节点ID顺序。
// 空图片仍计入数量，但必须在提交前拒绝，不能上传一张不存在的占位图。
// 文生图的请求不携带参考图；工程附件和连线仍保留供切回编辑使用。
// 请求像一张封口快递单：发出后输入图片次序和正文都以这份快照为准。
// 生成 request ID 与节点 ID 分离，同一张卡再次生成不会和上次取消身份混淆。
// name 与 workspace 描述受管归属，不能由远端服务回包指定任意落盘位置。
// 直接上游使用同一个 ID 排序规则，引用提示与实际上传顺位一致。
// 只要一个上游缺少真实图片就失败，不能丢掉空项让后续编号悄悄前移。
// 手动输入排在连线后面，不能让上传顺序由哪个缩略图先解码决定。
// 没有参考图的 text 模式仍提交空 images，schema 对模式和张数共同校验。
// n 读取批量确认值，缺省一张，不从按钮当前显示的汉字或乘号解析。
// safeParse 将不合法配置拒绝在 preload 调用之前，不发一个明知非法的收费请求。
// 配置只含供应商与模型选项，不含 API Key；主进程按专用凭据槽读取。
// 返回统一 promise/cancel，但远端的取消语义仍是停止本地等待。
// 同一工作单只建立一次 request ID，cancel 必须引用原值而不能临时生成新 UUID。
// 这里不保存返回字节，原远端处理器负责解码、大小限制和受管文件确认。
// HTTP 错误到 hook 再翻译，不能在此层吞错返回空媒体伪装成功。
// 本地队列和远端传输的相似外形不代表同一种收费或取消保证。
function remoteJob(node: CanvasNode, document: CanvasDocument) {
  const textOnly = canvasIsTextToImage(node.data);
  const linked = textOnly ? [] : canvasImageInputs(node.id, document);
  if (linked.some(item => item.data.media?.kind !== "image")) throw Error("euzhi-input-missing");
  const request = EuzhiImageRequestSchema.safeParse({
    id: crypto.randomUUID(), name: document.name, workspace: document.workspace,
    configuration: node.data.remoteImage, mode: node.data.mode ?? "text",
    prompt: node.data.prompt, n: canvasImageBatchSize(node.data),
    images: textOnly ? [] : [...linked.map(item => item.data.media), ...(node.data.inputImages ?? [])],
  });
  if (!request.success) throw Error("euzhi-input-invalid");
  return { promise: generateEuzhiImage(request.data), cancel: () => cancelEuzhiImage(request.data.id) };
}

// 本地队列直接保存到画布自己的 Picture 目录，登记时复用原地址。
// 创作页未指定画布目标，继续沿用它自己的图库保存契约。
// 取消使用确切任务ID；绝不以停止所有任务中断创建页的其他工作。
// 来源身份以 remoteImage 是否存在决定，不能以模型展示名包含 GPT 来猜服务。
// 本地 promise 完成得到工程内路径，导入器校验后转换为画布结果契约。
// then 不改变原队列的失败；推理或保存拒绝会直接跳过受管导入。
// 导入失败同样拒绝外层 promise，不能发出已经完成节点回填的通知。
// 两种任务都返回 media 与 workspace，宿主因此能共享批量回填规则。
// 只共享收货行为，模型构建、API 鉴权、上传方式与取消确认仍各自独立。
// 本地 cancel 保留原函数闭包，不依赖 then 是否已经进入受管登记。
// 已写文件不伪造可回滚事务，磁盘清理不由图层撤销承担。
// 返回对象不暴露服务端 prompt、原始令牌或可调用任意 IPC 的句柄。
// 图片、音频、视频在此选择已有执行器，结果都必须先成为工程受管媒体。
/** 远端图已受管保存才进入本地超分队列；取消只指向当前阶段，不中断其他请求。 */
function remoteWithUpscale(node: CanvasNode, document: CanvasDocument) {
  const remote = remoteJob(node, document);
  let local: ReturnType<typeof enqueueMediaUpscale> | null = null;
  let cancelled = false;
  const promise = remote.promise.then(async result => {
    if (cancelled) throw new DOMException("Cancelled", "AbortError");
    if (!node.data.upscale?.enabled) return result;
    const output = await canvasOutputTarget({ ...document, workspace: result.workspace }, "image");
    const paths: string[] = [];
    for (const media of result.media) {
      if (cancelled) throw new DOMException("Cancelled", "AbortError");
      local = enqueueMediaUpscale(media, node.data.upscale, output.target);
      paths.push(...await local.promise);
    }
    return importGeneratedImages({ ...document, workspace: result.workspace }, paths);
  });
  return { promise, cancel: async () => {
    cancelled = true;
    if (local) await cancelImageGeneration(local.id);
    else await remote.cancel();
  } };
}

export function startCanvasImageJob(node: CanvasNode, document: CanvasDocument) {
  if (node.data.kind === "audio") return startCanvasAudioJob(node, document);
  if (node.data.mode === "upscale") return startCanvasUpscaleJob(node, document);
  if (node.data.kind === "video") return startCanvasVideoJob(node, document);
  node = canvasCustomPromptNode(node, document);
  if (node.data.remoteImage) return remoteWithUpscale(node, document);
  const job = startLocalImageGeneration(node, document);
  return { promise: job.promise.then(result => importGeneratedImages({ ...document, workspace: result.workspace }, result.paths)), cancel: job.cancel };
}
