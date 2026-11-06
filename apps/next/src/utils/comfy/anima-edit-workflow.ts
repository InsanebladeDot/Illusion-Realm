/**
 * Anima 文字改图构建器：在共用图片生成图上接入编辑参考链。
 * 复用 Anima 文生图构建器的 UNet、LoRA 链和采样参数，再附加参考图 latent 链。
 * 表单范围和构建校验共用同一组默认值，离线导出与实际提交采用同一构建函数。
 */
import template from "@/data/comfy/utillswWorkflower/AnimaEdit2.json";
import type { ComfyApiPrompt, ComfyModelLists } from "@/types/comfy";
import { t } from "@/i18n";
import { buildImagePrompt, getImageWorkflowDefaults, type LoraPromptItem } from "./imageWorkflow";
import { SAMPLERS, SCHEDULERS } from "@/data/createForm";
// 编辑草稿只存实际辅助文件覆盖，默认文件仍由当前模板提供。
// 类型不新增 IPC 字段，最终提交依旧是原有 ComfyUI API prompt。
import type { VideoModelOverrides } from './video-workflow-models';
// 控制图与透明蒙版使用用户提供的独立模板，普通文字改图仍保留参考 latent 链。
// 构建器共用参数校验，导出与队列执行不会走两套分支。
// 只有显式 controlMode 才选择新流，旧草稿缺字段时行为保持不变。
import { buildAnimaControlPrompt } from "./anima-control-workflow";
// 本模块保持纯数据变换，不上传、不读写磁盘，也不主动查询服务器。
// i18n 的非组件入口只在失败时读取当前语言，不引入 React 运行时状态。
// 默认模板位于产品数据目录，运行不依赖可能被清理的 docs 原型文件。
// 既有基础图片流仍保留原 JSON，编辑仅修改每次返回的独立对象。
// 导出和真正运行使用同一个函数，避免“导出能跑但页面提交缺参考链”。
// 模型列表类型来自共享契约，空列表与缺失字段均按不可用处理。
// 编辑链的自定义节点缺失由 ComfyUI 的工作流校验反馈，不能据模型存在断言节点已安装。
// 本地构建成功只表示结构和输入通过检查，不代表显存或真实生成质量满足要求。

// 这些参数全部有对应节点，不为当前工作流添加无效的宽、高或蒙版字段。
// Seed 使用十进制文本编辑，在提交边界再转换，避免输入过程被精度格式化打断。
// 降噪与 LoRA 默认值来自原流，不能套用文生图的默认值。
// megapixels 表示百万像素，节点仍按原图比例缩放并对齐到八像素步进。
// edge 只消费已检测的边缘图；inpaint 消费保留 RGB 的透明通道 PNG。
// 模式属于提交快照，切换页面不改变正在排队的工作流。
// undefined 表示原文字改图，不能默认开启会影响历史结果的新控制链。
// controlStrength 为补丁权重，零表示显式关闭；仅控制模式消费该字段。
// controlStart/controlEnd 是零到一的采样进度，允许两端相等但不得倒置。
// 可选字段兼容旧快照，缺字段时构建器保留其对应模板默认值。
// 辅助覆盖是可选字段，旧图片快照没有该字段也能按原默认值恢复。
// 覆盖内容按节点身份保存，不通过主模型显示名反推 CLIP 或 VAE。
// 文字编辑用图片图的节点号，控制编辑会提前进入独立构建分支。
// 因此控制图覆盖不会先撞上中间基础图里的同名数字 id。
// 导出 API 图与实际队列调用同一构建器，设置不应只在界面看起来生效。
// 这不是跨进程新消息格式，Electron 接收的仍是已组装完成的 API 图。
export interface AnimaEditSettings { instruction: string; negative: string; megapixels: number; seed: string; steps: number; cfg: number; denoise: number; samplerName: string; scheduler: string; checkpointName: string; loras: LoraPromptItem[]; controlMode?: "edge" | "inpaint"; controlStrength?: number; controlStart?: number; controlEnd?: number; modelOverrides?: VideoModelOverrides }
export const ANIMA_EDIT_LORA = template["245"].inputs.lora_name;
// 模板仅作为编辑默认值来源，不把其中历史指令与图片文件名带入新任务。
// 用户进入页面时指令为空，避免把示例中的人物修改要求意外提交。
// 负面词允许为空，编辑任务不强制套用普通文生图的长负面词。
// 采样器和调度器从共享文生图默认值读取，菜单与实际初值一致。
// 保留编辑示例的步数与 CFG，用户仍可在高级设置覆盖它们。
// 默认 seed 处于 JavaScript 安全整数范围，不能使用有精度损失的整数。
// UNet 默认路径与图片流一致，允许通过标准资源选择器换成其他版本。
// LoRA 数组的顺序具有语义，后续节点按这个顺序串联。
// 预载编辑 LoRA 不属于强制依赖，用户删除后允许空数组继续构建。
// 类型只描述输入快照，不能在构建器内部反向修改页面状态。
const IMAGE_DEFAULTS = getImageWorkflowDefaults("anima");
export const ANIMA_EDIT_DEFAULTS: AnimaEditSettings = { instruction: "", negative: "", megapixels: template["296"].inputs.megapixels, seed: String(template["254"].inputs.seed), steps: template["254"].inputs.steps, cfg: template["254"].inputs.cfg, denoise: template["254"].inputs.denoise, samplerName: IMAGE_DEFAULTS.samplerName, scheduler: IMAGE_DEFAULTS.scheduler, checkpointName: template["236:3"].inputs.unet_name, loras: [{ name: ANIMA_EDIT_LORA, strength: 1 }] };

/**
 * 输入检查同样用于离线导出，不能只依赖表单的 min/max 属性。
 * 指令不能为空，负面词允许为空，两者都限制为三千个字符。
 * 种子必须是非负安全整数；不接受指数、负数或含小数的字符串。
 * 采样步数限定整数，其余数值先检查有限性，再检查范围。
 * MP 是离散选项，不允许导入状态绕过下拉传入任意缩放倍率。
 * 校验失败直接抛出已翻译错误，调用方负责在表单中展示。
 */
export function validateAnimaEdit(value: AnimaEditSettings): void {
  // 数字校验在构建入口集中执行，避免运行与导出采用不同的合法范围。
  // NaN 与 Infinity 不能参与 ComfyUI JSON 参数，先于网络访问拒绝。
  // 步数不能带小数；滑条之外的状态恢复也必须满足这个条件。
  // CFG 的零值有效，不能用 truthy 默认值把零变成模板值。
  // denoise 的零与一均保留，端点含义交由标准 KSampler 解释。
  // 指令先 trim 判空，但三千字符上限按原输入检查，空格也占用长度。
  // 负面词独立限长，不能利用第二个文本字段绕过同一输入边界。
  // seed 仅接受十进制数字；指数形式即使 Number 可解析也不接受。
  // 安全整数限制同时排除超出 JS 精度的长字符串。
  // MP 使用有限离散列表，保证缩放预算在用户界面能够解释。
  // LoRA 的权重允许负数，不能把标准扩展的负向作用错误夹成零。
  // 采样枚举直接使用共享数据表，新增采样器时不维护另一份白名单。
  const ranges = [[value.steps, 1, 100], [value.cfg, 0, 30], [value.denoise, 0, 1]];
  // 控制时间仅在控制模式校验，原文字编辑不消费这些可选字段。
  // 兼容旧草稿时采用模板的一、零、一，不把显式零值当作缺失。
  // 有限性检查同时拒绝 NaN 和 Infinity，不能让 JSON 序列化成 null。
  // 强度允许零到十，保留较强控制的调参空间，不将其误当成百分比。
  // 起止范围独立限制零到一；倒序则拒绝提交，不静默交换用户意图。
  // 相同端点合法，用于关闭一个持续区间；由实际节点解释其采样行为。
  // 构建和导出共用检查，不能通过离线导出绕过 UI 的交互限制。
  // 此错误复用参数校验词条，不向页面暴露模板内部节点编号。
  if (value.controlMode) { const start = value.controlStart ?? 0, end = value.controlEnd ?? 1; ranges.push([value.controlStrength ?? 1, 0, 10], [start, 0, 1], [end, 0, 1]); if (start > end) throw new Error(t('create.animaEdit.invalidParameters')); }
  if (!value.instruction.trim() || value.instruction.length > 3000 || value.negative.length > 3000) throw new Error(t("create.animaEdit.invalidInstruction"));
  if (!/^\d+$/.test(value.seed) || !Number.isSafeInteger(Number(value.seed))) throw new Error(t("create.animaEdit.invalidSeed"));
  if (!SAMPLERS.some((item) => item.value === value.samplerName) || !SCHEDULERS.some((item) => item.value === value.scheduler) || value.loras.some((item) => !item.name || !Number.isFinite(item.strength) || Math.abs(item.strength) > 5)) throw new Error(t("create.animaEdit.invalidParameters"));
  if (!Number.isInteger(value.steps) || ![0.5, 1, 1.5, 2].includes(value.megapixels) || ranges.some(([number, min, max]) => !Number.isFinite(number) || number < min || number > max)) throw new Error(t("create.animaEdit.invalidParameters"));
}

/**
 * 每次运行生成新对象，禁止共享 JSON 被一次用户操作永久修改。
 * 文件名由真实上传回包提供，离线导出则引用本地文件名。
 * 用户选择的全部 LoRA 先由图片构建器串联，再由参考节点包裹其最终模型输出。
 * 没有 LoRA 时从 UNet 直接进入参考节点，不能跳过参考节点直连采样器。
 * CLIP 的 cosmos 类型遵循编辑参考流，加载文件仍使用图片流的同一来源。
 * 正向和反向文本分别绑定到两个 CLIP 编码节点，不能互相覆盖。
 * 参考编码复用图片解码所用的 VAE，避免两个编码空间不一致。
 * 不引入原示例的拼接节点，输出沿用图片生成流的单张解码预览。
 * 保留文生图解码与预览连接，前端无需猜测裁切。
 * 去掉不再使用的空 latent 节点，导出的仍是 API prompt 格式。
 * 输出连接也写进 PNG prompt 块，保证提交与保存的数据一致。
 */
export function buildAnimaEditPrompt(value: AnimaEditSettings, imageName: string): ComfyApiPrompt {
  // 新控制链不叠加旧的参考 latent，蒙版和边缘图各自按模板连接。
  // 共用入口确保离线导出、入队前校验和实际提交采用完全相同的参数。
  // 构建前仍拒绝非法 seed、空指令、超范围权重和采样值。
  if (value.controlMode) { validateAnimaEdit(value); return buildAnimaControlPrompt(value, imageName); }
  validateAnimaEdit(value);
  // 这里实际调用图片构建器，不能复制其当前生成结果再各自维护两份实现。
  // 图片构建器负责正反向文本、主模型路径、LoRA 链及标准采样字段。
  // 本层只负责参考图所需的输入差异，不接管常规模型选择行为。
  // 每次构建都由共享实现深克隆基础图，旧任务与导出对象不会相互污染。
  // 用户不选择任何扩展时，基础图已移除模板 LoRA，参考模型从 UNet 接入。
  // 查询 class_type 而非采样节点数字 ID，使模板改编号不影响参考链定位。
  // 解码节点同时兼容普通和分块 VAE 解码，沿用图片流的显存策略。
  // sampler 与 decoder 属于受版本控制的基础图不变量，由集成冒烟覆盖。
  // 文字编辑沿用图片加载槽，覆盖与参考编码共用同一 CLIP/VAE 来源。
  // 控制模式已在前面分支处理，不将其不同的节点号交给图片构建器。
  const prompt = buildImagePrompt("anima", { positivePrompt: value.instruction.trim(), negativePrompt: value.negative, checkpointName: value.checkpointName, loras: value.loras, seed: Number(value.seed), steps: value.steps, cfg: value.cfg, denoise: value.denoise, samplerName: value.samplerName, scheduler: value.scheduler, modelOverrides: value.modelOverrides });
  const sampler = Object.values(prompt).find((node) => node.class_type === "KSampler")!;
  const decoder = Object.values(prompt).find((node) => node.class_type === "VAEDecode" || node.class_type === "VAEDecodeTiled")!;
  // edit- 前缀与基础图的数字节点不相撞，也不会占用用户 LoRA 的 100 起始编号。
  // LoadImage 引用 ComfyUI input 文件名，不传浏览器 blob URL 或本机绝对路径。
  // 图像缩放保留比例，由 MP 决定像素预算；八像素步进与编辑模板一致。
  // VAEEncode 和最终 decoder 使用同一 VAE 链接，编码与解码空间不能不同。
  // 参考 latent 同时送给参考模型补丁和采样器初始 latent。
  // ref_latents.ref_latent_1 是自定义节点的字面输入名，不能展开成嵌套对象。
  // 参考节点取得当前 sampler.model，因此无论 LoRA 数量多少都接在链尾。
  // 先读取原 model 链接再替换 sampler 输入，避免误连到参考节点自身。
  // 指令编码仍走基础图的 CLIPTextEncode，不创建重复的正反向编码。
  // 原编辑例的拼接输出不是本产品结果，保持纯解码图供保存与预览使用。
  prompt["edit-source"] = { class_type: "LoadImage", inputs: { image: imageName } };
  prompt["edit-scale"] = { class_type: "ImageScaleToTotalPixels", inputs: { upscale_method: "lanczos", megapixels: value.megapixels, resolution_steps: 8, image: ["edit-source", 0] } };
  prompt["edit-encode"] = { class_type: "VAEEncode", inputs: { pixels: ["edit-scale", 0], vae: decoder.inputs.vae } };
  prompt["edit-reference"] = { class_type: "ApplyCosmosReferenceLatent", inputs: { model: sampler.inputs.model, "ref_latents.ref_latent_1": ["edit-encode", 0] } };
  sampler.inputs.model = ["edit-reference", 0]; sampler.inputs.latent_image = ["edit-encode", 0];
  // 参考编码已替代空 latent，删除孤立节点以免导出时误读为固定宽高生效。
  // CLIPLoader 的 cosmos 类型与提供的编辑参考图一致，文件名不随类型变化。
  // 不修改共享 JSON 本身，普通图片模式仍保留其原有 CLIP 配置。
  // 提交者会在上传成功后覆盖 image 字段，离线导出保留传入的本地文件名。
  // 返回的是 API prompt，不包含可视化画布坐标，不能承诺等同 UI workflow 格式。
  for (const [id, node] of Object.entries(prompt)) { if (node.class_type === "EmptyLatentImage") delete prompt[id]; if (node.class_type === "CLIPLoader") node.inputs.type = "cosmos"; }
  return prompt;
}

/**
 * 安装路径允许与模板不同，但只在服务端存在唯一同名文件时自动匹配。
 * 优先使用完整路径精确匹配，再尝试 basename 唯一匹配。
 * 统一路径分隔符和大小写，仅用于比较，不改写服务端返回的真实名称。
 * 同名文件位于多个目录时拒绝猜测，提示用户整理模型或修正安装路径。
 * 缺失列表也按前置条件失败处理，不能上传图片后才发现所选模型不存在。
 * 不把 SDXL checkpoint 错当成 Anima diffusion model。
 * LoRA 仅映射 strength_model，工作流没有 CLIP 强度输入。
 * 服务端检查在用户运行时触发，进入页面不自动联网。
 */
export function resolveAnimaEditModels(prompt: ComfyApiPrompt, lists: ComfyModelLists): void {
  // 类型决定可用列表，不能在所有模型文件里跨类别寻找一个相同 basename。
  // Anima 的主模型必须来自 diffusionModels，不回落到 checkpoints。
  // 每个用户扩展都独立匹配，不能只检查预载的编辑 LoRA。
  // 只枚举当前图实际存在的加载器，移除的 LoRA 不再造成缺模型报错。
  // 此函数原地解析本次新建的图，便于 PNG 保存复用精确提交对象。
  // 补丁使用独立类别，缺失或歧义同样在上传前拒绝。
  // 服务端旧桥没有 modelPatches 时视为空，不假装模板资源已安装。
  // 相对路径优先精确匹配，跨目录唯一 basename 才可回退。
  const definitions = { UNETLoader: ["unet_name", lists.diffusionModels], CLIPLoader: ["clip_name", lists.clips], VAELoader: ["vae_name", lists.vaes], LoraLoaderModelOnly: ["lora_name", lists.loras], ModelPatchLoader: ["name", lists.modelPatches] } as const;
  const slots = Object.entries(prompt).flatMap(([id, node]) => { const slot = definitions[node.class_type as keyof typeof definitions]; return slot ? [[id, ...slot] as const] : []; });
  const key = (name: string) => name.replace(/\\/g, "/").toLowerCase();
  for (const [id, field, available] of slots) {
    // 优先完整路径匹配；目录里还有其他同名文件时精确选择仍应生效。
    // basename 回退只接受一个候选，多个同名文件时不能默认选第一个。
    // 服务端真实路径原样写回，比较时的大小写归一不改变最终文件名。
    // 不存在和歧义使用同一可读提示，用户可通过选择具体路径消除问题。
    // 错误只展示文件名，避免把用户完整本地模型目录附加到界面提示。
    // 一旦有加载器失败即终止，此时执行器尚未上传任何原图字节。
    // 重试会重新构建并重新读取实时列表，不复用上次部分解析过的图。
    const original = String(prompt[id].inputs[field]), names = available ?? [];
    const exact = names.find((name) => key(name) === key(original));
    const matches = names.filter((name) => key(name).split("/").pop() === key(original).split("/").pop());
    if (!exact && matches.length !== 1) throw new Error(t("create.animaEdit.modelMissing", { name: original.split(/[/\\]/).pop() ?? original }));
    prompt[id].inputs[field] = exact ?? matches[0];
  }
}
