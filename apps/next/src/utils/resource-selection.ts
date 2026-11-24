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

/**
 * 决定分类卡片当前代表哪个模型，封面和名称必须使用同一个结果。
 * 把已选 ID 当成排队取号：先选的人先展示，不按模型在货架上的位置插队。
 * 因此要先走选择队列，再查本分类，不能在版本列表中找第一个已选项。
 * 其他分类的选择不参加本分类的排队，搜索隐藏的选择也不会被删除。
 * 取消首项后，下一个仍然选中的模型自然接替，不保留最近点击的旧封面。
 * 没有本分类的有效选择时，退回调用方提供的第一版，不擅自重新排序。
 * 已删除的模型 ID 不再有效，不能挡住后面仍然存在的选择。
 * 空分类返回空值，由界面继续使用分类自己的封面和原有缺图占位。
 * 返回原选项，图片地址仍由既有媒体组件处理，不在这里请求或缓存图片。
 * 此方法只读草稿，不替用户勾选默认项，也不向生成工作流提交任何选择。
 * 每次渲染独立计算，主模型与 LoRA 弹窗不会通过模块缓存共享选中状态。
 */
export function resolveResourcePreview(options: ResourceSelectionOption[], ids: string[]) {
  const byId = new Map(options.map((option) => [option.id, option]));
  const firstSelectedId = ids.find((id) => byId.has(id));
  return firstSelectedId === undefined ? options[0] : byId.get(firstSelectedId);
}

/** 返回输入 JSON 中的模型对象，不改变字段、不解析路径。 */
export function resolveResourceSelection(resources: ResourceSelectionGroup[], ids: string[]) {
  const options = new Map(resources.flatMap((group) => group.versions.map((option) => [option.id, option] as const)));
  return ids.flatMap((id) => { const option = options.get(id); return option ? [option] : []; });
}
