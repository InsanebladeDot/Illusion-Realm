// 画布与原网页的桥接只管理真实文件和节点保存，不实现第二套时间线。
// 写盘成功后才更新 React 图，失败仍可保留 iframe 中未保存的原快照。
import { unwrapIpc } from "@/utils/ipcResult";
import { t } from "@/i18n";
import type { CanvasDocument, CanvasNode } from "../infinite-canvas/canvas-model";
import { CompositionAssets, connectedMedia, type CompositionMedia } from "./composition-assets";
interface CompositionCallbacks {
  save: (document: CanvasDocument) => Promise<boolean>;
  apply: (document: CanvasDocument) => void;
}
export class CompositionController {
  readonly registry: CompositionAssets;
  constructor(public document: CanvasDocument, readonly id: string, private callbacks: CompositionCallbacks) {
    this.registry = new CompositionAssets(this.node().data.composition);
  }
  private node(): CanvasNode {
    const node = this.document.nodes.find(item => item.id === this.id && item.data.kind === "composition");
    if (!node) throw Error("composition-node-missing");
    return node;
  }
  initial() {
    const media = connectedMedia(this.document, this.id).map(item => ({ url: this.registry.register(item), name: item.name, mediaType: item.kind }));
    return { initialState: this.registry.restore(this.node().data.composition), videos: media.filter(item => item.mediaType !== "audio"), audios: media.filter(item => item.mediaType === "audio") };
  }
  // 交易像先签收再入账：文档写失败就不派发替换，避免显示虚假的已保存。
  // 本地 document 立即前进，连续消息不依赖 React 下一次渲染才能看见最新结果。
  private async commit(document: CanvasDocument): Promise<void> {
    if (!await this.callbacks.save(document)) throw Error("composition-save-failed");
    this.document = document;
    this.callbacks.apply(document);
  }
  async save(value: unknown): Promise<void> {
    const composition = this.registry.snapshot(value);
    await this.commit({ ...this.document, nodes: this.document.nodes.map(node => node.id === this.id ? { ...node, data: { ...node.data, composition } } : node) });
  }
  // 原导出到画布会先存真实 MP4，再通知这里创建视频节点。
  // 只接受本会话登记的成片地址，远程地址和任意路径不能伪装为本地结果。
  async compose(value: unknown): Promise<void> {
    if (!value || typeof value !== "object" || !("resultUrl" in value) || typeof value.resultUrl !== "string") throw Error("composition-invalid-result");
    const media = this.registry.media(value.resultUrl);
    if (media.kind !== "video") throw Error("composition-invalid-result");
    const source = this.node();
    const result: CanvasNode = { id: crypto.randomUUID(), type: "canvas", position: { x: source.position.x + (source.data.card?.width ?? 284) + 100, y: source.position.y }, data: { kind: "video", title: t("canvas.compositionResult"), prompt: "", content: "", ratio: "16/9", media: { ...media } } };
    await this.commit({ ...this.document, nodes: [...this.document.nodes, result], edges: [...this.document.edges, { id: crypto.randomUUID(), source: this.id, target: result.id, sourceHandle: "out", targetHandle: "in" }] });
  }
  // File 经 MessagePort 后不一定保留 Electron 原始身份，正文导入是可靠后备。
  // 原文件保持不动；文件归属与另存为选择均由生产主进程服务负责。
  // 单次上限与主进程一致，避免跨 IPC 复制超大正文导致窗口失去响应。
  async media(value: unknown): Promise<{ url: string } | { downloaded: true } | null> {
    if (!value || typeof value !== "object" || !("file" in value) || !(value.file instanceof Blob)) throw Error("composition-invalid-media");
    const file = value.file;
    if (file.size > 256 * 1024 * 1024 || !file.size) throw Error(t("canvas.compositionSizeLimit"));
    const name = "name" in value && typeof value.name === "string" ? value.name : "composition.mp4";
    const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "video";
    const api = window.electronAPI;
    if (!api) throw Error("composition-desktop-required");
    const stored = unwrapIpc(await api.canvasCompositionMedia({ name: this.document.name, workspace: this.document.workspace, fileName: name, kind, bytes: new Uint8Array(await file.arrayBuffer()), download: "download" in value && value.download === true }));
    if (!stored) return null;
    if ("downloaded" in stored) return stored;
    this.document = { ...this.document, workspace: stored.workspace };
    return { url: this.registry.register(stored.media) };
  }
  // 工程素材直接复用地址，全局库和本地文件先复制；只登记素材，不创建画布节点或连线。
  // 每批沿用导入接口的200份上限，已完成副本由原资源台账管理。
  async selectMedia(media: CompositionMedia[], copy: boolean) {
    const selected: CompositionMedia[] = [];
    for (let offset = 0; offset < media.length; offset += 200) {
      const files = media.slice(offset, offset + 200);
      if (!copy) { selected.push(...files); continue; }
      if (!window.electronAPI) throw Error("composition-desktop-required");
      const imported = unwrapIpc(await window.electronAPI.canvasImportMedia({ name: this.document.name, workspace: this.document.workspace, mode: "copy", files }));
      this.document = { ...this.document, workspace: imported.workspace };
      selected.push(...imported.media);
      if (imported.rejected.length) throw Error("canvas-resource-partial-failure");
    }
    return selected.map(item => ({ type: item.kind, name: item.name, url: this.registry.register(item) }));
  }
}
