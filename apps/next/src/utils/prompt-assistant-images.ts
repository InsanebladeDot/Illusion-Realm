/** 将本次转译选中的本地图片编码；复用聊天图片格式，不创建图床或持久化副本。 */
import { AgentImagesSchema, AGENT_IMAGES_MAX_CHARS, AGENT_IMAGE_MAX_COUNT } from "@illusion-realm/shared";
import { encodeInputImage } from "./agent-input-images";
import { t } from "@/i18n";

export async function preparePromptImages(sources: readonly string[]): Promise<string[]> {
  try {
    if (!sources.length || sources.length > AGENT_IMAGE_MAX_COUNT) throw new Error("limit");
    const images: string[] = [];
    // 像按页扫描一本书：逐张读取、保留顺序，任一张失败就整次停止，不偷偷漏图。
    for (const source of sources) {
      if (!source.startsWith("blob:") && !source.startsWith("localfile://local/")) throw new Error("source");
      const response = await fetch(source, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("read");
      images.push(await encodeInputImage(await response.blob()));
      if (images.reduce((sum, image) => sum + image.length, 0) > AGENT_IMAGES_MAX_CHARS) throw new Error("limit");
    }
    return AgentImagesSchema.parse(images);
  } catch { throw new Error(t("create.promptAssistant.imagesFailed")); }
}
