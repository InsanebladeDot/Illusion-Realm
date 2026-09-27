/**
 * 把工作流与版本标记写进 PNG（生成落盘时用）；块约定见下方注释。
 */
import extractChunks from "png-chunks-extract";
import * as pngChunkText from "png-chunk-text";
import type { ComfyApiPrompt } from "@/types/comfy";
import {
  encodeMetaMarker,
  META_MARKER_KEYWORD,
  type MetaMarker,
} from "@/utils/sdImageInspector/metaMarker";

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
/**
 * 我们自己管理的块：重写时先剔除旧的，再写新的。
 * - `prompt`：ComfyUI API Prompt，必须与发送给 ComfyUI 的内容逐字一致
 * - `illusionRealmMeta`：版本标记（见 metaMarker.ts），**独立块**，
 *   免得把版本混进 prompt 块而破坏上面那条一致性
 */
const EMBED_KEYWORDS = new Set(["prompt", META_MARKER_KEYWORD]);

/**
 * PNG 的 tEXt 块只允许 Latin-1 字符，而 ComfyUI 工作流里一定有中文
 * （节点标题如「K采样器」「加载CLIP」）。直接 encode 会抛错，
 * 之前被上层 catch 掉后就成了「图片里没有参数」——
 * 这里把非 ASCII 字符转成 \uXXXX 转义（仍是合法 JSON，解析结果完全一致）。
 */
function escapeNonAscii(json: string): string {
  return json.replace(
    /[\u007f-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32Bytes(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeChunk(chunk: { name: string; data: Uint8Array }): Uint8Array {
  const typeBytes = new TextEncoder().encode(chunk.name);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, chunk.data.length);

  const crcInput = new Uint8Array(typeBytes.length + chunk.data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(chunk.data, typeBytes.length);
  const crcValue = crc32Bytes(crcInput);

  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crcValue);

  const output = new Uint8Array(
    4 + typeBytes.length + chunk.data.length + 4
  );
  output.set(length, 0);
  output.set(typeBytes, 4);
  output.set(chunk.data, 4 + typeBytes.length);
  output.set(crc, 4 + typeBytes.length + chunk.data.length);
  return output;
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function embedComfyPromptInPng(
  buffer: ArrayBuffer,
  workflow: ComfyApiPrompt,
  marker?: MetaMarker
): ArrayBuffer {
  const promptJson = escapeNonAscii(JSON.stringify(workflow));
  const textChunk = pngChunkText.encode("prompt", promptJson);

  const chunks = extractChunks(new Uint8Array(buffer)).filter((chunk) => {
    if (chunk.name !== "tEXt") return true;
    try {
      const decoded = pngChunkText.decode(chunk.data);
      return !EMBED_KEYWORDS.has(decoded.keyword);
    } catch {
      return true;
    }
  });

  const iendIndex = chunks.findIndex((chunk) => chunk.name === "IEND");
  const insertIndex = iendIndex >= 0 ? iendIndex : chunks.length;
  const appended = [textChunk];
  if (marker) {
    appended.push(pngChunkText.encode(META_MARKER_KEYWORD, encodeMetaMarker(marker)));
  }
  chunks.splice(insertIndex, 0, ...appended);

  const body = concatUint8Arrays(chunks.map((chunk) => writeChunk(chunk)));
  const png = concatUint8Arrays([PNG_SIGNATURE, body]);
  return png.buffer.slice(
    png.byteOffset,
    png.byteOffset + png.byteLength
  ) as ArrayBuffer;
}

export async function embedComfyPromptInPngBlob(
  blob: Blob,
  workflow: ComfyApiPrompt,
  marker?: MetaMarker
): Promise<Blob> {
  const buffer = await blob.arrayBuffer();
  const isPng =
    blob.type === "image/png" ||
    (buffer.byteLength >= 8 &&
      new Uint8Array(buffer.slice(0, 8)).every(
        (byte, index) => byte === PNG_SIGNATURE[index]
      ));

  if (!isPng) return blob;

  try {
    const embedded = embedComfyPromptInPng(buffer, workflow, marker);
    return new Blob([embedded], { type: "image/png" });
  } catch {
    return blob;
  }
}
