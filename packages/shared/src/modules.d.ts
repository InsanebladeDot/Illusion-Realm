/**
 * 第三方无类型依赖的模块声明（全局生效，两个 TS 工程共用）。
 */

declare module 'png-chunks-extract' {
  interface PngChunk {
    name: string;
    data: Uint8Array;
  }
  function extract(data: Uint8Array | ArrayBuffer | number[]): PngChunk[];
  export = extract;
}

declare module 'png-chunk-text' {
  interface PngTextChunk {
    keyword: string;
    text: string;
  }
  export function encode(keyword: string, text: string): {
    name: string;
    data: Uint8Array;
  };
  export function decode(data: Uint8Array): PngTextChunk;
}
