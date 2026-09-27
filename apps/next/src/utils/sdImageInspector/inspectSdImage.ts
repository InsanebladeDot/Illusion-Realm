/**
 * PNG / EXIF 内嵌参数的**主解析器**：本地解析页展示的字段都由它产出。
 *
 * 怎么做：抽 PNG 文本块 + 读 EXIF → 按文本块数量判断档位（SD-WEBUI / NovelAI /
 * ComfyUI…）→ 摊成「字段」列表；自管理的块（`NON_PARAM_CHUNK_TYPES`，含版本标记块）
 * 不参与分档、也不出现在展示字段里。
 */
import ExifReader from "exifreader";
import extractChunks from "png-chunks-extract";
import * as pngChunkText from "png-chunk-text";
import { t } from "@/i18n";
import { META_FIELD_ID } from "@/utils/sdImageInspector/metaFieldId";
import {
  decodeMetaMarker,
  LEGACY_META_VERSION,
  META_MARKER_KEYWORD,
} from "@/utils/sdImageInspector/metaMarker";
import { getStealthExif } from "@/utils/sdImageInspector/stealthExif";
type TextChunk = {
  keyword: string;
  text: string;
};

/**
 * **不参与参数分档**的文本块关键字：我们自己的元数据块。
 *
 * 这里的集合直接决定 `buildSdImageFieldsFromChunks` 走哪条分支（详见下面的
 * 过滤处注释）。新增自管理块时必须登记在这里，否则会静默改变新图的解析结果。
 *
 * 导出给校验脚本用：`verify-image-meta.mjs` 会逐类型比对「过滤行为 ↔ 本集合」，
 * 防止有人为了局部优化在过滤处内联一份列表、让契约悄悄分裂成两个真相来源。
 */
export const NON_PARAM_CHUNK_TYPES: ReadonlySet<string> = new Set<string>([
  META_MARKER_KEYWORD,
]);

export async function extractImageTextChunks(
  buffer: ArrayBuffer,
  mimeType: string
): Promise<TextChunk[]> {
  if (mimeType === "image/png") {
    try {
      const chunks = extractChunks(new Uint8Array(buffer));
      return chunks
        .filter((chunk) => chunk.name === "tEXt" || chunk.name === "iTXt")
        .map((chunk) => {
          if (chunk.name === "iTXt") {
            const data = chunk.data.filter((byte) => byte !== 0x0);
            const header = new TextDecoder().decode(data.slice(0, 11));
            if (header === "Description") {
              const txt = new TextDecoder().decode(data.slice(11));
              return { keyword: "Description", text: txt };
            }
            return {
              keyword: "Unknown",
              text: new TextDecoder().decode(data),
            };
          }
          return pngChunkText.decode(chunk.data);
        });
    } catch {
      return [];
    }
  }

  if (
    mimeType === "image/webp" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/avif"
  ) {
    const data = ExifReader.load(buffer);
    const userComment = data.UserComment as { value?: number[] } | undefined;
    const commentValue = userComment?.value;
    if (!commentValue || !Array.isArray(commentValue)) {
      return [];
    }
    const metadata = String.fromCodePoint(...commentValue)
      .replaceAll("\x00", "")
      .slice(7);
    return [{ keyword: "parameters", text: metadata }];
  }

  return [];
}

export async function readImageExifFields(
  buffer: ArrayBuffer
): Promise<Array<{ key: string; description: string }>> {
  try {
    const data = ExifReader.load(buffer);
    return Object.entries(data).map(([key, value]) => {
      const tag = value as { description?: string; value?: unknown };
      return {
        key,
        description:
          typeof tag.description === "string"
            ? tag.description
            : String(tag.description ?? tag.value ?? ""),
      };
    });
  } catch {
    return [];
  }
}

function handleWebUiParameters(text: string): TextChunk[] {
  const [prompts, otherParas] = text.split("Steps: ");
  const promptSplit = prompts.split("Negative prompt: ");
  const negativePrompt =
    promptSplit.length > 1 ? promptSplit[1] : t("inspect.sdImage.noNegativePrompt");
  return [
    { keyword: META_FIELD_ID.prompt, text: promptSplit[0] },
    { keyword: META_FIELD_ID.negativePrompt, text: negativePrompt },
    { keyword: META_FIELD_ID.otherParams, text: `Steps: ${otherParas ?? ""}` },
  ];
}

function isJsonViewerField(keyword: string): boolean {
  return keyword === "Comment" || keyword === "workflow" || keyword === "prompt";
}

export function buildSdImageFieldsFromChunks(
  fileName: string,
  fileSize: number,
  chunks: TextChunk[],
  stealthExif: Record<string, unknown> | null,
  imageDataUrl: string | null
): {
  metaType: "SD-WEBUI" | "NOVELAI" | "NONE";
  fields: Array<{ key: string; value: string; json?: unknown }>;
  rawParameters?: string;
} {
  let metaType: "SD-WEBUI" | "NOVELAI" | "NONE" = "SD-WEBUI";
  let parsed: TextChunk[] = [];

  if (chunks.length === 0) {
    if (stealthExif) {
      parsed = Object.keys(stealthExif).map((key) => ({
        keyword: key,
        text:
          typeof stealthExif[key] === "string"
            ? (stealthExif[key] as string)
            : JSON.stringify(stealthExif[key]),
      }));
      metaType = "NOVELAI";
    } else {
      return {
        metaType: "NONE",
        fields: [
          {
            key: t("inspect.sdImage.fallbackFieldKey"),
            value: t("inspect.sdImage.metadataUnreadable"),
          },
        ],
      };
    }
  } else if (chunks.length === 1) {
    parsed = handleWebUiParameters(chunks[0].text);
  } else {
    parsed = chunks;
    metaType = "NOVELAI";
  }

  const fields: Array<{ key: string; value: string; json?: unknown }> = [
    { key: META_FIELD_ID.fileName, value: fileName },
    { key: META_FIELD_ID.fileSize, value: formatBytes(fileSize) },
    ...parsed.map((item) => {
      const field: { key: string; value: string; json?: unknown } = {
        key: item.keyword,
        value: item.text,
      };
      if (isJsonViewerField(item.keyword)) {
        try {
          field.json = JSON.parse(item.text);
        } catch {
          // keep plain text
        }
      }
      return field;
    }),
  ];

  let rawParameters: string | undefined;
  if (metaType === "SD-WEBUI" && chunks[0]) {
    rawParameters = chunks[0].text;
    fields.push({ key: META_FIELD_ID.rawParameters, value: chunks[0].text });
  }

  if (parsed.length === 0) {
    fields.push({
      key: t("inspect.sdImage.fallbackFieldKey"),
      value: t("inspect.sdImage.metadataUnreadable"),
    });
  }

  void imageDataUrl;
  return { metaType, fields, rawParameters };
}

function formatBytes(size: number): string {
  const printable = (value: number, unit: string) =>
    `${value.toFixed(2)} ${unit}`;
  const kb = size / 1024;
  if (kb < 1024) return printable(kb, "KB");
  const mb = kb / 1024;
  if (mb < 1024) return printable(mb, "MB");
  return printable(mb / 1024, "GB");
}

export async function inspectSdImageBuffer(
  buffer: ArrayBuffer,
  mimeType: string,
  fileName: string,
  imageDataUrl: string | null
): Promise<{
  metaType: "SD-WEBUI" | "NOVELAI" | "NONE";
  fields: Array<{ key: string; value: string; json?: unknown }>;
  exif: Array<{ key: string; description: string }>;
  rawParameters?: string;
  metaVersion?: number;
}> {
  const allChunks = await extractImageTextChunks(buffer, mimeType);

  /**
   * 版本标记块只用于判定「这张图是谁写的、什么版本」，不当作展示字段。
   * 没有标记块时按 `LEGACY_META_VERSION` 推理：标记机制落地前产出的图
   * 确实是 v1 格式，只是没留标记，必须仍可二创。
   */
  const marker = decodeMetaMarker(
    allChunks.find((chunk) => chunk.keyword === META_MARKER_KEYWORD)?.text ?? ""
  );
  const metaVersion = marker?.version ?? LEGACY_META_VERSION;

  /**
   * ⚠️ **这个过滤是一处边界契约，不是实现细节 —— 改这里会直接改变解析分档。**
   *
   * 下游 `buildSdImageFieldsFromChunks` 是按**文本块数量**分档的：
   *   - 恰好 1 块 → 当作 A1111 的 parameters 文本处理，切出
   *     「提示词 / 负面提示词 / 其他参数」三个友好字段（`metaType = SD-WEBUI`）
   *   - 2 块及以上 → 直接把每个块当成一行原始字段（`metaType = NOVELAI`），
   *     界面上会从友好字段**退化成一行行原始 JSON**
   *
   * 所以：任何**我们自己的**元数据块都必须在交给它之前先剔除，否则新生成的图
   * 会因为多了一个块而走进第二条分支 —— 旧图一切正常、只有新图异常，极难察觉。
   * 加新块（水印 / 版权 / 来源链接 …）时，务必同时登记到 NON_PARAM_CHUNK_TYPES，
   * 并补一条断言（见 `apps/next/scripts/verify-image-meta.mjs` 的「分档契约」段）。
   */
  const chunks = allChunks.filter(
    (chunk) => !NON_PARAM_CHUNK_TYPES.has(chunk.keyword)
  );

  const exif = await readImageExifFields(buffer);
  let stealth: Record<string, unknown> | null = null;

  if (chunks.length === 0 && imageDataUrl) {
    try {
      stealth = await getStealthExif(imageDataUrl);
    } catch {
      stealth = null;
    }
  }

  const built = buildSdImageFieldsFromChunks(
    fileName,
    buffer.byteLength,
    chunks,
    stealth,
    imageDataUrl
  );

  return { ...built, exif, metaVersion };
}
