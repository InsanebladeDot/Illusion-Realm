/**
 * 把创建页表单 + 选中的模型 / 扩展拼成 ComfyUI 请求参数（点「生成」前的最后一跳）。
 *
 * 怎么做：纯函数 —— 解析模型名、拼 LoRA 权重、按模式（普通 / 高级）取提示词，
 * 产出 `CreateGenerateInput` 交给 `hooks/useComfyGenerate` 发 IPC。
 */
import type { SelectedExtension } from "@/types/extension";
import type { SelectedModel } from "@/types/model";
import type { LocalModel } from "@/types/localModel";
import type { SettingsPaths } from "@/types/settings";
import { getModelVersion } from "@/data/models";
import { RANDOM_SEED } from "@/data/createForm";
import { t } from "@/i18n";
import { isNonDiffusionModelPath } from "@/utils/localModelCategory";
import { clampExtensionWeight } from "@/utils/extensionWeight";
import { generateRandomSeed } from "@/utils/seed";
import {
  isLocalCheckpointId,
  isLocalLoraId,
  parseLocalLoraId,
} from "@/utils/localModelResources";
import {
  buildImagePrompt,
  type ImageWorkflowParams,
  type ImageWorkflowSeries,
} from "@/utils/comfy/imageWorkflow";

export type CreateGenerateInput = {
  positivePrompt: string;
  negativePrompt: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  samplerName?: string;
  scheduler?: string;
  width?: number;
  height?: number;
  batchSize?: number;
  selectedModel: SelectedModel;
  selectedExtensions: SelectedExtension[];
  localModels: LocalModel[];
  paths?: SettingsPaths;
  /** 图像工作流系列（默认 anima） */
  series?: ImageWorkflowSeries;
};

const DEFAULT_NEGATIVE =
  "score_1, score_2, score_3, blurry, worst quality, low quality, jpeg artifacts, signature, watermark, username, error, deformed hands, bad anatomy, extra limbs, poorly drawn hands, poorly drawn face, mutation, deformed, extra eyes, extra arms, extra legs, malformed limbs, fused fingers, too many fingers, long neck, cross-eyed, bad proportions, missing arms, missing legs, extra digit, fewer digits, cropped, normal quality";

/**
 * 提交前的模型合法性校验：
 * ComfyUI 侧会以 `value_not_in_list` / `prompt_outputs_failed_validation` 拒绝不存在的模型名，
 * 最常见的原因是选到了 upscale_models / vae / clip 等非扩散模型目录下的文件。
 * 这里提前拦下并给出可读提示，避免用户只看到 400。
 */
function assertUsableDiffusionModel(
  filePath: string,
  series: ImageWorkflowSeries,
  paths?: SettingsPaths
): void {
  if (isNonDiffusionModelPath(filePath)) {
    throw new Error(
      t("errors.buildGenerateParams.nonDiffusionModel", {
        filePath,
        target: series === "anima" ? " diffusion_models" : " checkpoints",
      })
    );
  }

  const expectedRoot = (
    series === "anima" ? paths?.diffusionModelsPath : paths?.checkpointPath
  )?.trim();
  if (!expectedRoot) return;

  const normalizedRoot = expectedRoot.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const normalizedFile = filePath.replace(/\\/g, "/").toLowerCase();
  if (!normalizedFile.startsWith(`${normalizedRoot}/`)) {
    throw new Error(
      t("errors.buildGenerateParams.modelOutsideSeries", {
        filePath,
        seriesHint:
          series === "anima"
            ? t("errors.buildGenerateParams.animaSeriesOnly", { root: expectedRoot })
            : t("errors.buildGenerateParams.sdxlSeriesOnly", { root: expectedRoot }),
      })
    );
  }
}

export function buildGenerateParams(
  input: CreateGenerateInput
): ImageWorkflowParams {
  const params: ImageWorkflowParams = {
    positivePrompt: input.positivePrompt.trim(),
    negativePrompt: input.negativePrompt.trim() || DEFAULT_NEGATIVE,
    seed:
      input.seed == null || input.seed === RANDOM_SEED
        ? generateRandomSeed()
        : input.seed,
    batchSize: input.batchSize ?? 1,
    series: input.series ?? "anima",
  };

  if (input.steps != null) params.steps = input.steps;
  if (input.cfg != null) params.cfg = input.cfg;
  if (input.samplerName != null) params.samplerName = input.samplerName;
  if (input.scheduler != null) params.scheduler = input.scheduler;
  if (input.width != null) params.width = input.width;
  if (input.height != null) params.height = input.height;

  if (isLocalCheckpointId(input.selectedModel.modelId)) {
    const version = getModelVersion(
      input.selectedModel.modelId,
      input.selectedModel.versionId,
      input.localModels
    );
    if (version?.id) {
      assertUsableDiffusionModel(version.id, input.series ?? "anima", input.paths);
      params.checkpointName = version.id;
    }
  }

  const loraExtensions = input.selectedExtensions
    .map((extension) => {
      if (!isLocalLoraId(extension.extensionId)) return null;
      const filePath = parseLocalLoraId(extension.extensionId);
      if (!filePath) return null;
      return {
        name: filePath,
        strength: clampExtensionWeight(extension.weight),
      };
    })
    .filter((item): item is { name: string; strength: number } => item != null);

  params.loras = loraExtensions;

  return params;
}

export function buildGeneratePrompt(input: CreateGenerateInput) {
  const params = buildGenerateParams(input);
  return buildImagePrompt(params.series ?? "anima", params);
}
