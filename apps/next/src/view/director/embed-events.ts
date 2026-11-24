// 消息只在本次 iframe 的专用端口上传递，不把场景广播到整个窗口。
// 仍先按 unknown 检查信封，不能因为同源就把任意消息当作场景保存。
// 原组件的三维计算留在子页面；宿主只接收快照与实际下载正文。
import { DirectorDocumentSchema } from "@illusion-realm/shared/schemas/director.schema";
import type { DirectorDocument } from "@illusion-realm/shared/types/director";

export interface DirectorCallbacks {
  onSave: (scene: DirectorDocument) => void | Promise<void>;
  onConfirm: (scene: DirectorDocument, image: string) => void | Promise<void>;
  onCancel: () => void;
}

// 保存与确认用相同入口校验，不能确认时忽略自动保存会拒绝的坏数据。
// 预览必须确实来自 JPEG 编码结果，不能在没有画面的情况下生成成功节点。
// cancel 的业务回调留到 closed 才执行；此处立即卸载会让保存确认丢在半路。
// 下载事件不落入场景 JSON，Blob 与三维对象走不同的消息分支。
// 未知动作必须拒绝确认，否则原组件可能把未执行的动作显示成成功。
export async function handleDirectorEvent(event: string, payload: unknown, callbacks: DirectorCallbacks): Promise<void> {
  if (event === "save") return void await callbacks.onSave(DirectorDocumentSchema.parse(payload));
  if (event === "confirm") {
    const scene = DirectorDocumentSchema.parse(payload);
    const image = scene.previewImageUrl;
    if (!image || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)) throw Error("director-preview-missing");
    return void await callbacks.onConfirm(scene, image);
  }
  if (event === "cancel") return;
  if (event === "exportVideo" && payload instanceof Blob) return download(payload, "director.mp4");
  if (event === "download" && isRecord(payload) && typeof payload.filename === "string") return download(payload.content, payload.filename);
  throw Error("director-invalid-event");
}

// MessagePort 已经隔离了调用方，这个缩窄只负责拒绝损坏信封和非对象值。
// 数组不算键值信封，避免数字索引被误解成请求字段。
// 不读取对象上的任意 getter；消息经过 structured clone 后应为普通数据。
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// 下载继续走浏览器/Electron 原有下载流程，不复刻上传或文件写盘服务。
// 文件名只留末段，不能让子页面用相对路径选择宿主的输出目录。
// Blob URL 在下一轮任务释放；清理不依赖窗口中的动画帧是否继续执行。
// 允许 PNG、JPEG data URL；JSON 和视频应使用 Blob，防止把任意地址作为下载。
// 下载正文有上限，错误会回到原组件，不用“已导出”掩盖拒绝结果。
function download(content: unknown, filename: string): void {
  if (!(content instanceof Blob) && !(typeof content === "string" && /^data:image\/(png|jpeg);base64,/.test(content))) throw Error("director-invalid-download");
  if ((content instanceof Blob ? content.size : content.length) > 536870912) throw Error("director-download-too-large");
  const url = content instanceof Blob ? URL.createObjectURL(content) : content;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.split(/[\\/]/).pop()?.slice(0, 200) || "director.bin";
  anchor.click();
  if (content instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 0);
}
