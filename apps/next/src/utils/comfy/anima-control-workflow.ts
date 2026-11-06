/**
 * Anima LLLite 控制图构建：深拷贝用户提供的边缘与蒙版 API 模板。
 * 复用标准图片构建器的采样参数和 LoRA 链，再接到模板的控制节点之前。
 * 本模块只构建数据，不读文件、不上传、不调用服务端。
 */
import edgeTemplate from "@/data/comfy/utillswWorkflower/image_anima_lllite_any_control_to_image.json";
import maskTemplate from "@/data/comfy/utillswWorkflower/image_anima_lllite_image_inpainting.json";
import type { ComfyApiPrompt, ComfyApiNode } from "@/types/comfy";
import type { AnimaEditSettings } from "./anima-edit-workflow";
import { buildImagePrompt } from "./imageWorkflow";
// 控制图的节点号不同于普通图片图，辅助覆盖必须写在最终控制模板上。
// 与 UI 共用模板读取入口，蒙版和边缘各自的默认文件不会串用。
import { applyWorkflowAuxiliaryOverrides } from './video-workflow-models';

// 只交付独立副本，设置界面与构建器都不能修改导入的原始 JSON。
// 模式决定实际工作流，不从上次图片或文字编辑的覆盖推测所需加载器。
// 蒙版与边缘图虽然展示相同字段，节点集合仍由各自 JSON 决定。
// mode 只接受两种控制类型，文字编辑使用图片模板而不进入此函数。
// 原图上传名仍在构建阶段替换，不把模板里的历史示例当成用户素材。
// 拿模板做界面展示不触发模型解析、文件上传或补丁下载。
// 两种模板都深拷贝，切换模式时上一次更改的文件名不能污染另一模式。
// 原有构建器也调用这个入口，避免 UI 展示模板与提交模板分别演化。
export function getAnimaControlTemplate(mode: 'edge' | 'inpaint'): ComfyApiPrompt {
  return structuredClone(mode === 'inpaint' ? maskTemplate : edgeTemplate);
}

// 两个模板都有且只有一个同类型核心节点，按类型查找而不依赖冒号 ID。
// 节点 ID 是用户导出的图内部身份，后续重新导出时可能发生变化。
// 类型缺失应当响亮失败，不返回空输入继续上传或请求生成。
// 该断言只保护随产品发布的模板结构，不用它解析任意用户工作流。
// 多个同类型节点同样拒绝，避免猜错 sampler、模型或图像来源。
// 错误使用固定技术类型名，不带本机路径、素材名或提示词内容。
// 返回原引用供本次独立 prompt 修改，不接触 import 的共享对象。
// inputs 保留 unknown，由各调用点按已验证的模板输入收窄。
function single(prompt: ComfyApiPrompt, kind: string): [string, ComfyApiNode] {
  const matches = Object.entries(prompt).filter(([, node]) => node.class_type === kind);
  if (matches.length !== 1) throw new Error(`Invalid Anima control template: ${kind}`);
  return matches[0];
}

/**
 * 默认值直接读取对应 API 模板，模板调参后无需手工维护第二份常量。
 * 两个控制模式各取自己的种子、采样参数和 UNet，不能继承文字编辑默认值。
 * 模板没有 LoRA 节点，因此默认空列表；用户显式选择后才注入扩展链。
 * 历史示例的正向提示词与输入文件名不属于默认业务输入，不复制到表单。
 * 负面词属于模型参数，保留模板编码节点的文本，包括合法空字符串。
 * megapixels 仅满足共用表单类型，控制工作流仍按输入图实际尺寸运行。
 * 数值从内置且受版本管理的模板读取，实际提交仍要经过统一有限性校验。
 * 每次返回新数组，避免一个草稿修改默认 LoRA 后污染另一个模式。
 * 起止比例保持零到一的原始单位，百分号只在界面展示时换算。
 * 这里不生成图片、不解析用户工作流，也不改写模块级 JSON。
 */
export function getAnimaControlDefaults(mode: 'edge' | 'inpaint'): AnimaEditSettings {
  const prompt: ComfyApiPrompt = mode === 'inpaint' ? maskTemplate : edgeTemplate;
  const sampler = single(prompt, 'KSampler')[1].inputs, apply = single(prompt, 'AnimaLLLiteApply')[1].inputs;
  const negative = sampler.negative as [string, number];
  return { instruction: '', negative: String(prompt[negative[0]].inputs.text), megapixels: 1, seed: String(sampler.seed), steps: Number(sampler.steps), cfg: Number(sampler.cfg), denoise: Number(sampler.denoise), samplerName: String(sampler.sampler_name), scheduler: String(sampler.scheduler), checkpointName: String(single(prompt, 'UNETLoader')[1].inputs.unet_name), loras: [], controlMode: mode, controlStrength: Number(apply.strength), controlStart: Number(apply.start_percent), controlEnd: Number(apply.end_percent) };
}

/**
 * 调用方先完成共享 AnimaEditSettings 参数校验，再进入此模板适配。
 * 图像文件名来自上传回包，离线导出则使用当前本地源文件名。
 * controlMode 缺省不会调用本函数，原文字改图仍由原构建器处理。
 * 模板中的示例提示词必须全部覆盖，不能夹带演示人物或历史编辑要求。
 * 图像尺寸仍由 GetImageSize 获取，蒙版不经过会改变 alpha 的画布重编码。
 * MP 参数属于旧参考链，新控制流保持模板的输入原尺寸，不偷偷缩放蒙版。
 * 标准构建器负责零个、一个及多个 LoRA 的串联和用户权重写入。
 * LoRA 节点放在 UNet 与 AnimaLLLiteApply 之间，控制节点必须实际影响采样。
 * 文本编码沿用新模板的 CLIP 配置，不混入旧编辑的 cosmos reference 节点。
 * PreviewImage 与分块解码沿用模板，结果仍进入正式保存与 Meta 写入。
 */
export function buildAnimaControlPrompt(value: AnimaEditSettings, imageName: string): ComfyApiPrompt {
  // 深拷贝断开模块级 JSON 引用，一次运行不能污染下次任务或另一个模式。
  // 蒙版流独有 MASK 连线；边缘流保持仅 IMAGE 输入，不能附加全图蒙版。
  // 标准图只作为参数与 LoRA 链来源，不把其输出节点复制到新流中。
  // 负面词允许为空，显式空串也应覆盖模板中的历史长文本。
  // seed 在共享校验后转换，确保仍是 JavaScript 安全整数。
  // UNet 路径保留用户选择，执行前再用服务端真实清单解析。
  // batch_size 在控制模板固定为一，批量由公共队列逐项调度。
  // 不把旧编辑 LoRA 作为隐藏必需项注入，实际列表完全来自 value.loras。
  // samplerName、scheduler 和 denoise 都由同一标准构建器处理。
  // 模板中的补丁名是默认依赖，允许服务端放在不同的唯一同名子目录。
  const prompt = getAnimaControlTemplate(value.controlMode === 'inpaint' ? 'inpaint' : 'edge');
  const base = buildImagePrompt("anima", { positivePrompt: value.instruction.trim(), negativePrompt: value.negative, checkpointName: value.checkpointName, loras: value.loras, seed: Number(value.seed), steps: value.steps, cfg: value.cfg, denoise: value.denoise, samplerName: value.samplerName, scheduler: value.scheduler });
  // 上传执行器固定覆盖 edit-source，先规范化模板的 LoadImage 身份。
  // 所有指向旧 LoadImage 的 IMAGE/MASK 引用都必须迁移，不能只改图像支路。
  // GetImageSize 仍取 IMAGE 输出零，蒙版始终取 LoadImage 输出一。
  // 原采样 latent 来自输入尺寸的 EmptyLatentImage，保留两个模板的设计。
  // source 的 RGB 与 alpha 必须同时来自这一份上传字节，禁止分别传不同图片。
  // 重命名只作用于节点引用数组，不替换提示词中的相同数字或字符串。
  // API link 的第零项是节点 ID；其第二项是输出索引，不能随名称变更。
  // 用户源文件名是普通输入值，不作为 URL 或本地绝对路径解析。
  const [sourceId, source] = single(prompt, "LoadImage"); delete prompt[sourceId]; prompt["edit-source"] = source; source.inputs.image = imageName;
  for (const node of Object.values(prompt)) for (const [key, input] of Object.entries(node.inputs)) if (Array.isArray(input) && input[0] === sourceId) node.inputs[key] = ["edit-source", input[1]];
  // 采样连线先保留模板的 positive/negative/model/latent_image，数值独立复制。
  // 标准图的节点 ID 不能直接替代新图的正负向编码节点 ID。
  // 数值字段为共享 builder 的实际输出，不重新维护另一组默认值。
  // 正反向文本通过 sampler 引用找到，避免按对象迭代顺序猜第一个编码节点。
  // 这两个模板没有拼接编码，因此引用均为单个 CLIPTextEncode 输出。
  // 所有输出仍沿模板 PreviewImage 返回，不新增可能混淆结果的预览节点。
  // 新图加载器原有 weight_dtype 保留，实际文件名则使用普通图片选择结果。
  // UNet 和 CLIP 属于不同资源，不能把 UNet 名写进文本编码器槽位。
  const [, sampler] = single(prompt, "KSampler"), [, baseSampler] = single(base, "KSampler");
  for (const field of ["seed", "steps", "cfg", "denoise", "sampler_name", "scheduler"]) sampler.inputs[field] = baseSampler.inputs[field];
  for (const field of ["positive", "negative"] as const) { const link = sampler.inputs[field] as [string, number]; prompt[link[0]].inputs.text = field === "positive" ? value.instruction.trim() : value.negative; }
  const [loaderId, loader] = single(prompt, "UNETLoader"), [baseId, baseLoader] = single(base, "UNETLoader"); loader.inputs.unet_name = baseLoader.inputs.unet_name;
  // 标准 LoRA ID 从 100 开始，与这两个固定模板的节点 ID 不重叠。
  // 复制前检查冲突，模板演进后不能静默覆盖控制节点或解码节点。
  // 链首原本指向标准 UNet，迁移为本图 UNet；后续 LoRA 引用保持顺序。
  // LoRA 节点独立克隆，修改控制图不可能改动标准构建器产出的参考对象。
  // 零 LoRA 时 baseSampler.model 直接指向 baseId，控制输入改接本图 loaderId。
  // 非零时最后一个 LoRA 的输出作为 Apply.model，KSampler.model 继续接 Apply。
  // 不绕过补丁节点直连 sampler，否则图片能生成但边缘或蒙版实际没有生效。
  // 补丁强度和起止比例来自可见表单；未提供的新字段兼容回退到模板原值。
  // 使用空值判断保留零强度和零结束点，不能用 truthy 回退改变用户输入。
  // 比例不做百分数二次换算，UI 与节点始终以零到一保存。
  // 调用入口已检查有限值、范围和起点不晚于终点。
  // 不自动调整时间区间或强度，提交对象必须能解释当前表单的实际结果。
  // 保持原 MASK、IMAGE、模型连线，调参不能绕过控制节点。
  // 返回前不做服务端存在性判断；调用方在上传前统一完成资源清单匹配。
  // 精确 prompt 会与输出 PNG 一起保存，方便后续确认真实模型与控制连线。
  for (const [id, node] of Object.entries(base).filter(([, item]) => item.class_type === "LoraLoaderModelOnly")) { if (prompt[id]) throw new Error("Anima control node ID collision"); prompt[id] = structuredClone(node); const link = prompt[id].inputs.model as [string, number]; if (link[0] === baseId) prompt[id].inputs.model = [loaderId, 0]; }
  const link = baseSampler.inputs.model as [string, number]; single(prompt, "AnimaLLLiteApply")[1].inputs.model = link[0] === baseId ? [loaderId, 0] : link;
  const apply = single(prompt, 'AnimaLLLiteApply')[1].inputs;
  apply.strength = value.controlStrength ?? apply.strength; apply.start_percent = value.controlStart ?? apply.start_percent; apply.end_percent = value.controlEnd ?? apply.end_percent;
  // 先完成控制连接，再改文件名，VAEEncode 与解码器仍共用原来的 VAE 链。
  // 不将控制图节点号传入中间图片图，否则会命中错误槽位或被校验拒绝。
  applyWorkflowAuxiliaryOverrides(prompt, value.modelOverrides);
  return prompt;
}
