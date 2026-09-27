/**
 * 漫画对话框 / 合成台的 id 生成（文本块、自定义素材、字体、已放置气泡）。
 *
 * 怎么做：时间戳 + 随机后缀的纯函数，保证同一次会话内不撞车、且不依赖全局计数器。
 */
export function createCartoonTextBlockId(): string {
  return `text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCustomCartoonAssetId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCustomCartoonFontId(): string {
  return `font-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPlacedBubbleId(): string {
  return `bubble-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
