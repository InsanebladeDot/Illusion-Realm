"use client";

// 仅接线原视频表单的三个组件，不在画布重新实现模型、扩展或加载设置。
// 外壳由图片侧栏复用，参数像分别放在每个节点抽屉里的配料单，互不串值。
// 主模型和 CLIP/VAE 共用原 loader 覆盖表，修改任何槽都保留其他已确认槽。
// 扩展继续使用原 workflowLoras，undefined 继承模板而 [] 表示用户明确清空。
// 不挂载首尾帧、提示词、输出设置或生成按钮；它们仍属于节点既有交互。
// 三个组件不加载模型权重，打开配置不等于提交生成或验证服务安装成功。
import { useMemo, type SetStateAction } from "react";
import { useTranslation } from "@/i18n";
import { AdvancedSettingsSection } from "@/view/create/advanced-settings-section";
import { GenerationParameterControl } from "@/view/create/generation-parameter-control";
import { getVideoGenerationDefaults, VIDEO_GENERATION_LIMITS } from "@/utils/comfy/video-generation-settings";
import { VideoModelSelect } from "@/view/create/video-model-select";
import { VideoLoraSelect } from "@/view/create/video-lora-select";
import { WorkflowModelSettings } from "@/view/create/video-model-settings";
import { CanvasLoraStatus } from "./canvas-lora-status";
import { getVideoLoras, type VideoLora } from "@/utils/comfy/video-workflow-loras";
import type { VideoModelOverrides } from "@/utils/comfy/video-workflow-models";
import type { CanvasData } from "./canvas-model";
import { getCanvasVideoWorkflowTemplate } from "./canvas-video-workflow";

// workflow 来自正式登记表的稳定编号，不能拿翻译后的标签反推模板。
// data 必须是当前节点最新值，撤销之后组件会直接显示恢复的覆盖。
// onChange 只发送局部补丁，不携带坐标或重新排列整张画布。
// onSelecting 表达资源选择页是否打开，不是模型正在生成或磁盘正在保存。
// 选择器未确认的勾选留在原弹窗，只有确认后才通过回调进入作品。
// 侧栏切换目标会按节点身份卸载，因此原弹窗草稿不会继承到另一张卡。
// Props 不包含创建页 store，防止复用组件时顺手修改用户正在编辑的另一份草稿。
// 原模型索引可共享，因为它是资源目录；当前选择不能共享，因为它是作品意图。
interface Props {
  workflow: "minimax" | "minimax-reference" | "wan2.2";
  data: CanvasData;
  onChange: (patch: Partial<CanvasData>) => void;
  onSelecting: (open: boolean) => void;
}

export function CanvasVideoSettings({ workflow, data, onChange, onSelecting }: Props) {
  const { t } = useTranslation();
  // 侧栏三个原组件共用本节点的已填尺寸模板，另一节点及原注册模板保持独立。
  const template = useMemo(() => workflow === "wan2.2" ? undefined : getCanvasVideoWorkflowTemplate({ ...data, workflow }), [workflow, data]);
  if (workflow === "wan2.2" || !template) return <p className="p-3 text-sm text-muted-foreground">{t("canvas.workflowLoraUnavailable")}</p>;
  // 原主模型卡按 UNet loader 查覆盖，辅助设置按 CLIP/VAE loader 查同一表。
  // 同一个文件名可能出现在两个槽，不能按文件名去重或用一项替代另一项。
  // 模板内默认文件名仍由三个原组件各自读取，适配层不保存默认文件的副本。
  // 因而服务端模板更新后，从未手动覆盖的槽仍可以跟随新默认。
  // 已确认的自定义名称即使本地索引暂时缺失也保留，方便用户识别并修复。
  // 名称不是文件读取授权，真正生成时仍需执行器验证模型可用性。
  // Wan 的原主模型与扩展控件本身不适用，提前返回已有限制说明。
  // 不能在这个分支画一个空的“添加模型”来暗示 Wan 已获得同样能力。
  // 这些原组件中的 useState 属于各自实例，侧栏打开不影响创作页折叠状态。
  // 同源视频可以创建多个节点，参数归属依赖节点身份而非媒体路径。
  const overrides = data.videoModelOverrides?.[workflow] ?? {};
  // 外表使用展开拷贝保留另一条工作流，内表由原组件给出完整的新确认值。
  // 不能用 Object.assign 修改旧对象；复制节点和撤销记录可能仍持有旧快照。
  // 模型卡选主模型后，辅助设置会在同一轮渲染看到相同 loader 覆盖。
  // CLIP 下拉改值后，主模型名称仍从它自己的 UNet 槽读取，不会被覆盖成 CLIP。
  // 局部改变不涉及 prompt、media、inputImages，已有输入和结果继续保留。
  // 保存失败由原画布状态栏解释，这里不提前弹出“已保存”的成功通知。
  const changeModels = (value: VideoModelOverrides) => onChange({ videoModelOverrides: { ...data.videoModelOverrides, [workflow]: value } });
  // 原扩展组件既可给完整数组，也可给依赖当前值的权重更新函数。
  // 第一次函数式更新读取模板默认，已有空数组则直接使用，不能重新补回扩展。
  // 这个适配只转换更新形态，不重写模型路径、权重上限或资源版本筛选。
  // 扩展行的稳定 id 与显示名称分开，重名版本仍可独立调权和删除。
  // 修改后只替换目标工作流的一行，其他视频工作流的扩展顺序保持原样。
  // 节点之间没有共享 setState，原选择器更新只会回到它所属节点的 onChange。
  const changeLoras = (value: SetStateAction<VideoLora[]>) => onChange({ workflowLoras: { ...data.workflowLoras, [workflow]: typeof value === "function" ? value(data.workflowLoras?.[workflow] ?? getVideoLoras(template)) : value } });
  // 原加载设置的重置与创作页一致：清主模型/辅助覆盖，同时恢复扩展继承。
  // 重置没有清空上传素材或提示词，用户不用为了修正模型重新接线。
  // 这是一笔原画布事务，两张表在同一次补丁中更新，撤销不会只恢复一半。
  // 另一模板和另一节点保留原值，不能遍历所有节点执行“恢复默认”。
  // 显式空模型表可保存，重开不能把它错误合并回旧的用户覆盖。
  // 资源文件本体没有被改名、移动或删除，重置仅影响之后请求使用的参数。
  const reset = () => onChange({ videoModelOverrides: { ...data.videoModelOverrides, [workflow]: {} }, workflowLoras: { ...data.workflowLoras, [workflow]: undefined } });
  // 辅助槽的异步清单由原 useVideoModelLists 管理，切流或卸载后忽略旧回包。
  // 原扩展弹窗确认前不改变覆盖表，取消只清理临时选中集合。
  // 选模请求失败继续由原 toast 提示，适配器不吞错后返回一个假的新模型。
  // 正文自身承担滚动，原模型封面和加载折叠组不会撑高整个工作区。
  // 使用原语义主题，禁止在这里复制一套深蓝底色或强制 color-scheme。
  // 展示中没有生成 footer，不会多出一个与节点请求图标竞争的提交入口。
  // 三个组件保持原调用顺序，所有按钮、模态资源页和加载状态由原实现维护。
  return <div data-canvas-video-settings className="min-h-0 flex-1 overflow-y-auto">
    {/* 视频侧栏：顺序与原视频表单一致，三个控件全部直接引用原组件。 */}
    <div className="space-y-2 px-3 pt-3">
      <VideoModelSelect workflowId={workflow} templateOverride={template} overrides={overrides} onChange={changeModels} disabled={false} />
      <VideoLoraSelect workflowId={workflow} templateOverride={template} value={data.workflowLoras?.[workflow]} onChange={changeLoras} disabled={false} onPickerOpenChange={onSelecting} />
      <CanvasLoraStatus names={getVideoLoras(template).map(item => item.name)} inherited={data.workflowLoras?.[workflow] === undefined} />
    </div>
    <AdvancedSettingsSection>
      {/* 界面：视频采样步数跟随当前工作流的默认值，修改后只记在当前节点。 */}
      <GenerationParameterControl
        name="steps"
        label={t("create.advancedSettings.steps")}
        hint={t("create.advancedSettings.stepsHint")}
        value={data.videoSteps ?? getVideoGenerationDefaults(template).steps}
        min={VIDEO_GENERATION_LIMITS.stepsMin}
        max={VIDEO_GENERATION_LIMITS.stepsMax}
        step={1}
        onChange={steps => onChange({ videoSteps: Math.round(steps) })}
      />
    </AdvancedSettingsSection>
    <WorkflowModelSettings workflowId={workflow} templateOverride={template} overrides={overrides} onChange={changeModels} onReset={reset} disabled={false} />
  </div>;
}
