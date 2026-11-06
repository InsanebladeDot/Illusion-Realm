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
// Agent 与创建页共用调度、取消及统计，适配器只保留解析与工具回执。
// 不复制另一份执行时钟，也不在工具结果展示时重复记账。
import { enqueueGenerationTask } from "@/utils/image-generation-queue";
import { useGenerationTaskStore } from "@/stores/useGenerationTaskStore";
import { generationModelsFromPrompt } from "@/utils/generation-statistics";
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
// LoRA 参数与服务器名称采用独立收口函数，避免复用模糊匹配时换掉实际模型。
// 主进程负责实际家族兼容性，这里负责最终传给工作流的类型与精确命名。
// 两端职责互补，服务器列表不携带足够的架构资料，不能替代主进程证据。
import { readAgentLoras, resolveAgentLoraParams } from "@/utils/agent-loras";

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
  // 拼错或暂不支持的视频系列不能回落到 Anima，否则 LoRA 将套进错误模板。
  // 缺省仍使用 Anima，保留未使用 LoRA 时旧请求的默认行为。
  // 含 LoRA 的主进程请求已经由实际主模型推导系列，显式冲突会提前失败。
  if (value !== undefined && value !== "anima" && value !== "sdxl") throw new Error(t("errors.agentHostTool.invalidSeries"));
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
    // 不允许参数被转换层遗漏，否则工具声明看似支持、实际生成却完全不加载。
    // 空数组就是不添加扩展，非空数组保持用户选择的顺序和显式零权重。
    // 名称与强度的脏值抛出可读错误，不以空数组掩盖输入问题。
    loras: readAgentLoras(args.loras),
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

/**
 * Agent 保留自己的严格模型检索，执行与终态统一交给公共队列。
 * 参数像写好的订单：服务器、模型目录和目标文件夹在提交时冻结。
 * 后面用户切换设置不影响已经排队的订单，也不能造成统计与执行分叉。
 * 只有最终实际图的模型进入账本，失败检索不会增加模型使用次数。
 */
/**
 * Agent 提交边界的约定：
 * 保留现有 toWorkflowParams，让工具 Schema 的字段仍按原有业务语义转换。
 * 没有正向提示词时维持原错误反馈，不创建一条看似可执行的空任务。
 * 服务器地址在提交时冻结，排队期间切站不改变这一次生成的目标。
 * paths 深拷贝，避免用户在设置页修改嵌套目录对象影响旧请求。
 * 参数中的 LoRA 数组也深拷贝，排序与权重草稿只作用于之后提交。
 * 目标文件夹身份取提交时选择，不跟随用户后来正在浏览的图库变化。
 * 任务 prompt 与 model 摘要用于公共卡片，实际模型身份等待解析后的图。
 * 远端标记初始为 false，因为模型检查阶段没有可停止的生成任务。
 * 执行器真正要发请求时才更新远端标记，取消可以避开其他客户端。
 * 返回公共 Promise 的最终值，Agent 的工具回执仍能收到原格式的图片路径。
 */
async function generateImage(args: Record<string, unknown>): Promise<AgentHostToolOutput> {
  const params = toWorkflowParams(args);
  if (!params.positivePrompt) throw new Error(t("errors.agentHostTool.missingPrompt"));
  const settings = useSettingsStore.getState();
  const input = { params: structuredClone(params), server: settings.comfyServerUrl, output: settings.outputPath, paths: structuredClone(settings.paths), folderId: useHistoryFolderStore.getState().selectedFolderId };
  // 检索尚未提交远端时只取消本地等待，不能中断其他客户端的任务。
  // 实际提交前的回调才打开远端停止能力，状态不靠超时猜测。
  let remote = false;
  return enqueueGenerationTask({ prompt: params.positivePrompt, model: params.checkpointName ?? params.series ?? "Anima", width: params.width ?? 0, height: params.height ?? 0, total: 1, folderId: input.folderId }, (id, signal) => executeAgentImage(id, signal, input, () => { remote = true; }), () => remote).promise;
}

// 参数类型从适配器明确的输入对象推导，不能把整个设置 store 传给执行器。
// 不冻结账户或密钥，网络生成仍通过已有安全 IPC 读取必要能力。
// folderId 只表示目标文件夹，卡片和通知使用同一份提交时身份。
interface AgentImageInput { params: ImageWorkflowParams; server: string; output: string; paths: import("@/types/settings").SettingsPaths; folderId: string }

// 两条解析分支沿用原语义：显式主模型/LoRA 严格检查；旧请求可读模板默认。
// 不因复用队列回退成只按 basename 匹配，模型子目录继续完整保留。
// 每个远端等待后检查取消，停止请求与生成请求共享同一个 requestId。
// 图片回包之后才进入资源保护，成功与失败都会回收本次临时 URL。
// saving 阶段沿用公共取消保护，不承诺撤销已经开始的文件写入。
// 已写盘文件和任务 completed 同次更新，统计不会读取到零张的旧快照。
// 统计写入失败与生图失败分开处理，后者仍由公共失败分支反馈。
/**
 * Agent 执行适配的约定：
 * 先进入 generating，使公共时钟包含模型检查和生成准备。
 * 显式主模型或 LoRA 保留严格解析，不因改走公共队列而恢复模糊 basename 匹配。
 * 未指定模型的旧内部调用仍可读取原模板默认值，兼容既有工具调用。
 * 解析失败直接拒绝，公共失败分支会把它记为异常尝试。
 * 解析成功后立即检查取消，停止期间完成的目录查询不能继续提交。
 * 实际工作流只构建一次，模型快照与 Meta 使用同一份图。
 * requestId 使用公共任务 ID，卡片停止不再缺少可定位的远端会话。
 * 提交后的回包必须包含图片，空回包不能只凭 promptId 宣布成功。
 * 收到图片后先检查取消，已停止的任务不继续进入文件写入。
 * saving 状态通知公共停止入口锁住该副作用阶段。
 * 落盘结果为空时报告保存失败，避免增加不存在的成功图片。
 * completed 与 savedPaths 在同一次更新中发布，终态账本能看见完整结果。
 * 工具摘要继续描述真实路径和服务端 promptId，不返回统计内部字段。
 * 临时图片 URL 在 finally 统一回收，成功和错误都不会遗留这一份缓存。
 * Agent 不保活预览 URL，任务卡查看动作仍使用已经落盘的路径。
 * 生成通知成功来自既有保存适配器，失败通知来自公共队列，职责保持清楚。
 */
async function executeAgentImage(id: string, signal: AbortSignal, input: AgentImageInput, beforeSubmit: () => void): Promise<AgentHostToolOutput> {
  const { params, server, paths, folderId, output } = input;
  const update = useGenerationTaskStore.getState().update;
  update(id, { status: "generating" });
  useGenerationNoticeStore.getState().start();
  const resolved = params.checkpointName || params.loras?.length ? await resolveAgentLoraParams(params, server) : await resolveImageWorkflowParams(params, server, paths);
  signal.throwIfAborted();
  const workflow = buildImagePrompt(resolved.series ?? "anima", resolved);
  update(id, { models: generationModelsFromPrompt(workflow) });
  beforeSubmit();
  const result = await generateWithComfy(workflow, { serverAddress: server, requestId: id });
  try {
    signal.throwIfAborted();
    if (!result.images.length) throw new Error(t("create.page.generateFailed"));
    update(id, { status: "saving" });
    const savedPaths = await persistGeneratedImages(result, resolved, workflow, folderId, output);
    if (!savedPaths.length) throw new Error(t("create.page.saveFailed"));
    update(id, { status: "completed", completed: 1, savedPaths });
    return { text: describeSavedImages(savedPaths, result.promptId), images: savedPaths };
  } finally { revokeComfyImages(result.images); }
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
