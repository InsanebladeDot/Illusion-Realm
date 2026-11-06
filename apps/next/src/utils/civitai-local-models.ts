/**
 * 在线模型标记：先精确比较目录标题与文件前缀，再使用已有来源 JSON 的完整摘要。
 * 类比先核对书架名和书名，两项对不上才查资料卡上的指纹，不能见到同名书就认定拥有。
 * 只消费扫描结果和小型 JSON 的读取结果，本模块不读取权重、不联网也不计算哈希。
 * 名称证据与摘要证据保持不同返回值，界面不能将同名说成内容已经校验一致。
 * 名称路径不证明内容一致：用户可能在原文件名下手动替换过权重。
 * 摘要路径也只证明上次保存的记录一致，外部覆盖文件后应由用户显式补全更新记录。
 * 两种证据都不表示主模型与 LoRA 架构兼容，生成兼容性仍由原生成链判断。
 * 检查范围限定在应用已配置且扫描到的模型，不能据此断言整块硬盘没有这个文件。
 */
import type { LocalModel } from "@/types/localModel";
import type { CivitaiModel } from "@/utils/civitai";
import type { SettingsPaths } from "@/types/settings";
// 元数据类型来自已有共享读取契约，不扩展扫描器或另开一个文件读取接口。
// ready 代表来源格式可读取，缺少或损坏的来源不能贡献摘要证据。
import type { LocalModelMetadataEntry } from "@illusion-realm/shared";

// name 只说明严格同名；sha256 说明保存过的摘要与远端相同，不表示本轮重算过权重。
// null 是未找到证据，不能用空字符串或远端缺省摘要意外匹配另一个空值。
export type CivitaiLocalMatch = "name" | "sha256" | null;

/**
 * 仅去掉已识别的权重后缀，保留版本、精度、空格、大小写和标点。
 * foo_v1 与 foo_v10 不相同，foo.fp16 也不能误认为 foo。
 * 路径仅取最后一段用于展示名比较，操作文件身份仍由完整路径保留。
 * Windows 与斜杠路径采用同一规则，不导入 Node 的 path 到渲染层。
 * 只移除最后一个已知扩展名，因此 foo.v2.safetensors 仍保留版本段 .v2。
 * 下载扩展名与主干是不同概念，同一个主干采用不同权重后缀仍走名称提示。
 * 不使用浏览器 URL 解码，文件名里的百分号可能是实际字符而非转义。
 * @param pathValue 扫描结果的文件路径或接口返回的文件名。
 */
function modelFileStem(pathValue: string): string {
  return (pathValue.split(/[/\\]/).pop() || "").replace(/\.(safetensors|ckpt|pt|pth|gguf)$/i, "");
}

/**
 * 名称必须是“实际文件夹末段、实际文件前缀”这一对，不单独收集所有文件名。
 * JSON 编码二元组，避免名字本身含分隔符时，两个不同的组合产生相同键。
 * 文件前缀来自 version.filePath，version.name 常是显示别名，不能拿来做严格匹配。
 * model.name 也可能经过自定义展示，所以目录标题从真实 filePath 提取。
 * 同一目录多版本分别登记，不能借另一个版本的同名文件满足当前文件条件。
 * 目录尾部斜杠先去掉，避免正常的路径写法导致末段错误变成空字符串。
 * 这是纯字符串索引，模型数量增多也不会在此访问磁盘或读取模型字节。
 * 上层分类目录不参与名称条件，用户把同一个模型移到另一个系列子目录不影响标题比较。
 * 不读取自定义别名作为文件夹名，改界面显示名称不该改变磁盘文件的匹配证据。
 * 不做 Unicode 归一化，视觉相似的全角、半角或组合字符不能替代逐字一致。
 * 同名二元组重复出现只保留一份；角标回答“有没有”，不负责统计本地副本数量。
 * @param models 设置中已有的目录分组与版本，不能把线上标题写回这些记录。
 */
export function localModelNamePairs(models: LocalModel[]): Set<string> {
  return new Set(models.flatMap(model => {
    const folder = model.filePath.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "";
    return model.versions.map(version => JSON.stringify([folder, modelFileStem(version.filePath)]));
  }));
}

/**
 * 严格名称分支要求同一远端模型的标题和某个文件前缀同时命中同一本地记录。
 * 不做包含、startsWith、去标点或模糊匹配，防止相似名字误报。
 * 不用基础模型系列或 C站版本名称代替标题，两者不是本地模型文件夹名。
 * 没有返回文件的远端模型不满足此分支，即使标题与某个目录完全相同。
 * 名称条件满足不要求 JSON 已有摘要，保留用户确认的低成本同名提示。
 * 只要求某个已返回版本命中，不要求首版本命中；旧版已下载也属于本地已有对应项。
 * 不把远端版本展示名当文件主干，作者可以让版本名和下载文件名完全不同。
 * @param model 来自现有 Civitai 解析器的模型，文件身份以版本下的 files 为准。
 * @param names 由本地目录和文件前缀构成的精确二元组集合。
 */
export function hasLocalCivitaiName(model: CivitaiModel, names: Set<string>): boolean {
  return model.versions.some(version => version.files.some(file => names.has(JSON.stringify([model.name, modelFileStem(file.name)]))));
}

/**
 * 摘要必须是完整 64 位十六进制，AutoV1、AutoV2 或被截断的哈希不能冒充 SHA256。
 * 大小写只是十六进制写法不同，比较时统一小写；两端空白不作为摘要内容。
 * 无效值回落为空，调用方会显式剔除，禁止空值与空值相等造成匹配。
 * 校验已有字符串不会触碰模型文件，不能在这里按文件名临时计算摘要。
 * 完整长度与合法字符必须同时满足，64 个非十六进制字符依然没有证明作用。
 * 不把 SHA256 数字化，前导零和超出安全整数范围的内容都必须原样保留。
 * @param value 本地规范化 JSON 或远端文件记录中的摘要文本。
 */
function normalizedSha256(value: string): string {
  const trimmed = value.trim();
  return /^[a-f\d]{64}$/i.test(trimmed) ? trimmed.toLowerCase() : "";
}

/**
 * 只登记 ready 来源中的有效 SHA256，缺失、损坏、未授权、未来格式均不猜测。
 * 不从 JSON 的模型标题或版本号推导摘要，也不回退到短哈希字段。
 * 读取结果按权重文件绑定，元数据接口已负责防止同目录版本互借 sidecar。
 * 同一摘要可对应多个改名副本，Set 仅减少重复证据，不会合并或删除本地模型。
 * 这份集合只活在当前在线页内，不另建数据库或永久缓存手工可改的 JSON。
 * 不依赖来源里的模型 ID，复制来的 ID 或改过的标题都不能代替内容摘要。
 * 某一来源损坏不会排除其他有效来源，坏 JSON 只使它对应的那份证据失效。
 * @param entries 现有 readLocalModelMetadata 返回的小型来源记录。
 */
export function localModelHashes(entries: LocalModelMetadataEntry[]): Set<string> {
  return new Set(entries.filter(entry => entry.status === "ready" && entry.metadata).map(entry => normalizedSha256(entry.metadata?.sha256 || "")).filter(Boolean));
}

/**
 * 先走严格名称分支，名称不满足才从已有摘要集合找完整内容指纹。
 * 改名模型仍可凭摘要识别，目录相同或文件同名都不能替代缺失摘要。
 * 候选覆盖接口已返回的文件，不偷偷请求更多版本或遍历远端模型库。
 * 只命中其中一个文件表示这个模型有本地对应项，不能宣称所有版本都已下载。
 * 不以空摘要参与比较，远端没提供 SHA256 时只允许上面的严格名称分支。
 * 两个分支同时成立仍返回 name，保持用户确认的判断顺序，也避免夸大校验程度。
 * @param names 本轮扫描得到的名称配对索引，不能由在线标题直接生成本地证据。
 * @param hashes 已保存来源中的有效完整摘要，不能把远端摘要直接加入这个集合。
 * @returns 名称、摘要或无匹配，供现有卡片注入准确的标签与说明。
 */
export function findLocalCivitaiMatch(model: CivitaiModel, names: Set<string>, hashes: Set<string>): CivitaiLocalMatch {
  if (hasLocalCivitaiName(model, names)) return "name";
  return model.versions.some(version => version.files.some(file => {
    const hash = normalizedSha256(file.sha256);
    return hash !== "" && hashes.has(hash);
  })) ? "sha256" : null;
}

/** Display the category inside the model type/series directory, matching native download destinations. */
export function localLibraryCategory(model: LocalModel, paths: SettingsPaths): string {
  const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");
  const folder = normalize(model.filePath);
  const roots = paths.searchPath ? [paths.searchPath] : [paths.lorasPath, paths.checkpointPath, paths.diffusionModelsPath];
  const root = roots.map(normalize).filter(Boolean).find((value) => folder.toLowerCase().startsWith(value.toLowerCase() + "/"));
  if (!root) return model.category || "Uncategorized";
  const segments = folder.slice(root.length + 1).split("/");
  if (paths.searchPath && /^(loras|checkpoints|diffusion_models|embeddings)$/i.test(segments[0])) segments.shift();
  if (/^(anima|sdxl)$/i.test(segments[0]) && segments.length > 2) segments.shift();
  return segments.length > 1 ? segments[0] : model.category || "Uncategorized";
}
