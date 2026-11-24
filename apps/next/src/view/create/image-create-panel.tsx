"use client";

// 原 CreatePage 的整个文生图区域在此原样装配，两个入口直接使用同一组件。
// 外层宿主决定模型数据、参数所属与任务入口，字段布局不再由画布重新组装。
// 像整台机器搬到另一张工作台，只替换接线，不重新拼装按钮和面板。
import { useWorkflowReadiness } from "@/hooks/use-workflow-readiness";
import { WorkflowModelNotice } from "@/components/workflow-model-notice";
import type { ComfyApiPrompt } from "@/types/comfy";
import { UpscaleOptions } from "@/components/create/upscale-options";
import { useStore } from "zustand";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { useState, type ComponentProps, type ReactNode } from "react";
import type { StoreApi } from "zustand";
import type { CreateFormState } from "@/stores/useCreateFormStore";
import { useTranslation } from "@/i18n";
import { ModelCoverSelect } from "./model-cover-select";
import { PromptGuideButton, PromptGuideDialog } from "./PromptGuideDialog";
import { WorkflowModelSettings } from "./video-model-settings";
import { PromptSection, type ImagePromptScope } from "./PromptSection";
import { NegativePromptSection } from "./NegativePromptSection";
import { useShallow } from "zustand/react/shallow";
import { resolveImageDimensions } from "@/utils/imageSize";
import { ImageSizeSection } from "./ImageSizeSection";
import type { ImageWorkflowSeries } from "@/utils/comfy/imageWorkflow";
import { AdvancedSettings } from "./AdvancedSettings";
import { GenerateFooter } from "./GenerateFooter";

// 创建页与画布直接共用原表单；局部 store 和回调只替换数据来源，未传时仍用创建页草稿。
// full 显示完整创建表单；settings 省略节点已有的正向输入、尺寸和提交入口。
// 模型、扩展、反向词和高级设置仍用原组件，工作流身份由 modelSettings 传入。
interface Props {
  // settings 仍复用原字段，仅省略节点上已有的正文、尺寸和提交入口。
  // 创建页不传此参数，继续展示完整 rail，避免画布需求改变原页面。
  variant?: "full" | "settings";
  modelPrompt?: ComfyApiPrompt;
  series: ImageWorkflowSeries;
  advancedFields?: ReactNode;
  modelDisplay: Pick<ComponentProps<typeof ModelCoverSelect>, "name" | "cover">;
  modelVerification?: "pending" | "verified" | "unsupported";
  loraIds?: string[];
  onModelClick: () => void;
  extensions: ReactNode;
  modelSettings: ComponentProps<typeof WorkflowModelSettings>;
  store?: StoreApi<CreateFormState>;
  promptScope?: ImagePromptScope;
  renderPromptHeaderAction?: ComponentProps<typeof PromptSection>["renderHeaderAction"];
  negative?: ComponentProps<typeof NegativePromptSection>;
  sideVisible?: boolean;
  generating?: boolean;
  onGenerate?: (count: number) => void;
  locked?: boolean;
  footer?: Partial<ComponentProps<typeof GenerateFooter>>;
}

// rail：模型、指南、LoRA、加载器、完整提示词工具、尺寸、高级设置及底栏一并复用。
// 内部指南与表单一起卸载，关闭后不留下另一个节点的可操作弹窗。
// 滚动仍属于中间正文，生成底栏保持原创建页位置，不挤进内容流。
export function ImageCreatePanel({ variant = "full", series, advancedFields, modelDisplay, modelVerification, loraIds, onModelClick, extensions, modelSettings, store, promptScope, renderPromptHeaderAction, negative, sideVisible, generating = false, onGenerate, footer, modelPrompt, locked = false }: Props) {
  const { t } = useTranslation();
  const readiness = useWorkflowReadiness(variant === "full" ? modelPrompt ?? null : null);
  // 指南只属于当前表单，关闭不改草稿；消费 Escape，避免同时关闭外层侧栏。
  const [guideOpen, setGuideOpen] = useState(false);
  const guideSeries = series === "sdxl" ? "sdxl" : "anima";
  const formStore = store ?? useCreateFormStore;
  const upscale = useStore(formStore, state => state.upscale);
  // 和提交生成用同一套尺寸换算，比例、像素对齐和缩放都算进坐标。
  const compositionSize = useStore(formStore, useShallow(state => series === "moss" && variant === "full"
    ? resolveImageDimensions({ mode: state.sizeMode, aspectRatio: state.aspectRatio,
      customWidth: state.customWidth, customHeight: state.customHeight, scale: state.sizeScale })
    : undefined));
  return <div data-image-create-panel className="flex min-h-0 flex-1 flex-col" onKeyDown={event => {
    // 原文档弹框不处理 Escape，由持有打开状态的表单关闭这一层。
    // 消费事件后外层侧栏继续保留，不能一次按键同时退回画布。
    if (guideOpen && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setGuideOpen(false); }
  }}>
            <WorkflowModelNotice readiness={readiness} />
            {/* 锁住整块输入但保留 DOM，补齐模型后原草稿和滚动位置仍在。 */}
            <div data-create-rail-scroll inert={locked} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:thin] inert:opacity-50">
              <div data-create-form-sections className="flex min-w-0 max-w-full flex-col gap-2 px-3 py-2 sm:px-4">
                <div data-create-model-section className="space-y-1.5">
                  {/* 主模型选择区 */}
                  <ModelCoverSelect name={modelDisplay.name} cover={modelDisplay.cover} label={t("create.page.model")} onClick={() => onModelClick()} priority />
                  {/* 主模型旁显示试跑结果，画布及 SDXL 不传这个状态。 */}
                  {modelVerification && <p data-image-model-verification={modelVerification} role="status"
                    className={modelVerification === "unsupported" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {t(`create.imageModelSetup.verification.${modelVerification}`)}
                  </p>}
                  {/* 当前系列提示词指南 */}
                  <PromptGuideButton
                    series={guideSeries}
                    onClick={() => setGuideOpen(true)}
                  />
                </div>
                {/* 扩展区：直接渲染调用方传入的原组件。 */}
                <div data-create-extension-section>
                  {extensions}
                </div>
                {/* 加载设置区：复用原工作流控件。 */}
                <WorkflowModelSettings key={series} {...modelSettings} disabled={locked || modelSettings.disabled} />


                {/* 正向提示词区 */}
                {variant === "full" && <PromptSection
                  series={guideSeries}
                  loraIds={loraIds}
                  sideVisible={sideVisible}
                  scope={promptScope}
                  renderHeaderAction={renderPromptHeaderAction}
                  toolSeries={series}
                  compositionSize={compositionSize}
                />}

                {/* 界面：「反向提示词」区 */}
                <NegativePromptSection {...negative} />

                {/* 尺寸与采样参数区 */}
                {variant === "full" && <ImageSizeSection store={store} />}
                <AdvancedSettings series={series} store={store}>
                  {advancedFields}
                  {/* 界面：「高级设置」中的生成后超分仍使用当前表单的参数。 */}
                  <UpscaleOptions value={upscale} disabled={generating || locked} onChange={value => formStore.getState().setUpscale(value)} />
                </AdvancedSettings>
              </div>
            </div>

            {/* 界面：rail 底部的「生成」按钮条 */}
            {variant === "full" && <GenerateFooter generating={generating} onGenerate={onGenerate} {...footer} disabled={footer?.disabled || locked || readiness.blocked} locked={locked} />}
    <PromptGuideDialog open={guideOpen && !locked} series={guideSeries} onOpenChange={setGuideOpen} />
  </div>;
}
