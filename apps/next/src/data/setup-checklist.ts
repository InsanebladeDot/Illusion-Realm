/** 安装清单只提供操作指引；模型文件名直接取工作流，避免教程和默认配置各写一份。 */
import downloads from "@illusion-realm/shared/src/data/setup-downloads.json";
// 教程占位符与自动下载使用同一落点；修改清单后手册不需要再手动抄一遍。
const GUIDE_PATHS = { diffusion_models: "model", checkpoints: "model", text_encoders: "text", vae: "vae" } as const;

export function setupGuidePaths(groupId: string) {
  const group = downloads.groups.find(group => group.id === groupId);
  // 现有 MiniMax 指南区分多种 VAE，继续用其原有专用说明。
  if (groupId !== "anima" && groupId !== "moss") return {};
  return Object.fromEntries(downloads.files.flatMap(file => {
    if (!group?.files.includes(file.id)) return [];
    const folder = file.relativePath.split("/")[0];
    const key = GUIDE_PATHS[folder as keyof typeof GUIDE_PATHS];
    return key ? [[key, file.relativePath]] : [];
  }));
}

export const SETUP_GUIDES = downloads.groups.map(group => ({ id: group.id, file: group.guide }));
