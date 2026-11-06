"use client";

import { type RefObject } from "react";
import { useTranslation } from "@/i18n";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { useToastStore } from "@/stores/useToastStore";
import { GLM_MODELS } from "@/utils/prompt-assistant";
// 这里只组装翻译业务，列布局、悬停展开和边缘换向由共用级联菜单维护。
// 视频右键也调用相同组件，不能在两个入口分别修补菜单外观。
import { CascadeMenu, type CascadeMenuItem } from "@/components/cascade-menu";
// 可选 id 将既有添加表单定位到当前记录；连接设置无需提供目标。
// 菜单不直接修改或删除数据，持久化和错误反馈由编辑表单统一处理。
// 保持外层关闭回调，菜单 Escape 与点击外部仍沿用原实现。
// 历史只通知外层打开查看页，菜单不持有记录或直接覆盖任何输入框。
// 沿用同一列菜单的按钮与键盘焦点样式，不新增悬浮按钮挤占正文。
interface MenuProps { anchor: RefObject<HTMLDivElement | null>; onClose: () => void; onHistory: () => void; onConfigure: (mode: "connection" | "preset", presetId?: string) => void }
export function AssistantMenu({ anchor, onClose, onConfigure, onHistory }: MenuProps) {
  const { t } = useTranslation();
  const preferences = usePromptAssistantStore(state => state.preferences); const save = usePromptAssistantStore(state => state.save);
  const choose = (patch: Parameters<typeof save>[0]) => { void save(patch).then(onClose).catch(() => useToastStore.getState().show(t("create.promptAssistant.failed"))); };
  const items: CascadeMenuItem[] = [
    { id: "provider", label: t("create.promptAssistant.provider"), children: [
      { id: "glm", label: "GLM", selected: preferences.provider === "glm", children: GLM_MODELS.map(model => ({ id: model, label: model.toUpperCase(), selected: preferences.provider === "glm" && preferences.model === model, action: () => choose({ provider: "glm", model }) })) },
      // 供应商列表：直接沿用同一个菜单项、选中态和保存回调，不增加第二套弹窗。
      // 说明明确模型与凭据来自 Agent，点击只选站，不自动提交翻译或产生推理费用。
      // 原 custom 入口仍可用于其他中转地址，已有用户连接不会被覆盖。
      { id: "euzhi", label: t("agent.providers.euzhi"), description: t("create.promptAssistant.euzhiShared"), selected: preferences.provider === "euzhi", action: () => choose({ provider: "euzhi" }) },
      { id: "custom", label: t("create.promptAssistant.customProvider"), selected: preferences.provider === "custom", action: () => { void save({ provider: "custom" }).then(() => onConfigure("connection")).catch(() => useToastStore.getState().show(t("create.promptAssistant.failed"))); } },
    ] },
    { id: "presets", label: t("create.promptAssistant.presets"), children: [
      { id: "translate", label: t("create.promptAssistant.translation"), description: t("create.promptAssistant.translationInstruction"), selected: preferences.presetId === "translate", action: () => choose({ presetId: "translate" }) },
      { id: "anima", label: t("create.promptAssistant.anima"), description: t("create.promptAssistant.animaInstruction"), selected: preferences.presetId === "anima", action: () => choose({ presetId: "anima" }) },
      // 选择保留原点击语义，铅笔另行打开同一预设的编辑与删除表单。
      // 名称可以重复，回调始终捕获稳定 id，避免误改其他同名记录。
      // 编辑动作不调用 choose，因此未保存之前不会改变当前使用的预设。
      ...preferences.presets.map(preset => ({ id: preset.id, label: preset.name, description: preset.instruction, selected: preferences.presetId === preset.id, action: () => choose({ presetId: preset.id }), edit: () => onConfigure("preset", preset.id), editLabel: t("create.promptAssistant.editNamedPreset", { name: preset.name }), editTitle: t("create.promptAssistant.editPreset") })),
      { id: "add", label: t("create.promptAssistant.addPreset"), action: () => onConfigure("preset") },
    ] },
    // 历史属于一级动作，不放到供应商或预设子菜单，切站以后仍能找到所有结果。
    // 直接使用原 MenuItem 的 action，因此鼠标、触屏与键盘走同一个打开回调。
    // 不设置 selected：打开历史不是修改正在使用的供应商或系统指令。
    // 入口始终可见，即使尚未翻译，也能在空态了解何时开始记录。
    // 不在菜单里显示正文片段，避免长结果撑大截图中已经紧凑的菜单宽度。
    // 也不在 hover 时加载详情，用户必须明确点击才会进入历史资源页。
    { id: "history", label: t("create.promptAssistant.history.title"), action: onHistory },
    { id: "settings", label: t("create.promptAssistant.configure"), action: () => onConfigure("connection") },
  ];
  // 菜单关闭和预设保存仍属于创建页，公共展示不持有任何供应商密钥。
  return <CascadeMenu anchor={anchor} items={items} label={t("create.promptAssistant.title")} backLabel={t("create.promptAssistant.back")} onClose={onClose} attributes={{ "data-prompt-assistant-menu": true }} />;
}
