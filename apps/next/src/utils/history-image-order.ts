/** 图库手动顺序与批量名称预览纯逻辑；文件移动和重命名仍由图片服务执行。 */
// 这个模块接收扫描得到的文件记录，不扫描目录，也不读取图片像素。
// 排列与命名分开：仅保存顺序不产生磁盘文件操作。
// 真正改名沿用 generatedImages 的 IPC 封装，路径授权仍由主进程执行。
// 文件名格式沿用 EXIF 工具，两个入口不会对编号或扩展名给出不同规则。
// GeneratedImageFile 保留真实路径与修改时间，不把 UI 序号当作文件身份。
// 所有计算都返回新数组，不就地修改父组件正在展示的扫描结果。
// 文案在调用时翻译，运行中切换语言后不会继续返回模块加载时的语言。
// 三种数组的用途不能混淆：
// 扫描数组描述“磁盘现在有什么”，它的字段由文件服务保证。
// 顺序数组描述“以前排在哪个位置”，其中可能残留已经删除的路径。
// 名称计划描述“这次要把谁改成什么”，只在用户确认执行的时刻有效。
// 扫描数组中的 fileName 可以变，不能将它用作两个扫描周期之间的唯一键。
// 顺序数组不携带文件大小或图片内容，因此不会因为保存一次排序复制整个图库。
// 名称计划引用原图片记录，但不会对其字段赋值，父层可继续使用原记录渲染。
// 真实文件操作之后以回执建立新旧路径关系，而不是凭名称相似猜测同一个文件。
// 这种区别也解释为什么排序可以纯计算，改名却必须进入受限系统接口。
import type { GeneratedImageFile } from "@/types/historyFolder";
import { t } from "@/i18n";
import { renameGeneratedImageOnDisk, type RenameGeneratedImageResult } from "@/utils/generatedImages";
import { buildRenamedName } from "@/utils/exif/format";

/** 保留用户排好的文件身份，并把新文件接到队尾。 */
// 像拿着座位名单安排来宾：名单里的人先入座，新到的人排在最后。
// images 是这次实际到场的人，paths 是上次保存的名单。
// 名单里有、磁盘上已删除的图片直接跳过，不能重新画出幽灵卡片。
// 磁盘上有、名单里没有的图片按原扫描顺序接在后面。
// 没有已存名单时，返回顺序与原始扫描完全一致，兼容旧用户文档。
// Map 按完整路径定位，同名但位于不同子目录的文件不会互相顶替。
// 不用 basename 比较，避免把“角色/a.png”和“风景/a.png”合成一张。
// 不把 Windows 路径改成显示名称，调用后仍可直接交给现有文件接口。
// 找到记录后立即从候选表删除，旧配置里重复的路径只会入列一次。
// 去重的是同一路径，不按像素去重；内容相同的两个文件仍可各自排列。
// included 只包含真实保留下来的记录，已删除路径不会占住队尾位置。
// 扫描结果更新后再次调用即可，不额外维护一份永久的图片对象缓存。
// 保存的是身份列表，图片的修改时间和其他字段始终来自最新扫描对象。
// 这个机制不会为了恢复顺序而改写文件时间，也不依赖文件名自然排序。
// 本函数不负责读取配置的结构；Zustand 和用户文档负责提供字符串队列。
// 外部新增或删除文件不会要求用户重新手动排列全部现有图片。
// 排序映射的例子，字母代表完整路径而非文件名：
// 磁盘为 [A,B,C]、名单为 [C,A]，返回 [C,A,B]，未排过的 B 接在末尾。
// 磁盘为 [A,B]、名单为 [C,A]，返回 [A,B]，不存在的 C 不产生空卡片。
// 磁盘为 [A,B]、名单为 [A,A,B]，返回 [A,B]，重复配置不重复渲染同一身份。
// 磁盘为空、名单有历史记录时返回空数组，保留正确的当前文件夹空态。
// 名单为空时按磁盘数组原顺序返回，不顺带按文件名或修改时间重排。
// 全部文件都在名单内时，扫描器更换遍历顺序也不会使卡片突然换位置。
// 只有一部分文件在名单内时，新文件之间仍维持扫描器给定的先后关系。
// Map 的删除只操作本地临时索引，不删除磁盘文件或改变传入 images 数组。
// included 从最终 ordered 提取，因此旧配置里无效路径不会影响补入判断。
// 索引查找避免每个历史路径都从头扫描所有图片，适合有多页图片的目录。
// 代价是保存临时 Map 和 Set，它们只保留记录引用，不复制图像字节。
// 不使用数组下标作为返回身份，前项被删除后其余图片的对象仍保持原记录。
// 目前上游扫描应保证实际路径唯一，重复扫描记录属于上游数据问题。
// 这里专门容忍的是历史名单重复，不能据此宣称所有非法用户文档都已校验。
// 若今后要支持路径别名，需要先统一文件服务的路径契约，不能只改此处比较。
export function applyHistoryImageOrder(images: GeneratedImageFile[], paths: string[]): GeneratedImageFile[] {
  const byPath = new Map(images.map(image => [image.filePath, image]));
  const ordered = paths.flatMap(path => {
    const image = byPath.get(path);
    byPath.delete(path);
    return image ? [image] : [];
  });
  const included = new Set(ordered.map(image => image.filePath));
  return [...ordered, ...images.filter(image => !included.has(image.filePath))];
}

/** 复用 EXIF 工具相同的“前缀 + 连号 + 原扩展名”命名规则。 */
// 队列下标只用于本次编号，不用于 React key 或文件识别。
// 用户拖动后重新计算预览，编号跟随屏幕上实际排列的先后顺序。
// 降序从 start 往下减，而不是先生成升序名称再倒转图片。
// 每张图片单独保留扩展名，混合 PNG/JPEG 不会被错误地统一成 PNG。
// image 与 name 放在一起，执行时无需按名称反查原路径。
// 返回的是计划，没有调用改名接口；编辑前缀时不会动到磁盘。
// 起始编号合法性由下面的验证负责，展示函数本身不偷偷修正用户输入。
// buildRenamedName 是两个业务入口的共同格式源，避免手写另一条拼接公式。
// 预览可以全部生成，再由界面截取少量展示；截取不改变实际执行范围。
// 名称计算的例子，假设前缀为 scene_：
// 起点一、升序、三张图，对应 scene_1、scene_2、scene_3。
// 起点三、降序、三张图，对应 scene_3、scene_2、scene_1。
// 上例并不把最后一张搬到第一位，数字方向和图片位置是两个独立概念。
// 原文件为 a.jpeg 时扩展名仍是 jpeg，不能因为窗口叫“图片排列”就改成 png。
// 原文件名里已有数字不会被解析或累加，序号只由用户输入和队列位置决定。
// 前缀可以包含数字，例如 take2_，算法不会把它误当作起始序号。
// 不补齐固定宽度零，名称样式沿用已有 EXIF buildRenamedName 的结果。
// 显示队列独立保存，因此 image_10 在字典序中排到 image_2 前也不影响图库顺序。
// 原文件若已叫 scene_1.png，目标恰好同名仍可进入正式接口的原名处理分支。
// 这一步没有搜索替换原文件名中的关键词，也没有重命名文件夹的能力。
export function previewHistoryImageNames(images: GeneratedImageFile[], prefix: string, start: number, ascending: boolean): Array<{ image: GeneratedImageFile; name: string }> {
  return images.map((image, index) => ({ image, name: buildRenamedName(image.fileName, prefix, ascending ? start + index : start - index) }));
}


/** 同一目录内名称不能互相覆盖；该检查不读模型或图片内容。 */
// 输入检查和文件系统检查有不同职责，前者给即时反馈，后者阻止真实越界。
// 前缀不接受路径分隔符，用户只能改名称，不能借改名把文件搬到其他目录。
// 控制字符和 Windows 禁用字符会被拒绝，而不是悄悄替换后产生意外名称。
// 首尾空格会使预览和 Windows 实际名称不一致，因此要求用户明确删去。
// 限制前缀长度给序号和扩展名留空间；不在这里承诺所有文件系统的路径上限。
// 起始编号必须是安全整数，避免超出 JavaScript 精度后两个编号看起来相同。
// 同时检查末尾编号，降序图片较多时不能走到零或负数。
// 判断现有目标按 Windows 不区分大小写处理，a.png 与 A.png 会视为冲突。
// 比较键统一斜杠只用于内存检查，不改变提交给主进程的原始路径。
// 用原文件所在目录计算目标，文件夹不同的同名目标不会被误报为相互覆盖。
// targets 记录本次计划已经使用的目标名，发现重复就阻止确认。
// existing 记录本次图片库已有的文件，避免前项直接占用后项仍在使用的名字。
// 目标等于当前源路径允许作为原名操作，不要求用户为了批量功能先改一次名。
// 目标属于另一张源图片时拒绝，当前流程没有临时名两阶段交换协议。
// 这样会保守拒绝名称互换，而不会把第二张图覆盖成第一张。
// CON、PRN、AUX、NUL、COM1–9、LPT1–9 是 Windows 设备名称，带图片扩展名也不应使用。
// 这些检查不推断磁盘权限，确认之后仍可能因只读目录或外部占用失败。
// 主进程会再次确认文件存在、路径边界与目标情况，界面验证不能替代它。
// 当前扫描之外的外部文件可能在确认前出现，真实冲突由正式接口兜底。
// 返回的是可翻译的错误提示或 null，界面无需把异常当作普通输入校验。
// 不对字符串做语言相关排序或转写，中文前缀仍按用户输入保留。
// 空清单由按钮禁用处理，验证不把“零项可改名”伪装成真实操作成功。
// 输入边界的具体含义：
// start=1、count=2、降序时末尾为零，即使第一项合法也拒绝整个计划。
// start=2、count=2、降序时末尾为一，编号范围满足最低要求。
// 小数起点不能靠 buildRenamedName 变成小数文件序号，验证提前拒绝。
// NaN 或 Infinity 不符合安全整数条件，不会把无效字样拼进名称。
// 安全整数上界附近的升序也要检查末尾，防止第二项开始丢失数值精度。
// prefix 为 ../ 时斜杠会使检查失败，不能借此改写父目录文件。
// prefix 为 C: 时冒号会使检查失败，盘符文本不能变成文件名前缀。
// prefix 中包含换行时按控制字符拒绝，不能产生界面中看似两行的一个文件名。
// prefix 首尾有空白时不 trim 后执行，用户看到的输入与实际结果必须一致。
// prefix 内部正常空格允许保留，不把所有空白都视作路径异常。
// 前缀长度上限只约束这一段，不在界面猜测 Windows 当前启用的长路径策略。
// 名称冲突的具体含义：
// A.png 改成 B.png 而 B.png 仍存在，属于真实占名，拒绝整批计划。
// A.png 保持 A.png 不占用另一个源文件，可以保留当前名称。
// 目录一的 A.png 与目录二的 A.png 不冲突，因为目标完整路径不同。
// A.png 与 a.png 在当前 Windows 产品边界内按同名处理。
// 设备名称检查针对完整生成结果，所以普通的 con_1.png 不会被误当作 CON。
// 如果未来加入无序号模式，需要同步重新评估设备名检查，不能只移除编号。
// 校验只报告一种错误，是为了让按钮可用性和旁边的解释始终对应同一个原因。
// 如果先显示冲突再显示起点非法，用户可能围绕无效计划反复修改已有文件名。
// 所以先完成前缀和编号范围检查，再构建目标路径集合。
// 每个目标的目录从其源路径取得，不从 output 配置推断所有图片都在同一级。
// 源目录使用标准化后的副本参与比较，实际执行仍拿原记录路径。
// lowerCase 在这里仅表达当前 Windows 名称冲突策略，不作为国际文字转写。
// 中文名称不涉及大小写转换，合法中文前缀不会在比较阶段被翻译或删减。
// targets 集合只存字符串，不尝试打开或锁住目标文件。
// 因而验证期间浏览器不会占用图片文件句柄，也不会妨碍用户在外部查看原图。
// UI 校验与主进程安全检查不能互相删掉：前者减少误操作，后者约束真实请求。
// 即使来自别的渲染入口的参数绕过本函数，文件服务仍必须独立拒绝非法操作。
// 当前方法不接受函数式名称模板，避免把输入当代码执行或引入第二种命名语言。
// 前缀和数字规则足以复用 EXIF 既有设置，不在局部任务建立通用模板引擎。
// 预览、验证和执行使用同一份命名结果来源，修改格式时需要同步回归三者。
// targets 检查同批次目标是否重复，existing 检查目标是否占用当前已有源文件。
// 这两个 Set 不能合为一个，否则无法区分当前源保持原名和覆盖另一张图。
// 验证成功不预先创建目录或空文件，真正占名竞争仍由执行时的文件接口处理。
// 旁车占名也由文件接口决定，本函数只知道 GeneratedImageFile 中的图像记录。
// 返回第一种明确错误足够指导当前修复，不把所有路径细节暴露在一条提示里。
// 未触发这些规则时返回 null，不返回空字符串当作另一种“成功”协议。
// 组件据此用 Boolean(validation) 禁用确认，避免多个成功表示混用。
export function validateHistoryImageNames(images: GeneratedImageFile[], prefix: string, start: number, ascending: boolean): string | null {
  const end = ascending ? start + images.length - 1 : start - images.length + 1;
  if (!prefix.trim() || /[\u0000-\u001f<>:"/\\|?*]/.test(prefix) || prefix !== prefix.trim() || prefix.length > 96 || !Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(end) || end < 1) return t("create.historyOrder.invalidName");
  const existing = new Set(images.map(image => image.filePath.replace(/\\/g, "/").toLowerCase()));
  const targets = new Set<string>();
  for (const item of previewHistoryImageNames(images, prefix, start, ascending)) {
    const source = item.image.filePath.replace(/\\/g, "/").toLowerCase();
    const target = source.slice(0, source.lastIndexOf("/") + 1) + item.name.toLowerCase();
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(item.name) || targets.has(target) || (target !== source && existing.has(target))) return t("create.historyOrder.nameConflict");
    targets.add(target);
  }
  return null;
}

/** 按可见队列逐个调用现有改名接口，出错就停，返回已实际完成的记录。 */
// 类似按清单搬箱子：每搬完一个记一笔，遇到障碍停下并交回已完成的收据。
// 不并发改名，避免多个目标同时争用名称、旁车文件或文件系统状态。
// 接口内部继续处理 PNG 与旧 JSON 旁车关联，这里不复制文件服务实现。
// 只把真正完成的回执加入 results，不根据预览提前生成成功记录。
// 改名后的 filePath 和 modifiedAt 使用正式返回值，不假定结果一定等于预览。
// 单个失败会终止剩余队列，避免用户看到一个不断扩大的部分完成状态。
// 已经完成的文件不会自动回滚，当前服务没有跨文件事务或撤销保证。
// 调用方必须展示完成数量和失败原因，不能把部分完成提示成全部成功。
// 第一项就失败时 results 为空，界面可以保留弹窗让用户修改设置或取消。
// 后面失败时仍返回前面的回执，让父图库及时替换已经变化的路径。
// 其余原路径继续保留，恢复顺序不能把尚未处理的文件丢掉。
// 错误消息来自已有渲染封装，未知异常使用统一兜底文案。
// 不向渲染组件返回主进程堆栈，也不在控制台打印用户图片路径。
// 最后 error 为 null 只表示整个计划调用完成，保存顺序仍由调用方执行。
// 计划从调用时的预览冻结而来，不在异步循环中反复读取正在更新的 UI 列表。
// 本方法不依赖 React 或 Zustand，文件业务与排序弹窗生命周期保持分开。
// 它没有定时器、全局监听或待释放 URL；异步失败的边界是每次正式改名调用。
// 顺序执行的时间线：
// 第一次 await 结束后才开始第二项，磁盘完成的先后与确认名单相同。
// 若第二项拒绝，第三项根本不会调用，避免错误之后继续改变更多文件。
// results 此时只包含第一项，后续 UI 可以准确报告“完成一项”。
// 不在 catch 内重新执行失败项，文件占用或权限拒绝不能靠无限重试解决。
// 不把错误结果塞入 results，成功回执数组保持同一明确形状。
// 调用方不需要从错误文案解析哪张图完成，完成集合由结构化回执提供。
// 当所有目标与原名相同时，是否需要实际重命名由已有文件服务处理。
// 本函数不通过触碰文件时间来制造“改名完成”的可见证据。
// 测试需要核对真实文件身份和磁盘清单，不能仅检查页面文字已换成目标名。
// 服务如果以后支持原子批量接口，应在这一执行边界替换，而不是改动拖拽容器。
export async function renameHistoryImageSequence(output: string, plan: Array<{ image: GeneratedImageFile; name: string }>): Promise<{ results: RenameGeneratedImageResult[]; error: string | null }> {
  const results: RenameGeneratedImageResult[] = [];
  for (const item of plan) {
    try {
      results.push(await renameGeneratedImageOnDisk(output, item.image.filePath, item.name));
    } catch (error) {
      return { results, error: error instanceof Error ? error.message : t("create.historyOrder.renameFailed") };
    }
  }
  return { results, error: null };
}
