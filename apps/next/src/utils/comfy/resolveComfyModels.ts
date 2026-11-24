/**
 * 生成前确认「本机 ComfyUI 里确实有这个模型」，并把名字对齐。
 *
 * 怎么做：调用 `comfy:listModels` 拿到服务端模型列表，与本地路径候选逐级匹配；
 * 匹配不上时保留原值（让用户看到失败原因，而不是静默换模型）。
 */
import {
  EMPTY_SETTINGS_PATHS,
  type SettingsPaths,
} from "@/types/settings";
import type { ImageWorkflowParams } from "@/utils/comfy/imageWorkflow";
import {
  resolveComfyModelNameFromList,
  toComfyModelName,
} from "@/utils/comfy/comfyModelPath";
import { fetchComfyModelLists } from "@/api/comfyui";

/** 把本地模型路径解析为 ComfyUI 可识别的相对模型名 */
export async function resolveImageWorkflowParams(
  params: ImageWorkflowParams,
  serverAddress: string,
  paths: SettingsPaths = EMPTY_SETTINGS_PATHS
): Promise<ImageWorkflowParams> {
  const checkpointRoots = [
    paths.checkpointPath,
    paths.diffusionModelsPath,
    paths.searchPath,
  ].filter(Boolean);
  const loraRoots = [paths.lorasPath, paths.searchPath].filter(Boolean);

  let checkpoints: string[] = [];
  let loras: string[] = [];

  try {
    const lists = await fetchComfyModelLists(serverAddress);
    checkpoints = params.series === "sdxl" ? lists.checkpoints : lists.diffusionModels ?? [];
    loras = lists.loras;
  } catch {
    // 无法拉取列表时仍使用路径推导
  }

  const resolved: ImageWorkflowParams = { ...params };

  if (params.checkpointName) {
    const name = params.checkpointName;
    // 已按分类根目录保存的相对名包含子目录，不能退化成只传文件名。
    if (!/^(?:[a-z]:|[/\\])/i.test(name)) {
      const key = name.replaceAll("\\", "/").toLowerCase();
      resolved.checkpointName = checkpoints.find(item => item.replaceAll("\\", "/").toLowerCase() === key) ?? name;
    } else {
      resolved.checkpointName = resolveComfyModelNameFromList(name, checkpoints, checkpointRoots);
    }
  }

  if (params.loras) {
    resolved.loras = params.loras.map((lora) => ({
      ...lora,
      name:
        loras.length > 0
          ? resolveComfyModelNameFromList(lora.name, loras, loraRoots)
          : toComfyModelName(lora.name, loraRoots),
    }));
  }

  return resolved;
}
