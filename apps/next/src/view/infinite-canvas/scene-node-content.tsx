"use client";

// 场景节点继续复用 CanvasNode 外壳，仅注入缩略图和打开动作。
// 缩略图来自实际取景的本地文件，空场景不显示参考图片冒充生成结果。
import { Box } from "lucide-react";
import { useTranslation } from "@/i18n";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import type { DirectorScene } from "@illusion-realm/shared/schemas/director.schema";
import { CanvasChip } from "./reference-ui/components";

export function SceneNodeContent({ scene, onOpen }: { scene?: DirectorScene; onOpen: () => void }) {
  const { t } = useTranslation();
  // 空场景的图标和入口共用一个垂直居中的内容组，不能只把容器本身居中。
  // 容器填满节点后仍由 flex 分配上下留白，用户改卡片高度时无需重算固定偏移。
  // 已有取景图片继续完整适配，居中不会改变导演台数据或预览生成方式。
  // 正文是卡片的抓取面，不能把整个容器标成 nodrag，否则中间区域完全无法移动。
  // 像相框里只有开关不能拿来搬动：禁止拖动只标在真正执行打开动作的按钮上。
  // 不额外拦截鼠标事件，让原图引擎继续处理选择、抓取偏移和移动历史。
  // 预览图关闭浏览器原生图片拖拽，防止保存取景后突然变成拖图片而非移动节点。
  // draggable=false 不影响图片加载，也不改变工程的预览路径或场景内容。
  // 按钮保留 nodrag 与 nopan，点击它不会先移动节点或平移工作区。
  // 这些命中规则同时覆盖空场景和已有缩略图的场景，不依赖当前是否选中。
  // 这里只修正插槽内的输入边界，仍复用 CanvasNode 外壳和 CanvasChip 按钮。
  return <div className="hy-node-empty" style={{ position: "relative", width: "100%", height: "100%", justifyContent: "center", overflow: "hidden" }}>
    {scene?.previewPath ? <img draggable={false} src={buildLocalFileUrl(scene.previewPath) ?? undefined} alt={t("director.preview")} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <Box size={36} />}
    <CanvasChip className="nodrag nopan" onClick={onOpen}>{t("director.open")}</CanvasChip>
  </div>;
}
