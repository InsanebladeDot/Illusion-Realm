// 导演台把实际 JPEG 交给既有图片保存桥接，再把本地路径写回当前画布。
// 不往用户 JSON 塞 Base64，也不把本地取景发送给第三方服务。
// 先写文件再写文档，文档失败时仍保留原场景；多余图片不会被误认为已确认节点。
import type { DirectorDocument } from "@illusion-realm/shared/types/director";
import { DirectorDocumentSchema } from "@illusion-realm/shared/schemas/director.schema";
import {
  persistDirectorImage,
  persistDirectorMedia,
  type DirectorMediaWriter,
} from "../director/director-media";
import { t } from "@/i18n";
import type { CanvasDocument, CanvasNode } from "./canvas-model";

export async function prepareDirectorSave(
  document: CanvasDocument,
  id: string,
  scene: DirectorDocument,
  image?: string,
  confirm = false,
  write: DirectorMediaWriter = persistDirectorImage,
): Promise<CanvasDocument> {
  const node = document.nodes.find(
    (item) => item.id === id && item.data.kind === "scene",
  );
  if (!node) throw new Error("director-scene-node-missing");
  const path = image ? await write(image) : undefined;
  const stored = await persistDirectorMedia(scene, write);
  const next = mergeSnapshot(node, stored, path);
  const nodes = document.nodes.map((item) =>
    item.id === id ? { ...item, data: { ...item.data, scene: next } } : item,
  );
  if (!confirm || !path) return { ...document, nodes };
  const result = createPreviewNode(node, scene, path, image);
  return {
    ...document,
    nodes: [...nodes, result],
    edges: [...document.edges, previewEdge(id, result.id)],
  };
}
// 原组件的通告单和宿主的工程记录分别负责不同字段，保存时在这里汇合。
// 原组件只导出自己认识的顶层字段；宿主扩展不能在下一次自动保存时被擦掉。
// 新快照中的人物、机位、动画数组整体替换，已删除的对象不能被旧数组复活。
// v1 只保留迁移后的字段，旧 objects/animations 不随原生格式继续累积。
// 没有新截图时保留原预览路径，不能因一次不带图片的保存让节点变成空白。
// 图片正文只在桥接期间存在，最终文档移除它，避免用户 JSON 随自动保存膨胀。
// 合并之后重新校验，防止旧扩展与新字段组合成不合法的可持久化状态。
// 这里只构造副本；实际写盘仍由调用方的持久化器完成，失败不会改当前工程。
function mergeSnapshot(node: CanvasNode, scene: DirectorDocument, previewPath?: string) {
  return DirectorDocumentSchema.parse({
    ...(node.data.scene && "characters" in node.data.scene ? node.data.scene : {}),
    ...scene,
    previewImageUrl: undefined,
    version: 3,
    previewPath: previewPath ?? scene.previewPath ?? node.data.scene?.previewPath,
  });
}
// 确认输出才创建图片节点；普通自动保存只更新原场景，不能反复生成图片。
// 图片位置放在场景卡片右侧，资源仍走既有本地媒体契约，不嵌入 Base64。
function createPreviewNode(
  node: CanvasNode,
  scene: DirectorDocument,
  path: string,
  image?: string,
): CanvasNode {
  return {
    id: crypto.randomUUID(),
    type: "canvas",
    position: {
      x: node.position.x + (node.data.card?.width ?? 284) + 100,
      y: node.position.y,
    },
    data: {
      kind: "image",
      title: t("director.picture"),
      prompt: "",
      content: "",
      ratio: scene.aspectRatio < 1 ? "9/16" : "16/9",
      media: {
        kind: "image",
        path,
        name: "director.jpg",
        size: image ? Math.floor(image.split(",")[1].length * 0.75) : 0,
      },
    },
  };
}
// 连线的两个端口与画布常规图片输出一致，导演台不引入另一种连接类型。
function previewEdge(
  source: string,
  target: string,
): CanvasDocument["edges"][number] {
  return {
    id: crypto.randomUUID(),
    source,
    target,
    sourceHandle: "out",
    targetHandle: "in",
  };
}
