/** Canny 后台处理的数据契约：传原图与归一化参数，返回原尺寸 PNG 或稳定错误码。 */
export interface CannyOptions { lower: number; upper: number; inverted: boolean }
export interface CannyRequest { id: number; file: File; options: CannyOptions; maxPixels: number; maxSide: number }
export type CannyResponse = { id: number; success: true; blob: Blob } | { id: number; success: false };
export const CANNY_MAX_PIXELS = 16777216;
export const CANNY_MAX_SIDE = 8192;
