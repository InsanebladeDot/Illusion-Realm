/**
 * 创建页资源选择器的最小展示契约。
 * 调用方提供分类及模型 JSON；弹窗统一返回所选选项数组，业务层自行转换工作流参数。
 */
import type { ModelCover } from "@/types/model";

export interface ResourceSelectionOption {
  id: string;
  label: string;
  detailLabel?: string;
  cover?: ModelCover;
}

export interface ResourceSelectionGroup {
  id: string;
  name: string;
  category?: string;
  cover: ModelCover;
  tag: string;
  tagClassName?: string;
  versions: ResourceSelectionOption[];
}

/** 返回输入 JSON 中的模型对象，不改变字段、不解析路径。 */
export function resolveResourceSelection(resources: ResourceSelectionGroup[], ids: string[]) {
  const options = new Map(resources.flatMap((group) => group.versions.map((option) => [option.id, option] as const)));
  return ids.flatMap((id) => { const option = options.get(id); return option ? [option] : []; });
}
