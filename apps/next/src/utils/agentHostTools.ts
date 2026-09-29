/**
 * 宿主工具的**渲染层执行端**。
 *
 * 干什么：主进程把 `agent:hostCall` 转过来，这里用与创建页**完全相同**的那几个函数跑一遍
 * （组装工作流 → 提交 ComfyUI → 落盘 + 内嵌 Meta → 刷新图库），再把一句摘要回执给主进程，
 * 最终写进模型的工具结果。
 *
 * 为什么放在渲染层：工作流模板组装（`utils/comfy/*`）与落盘 / Meta 内嵌
 * （`saveGeneratedImages` / `buildGeneratedImageMeta`）只存在于渲染层；主进程是手写
 * CommonJS，运行期拿不到它们。放这里的结果是：Agent 生成的图和界面上点「生成」得到的东西
 * 同一套判据、同一个图库，不存在第二种实现。
 *
 * 怎么接：`AppShell` 挂载时调一次 `subscribeAgentHostTools()`。**不要挂在 Agent 页** ——
 * 切页后请求没人接，主进程要白等到超时。
 */
import type {
  AgentHostCall,
  ComfyApiPrompt,
  ComfyGenerateResult,
} from "@illusion-realm/shared";
import { generateWithComfy, revokeComfyImages } from "@/api/comfyui";
import { t } from "@/i18n";
import {
  getSelectedFolderDirPath,
  useHistoryFolderStore,
} from "@/stores/useHistoryFolderStore";
import { useGenerationNoticeStore } from "@/stores/useGenerationNoticeStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { buildGeneratedImageMeta } from "@/utils/buildGeneratedImageMeta";
import {
  buildImagePrompt,
  type ImageWorkflowParams,
  type ImageWorkflowSeries,
} from "@/utils/comfy/imageWorkflow";
import { resolveImageWorkflowParams } from "@/utils/comfy/resolveComfyModels";
import {
  respondAgentHostCall,
  subscribeAgentHostCalls,
} from "@/utils/electronBridge";
import { resolveSaveOutputPath } from "@/utils/generatedImages";
import { saveGeneratedImagesToDisk } from "@/utils/saveGeneratedImages";

interface AgentHostToolOutput {
  text: string;
  images?: string[];
}

/** 只收字符串型入参：模型给的 JSON 什么形状都可能有，脏值一律当没填 */
function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readSeries(value: unknown): ImageWorkflowSeries {
  return value === "sdxl" ? "sdxl" : "anima";
}

/** 模型入参 → 工作流参数；没给的一律留空，让模板自带的默认值生效 */
function toWorkflowParams(args: Record<string, unknown>): ImageWorkflowParams {
  return {
    positivePrompt: readText(args.prompt),
    negativePrompt: readText(args.negativePrompt) || undefined,
    series: readSeries(args.series),
    checkpointName: readText(args.model) || undefined,
    width: readNumber(args.width),
    height: readNumber(args.height),
    steps: readNumber(args.steps),
    cfg: readNumber(args.cfg),
  };
}

function describeSavedImages(savedPaths: string[], promptId: string): string {
  if (savedPaths.length === 0) {
    return t("errors.agentHostTool.unsavedImages", { promptId });
  }
  return t("errors.agentHostTool.savedImages", {
    count: savedPaths.length,
    paths: savedPaths.join("、"),
  });
}

/** 落盘 + 刷图库 + 右上角通知（与创建页 `useComfyGenerate` 的最后一步同构） */
async function persistGeneratedImages(
  result: ComfyGenerateResult,
  params: ImageWorkflowParams,
  workflow: ComfyApiPrompt,
  folderId: string,
  outputPath: string
): Promise<string[]> {
  const savedPaths = await saveGeneratedImagesToDisk(
    result.images,
    result.promptId,
    resolveSaveOutputPath(outputPath, getSelectedFolderDirPath(folderId)),
    buildGeneratedImageMeta({
      promptId: result.promptId,
      params,
      workflow,
      generationKind: "text2img",
      sourceImagePath: null,
    })
  );
  useHistoryFolderStore.getState().refreshGeneratedImages();
  useGenerationNoticeStore.getState().succeed({
    filePath: savedPaths[0] ?? null,
    folderId,
  });
  return savedPaths;
}

/** 工具：生图 —— 与创建页同一条流水线，只有触发者不同 */
async function generateImage(
  args: Record<string, unknown>
): Promise<AgentHostToolOutput> {
  const params = toWorkflowParams(args);
  if (!params.positivePrompt) {
    throw new Error(t("errors.agentHostTool.missingPrompt"));
  }

  const { comfyServerUrl, outputPath, paths } = useSettingsStore.getState();
  const folderId = useHistoryFolderStore.getState().selectedFolderId;
  useGenerationNoticeStore.getState().start();

  try {
    const resolved = await resolveImageWorkflowParams(params, comfyServerUrl, paths);
    const workflow = buildImagePrompt(resolved.series ?? "anima", resolved);
    const result = await generateWithComfy(workflow, { serverAddress: comfyServerUrl });
    try {
      const savedPaths = await persistGeneratedImages(
        result,
        resolved,
        workflow,
        folderId,
        outputPath
      );
      return {
        text: describeSavedImages(savedPaths, result.promptId),
        images: savedPaths,
      };
    } finally {
      // 已经落盘，objectUrl 再留着就是泄漏（创建页保活是因为还要显示预览）
      revokeComfyImages(result.images);
    }
  } catch (error) {
    useGenerationNoticeStore.getState().fail();
    throw error;
  }
}

/** 工具名 → 渲染层实现；加工具时这里加一条、主进程 `host-tools.js` 加一条声明 */
const HOST_TOOL_HANDLERS: Record<
  string,
  (args: Record<string, unknown>) => Promise<AgentHostToolOutput>
> = {
  generate_image: generateImage,
};

/** 执行一次宿主工具调用；认不出的名字要变成明确失败，别让模型干等 */
export async function runAgentHostTool(
  name: string,
  args: Record<string, unknown>
): Promise<AgentHostToolOutput> {
  const handler = HOST_TOOL_HANDLERS[name];
  if (!handler) throw new Error(t("errors.agentHostTool.unknownTool", { name }));
  return handler(args);
}

/** 执行 + 回执；成败都要回，否则主进程要等到工具超时 */
async function handleAgentHostCall(call: AgentHostCall): Promise<void> {
  try {
    const result = await runAgentHostTool(call.name, call.arguments ?? {});
    await respondAgentHostCall({
      callId: call.callId,
      ok: true,
      result: result.text,
      images: result.images,
    });
  } catch (error) {
    await respondAgentHostCall({
      callId: call.callId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 订阅宿主工具调用并在渲染层执行（AppShell 挂载一次）。
 * @returns 退订函数
 */
export function subscribeAgentHostTools(): () => void {
  return subscribeAgentHostCalls((call) => {
    void handleAgentHostCall(call);
  });
}
