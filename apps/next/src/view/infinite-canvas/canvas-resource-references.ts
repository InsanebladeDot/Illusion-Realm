/** 枚举工程内媒体引用供素材页展示；这里只判断使用状态，不登记归属或授权回收。 */
import type { UserDataInfiniteCanvas } from "@illusion-realm/shared";
import type { CanvasMedia } from "./canvas-media-import";

// 本地路径统一分隔符和大小写；网址保留大小写，不能把不同远端资源合并。
export function canvasResourceKey(path: string) {
  return /^[a-z]:[/\\]|^\\\\/i.test(path) ? path.replace(/\\/g, "/").toLowerCase() : path;
}

export function canvasResourceReferences(document: Pick<UserDataInfiniteCanvas, "nodes">) {
  const items = new Map<string, CanvasMedia>();
  for (const { data } of document.nodes) {
    const scene = data.scene;
    const images = [scene?.previewPath, ...(scene && "characters" in scene ? [scene.panoramaUrl, ...scene.props.map(prop => prop.imageUrl)] : [])];
    const media = [data.media, data.audioParameters?.reference, ...(data.inputImages ?? []), ...(data.composition?.assets.map(asset => asset.media) ?? [])];
    for (const item of media) if (item) items.set(canvasResourceKey(item.path), item);
    for (const path of images) {
      if (!path) continue;
      const name = path.replace(/\\/g, "/").split("/").pop() || path;
      items.set(canvasResourceKey(path), { path, name, kind: "image", size: 0 });
    }
  }
  return [...items.values()];
}
