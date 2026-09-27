/**
 * 读 NovelAI「Stealth PNG」里藏在**像素**中的 EXIF。
 *
 * 怎么做：canvas 取像素 → 按低位流还原字节（`DataReader`）→ gzip 解压（pako）→ JSON。
 */
import { ungzip } from "pako";
import { DataReader } from "@/utils/sdImageInspector/dataReader";

export async function getStealthExif(
  imageSrc: string
): Promise<Record<string, unknown> | null> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: true });
  if (!ctx) return null;

  const img = new Image();
  img.src = imageSrc;
  await img.decode();

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const lowestData: number[] = [];

  for (let x = 0; x < img.width; x++) {
    for (let y = 0; y < img.height; y++) {
      const index = (y * img.width + x) * 4;
      const alpha = imageData.data[index + 3];
      lowestData.push(alpha & 1);
    }
  }

  const magic = "stealth_pngcomp";
  const reader = new DataReader(lowestData);
  const readMagic = reader.readNBytes(magic.length);
  const magicString = String.fromCharCode(...readMagic);

  if (magic !== magicString) {
    return null;
  }

  const dataLength = reader.readInt32();
  const gzipData = reader.readNBytes(dataLength / 8);
  const data = ungzip(new Uint8Array(gzipData));
  const jsonString = new TextDecoder().decode(data);
  return JSON.parse(jsonString) as Record<string, unknown>;
}
