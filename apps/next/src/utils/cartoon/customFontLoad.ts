/**
 * 用户导入的自定义字体在本机生效（漫画对话框用）。
 *
 * 怎么做：`FontFace` 注册后 `document.fonts.add`；批量加载时逐个 await，
 * 失败只跳过该字体，不影响其它字体与出图。
 */
import type { CartoonCustomFont } from "@/types/cartoonBubble";

export async function loadCustomCartoonFont(font: CartoonCustomFont): Promise<void> {
  if (typeof document === "undefined") return;
  try {
    const face = new FontFace(font.family, `url(${font.dataUrl})`);
    await face.load();
    document.fonts.add(face);
  } catch {
    /* ignore load failure */
  }
}

export async function loadCustomCartoonFonts(fonts: CartoonCustomFont[]): Promise<void> {
  await Promise.all(fonts.map((font) => loadCustomCartoonFont(font)));
}
