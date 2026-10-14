/** 用户分镜模板只保存归一化几何和画布尺寸；不包含图片、提示词或其他创作内容。 */
export interface ComicTemplatePoint { x: number; y: number }
export interface ComicTemplateFrame { x: number; y: number; width: number; height: number; vertices: ComicTemplatePoint[] }
export interface SavedComicTemplate {
  id: string; name: string; category: string; frames: ComicTemplateFrame[];
  pageSize: { width: number; height: number };
  backgroundColor?: string;
}
export interface ComicTemplateLibrary { version: 1; templates: SavedComicTemplate[] }
