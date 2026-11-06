/**
 * 把已有扫描分组适配成“官方目录 / 文件夹 / 单个模型”的浏览数据。
 * 扫描器继续按目录聚合，避免改变创建页、下载器与模型加载的既有契约。
 * 类比文件管理器：主分类是磁盘入口，文件夹是道路，模型文件才是终点。
 * 不像旧分类函数那样跳过 Anima 或 SDXL，保留每一级实际相对目录。
 * 这里只处理索引里的字符串，不读取本地磁盘、不新增 Electron 权限。
 * 空文件夹不在扫描结果中，界面只显示含可识别模型的目录。
 * 目录管理仍由原业务负责，单文件展示不意味着能安全删除同目录其他文件。
 */
import type { LocalModel } from "@/types/localModel";
import type { SettingsPaths } from "@/types/settings";

// filePath 保留原目录供 logo 和现有目录级管理，id 使用模型文件路径。
// versions 收窄为一个文件，批量资料补全仍可复用原有按版本读取机制。
// folderFileCount 用于禁用会误伤同目录其他模型的移动、删除操作。
// folder 是相对主分类的完整路径，不能把深层子目录压成一个标签。
// rootCategory 表示真实分类目录，不从模型文件名猜系列或架构。
export interface LocalLibraryFile extends LocalModel {
  rootCategory: string;
  folder: string;
  folderFileCount: number;
}
// 兼容边界：LocalModel.filePath 在原契约里指目录，不能擅自改成权重路径。
// 目录仍用于封面和原有类别管理；模型文件身份单独放在 id 中。
// versions 中的 filePath 才是确切权重，后续补全对这一项计算摘要。
// 保留 versions 数组便于接入原有来源面板，不创建另一套资料读取接口。
// 收窄为单项只是浏览适配，不覆盖设置里的原始分组数组。
// 同一目录的两个文件可以共用封面，但不能共用 sidecar 的来源内容。
// name 包含后缀，用户可以区分同名 safetensors 和 gguf。
// rootCategory 与 model.type 不能混为一谈：VAE/CLIP 也属于官方目录。
// model.type 继续服务旧业务，官方导航以真实目录身份为准。
// folder 允许为空，表示权重直接位于官方目录，无需伪造一级“默认分类”。
// folderFileCount 包含后代模型，父文件夹的操作不能误动子目录权重。
// 没有把图像、JSON 作为模型单元，识别范围仍由原扫描器负责。
// 节点值为相对分类目录，不向主进程发送拼出来的任意绝对路径。
// count 统计目录后代里的文件数量，不是版本分组数量。
// 同名文件夹在不同父目录下有不同 value，不按名称去重。
export interface ModelFolderNode {
  name: string; value: string; count: number; children: ModelFolderNode[];
}
// 仅规范分隔符与末尾斜杠，不解析 ..、不改磁盘中的文件名。
// Windows 大小写比较只用于匹配配置根，展示路径保留扫描原文。
// 不把 basename 用作文件身份，嵌套路径完整保留到模型版本。
const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");

// 检索根启用时沿用设置页的优先规则，不把未生效的其他根混入分类。
// 独立配置根的目录名字可任意，因此使用配置键确定官方类别。
// 匹配需要目录边界，models2 不能误认作 models 的子目录。
// 检索根本身存模型时归 other，不能把第一个模型名当官方分类。
// 路径不属于现配置根时采用扫描分类保留可见性，不替用户移动文件。
// 最长根优先，避免单独配置的嵌套目录被更宽的父根抢先认领。
function locateFolder(model: LocalModel, paths: SettingsPaths) {
  const roots = paths.searchPath ? [{ path: paths.searchPath, category: "" }] : [
    { path: paths.checkpointPath, category: "checkpoints" }, { path: paths.lorasPath, category: "loras" }, { path: paths.diffusionModelsPath, category: "diffusion_models" },
  ];
  const folder = normalize(model.filePath);
  const root = roots.filter(item => item.path).sort((a, b) => b.path.length - a.path.length).find(item => folder.toLowerCase() === normalize(item.path).toLowerCase() || folder.toLowerCase().startsWith(normalize(item.path).toLowerCase() + "/"));
  if (!root) return { rootCategory: model.category || model.type, folder: "" };
  const segments = folder.slice(normalize(root.path).length).replace(/^\//, "").split("/").filter(Boolean);
  return { rootCategory: root.category || segments.shift() || "other", folder: segments.join("/") };
}
// 例子一：检索根为 models，文件位于 models/loras/Anima/style/a.safetensors。
// 输出根为 loras、目录为 Anima/style，a.safetensors 留给单文件卡片。
// 例子二：独立 LoRA 根本身命名为“权重”，官方根仍显示 loras。
// 这时根目录名称是用户自由选择，不可根据“权重”猜成自定义模型类别。
// 例子三：主分类直接包含文件，folder 为空，根页直接展示该文件。
// 例子四：searchPath 被配置时，其他独立路径按设置现有优先级暂不生效。
// 不把未扫描的根强行画到导航里，否则点击后只会得到虚假的空目录。
// 路径比较要求斜杠边界，避免把 models-old 下的权重认作 models 内资源。
// 对根排序只作用于本地新数组，不改变用户设置的顺序和内容。
// 展示保留大小写，Windows 匹配使用小写只是为了认出同一个目录。
// 旧索引不属于当前根时仍保留类别和文件，不因迁移时期信息不全而消失。
// 回退不尝试解析或访问磁盘，它只能表达扫描器已经给出的结果。
// 路径规范化不是安全授权；真正写入依然由主进程验证目录和链接。
// 渲染组件不能据此拼接任意文件地址或执行移动命令。

// 每个版本变成一项，保留绝对文件路径作为稳定且可区分同名文件的身份。
// 展示名取文件全名包含扩展名，不能再用目录名表示多个不同模型。
// 封面来自原分组，读取机制未改变，不为同目录文件重复扫描找图。
// 同文件被重叠配置根扫描到时按完整文件路径去重，不能按纯文件名合并。
// 分组大小单独保留，为目录级移动/删除提供清晰的安全边界。
// 结果不会改写 settings.models，创建页和 Agent 原始索引继续独立使用。
// 展示适配不会修改 ComfyUI 接受的相对模型名称，生成链的路径规则沿用原实现。
// 排序只影响展示，不改 id 或 versions 中发给 ComfyUI 的真实路径。
// 用户切换分类之后可再次使用同一索引，不触发磁盘递归扫描。
export function localLibraryFiles(models: LocalModel[], paths: SettingsPaths): LocalLibraryFile[] {
  const files = new Map<string, LocalLibraryFile>();
  for (const model of models) for (const version of model.versions) {
    const location = locateFolder(model, paths);
    // 原有管理会移动整个目录，子目录里的模型同样需要纳入保护。
    // 只数当前分组会漏掉“父目录一模型、子目录另有模型”的情况。
    const directory = normalize(model.filePath).toLowerCase();
    const folderFileCount = models.filter(group => normalize(group.filePath).toLowerCase() === directory || normalize(group.filePath).toLowerCase().startsWith(directory + "/")).reduce((sum, group) => sum + group.versions.length, 0);
    files.set(normalize(version.filePath).toLowerCase(), { ...model, ...location, id: version.filePath, name: version.filePath.split(/[/\\]/).pop() || version.name, category: location.folder, versions: [version], folderFileCount });
  }
  return [...files.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}
// 数据生命周期：索引更新后重新计算浏览数据，局部选择另由页面保存。
// Map 的键采用规范完整路径，纯文件名同名不会发生覆盖。
// 重复扫描同一文件时保留一项，减少同图卡片重复和补全重复提交。
// 去重不声称两份不同路径权重的内容相同，本层没有读取模型字节。
// 文件大小或模型系列不从名称推断，相关资料继续交给既有来源信息。
// name 的最后一段处理只用于展示，没有截断 versions 中的路径。
// 上层可按官方根过滤同一个数组，无需再次扫描磁盘。
// 所有对象来自浅复制，新增字段不会回写创建页使用的 LocalModel 对象。
// 排序是中文自然名称比较，文件 ID 不随数组位置变化。
// 目录安全计数是写操作保护，不影响只读详情与资料补全。
// 目录里含未知非模型文件时仍由原生操作确认和边界校验负责。
// 本层不能保证磁盘没发生外部改动，所以写入前仍要主进程复核。

// 每一级只看相对目录的下一个段，所以可按文件管理器方式逐层进入。
// count 包含所有后代，便于知道还需要展开哪些目录，不把后代卡片平铺出来。
// 递归在实际索引深度停止，不设固定三层或四层的假目录上限。
// value 包含完整父路径，兄弟目录同名也不会串用展开或选中。
// 此函数不修改输入数组，两个浏览实例可以读取同一数据而各自导航。
// 排序只按可见目录名，路径值和文件身份不随排序改变。
// 不创建合成的模型文件夹，不把模型扩展名误当成可继续打开的目录。
export function modelFolderTree(files: LocalLibraryFile[], parent = ""): ModelFolderNode[] {
  const prefix = parent ? `${parent}/` : "";
  const names = [...new Set(files.filter(file => file.folder.startsWith(prefix)).map(file => file.folder.slice(prefix.length).split("/")[0]).filter(Boolean))];
  return names.sort((a, b) => a.localeCompare(b, "zh-CN")).map(name => {
    const value = prefix + name, descendants = files.filter(file => file.folder === value || file.folder.startsWith(`${value}/`));
    return { name, value, count: descendants.length, children: modelFolderTree(descendants, value) };
  });
}
// 树中节点只代表目录，只有叶子文件卡片才是用户选择的模型单元。
// 目录树和中间文件夹卡片使用同一个构造器，路径层级不会各自省略。
// prefix 带尾部斜杠，Anima/style 不会把 Anima/style-old 算作后代。
// 当前层只取下一段，点击目录后才继续展开它的下一层。
// count 用全体后代文件数，不能把“一个分组含两个版本”错误计成一个模型。
// 递归传入已经筛过的后代，兄弟节点不会携带其他分支的数据。
// 空名称被过滤，避免末尾斜杠产生一张无法进入的空白文件夹。
// 搜索结果仍使用原始 folder，清空关键词之后能回到原浏览位置。
// 节点的 value 与显示的 name 分开，同名子目录不会串选。
// 本函数不保存展开状态，两个导航实例读取同一树也可以独立开合。
