"use client";

// 仅提供原文生图组件的节点数据绑定；本文件没有字段、按钮或布局。
// 不再单独排列模型、提示词、尺寸、高级设置或生成按钮。
// 像整台设备换一个插座：布局与交互来自原组件，电源与工作单属于当前节点。
import { createElement, useId, useMemo, useState, type ComponentProps } from "react";
import { useTranslation } from "@/i18n";
import { useStore } from "zustand";
import { isModelNameHidden } from "@/utils/local-model-visibility";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { ImageCreatePanel } from "@/view/create/image-create-panel";
import type { ModelSelectDialog } from "@/view/create/ModelSelectDialog";
import { getLocalCheckpointDisplay, parseLocalCheckpointId } from "@/utils/localModelResources";
import { getImageWorkflowTemplate, resolveImageWorkflowSeries } from "@/utils/comfy/imageWorkflow";
import editTemplate from "@/data/comfy/utillswWorkflower/AnimaEdit2.json";
import { useCanvasImageForm, type CanvasImageFormWorkflow } from "./use-canvas-image-form";
import { MossSlgSetting } from "@/view/create/moss-slg-setting";
import type { CanvasData } from "./canvas-model";

// 资源选择及主模型返回仍由本节点处理，完整表单只接收数据和回调。
// LoRA 仍由原资源适配器直接传给共享表单，不在这里渲染。
// 只存已有参数覆盖，模板默认和模型文件名仍由原模板提供。
interface Props { workflow: CanvasImageFormWorkflow; data: CanvasData; onChange: (patch: Partial<CanvasData>) => void; onSelecting: (open: boolean) => void }
const COUNT_OPTIONS = [1, 2, 4, 6].map(count => ({ count, label: `×${count}` }));

// workflow 是完整模板身份；series 只给原指南和系列过滤使用。
// 图片编辑虽映射为 Anima 系列，参数覆盖依然写到 anima-edit 项。
// 模板 useMemo 的依赖包含工作流，不能切编辑模板后还显示文生图加载文件。
// 没有主模型覆盖时显示真实模板文件名，而不是创建页当前选择的全局模型名。
// 已确认模型找不到索引时显示保存的基本名，缺图不等于可以换成其他资源封面。
// 解析主模型 id 仍由公共本地资源工具负责，不从显示名称反查文件夹。
// update 先合并当前参数项，所以改负面词不会清空此前选择的主模型。
// onSelecting 只通知外壳暂缓关闭，不参与工程数据，也不进入撤销历史。
// 主模型选择器保留自己的 open 状态，不能与 LoRA 的 open 共用一个布尔值。
// ModelSelectDialog 确认后先写入真实身份再收起，会话取消不写节点。
// COUNT_OPTIONS 描述当前工程格式支持的数量，和创建页默认目录保持各自合法。
// 底栏回调再缩窄到一二四六，类型和运行边界一致，不接受任意 number 写入节点。
// onGenerate 没有接入，这里同时传原生禁用，不能留下点击无响应的生成按钮。
// 正负输入各用 useId 后缀，选择器查找不依赖图片卡片标题是否唯一。
// promptScope 的 onValueChange 仅写原 prompt，不另建一个 sidebarPrompt 镜像字段。
// negative 则保存在当前工作流附表，切 Anima 与 SDXL 可以保留不同反向词。
// 本地尺寸和采样通过同一原表单 store 注入口，不能再在外层排列第二份滑条。
// LoRA 插槽由侧栏使用处传入，版本选择和权重 UI 完全沿用原实现。
// 原输入助手继续可用，网络翻译是否可用由它的原服务处理，不伪造结果。
// 此组件不持有媒体播放引用，打开设置不应中断其他卡片正在播放的真实内容。
// 不直接修改节点数组，所有确认值都经 onChange 返回原画布业务入口。
// 切换节点会卸载本次配置，选择器未确认的草稿不会被留给下一张卡片。
// 本 hook 的产物是原 ImageCreatePanel 的公开参数，不是另一份展示组件。
// Omit 只排除 extensions，因为该插槽在实际侧栏使用处直接传入原 LoRA 列表。
// 原表单新增必需参数时，这里的 ComponentProps 会让缺失接线在类型检查中报错。
// 不在适配器维护一套名字相似却逐渐分叉的 UI 参数接口。
// picker 的参数也从原 ModelSelectDialog 推导，选择确认与取消仍交给原对话框。
// 没有在 hook 中返回 JSX，因此不会混入隐藏按钮或画布专属字段排版。
// 主表单和选择弹窗在真实调用处一眼可见，便于核对用户要求的直接组件嵌套。
// 这个文件不导入样式，也不读取 computedStyle 生成一份相似 CSS。
// 不读取参考图坐标来排列字段，间距始终由原组件与原样式维护。
// display 只影响实际模型名称与封面内容，不改变模型卡片结构。
// 当前节点未选本地主模型时，模板文件名保持可见，不能借显示层伪造已安装模型。
// 原数据源和 UI 组件是两件事，复用 UI 不能要求节点借用创建页全局选中状态。
// 上层仍把确认值交给原节点事务，这个 hook 不操作结果图库或图片生成队列。
// 工程序列化仍使用已有 imageParameters 表，没有因为删除自制 UI 改作品格式。
// 旧作品缺省配置继续从原模板读取，不要求用户先重新保存才能打开原表单。
// 主模型与辅助加载覆盖合并时保留当前负面词和尺寸，不能整项替换为模型对象。
// 负面输入更新时也保留主模型身份，两个原子区不竞争附表所有权。
// 采样和尺寸由 useCanvasImageForm 接回原状态动作，重复算法没有迁进此层。
// 正向正文仍复用节点已有 prompt，与卡片输入是同一个确认值。
// 生成数量仍使用原底栏 countControl，侧栏不再渲染独立数量条。
// 数量目录是原工程允许的值，原 ImageCountDropdown 决定如何展示、聚焦和关闭。
// 骰子通过原 seedControl 接口作用于当前局部 store，不写创建页随机开关。
// store 的订阅与销毁继续由原 hook 管理，返回 props 不意味着复制状态对象作为事实来源。
// panel 每次反映最新节点输入，外部撤销后无需重新打开侧栏才能刷新字段。
// 选择弹窗打开只切当前会话布尔值，不提前替用户选中或清空主模型。
// 弹窗确认后的 update 只写真实 model 身份，资源本体不被复制进参数对象。
// 取消没有 onSelect，因此原模型和其他所有确认值继续保留。
// onSelecting 仅保护内外关闭顺序，不传给工程保存层。
// 侧栏关闭会销毁未确认的资源选择草稿，下个节点不会复用它的临时勾选。
// 图片与视频工作流仍各自处理生成配置，本次直接复用不建立跨媒介通用执行器。
// 类型约束只描述接线，不表示真实 ComfyUI 服务已经接受或运行这些参数。
// 生成入口因此明确禁用，不能以完整表单已显示作为任务已经接通的证据。
// 本次删除旧 CanvasImageParameters 组件，避免以后有人继续维护一份画布专用表单。
// 实际原组件调用保留在 CanvasWorkflowSettings，文生图所有可见字段只维护一份。
// 如果需要修改原表单交互，应同时验证创建页与侧栏，不能只在此处写一个补丁。
export function useCanvasImagePanel({ workflow, data, onChange, onSelecting }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const models = useSettingsStore(state => state.models);
  const hidden = useSettingsStore(state => state.hiddenModelPaths);
  const [selecting, setSelecting] = useState(false);
  const series = resolveImageWorkflowSeries(workflow);
  const store = useCanvasImageForm({ workflow, data, onChange });
  // 原骰子需要订阅局部确认值，不能只在父组件渲染时读一次 getState。
  // 外部撤销先更新节点，再由 layout effect 水合 store，订阅会补上这一轮显示更新。
  // 否则原种子字段已恢复随机，底栏却可能还显示上次的自定义状态。
  // 这里只订阅 seedMode，拖动 CFG 不会为了骰子额外订阅整个工作单。
  // 点击动作仍读当前 store 的原 setter，不把某次渲染的数字冻结在回调中。
  // 该订阅随实例卸载释放，不新增模块级监听器或第二份镜像种子状态。
  const seedMode = useStore(store, state => state.seedMode);
  const template = useMemo(() => workflow === "anima-edit" ? editTemplate : getImageWorkflowTemplate(series), [workflow, series]);
  const params = data.imageParameters?.[workflow] ?? {};
  const model = params.model ?? { modelId: "", versionId: "" };
  // 缺失身份不回退到其他样例封面；只有展示模型来源与创建页默认选择有区别。
  // 本地索引可共享，选择确认只进入当前节点，不修改创建页资源 store。
  const display = params.model ? getLocalCheckpointDisplay(models, parseLocalCheckpointId(model.modelId) ?? "", model.versionId) ?? { name: model.versionId.split(/[\\/]/).pop() ?? model.versionId, cover: "" } : { name: String(Object.values(template).find(node => node.class_type === "UNETLoader" || node.class_type === "CheckpointLoaderSimple")?.inputs.unet_name ?? Object.values(template).find(node => node.class_type === "CheckpointLoaderSimple")?.inputs.ckpt_name ?? workflow), cover: "" };
  const update = (patch: Partial<typeof params>) => onChange({ imageParameters: { ...data.imageParameters, [workflow]: { ...params, ...patch } } });
  function setMossSlg(slg: boolean) {
    // 按节点保存，换成其他工作流后切回来仍能读到原来的开关。
    onChange({ imageParameters: { ...data.imageParameters, moss: { ...data.imageParameters?.moss, slg } } });
  }
  const toggleModel = (open: boolean) => { setSelecting(open); onSelecting(open); };
  // 原 GenerateFooter 也一并复用，只传入禁用执行与节点受控数量。
  // 提示词、反向词和完整尺寸都使用原表单组件，画布不再生成另一份 JSX 字段。
  // 这里只返回原组件需要的数据和回调，不渲染任何画布专用字段或按钮。
  // 原表单直接由侧栏调用，主模型弹窗也使用创建页原组件。
  const panel: Omit<ComponentProps<typeof ImageCreatePanel>, "extensions"> = {
    series, loraIds: data.workflowLoras?.[workflow]?.map(item => item.extensionId), modelDisplay: isModelNameHidden(model.versionId, [], hidden) ? { name: t("toolBox.civitai.visibility.hiddenName"), cover: "" } : display,
    onModelClick: () => toggleModel(true), store, sideVisible: false,
    advancedFields: workflow === "moss" ? createElement(MossSlgSetting, { checked: data.imageParameters?.moss?.slg ?? false, onChange: setMossSlg }) : undefined,
    promptScope: { store, editorId: `${id}-positive`, value: data.prompt, onValueChange: prompt => onChange({ prompt }) },
    negative: { editorId: `${id}-negative`, value: params.negative ?? "", onValueChange: negative => update({ negative }), maxLength: 4000 },
    modelSettings: { workflowId: workflow, mediaKind: "image", templateOverride: template, overrides: params.modelOverrides ?? {}, onChange: modelOverrides => update({ modelOverrides }), onReset: () => update({ modelOverrides: {} }), disabled: false },
    footer: { disabled: true, disabledReason: t("canvas.unavailable"), countControl: { value: data.batchSize ?? 1, options: COUNT_OPTIONS, onChange: batchSize => { if (batchSize === 1 || batchSize === 2 || batchSize === 4 || batchSize === 6) onChange({ batchSize }); } }, seedControl: { random: seedMode === "random", onEnable: () => store.getState().setAdvancedSettings({ seedMode: "random" }) } },
  };
  const picker: ComponentProps<typeof ModelSelectDialog> = { open: selecting, selected: model, series, onOpenChange: toggleModel, onSelect: model => { update({ model }); toggleModel(false); } };
  return { panel, picker };
}
