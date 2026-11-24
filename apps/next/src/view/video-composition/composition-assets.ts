// 原合成器与画布共用媒体引用，原组件的临时 URL 不进入磁盘工程。
// 资产表像货架目录：片段只记货号，换电脑时只更换目录里的地址。
// 每个会话独占这张表，不把另一个合成节点的素材混入当前工程。
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { isCompositionState, type CompositionJson, type CompositionState } from "@illusion-realm/shared/schemas/video-composition.schema";
import type { CanvasData, CanvasDocument } from "../infinite-canvas/canvas-model";
export type CompositionDocument = NonNullable<CanvasData["composition"]>;
export type CompositionMedia = NonNullable<CanvasData["media"]>;

// URL 转换只处理原组件的 src/url，不把用户片段名称误当作文件地址。
// 深度、节点数与快照类型均有限制，坏消息不能耗尽渲染进程。
// 拒绝未知对象和危险键，不把 iframe 的任意载荷直接写入用户 JSON。
export function rewriteState(value: unknown, resolve: (url: string) => string): CompositionState {
  let count = 0;
  const visit = (item: unknown, depth: number, key = ""): CompositionJson => {
    if (++count > 100000 || depth > 16) throw Error("composition-state-too-large");
    if (typeof item === "string") return ["src", "url"].includes(key) ? resolve(item) : item;
    if (item === null || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) return item;
    if (Array.isArray(item)) return item.map(child => visit(child, depth + 1));
    if (!item || typeof item !== "object") throw Error("composition-invalid-state");
    return Object.fromEntries(Object.entries(item).map(([name, child]) => {
      if (["__proto__", "constructor", "prototype"].includes(name)) throw Error("composition-invalid-key");
      return [name, visit(child, depth + 1, name)];
    }));
  };
  const result = visit(value, 0);
  if (!result || typeof result !== "object" || Array.isArray(result)) throw Error("composition-invalid-state");
  return result;
}

export class CompositionAssets {
  readonly assets: CompositionDocument["assets"];
  constructor(saved?: CompositionDocument) { this.assets = structuredClone(saved?.assets ?? []); }
  // 同路径复用货号，避免每次打开把同一连线素材再添一份。
  // 返回本地只读地址，iframe 没有路径写入或任意 IPC 权限。
  register(media: CompositionMedia): string {
    if (!this.assets.some(asset => asset.media.path === media.path)) this.assets.push({ id: crypto.randomUUID(), media: { kind: media.kind, path: media.path, name: media.name, size: media.size } });
    return buildLocalFileUrl(media.path)!;
  }
  media(url: string): CompositionMedia {
    const asset = this.assets.find(item => buildLocalFileUrl(item.media.path) === url);
    if (!asset) throw Error("composition-unknown-asset");
    return asset.media;
  }
  // 保存必须将每个媒体地址换成已登记编号，未经导入的远程网址不被接受。
  // 解析结果再交给画布原保存器，主进程还有独立的完整图验证。
  snapshot(value: unknown): CompositionDocument {
    const used = new Set<string>();
    const state = rewriteState(value, url => {
      const asset = this.assets.find(item => buildLocalFileUrl(item.media.path) === url);
      if (!asset) throw Error("composition-unknown-asset");
      used.add(asset.id);
      return `composition-asset:${asset.id}`;
    });
    if (!isCompositionState(state)) throw Error("composition-invalid-state");
    return { version: 1, state, assets: structuredClone(this.assets.filter(asset => used.has(asset.id))) };
  }
  // 重开用当前机器路径解货号，工程包迁移不需要修改原片段效果。
  // 缺失编号是坏工程，不静默回退为空素材。
  restore(saved?: CompositionDocument): CompositionState | null {
    if (!saved) return null;
    return rewriteState(saved.state, token => {
      const asset = this.assets.find(item => token === `composition-asset:${item.id}`);
      if (!asset) throw Error("composition-asset-missing");
      return buildLocalFileUrl(asset.media.path)!;
    });
  }
}
// 只读取直接连到本合成器的真实媒体；文字提示与空卡不是可解码文件。
// 原组件会按既有初始化规则入轨；这里不提前再创建片段，以免同一输入重复入轨。
export function connectedMedia(document: CanvasDocument, id: string): CompositionMedia[] {
  const sources = new Set(document.edges.filter(edge => edge.target === id).map(edge => edge.source));
  return document.nodes.flatMap(node => sources.has(node.id) && node.data.media ? [node.data.media] : []);
}
