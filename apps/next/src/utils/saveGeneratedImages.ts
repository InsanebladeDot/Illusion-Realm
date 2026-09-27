/**
 * 生成流程的最后一步：把 ComfyUI 产出的图片保存到磁盘。
 *
 * 怎么做：先在 PNG 里写入工作流与独立的版本标记块（`illusionRealmMeta`），
 * 再走 `files:saveGeneratedImages` IPC，由主进程决定落盘位置。
 */
import type { ComfyGeneratedImage } from "@/types/comfy";
import type { GeneratedImageMetaDocument } from "@/types/generatedImageMeta";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { unwrapIpc } from "@/utils/ipcResult";
import { embedComfyPromptInPngBlob } from "@/utils/sdImageInspector/embedComfyPrompt";

function formatTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
    ].join("-") +
    `_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function buildFileName(
  promptId: string,
  index: number,
  originalFilename: string
): string {
  const ext = originalFilename.includes(".")
    ? originalFilename.slice(originalFilename.lastIndexOf("."))
    : ".png";
  const shortId = promptId.replace(/-/g, "").slice(0, 8);
  return `IR_${formatTimestamp()}_${shortId}_${index + 1}${ext}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

/**
 * 保存生成结果到输出目录。
 *
 * 生成参数**只写进图片自身**：保存前把 ComfyUI 的工作流（API 格式 JSON）
 * 作为 `prompt` tEXt 块嵌进 PNG，之后二创 / 详情都从图片 Meta 本地解析出来，
 * 不再额外生成 `<name>.json` 旁车文件。
 */
export async function saveGeneratedImagesToDisk(
  images: ComfyGeneratedImage[],
  promptId: string,
  outputPath: string,
  metaDocument?: GeneratedImageMetaDocument
): Promise<string[]> {
  if (!isElectronEnvironment() || !window.electronAPI?.saveGeneratedImages) {
    return [];
  }

  if (images.length === 0) return [];

  const files = await Promise.all(
    images.map(async (image, index) => {
      let blob = image.blob;

      if (metaDocument?.workflow) {
        // 标记与工作流分块写入：版本标记独立成块，prompt 块保持与 API Prompt 一致
        blob = await embedComfyPromptInPngBlob(blob, metaDocument.workflow, {
          version: metaDocument.version,
          promptId: metaDocument.promptId,
        });
      }

      return {
        filename: buildFileName(promptId, index, image.filename),
        dataBase64: await blobToBase64(blob),
      };
    })
  );

  return unwrapIpc(
    await window.electronAPI.saveGeneratedImages(outputPath, files)
  );
}
