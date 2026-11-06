/**
 * 「高级组装」模式的分类 Tab 模型：拼接、已填计数、增删分类与模板。
 *
 * 怎么做：纯函数；`assemblePrompt` 按 Tab 顺序用 `, ` 拼出最终提示词。
 */
import { t } from "@/i18n";
import type {
  PromptTab,
  PromptTabToolId,
  PromptTemplate,
} from "@/types/promptTabs";
import { DEFAULT_PROMPT_TABS, PROMPT_TAB_MAX } from "@/data/promptTabs";
import { PROMPT_TOOL_IDS } from "@/data/promptTools";

/**
 * 合法工具清单：文档是外部输入，脏值（旧版本写的、手改的）不能原样带进 UI。
 * 清单本身来自工具注册表（`data/promptTools.ts`），加工具只改那一处。
 */
export const PROMPT_TAB_TOOL_IDS: readonly PromptTabToolId[] = PROMPT_TOOL_IDS;

/** 只保留合法且不重复的工具 id */
function sanitizeTabTools(value: unknown): PromptTabToolId[] {
  if (!Array.isArray(value)) return [];
  const unique: PromptTabToolId[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const toolId = PROMPT_TAB_TOOL_IDS.find((id) => id === item);
    if (!toolId || unique.includes(toolId)) continue;
    unique.push(toolId);
  }
  return unique;
}

/**
 * 逗号自动拼接（任务规范 v2.1 核心算法）：
 * 按 Tab 顺序遍历所有**非空**输入框，
 * - 若已拼接结果的结尾已有英文逗号 `,`，直接接上（只补一个空格）；
 * - 否则自动追加 `, ` 再拼接。
 * 结果实时输出到只读预览框。
 */
export function assemblePrompt(tabs: PromptTab[]): string {
  let result = "";

  for (const tab of tabs) {
    const text = (tab.content ?? "").trim();
    if (!text) continue;

    if (!result) {
      result = text;
      continue;
    }

    result = /,\s*$/.test(result) ? `${result} ${text}` : `${result}, ${text}`;
  }

  return result;
}

/** 已填写内容的分类数量（用于 Tab 角标） */
export function countFilledTabs(tabs: PromptTab[]): number {
  return tabs.filter((tab) => (tab.content ?? "").trim().length > 0).length;
}

export function isTabFilled(tab: PromptTab): boolean {
  return (tab.content ?? "").trim().length > 0;
}

/**
 * 队列就像排队点餐：交换的是两位客人的位置，订单仍跟随原来的客人。
 * 这里移动完整分类对象，稳定 id、内容、快捷词和工具绑定不会分家。
 * 图片与蒙版共用这段纯计算，真正保存或任务锁仍由各自 store 负责。
 * 首尾不能越界；失效 id 保留原数组，避免删除后的旧事件挪动别的分类。
 * 不以名称定位，因为默认分类和自定义分类可能同名。
 * 不改变活动分类 id，用户正在编辑的文本框仍属于原分类。
 * 数组副本通知 Zustand 重新组装；分类对象本身无须深拷贝。
 */
export function movePromptTab(tabs: PromptTab[], id: string, direction: -1 | 1): PromptTab[] {
  // direction 只接受相邻两种方向，调用方不能借一次事件跨过多组造成不可解释跳动。
  // 索引来自当前数组而非之前渲染的下标，快速连续操作仍对准同一个 id。
  // 两个边界都先检查再交换，避免 JavaScript 生成负下标属性或插入 undefined。
  const index = tabs.findIndex((tab) => tab.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= tabs.length) return tabs;
  const next = [...tabs];
  // 交换不修改传入数组；保存前后快照比较、模板读取和订阅都能得到稳定结果。
  // 没有复制字符串内容，长提示词不会因排序重复占一份正文存储。
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * 拖拽像把排队的人插入另一人的位置：中间成员依次让位，订单原封不动。
 * 只接收两个分类 id，放手时才在最新队列查位置，不把旧快照写回 store。
 * 所以拖动期间新增、删组或修改文字，都不会被一份过期数组覆盖。
 * 箭头仍保留相邻交换语义；拖拽允许跨多组，二者共用最终数组顺序。
 * 不认识的 id 和原地放手保留原引用，调用方不会得到缺失成员的新队列。
 * 输入组对象不改写，内容、工具绑定、快捷词、默认/自定义身份整体跟随。
 * 此处没有存储和任务状态依赖，图片与蒙版各自在动作边界决定是否应用。
 */
// 拖拽计算的细节：
// 目标下标在移除前计算，和视频原有 arrayMove 的最终位置语义一致。
// 从前往后移时先移除起点，再在原目标位置插入，结果是越过目标项。
// 从后往前移则插在目标之前，其他组保持相对次序。
// 因此不是交换两个端点，中间的分组会依次让出一个位置。
// 只复制外层数组，长正文字符串和快捷词列表不做多余深拷贝。
// 没有对内容做 trim 或长度截断，排序不应该承担文字清洗职责。
// 空分类也保留原对象，不因为当前不参与合并就被过滤掉。
// 失效目标返回原数组，可避免拖拽期间被删组后挪错邻居。
// 纯函数没有读取当前语言，相同标签在切换语言后也不会影响 id 匹配。
// 自定义名称可以重复，使用名称查找会错位，稳定 id 才是正确定位依据。
// 没有按文件路径或标签拆字符串，带空格和中文的组名不需要转义。
// 模板仍按 id 保存正文，本函数不调整模板键也不套用模板。
// 活动项不属于本函数输入，因此调序无法偷偷切换当前编辑目标。
// 最终拼接继续由 assemblePrompt 完成，不在拖拽路径重写逗号规则。
// 这种分工让箭头和拖拽得到同一个生成队列，不存在第二份隐藏顺序。
export function reorderPromptTab(tabs: PromptTab[], activeId: string, overId: string): PromptTab[] {
  const source = tabs.findIndex(tab => tab.id === activeId);
  const target = tabs.findIndex(tab => tab.id === overId);
  if (source < 0 || target < 0 || source === target) return tabs;
  const next = [...tabs];
  const [moved] = next.splice(source, 1);
  next.splice(target, 0, moved);
  return next;
}

/** 把确认后的号码牌队列应用到最新分组，正文仍取提交当下的数据。 */
// 像交给店员一张座位顺序表，而不是拿旧表覆盖每位客人的最新资料。
// ids 只表达先后，不包含正文；等待期间完成的翻译因此不会被旧内容盖回去。
// 顺序表里已经删除的分组跳过，外部新增而没有排过的分组接在队尾。
// 同名分组仍按稳定 id 区分，不根据显示标题、数量或当前下标猜测身份。
// 每取出一个对象就从 Map 删除，重复 id 不能让同一个分组出现两次。
// Map 保存原对象引用，不深拷贝长正文、快捷词或工具配置。
// 结果只有数组顺序不同，默认组、自定义组和空组都保留自己的字段。
// 这里不检查业务锁；图片和蒙版在各自 store 的提交入口决定是否允许执行。
// 草稿预览和最终提交共同调用此函数，避免两处对“新组接队尾”给出不同结果。
// 不把排序名单写成第二份用户文档字段，持久化仍只保存既有 promptTabs。
// 当前编辑分组不属于此函数输入，移动分组不能偷偷切换活动输入。
// 比如最新分组 A、B、C，确认名单 B、A，返回 B、A、C。
// 若 B 在提交前被删除，返回 A、C，不恢复一个内容过期的 B。
// 若名单误含 B、B、A，返回 B、A、C，不产生重复 React key。
// 空名单表示保持当前各组原顺序，不清空全部提示词。
// 本函数不处理单个标签的权重或逗号清洗，那仍属于原正文编辑规则。
export function orderPromptTabs(tabs: PromptTab[], ids: string[]): PromptTab[] {
  // Map 依照最新数组的插入顺序保存剩余成员，因此未列出的新组保持相对次序。
  // 对剩余表的删除只发生在临时索引上，不删除原数组中的对象或任何用户内容。
  // 名单可以包含默认组和自定义组混排，custom 字段不会改变谁有资格排序。
  // 剩余列表没有用 Set 按内容去重，相同正文的两组依然是不同身份。
  // 成员表查找成本随分组数线性增长，不在每个名单项上反复扫描整份正文。
  // 没有调用 sanitizePromptTabs，确认排列不能顺带重置用户标签或截断正文。
  // 不设置修改时间，排序不是翻译历史，也不产生一条虚构的翻译收据。
  // 调用时旧 ids 和最新 tabs 都由业务层提供，函数不读取 DOM 的可见顺序。
  // 这样图片页与蒙版页可以共享算法，而不用互相访问各自的编辑器元素。
  // 空数组输入返回空数组，界面据此禁用 Done，不把零分组当作有效提交。
  const remaining = new Map(tabs.map(tab => [tab.id, tab]));
  const ordered = ids.flatMap(id => {
    const tab = remaining.get(id);
    remaining.delete(id);
    return tab ? [tab] : [];
  });
  return [...ordered, ...remaining.values()];
}

/**
 * 往分类内容末尾追加文本（快捷插入词 / 角色 / 3D 视角都走这里）：
 * 结尾已有逗号则只补空格，否则自动补 `, `。
 */
export function appendToTabContent(content: string, addition: string): string {
  const snippet = addition.trim();
  if (!snippet) return content;

  const current = (content ?? "").trim();
  if (!current) return snippet;
  return /,\s*$/.test(current) ? `${current} ${snippet}` : `${current}, ${snippet}`;
}

export function createPromptTabId(): string {
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createPromptTemplateId(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sanitizeQuickWords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item).trim())
    .filter(Boolean)
    .slice(0, 24);
}

/**
 * 兜底 / 迁移：保证默认 8 个分类始终存在（用户删掉后重建），
 * 自定义分类去重并按 id 去重，最多 PROMPT_TAB_MAX 个。
 */
function readStoredPromptTabs(value: unknown): Map<string, PromptTab> {
  // 此步骤只认数组；旧文档缺字段或手动改成对象时，调用方仍能补回默认分类。
  // 使用 Map 把重复 id 合成一个对象，与既有最后一次内容覆盖规则保持一致。
  // 缺失 id 的项目无法稳定定位，跳过比生成临时 id 后反复出现更可靠。
  // 名称为空时退回 id，避免保存的组在分类栏成为看不见的点击区域。
  // 内容必须是字符串，外部 JSON 对象不会直接成为 textarea 的 value。
  // 快捷词仍按原数量上限清洗，恢复顺序不放宽输入大小或工具允许集。
  // 本步骤不决定默认组还是自定义组，后面由当前注册表重新确认身份。
  // 因此保存文档把默认组标为 custom 也不能绕过默认组不可删除的规则。
  // 旧版本没有 tools 字段时得到空数组，既有固定默认工具继续由注册表提供。
  // Map 保存本次新对象，不复用未知文档对象，避免 UI 后续动作改到读取快照。
  // 返回后不再保留原文件路径或其他无关字段，组装数据仍是最小展示模型。
  // 清洗和排列分开说明，是因为保存顺序正确不代表每个成员的数据也可信。
  const stored = Array.isArray(value) ? (value as Partial<PromptTab>[]) : [];
  const byId = new Map<string, PromptTab>();

  for (const item of stored) {
    const id = asString(item?.id).trim();
    if (!id) continue;
    byId.set(id, {
      id,
      label: asString(item?.label).trim() || id,
      content: asString(item?.content),
      // 此分支只依据字段形状决定是否回填，不能以数组长度判断用户是否配置过。
      // 默认分类的id稳定，回填按id查预设，不按可能翻译过的label查找。
      // 旧文档没有quickWords时仍能得到原快捷词，不把兼容修复变成全部默认清空。
      // 非数组例如字符串视为坏字段，不能把整段错误类型当成一个合法数组读取。
      // 显式[]通过sanitize后仍是[]，合并默认分类时也必须保持这个决定。
      // 这避免空数组在两次清洗之间被前一步保留、后一步又用预设覆盖。
      // 自定义分类没有对应预设时回填undefined，再由原清洗器安全得到空数组。
      // 默认配置只用于读取恢复，不会在用户点击清空时主动写一遍出厂词。
      // 原24条限制保持在存储入口，显示分词不会借此突破数组容量契约。
      // 模板读取同样调用该清洗器，明确清空的模板分类也能保持空快捷词。
      // content的读取与快捷词独立，旧提示词正文不因快捷词迁移被覆盖。
      // Map仍保留最后一次同id对象，修复不改变旧重复分类的合并优先级。
      // 缺失/坏字段才补默认词；显式空数组表示用户已清空，不能在重启时复活。
      // 默认分类和自定义分类共用读取入口，未知自定义组没有默认词可补。
      // 像空抽屉与没有抽屉不同：空抽屉保留空，缺抽屉才用出厂配置。
      quickWords: sanitizeQuickWords(Array.isArray(item?.quickWords) ? item.quickWords : DEFAULT_PROMPT_TABS.find(preset => preset.id === id)?.quickWords),
      custom: item?.custom === true,
      tools: sanitizeTabTools(item?.tools),
    });
  }

  return byId;
}

/**
 * 恢复分类先清洗内容，再保留历史队列，二者不能以“保留顺序”为由跳过其一。
 * Map 负责去重；默认分类由当前注册表补齐，防止旧文档缺项。
 * 读取顺序只使用稳定 id，不把显示语言、名称或内容作为排序依据。
 * 工具绑定清单仍由原白名单约束，文件里不能凭空注册新工具。
 * 恢复过程不写文档，首次真正修改再由已有 persist 保存。
 */
export function sanitizePromptTabs(value: unknown): PromptTab[] {
  // DEFAULT_PROMPT_TABS 是当前版本必需类别，缺少时保留原默认词和显示名。
  // 已保存的空快捷词列表也必须覆盖默认值；清空和初次使用不能混为一谈。
  // 自定义组上限包括默认类别，不能借重排扩充 PROMPT_TAB_MAX 的容量。
  // 被丢弃的超额自定义项不会留下一个可见但没有内容对象的排序位置。
  // 返回的新数组同时用于分类栏和最终拼接，界面与生成不会各持一份排序结果。
  // 默认组文案翻译只影响 label，不能拿翻译后的文字参与 rank 匹配。
  // 自定义项可以与默认项显示同名，但 id 不同，所以两者仍有各自位置。
  // 旧文档只有一部分默认组时，其保存过的相对位置优先，新补项随后出现。
  // 全空数组仍返回完整默认列表，为首次使用者保留原始编辑体验。
  // 恢复不调用任何 setter，避免存储水合期间递归触发另一轮写盘。
  const stored = Array.isArray(value) ? (value as Partial<PromptTab>[]) : [];
  const byId = readStoredPromptTabs(stored);

  const tabs: PromptTab[] = [];
  for (const preset of DEFAULT_PROMPT_TABS) {
    const storedTab = byId.get(preset.id);
    tabs.push({
      id: preset.id,
      label: storedTab?.label?.trim() || t(preset.label),
      content: storedTab?.content ?? "",
      quickWords: storedTab ? storedTab.quickWords : preset.quickWords,
      custom: false,
    });
    byId.delete(preset.id);
  }

  for (const custom of byId.values()) {
    if (tabs.length >= PROMPT_TAB_MAX) break;
    tabs.push({ ...custom, custom: true });
  }

  // 恢复时先按已经确认的队列排好，再把新版新增的默认分类补到末尾。
  // 原先总是先放八个默认分类，会在重启时悄悄撤销用户保存的顺序。
  // rank 只决定位置，不信任外部文档提供的内容形状；上方仍完成清洗和去重。
  // 自定义组可排在默认组前面，模板继续按 id 取值，不依赖数组下标。
  // 没保存过队列的旧文档仍按默认顺序出现，不需要迁移版本或新增存储分区。
  const rank = new Map(stored.map((item, index) => [asString(item?.id).trim(), index]));
  // 比较的是数字位置，不依赖系统 localeCompare，系统语言变化也不会重排队列。
  // 原数组有无效项目时会留下数字间隔，但相对前后关系仍然完全相同。
  // 排名值不作为分类编号呈现给用户，删除后无需修补连续数字。
  // 缺项的兜底位置使用原数组长度，保证比任意有效保存位置都靠后。
  // 重复 id 最终仍只有一个分类；其内容与最后一次记录对应，不复制多份正文。
  // sort 稳定性由当前 Electron/浏览器运行时提供，不再写第二套手工排序算法。
  // 未出现的分类共用末位 rank，稳定排序保留默认注册表中的相对次序。
  // 有历史位置的项目总是排在这些补项前面，避免升级后插队打乱已有组合。
  // 两项同 rank 时比较结果为零，不按标签字母或当前语言额外排序。
  // 只排序本次构造的新 tabs，不改变读取到的原 JSON 数组供其他迁移步骤使用。
  // 这里的排序不是根据词义自动推断，用户排好的队列才是唯一位置来源。
  return tabs.sort((left, right) => (rank.get(left.id) ?? stored.length) - (rank.get(right.id) ?? stored.length));
}

export function sanitizePromptTemplates(value: unknown): PromptTemplate[] {
  if (!Array.isArray(value)) return [];

  return (value as Partial<PromptTemplate>[])
    .map((item) => {
      const id = asString(item?.id).trim();
      const name = asString(item?.name).trim();
      if (!id || !name) return null;
      const rawValues =
        item?.values && typeof item.values === "object" ? item.values : {};
      const values: Record<string, string> = {};
      for (const [key, content] of Object.entries(
        rawValues as Record<string, unknown>
      )) {
        values[key] = asString(content);
      }
      return {
        id,
        name,
        values,
        createdAt:
          typeof item?.createdAt === "number" ? item.createdAt : Date.now(),
      } satisfies PromptTemplate;
    })
    .filter((item): item is PromptTemplate => item !== null)
    .slice(0, 50);
}

/** 快照当前分类内容（保存模板用） */
export function snapshotTabValues(tabs: PromptTab[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const tab of tabs) {
    values[tab.id] = tab.content ?? "";
  }
  return values;
}

/**
 * 套用模板：模板里存在的分类直接覆盖，模板里没有的分类保持原样
 * （这样自定义分类不会被模板清空）。
 */
export function applyTemplateToTabs(
  tabs: PromptTab[],
  template: PromptTemplate
): PromptTab[] {
  return tabs.map((tab) =>
    Object.prototype.hasOwnProperty.call(template.values, tab.id)
      ? { ...tab, content: template.values[tab.id] ?? "" }
      : tab
  );
}
