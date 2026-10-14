/** Canvas dimensions stay independent from percent-based panel geometry; validate persisted and exported sizes. */
export interface ComicPageSize { width: number; height: number; locked: boolean }
export const MIN_COMIC_DIMENSION = 64;
export const MAX_COMIC_DIMENSION = 4096;
export const DEFAULT_COMIC_PAGE_SIZE: ComicPageSize = { width: 1200, height: 1600, locked: false };

export function isComicDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_COMIC_DIMENSION && value <= MAX_COMIC_DIMENSION;
}
export function readComicPageSize(value: unknown): ComicPageSize {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_COMIC_PAGE_SIZE };
  const size = value as Record<string, unknown>;
  if (!isComicDimension(size.width) || !isComicDimension(size.height)) return { ...DEFAULT_COMIC_PAGE_SIZE };
  return { width: size.width, height: size.height, locked: size.locked === true };
}
