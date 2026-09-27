/**
 * 等字体加载完成再测量 / 绘制（否则首帧量到的排版是兜底字体的）。
 *
 * 怎么做：`document.fonts.load(...)` 后 await；失败吞掉不阻塞出图。
 */
export async function ensureCartoonFontLoaded(
  fontFamily: string,
  fontSize: number
): Promise<void> {
  if (typeof document === "undefined") return;
  try {
    await document.fonts.load(`${fontSize}px ${fontFamily}`);
  } catch {
    /* 部分系统字体无法通过 FontFace API 预加载，忽略 */
  }
}

export async function ensureTextItemsFontsLoaded(
  items: { fontFamilyId: string; fontSize: number }[],
  resolveFamily: (fontFamilyId: string) => string
): Promise<void> {
  const seen = new Set<string>();
  const tasks: Promise<void>[] = [];
  for (const item of items) {
    const family = resolveFamily(item.fontFamilyId);
    const key = `${family}@${item.fontSize}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push(ensureCartoonFontLoaded(family, item.fontSize));
  }
  await Promise.all(tasks);
}
