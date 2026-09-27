declare module "png-chunks-extract" {
  type PngChunk = { name: string; data: Uint8Array };
  export default function extractChunks(data: Uint8Array): PngChunk[];
}

declare module "png-chunk-text" {
  export function decode(data: Uint8Array): { keyword: string; text: string };
  export function encode(
    keyword: string,
    content: string
  ): { name: string; data: Uint8Array };
}

declare module "crc-32" {
  const crc32: {
    buf(data: Uint8Array | number[]): number;
  };
  export default crc32;
}
