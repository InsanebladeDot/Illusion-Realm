/**
 * 编辑资源快速加载：读取图片模式草稿或原图内嵌工作流，解析成原选择器的 id。
 * 共用图片元数据解析器；本模块只返回经过完整校验的模型与 LoRA，不提交生成。
 * 所有文件必须能唯一映射到本地扫描结果，任何缺失都拒绝整次应用。
 * 不按画面外观猜测模型，也不下载图片中提到的未知资源。
 * 图片中的参数始终作为不可信输入读取，只解析已存在的 JSON 结构。
 * 原图字节不会发送给外部识别服务，解析失败也不尝试联网补全。
 * 资源映射与写入分离，任何读取错误都不会留下部分修改。
 * 不修改图片文件内容或其版本标记，旧图兼容逻辑仍由公共解析器维护。
 * 返回值只包含选择器需要的资源身份，不包含原始工作流节点对象。
 * 内嵌图片模型必须在当前本地扫描中可用，不能凭文件名制造已安装状态。
 * 当前入口支持标准 ComfyUI UNETLoader，不声称支持任意第三方加载器。
 * UNet 类型校验无法证明权重架构，真实模型与编辑 LoRA 的兼容性仍需实际运行确认。
 * 后续运行还会对服务端模型列表做检查，本地解析不代替远端存在性校验。
 * 用户可以在快速加载后使用原模型卡片、扩展列表继续修改资源。
 * 采样参数不从原图回填，保持本次编辑指令与降噪设置的语义独立。
 * 不生成新持久化格式，也不改变图片二创现有的参数读取约定。
 * 资源读取失败不会清除已生成结果，调用者仍能下载之前成功保存的图片。
 */
import { t } from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useImageResourceStore } from "@/stores/use-image-resource-store";
import { filterAndSortExtensions } from "@/data/extensions";
import { buildGenerateParams } from "@/utils/comfy/buildGenerateParams";
import { inspectSdImageBuffer } from "@/utils/sdImageInspector/inspectSdImage";
import { parseComfyWorkflow, resolveComfyWorkflowFromInspect } from "@/utils/sdImageInspector/parseComfyWorkflow";
import { isMetaVersionSupported } from "@/utils/sdImageInspector/metaMarker";
import { makeLocalCheckpointId, makeLocalLoraId, parseLocalLoraId } from "@/utils/localModelResources";
import { clampExtensionWeight } from "@/utils/extensionWeight";
import type { SelectedModel } from "@/types/model";
import type { SelectedExtension } from "@/types/extension";
import type { LocalModel } from "@/types/localModel";
// 历史解析器只要求至少一个节点合法，快速加载另用共享 schema 校验整个节点字典。
// 混入 null 或非节点字段的 JSON 不应进入模型遍历，也不能暴露底层 TypeError。
// 此 schema 与生成 IPC 同源，不为图片参数维护第二套节点结构规则。
import { ComfyApiPromptSchema } from "@illusion-realm/shared";

// 这是资源补丁，不携带提示词、种子、尺寸或生成结果。
// 调用者必须一次应用两项，不能在 LoRA 校验失败后留下半更新的主模型。
// 资源 id 保持公共选择器契约，导出与实际生成沿用原参数组装器。
// 文件名只在错误提示展示，不把任意路径或异常堆栈写入控制台。
export interface EditResources { selectedModel: SelectedModel; extensions: SelectedExtension[] }
// Windows 路径大小写与分隔符归一仅用于比较，返回的真实路径不能被改写。
// 不删除目录段：同名文件的子目录仍是区分实际版本的重要依据。
// basename 只作为最后的唯一性回退，不代表同名文件一定相同。
const key = (value: string) => value.replace(/\\/g, "/").toLowerCase();
const base = (value: string) => key(value).split("/").pop();

/**
 * 完整路径优先，其次完整相对路径后缀，最后唯一 basename。
 * 精确匹配成功时允许目录内存在其他同名版本；模糊候选多个时必须拒绝。
 * 只在指定类型中匹配，不允许 LoRA 名称命中 UNet 或反向命中。
 * 同一路径可能因分类扫描重复出现，先按真实路径去重再判断歧义。
 * 返回模型组与版本路径，避免从显示标签重建版本 id。
 * 精确匹配先于 basename，两个不同文件夹中的同名模型不会抢占正确路径。
 * 原图记录相对路径时允许当前安装根目录不同，但子目录身份仍优先。
 * 只剩文件名时要求全扫描结果唯一，不能以列表顺序决定用户实际加载哪个文件。
 * 全路径重复项的模型组只影响展示分组，版本文件身份仍以路径为准。
 * 模型名称不含可执行表达式，整个匹配过程只有字符串比较。
 * 不读取 safetensors 头或计算哈希，名称匹配不能被描述成模型内容鉴定。
 * 不使用目录末尾的模糊包含，严格路径分段避免扩展名相近时误命中。
 * 匹配失败与存在歧义共用明确提示，用户均可通过手动选择消除问题。
 */
function matchResource(name: string, type: LocalModel["type"]) {
  // 本地资源来自设置页已有扫描结果，不在解析原图时再次遍历磁盘。
  // 精确列表与后缀列表分开，防止一个准确全路径被模糊候选遮住。
  // 后缀必须以斜线分段，a.safetensors 不能匹配 ba.safetensors。
  // 模型组路径与文件路径分别保留，用于原主模型选择器的两个 id。
  // Map 去重不合并不同文件，只去掉扫描器重复列出的同一路径。
  const entries = useSettingsStore.getState().models.filter((m) => m.type === type).flatMap((m) => m.versions.map((v) => ({ modelId: makeLocalCheckpointId(m.filePath), versionId: v.filePath })));
  const unique = [...new Map(entries.map((v) => [key(v.versionId), v])).values()];
  // 空名称不能回落到扫描列表首项，元数据无模型时明确失败。
  // 多个相对路径后缀同样不能取第一个，必须让用户手动选择。
  // 这里的错误不修改编辑 store，调用者可以保留全部现有资源。
  // basename 提示避免在常驻 UI 暴露扫描目录的完整绝对路径。
  const exact = unique.filter((v) => key(v.versionId) === key(name));
  const suffix = unique.filter((v) => key(v.versionId).endsWith(`/${key(name)}`));
  const matches = exact.length ? exact : suffix.length ? suffix : unique.filter((v) => base(v.versionId) === base(name));
  if (!name || matches.length !== 1) throw new Error(t("create.animaEdit.resourceMissing", { name: base(name) ?? name }));
  return matches[0];
}

/**
 * 两个入口共享最终校验，读取成功不等于当前编辑工作流可以使用。
 * 主模型必须是已扫描的真实版本，示例卡片 id 不能被当成已安装文件。
 * LoRA 必须属于 Anima 选择器可见列表，避免跨系列偷偷加入不兼容扩展。
 * buildGenerateParams 继续负责模型目录边界检查和权重归一。
 * 显式固定 seed 仅为资源校验，不能消耗或修改用户的随机种子状态。
 * series 固定为 anima，不能依靠原图提示词或名称自动切换编辑工作流。
 * 设置中配置的 diffusionModelsPath 是主模型目录边界的事实来源。
 * 主模型组相同而版本不同仍需验证该文件存在于该组的版本列表。
 * 扩展以版本 id 校验，不能因为同分类里有一个可用文件就放行整个分类。
 * 权重继续沿用公共范围，不因来自原图而绕过手动输入的约束。
 * 一项失败即整体抛错，调用者无需回滚先前已经写入的字段。
 * 默认编辑回退 LoRA 属于已有选择的保留策略，不伪装成扫描成功的新资源。
 * 校验不发起磁盘扫描，用户更新目录后可通过设置页既有扫描流程重试。
 * 本模块只读设置状态，校验不会更改当前模型系列或路径设置。
 * 不填入宽高与 batchSize，加载资源不应意外重设编辑输出分辨率。
 */
function validateResources(value: EditResources): EditResources {
  // 设置在实际应用前读取，目录变化不会继续使用打开编辑页时的旧快照。
  // 模型组和版本同时校验，防止版本已被移走后组装器静默回落默认 UNet。
  // 扩展列表来自同一个 filterAndSortExtensions，与手动添加入口完全一致。
  // 已选编辑 LoRA 的保留在校验之后处理，不要求未扫描的模板回退项参与匹配。
  // 因此普通图片模式不能通过同步把伪造 local-lora id 注入编辑表单。
  const { models, paths } = useSettingsStore.getState();
  const model = models.find((m) => makeLocalCheckpointId(m.filePath) === value.selectedModel.modelId && m.type === "checkpoint" && m.versions.some((v) => v.filePath === value.selectedModel.versionId));
  const allowed = new Set(filterAndSortExtensions("", models, paths, null, "anima").flatMap((r) => r.versions?.map((v) => v.id) ?? []));
  // 不做部分成功：一个扩展不可用时，主模型也维持原选择。
  // 系列校验依据设置目录与公共资源过滤，不依据封面或文件名中的 anima 字样。
  // 返回独立对象，后续图片模式修改行权重不会影响本次加载结果。
  // 克隆的数组保持源顺序，LoRA 链不会因展示名称排序改变语义。
  if (!model || value.extensions.some((v) => !allowed.has(v.extensionId))) throw new Error(t("create.animaEdit.resourceUnavailable"));
  buildGenerateParams({ positivePrompt: "", negativePrompt: "", seed: 0, selectedModel: value.selectedModel, selectedExtensions: value.extensions, localModels: models, paths, series: "anima" });
  return { selectedModel: { ...value.selectedModel }, extensions: value.extensions.map((v) => ({ ...v })) };
}

/**
 * 点击同步才读取图片草稿，不在模型变化时自动联动编辑。
 * SDXL 模式明确拒绝，不能把 checkpoint 放进 Anima 的 UNet 槽位。
 * 同步只复制资源，普通图片模式的负面词和采样参数不覆盖编辑设置。
 * 失败通过异常返回用户提示，函数本身没有 store 写入副作用。
 * 源草稿为空扩展时会清除编辑页原风格扩展，只有显式编辑项按保留规则处理。
 * 不把 SDXL 的选择转换为同名 UNet，文件名相同并不能证明模型架构一致。
 * 默认演示模型被拒绝后，用户仍可进入图片模式选择实际本地模型重试。
 * 同步不会回填图片模式正在编辑的正向词，避免覆盖用户已经写好的修改指令。
 * 入口不读取图片模式的结果图，因此没有原图文件也能先准备编辑模型。
 * 每次同步重新生成独立行对象，不复用前一次加载得到的可变数组。
 */
export function resourcesFromImageMode(): EditResources {
  // 读取 getState 的最新值，与当前生成按钮使用的数据源一致。
  // 资源可能已随扫描更新失效，因此每次点击仍需重新校验。
  // 不在这里调用图片模式 setter，编辑加载永远不会反写来源。
  // 空 LoRA 列表是有效选择，可用于替换编辑页额外的风格资源。
  const current = useImageResourceStore.getState();
  if (current.seriesId !== "anima") throw new Error(t("create.animaEdit.animaOnly"));
  return validateResources({ selectedModel: current.selectedModel, extensions: current.selectedExtensions });
}

/**
 * 使用用户已导入的 File 字节，复用本地解析对 PNG/JPEG/WebP 文本的读取。
 * 保留独立版本标记，不走会丢弃 metaVersion 的历史上传适配器。
 * 无内嵌工作流时明确提示，不把画面视觉推断描述成真实模型来源。
 * 多个主模型加载器的工作流不尝试猜测用户想要哪一条分支。
 * UNet 工作流仍须通过本地目录校验；标准 checkpoint 工作流明确拒绝。
 * 仅读取文本元数据，因此不把原图转为 data URL 做额外隐写/像素推断。
 * JPG 与 WebP 是否可读取决于其实际保留的文本块，不取决于扩展名。
 * 图片被转码或网站移除参数后可能无法恢复，失败时由用户手动选择资源。
 * 独立标记只用于格式兼容，不把其中 promptId 当作模型参数来源。
 * 未提供隐写像素输入是本入口的范围约束，不修改原本本地解析页的能力。
 * 不读取旁车 JSON，避免原图与同名外部文件内容不一致造成错误回填。
 * 原始工作流仍交给公共 unwrap 校验，不直接将任意 JSON 断言为节点字典。
 * 多加载器拒绝是保守策略，避免从多分支工作流的非生成分支挑到错误模型。
 * LoRA 原始名称仅用于本地版本匹配，显示名称不会代替真实文件名。
 * 缺少强度时沿用公共解析器的默认一，零强度仍然保留为零。
 * 没有 LoRA 的工作流返回有效空列表，不将“无扩展”误报为“无模型参数”。
 */
export async function resourcesFromEditImage(file: File): Promise<EditResources> {
  // 原 File 在导入时已经过图片格式、字节数和像素限制。
  // inspectSdImageBuffer 只做浏览器本地读取，不需要 Electron 文件权限或 ComfyUI。
  // 版本校验先于字段解析，未来格式不能被误当作当前版本加载。
  // 未标记的旧图继续由原解析器按当前兼容版本推理。
  const inspected = await inspectSdImageBuffer(await file.arrayBuffer(), file.type, file.name, null);
  if (!isMetaVersionSupported(inspected.metaVersion ?? 1)) throw new Error(t("create.animaEdit.metaUnsupported"));
  const resolved = resolveComfyWorkflowFromInspect(inspected);
  if (!resolved) throw new Error(t("create.animaEdit.noModelMetadata"));
  // 元数据是外部输入，不能因为其中一个节点合法就相信其余节点都合法。
  // shared schema 失败映射为可读参数提示，不向用户输出 Zod 原始校验详情。
  // 校验只验证形状，不执行节点或调用模型接口。
  if (!ComfyApiPromptSchema.safeParse(resolved.workflow).success) throw new Error(t("create.animaEdit.noModelMetadata"));
  // 结构检查与原解析器分工：此处只保证单个 UNet 来源，不重新实现节点字段提取。
  // 本入口暂不接收 A1111 文本模型名称，其 checkpoint 类型不满足编辑工作流。
  // 多加载器包含未使用分支时仍拒绝，宁可保留手动入口也不悄悄选错模型。
  // parsed.loras 保留解析器顺序与每项原始强度，权重再沿用公共夹取规则。
  const nodes = Object.values(resolved.workflow), loaders = nodes.filter((n) => n.class_type === "UNETLoader");
  if (loaders.length !== 1 || nodes.some((n) => n.class_type.startsWith("CheckpointLoader"))) throw new Error(t("create.animaEdit.animaOnly"));
  const parsed = parseComfyWorkflow(resolved.workflow), selectedModel = matchResource(parsed.checkpointRaw ?? "", "checkpoint");
  const extensions = parsed.loras.map((v) => ({ extensionId: makeLocalLoraId(matchResource(v.rawName, "lora").versionId), weight: clampExtensionWeight(v.strengthModel ?? 1) }));
  return validateResources({ selectedModel, extensions });
}

/**
 * 保留当前显式选中的编辑 LoRA，其他风格 LoRA 用来源列表替换。
 * 用户已删除编辑 LoRA 时不补回，避免快速加载撤销用户明确选择。
 * 来源自身带编辑 LoRA 时采用来源权重，不再叠加当前同名版本。
 * 同一路径版本按 id 去重，行顺序保持第一次出现的位置。
 * 仅已知编辑文件名用于保留策略，不用于识别任意普通 LoRA 的真实身份。
 * 保留的是用户当前可见列表，不是模板里不可见的固定注入项。
 * 当前编辑项被调成零权重时同样保留，不能悄悄恢复成默认强度一。
 * 来源已有编辑项时来源权重优先，让用户能直接复用原图已记录的编辑设置。
 * 其他旧扩展不会累加，反复点击同一入口不会不断增长模型链。
 * 没有编辑项时返回值完全由来源决定，用户删除默认项的动作持续有效。
 * 保留项置于来源风格链之前，与编辑器最初预载后追加风格的顺序一致。
 * 结果仍供同一个 SelectedExtensions 渲染，删除与滑条操作无需另一套实现。
 * 数组去重不做强度求和，重复输入不能把同一 LoRA 强度意外翻倍。
 */
export function mergeEditResources(incoming: SelectedExtension[], current: SelectedExtension[]): SelectedExtension[] {
  // 默认项可能是未扫描的模板相对路径，也可能是实际扫描绝对路径。
  // 按固定编辑文件名识别这项能力，不能把整个旧风格列表全部保留下来。
  // incoming 带编辑资源时仅用 incoming，防止默认回退和真实版本同时注入。
  // 最终 Map 只去重相同 id，不合并两个不同路径的普通同名文件。
  // 新数组与新行断开来源引用，之后的公共权重控件可以独立修改。
  const isEdit = (v: SelectedExtension) => base(parseLocalLoraId(v.extensionId) ?? "") === "animeeditv2.safetensors";
  const kept = incoming.some(isEdit) ? [] : current.filter(isEdit);
  return [...new Map([...kept, ...incoming].map((v) => [v.extensionId, { ...v }])).values()];
}
