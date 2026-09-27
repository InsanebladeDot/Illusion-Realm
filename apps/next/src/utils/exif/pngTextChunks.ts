/**
 * PNG tEXt 文本块解析 / 写入 / 剔除工具。
 *
 * PNG 文件结构：8 字节签名 + 若干 chunk（每个 chunk = 4 字节长度 + 4 字节类型 + 数据 + 4 字节 CRC）。
 * tEXt 块用于存放键值对元数据（ComfyUI 工作流、作者、描述等）。
 *
 * 参考：https://www.w3.org/TR/png-3/#11tEXt
 */

export type PngTextChunk = {
  key: string;
  value: string;
};

const PNG_SIGNATURE_LENGTH = 8;
const CHUNK_HEADER_LENGTH = 8; // length(4) + type(4)
const CRC_LENGTH = 4;

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

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

type RawChunk = {
  type: string;
  data: Uint8Array;
};

/** 把 PNG 二进制切分为签名 + 原始 chunk 列表 */
function splitChunks(buffer: ArrayBuffer): { signature: Uint8Array; chunks: RawChunk[] } {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const signature = bytes.slice(0, PNG_SIGNATURE_LENGTH);

  const chunks: RawChunk[] = [];
  let offset = PNG_SIGNATURE_LENGTH;
  while (offset + CHUNK_HEADER_LENGTH <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );
    const dataStart = offset + CHUNK_HEADER_LENGTH;
    const data = bytes.slice(dataStart, dataStart + length);
    chunks.push({ type, data });
    offset = dataStart + length + CRC_LENGTH;
  }

  return { signature, chunks };
}

/** 解析 PNG 中所有 tEXt 块为键值对 */
export function parsePngTextChunks(buffer: ArrayBuffer): PngTextChunk[] {
  const { chunks } = splitChunks(buffer);
  const decoder = new TextDecoder();

  return chunks
    .filter((chunk) => chunk.type === "tEXt")
    .map((chunk) => {
      const nullIndex = chunk.data.indexOf(0);
      if (nullIndex < 0) return null;
      return {
        key: decoder.decode(chunk.data.slice(0, nullIndex)),
        value: decoder.decode(chunk.data.slice(nullIndex + 1)),
      };
    })
    .filter((item): item is PngTextChunk => item !== null);
}

/** 剔除所有 tEXt 块（保留其余 chunk，含 CRC） */
export function stripPngTextChunks(buffer: ArrayBuffer): ArrayBuffer {
  const { signature, chunks } = splitChunks(buffer);
  return reassemble(
    signature,
    chunks.filter((chunk) => chunk.type !== "tEXt")
  );
}

function buildTextChunk(metadata: PngTextChunk): Uint8Array {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(metadata.key);
  const valueBytes = encoder.encode(metadata.value);

  // data = key + NUL + value
  const data = new Uint8Array(keyBytes.length + 1 + valueBytes.length);
  data.set(keyBytes, 0);
  data[keyBytes.length] = 0;
  data.set(valueBytes, keyBytes.length + 1);

  // type + data 用于 CRC
  const typeBytes = new Uint8Array([0x74, 0x45, 0x58, 0x74]); // "tEXt"
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);

  const chunkBytes = new Uint8Array(
    CHUNK_HEADER_LENGTH + data.length + CRC_LENGTH
  );
  new DataView(chunkBytes.buffer).setUint32(0, data.length);
  chunkBytes.set(typeBytes, 4);
  chunkBytes.set(data, 8);
  new DataView(chunkBytes.buffer).setUint32(8 + data.length, crc32(crcInput));
  return chunkBytes;
}

/** 写入 tEXt 块：剔除原有 tEXt 后在 IEND 之前插入新的（含正确 CRC） */
export function writePngTextChunks(
  buffer: ArrayBuffer,
  metadata: PngTextChunk[]
): ArrayBuffer {
  const { signature, chunks } = splitChunks(buffer);
  const kept = chunks.filter((chunk) => chunk.type !== "tEXt");
  const valid = metadata.filter((item) => item.key && item.value);

  const newChunks = valid.map(buildTextChunk);

  // 在 IEND 之前插入
  const iendIndex = kept.findIndex((chunk) => chunk.type === "IEND");
  const insertIndex = iendIndex >= 0 ? iendIndex : kept.length;

  const rawKept = kept.map((chunk) => rawChunkToBytes(chunk));
  rawKept.splice(insertIndex, 0, ...newChunks);

  return reassembleRaw(signature, rawKept);
}

function rawChunkToBytes(chunk: RawChunk): Uint8Array {
  const out = new Uint8Array(CHUNK_HEADER_LENGTH + chunk.data.length + CRC_LENGTH);
  new DataView(out.buffer).setUint32(0, chunk.data.length);
  out.set(new TextEncoder().encode(chunk.type), 4);
  out.set(chunk.data, 8);
  // 原始 chunk 的 CRC 已在 splitChunks 中随 data 一起读取，但这里重建时需重算
  const typeBytes = out.slice(4, 8);
  const crcInput = new Uint8Array(typeBytes.length + chunk.data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(chunk.data, typeBytes.length);
  new DataView(out.buffer).setUint32(8 + chunk.data.length, crc32(crcInput));
  return out;
}

function reassemble(signature: Uint8Array, chunks: RawChunk[]): ArrayBuffer {
  return reassembleRaw(
    signature,
    chunks.map(rawChunkToBytes)
  );
}

function reassembleRaw(signature: Uint8Array, chunkBytes: Uint8Array[]): ArrayBuffer {
  const total = signature.length + chunkBytes.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  result.set(signature, 0);
  let offset = signature.length;
  for (const chunk of chunkBytes) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
}
