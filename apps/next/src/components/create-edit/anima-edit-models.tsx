"use client";

/**
 * 界面：编辑模式中的 UNet 模型卡片与已选 LoRA，复用 Anima 文生图选择器。
 * 这里只连接资源状态，不扫描文件、不提交模型请求，也不维护第二份选择草稿。
 */
import { useState } from "react";
import { useTranslation } from "@/i18n";
import type { AnimaEditState } from "@/hooks/use-anima-edit";
import { DEFAULT_SELECTED_MODEL } from "@/data/models";
import { DEFAULT_EXTENSION_WEIGHT } from "@/types/extension";
import { ModelCoverSelect } from "@/view/create/model-cover-select";
import { ModelSelectDialog } from "@/view/create/ModelSelectDialog";
import { SelectedExtensions } from "@/view/create/selected-extensions";
import { ExtensionSelectDialog } from "@/view/create/ExtensionSelectDialog";
// 快速加载复用已选资源列表，不创建一套与实际生成分离的模型展示。
// 两个入口只在点击后更新编辑领域 store，原选择器继续负责后续手动调整。
// 位置紧邻主模型和 LoRA，用户可立即核对加载后的真实版本及权重。
import { AnimaEditResourceActions } from "./anima-edit-resource-actions";
// 编辑模式始终共享原版卡片尺寸，不额外定义更大的模型选择 card。

/**
 * 主模型选择始终限定 Anima UNet，沿用扫描目录、分类、版本卡片与搜索行为。
 * 额外 LoRA 同样使用图片页分类选择，确认后追加并保留原项权重。
 * 初始 AnimeEditV2 在标准列表中可见，不用一个独立强度滑条隐藏其真实来源。
 * 因此调权重、移除和继续添加都交给 SelectedExtensions，避免重复实现。
 * 弹窗与功能展示区共享原 ResourceDialogShell 的响应式规则。
 * 宽屏居中选择，窄屏由 main 父容器替换内容，不能被表单滚动区裁切。
 * 模型卡片与添加入口显式 type=button，不会触发表单运行。
 * 选择器关闭只改变 open 状态，不清除原图或修改指令。
 * fieldset 的忙碌禁用由父表单提供，同时传给公共 LoRA 列表保证一致性。
 * 资源回调只处理提交结果，不从显示文本解析路径或模型版本。
 * 模型展示使用公共封面组件，名称与实际选择的版本同步。
 * 无本地模型时显示原模板文件名，不能展示与请求无关的 Amanatsu 示例名。
 */
export function AnimaEditModels({ editor, getSourceFile }: { editor: AnimaEditState; getSourceFile?: () => File | null }) {
  // 打开状态只属于当前工具，不与图片模式的弹窗布尔值交叉共享。
  // 两个资源对话框由其自身门户承载，不嵌入表单滚动区域。
  // 表单 fieldset 禁用上传与资源按钮，运行快照期间不能修改本次输入。
  // 选择器只在用户点开后创建会话，因此取消不会留下未提交草稿。
  // 模型信息从 models.display 读取，与 snapshot 使用相同资源来源。
  // 标准已选扩展列表保留双击数值输入、滑条和删除三种原有操作。
  // 预载项与额外项没有不同的交互权限，避免把编辑 LoRA 变成隐藏硬编码。
  // 这里不提供强制恢复按钮，用户删除预载项的选择在页面切换后仍有效。
  // shared dialog 默认选择只负责初始高亮，只有 onSelect 才改变主模型。
  // series 限定主模型列表，不能选择一个本层无法构建的 SDXL 主模型。
  // LoRA selectedIds 带入现有行，用于原资源窗口的高亮与草稿初始化。
  // 确认回调采用追加而非全量替换，原有行的调权结果不会被新选择重置。
  // 使用 extensionId 去重，同一版本反复确认不能不断叠加权重行。
  // 多选确认返回多个真实版本，逐项保留顺序以决定后续 LoRA 链顺序。
  // 默认添加权重引用公共常量，普通图片页调整默认值后这里也同步。
  // 函数式更新比较最新 previous，避免弹窗打开期间使用过期列表快照。
  // 取消仅关闭菜单，不触发 onConfirm 的数组合并。
  // JSX 中共享组件名称与原图片页一致，后续卡片尺寸修复可同时覆盖本工具。
  // 不在此处推断服务端文件路径，最终存在性检查仍位于明确运行的边界。
  // 编辑 LoRA 缺文件不会阻止打开界面，用户仍能选择已安装的替代资源。
  // 弹窗内搜索、版本选择及窄屏替换均由已存在的 ResourceDialogShell 实现。
  // 当前模块不维护另一套选中状态，界面高亮与实际参数避免分叉。
  const { t } = useTranslation(), [modelOpen, setModelOpen] = useState(false), [loraOpen, setLoraOpen] = useState(false), models = editor.models;
  return <section data-anima-models className="space-y-3"><ModelCoverSelect name={models.display.name} cover={models.display.cover} label={t("create.page.model")} onClick={() => setModelOpen(true)} /><SelectedExtensions value={models.extensions} onChange={models.setExtensions} onAdd={() => setLoraOpen(true)} disabled={editor.busy} displays={models.displays} />
    {/* 弹窗：与 Anima 图片生成共用的主模型与 LoRA 资源选择器。 */}
    <ModelSelectDialog open={modelOpen} selected={models.selectedModel ?? DEFAULT_SELECTED_MODEL} series="anima" onOpenChange={setModelOpen} onSelect={models.setSelectedModel} /><ExtensionSelectDialog open={loraOpen} selectedIds={models.extensions.map((item) => item.extensionId)} resources={models.resources} onOpenChange={setLoraOpen} onConfirm={(items) => models.setExtensions((previous) => [...previous, ...items.filter((item) => !previous.some((selected) => selected.extensionId === item.id)).map((item) => ({ extensionId: item.id, weight: DEFAULT_EXTENSION_WEIGHT }))])} />
    {/* 界面：同步图片模式资源，或读取当前导入原图的模型与 LoRA。 */}
    {/* 加载反馈位于模型旁，后续仍通过上方原卡片与权重列表手动调整。 */}
    <AnimaEditResourceActions editor={editor} getSourceFile={getSourceFile} />
  </section>;
}
