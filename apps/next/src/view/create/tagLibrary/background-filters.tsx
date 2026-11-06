"use client";

/**
 * 界面：背景库的场景大类与特征标签，接入已有静态库侧栏。
 * 复用角色分类的折叠区和计数行，不另造卡片或弹窗。
 * 数据来自应用已有背景库，线上仅按原 preview 地址加载图片。
 * 分类选择不会写账户、下载图片或改变已选条目。
 */
import { useMemo } from "react";
import { Mountain, Sparkles } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { StaticTagItem } from "@/types/staticTagLibrary";
import { categoryKey, listLibraryFacets, type BackgroundFilters as FilterState } from "@/utils/library-facets";
import { LibraryFacetOption, LibraryFacetSection } from "./library-facet-section";

// 四个大类按参考工具顺序呈现，源数据仍保留自己的中英双语原值。
// 显示名走词条，避免把英文分类键强制翻译后传给实际过滤器。
// 没有出现在映射中的新分类仍可展示原文，不静默丢掉资料。
const CATEGORY_LABELS = { "nature & outdoors": "characters.background.nature", "urban & daily": "characters.background.urban", "fantasy & sci-fi": "characters.background.fantasy", "minimalist & abstract": "characters.background.minimalist" } as const;

/**
 * items 是同一卡片库的全量可用条目，计数分母与网格一致。
 * filters 是父组件受控状态，切换分类后统一重置到第一页。
 * onChange 仅返回分类，不清除搜索文本或已选提示词草稿。
 * 组件不处理收藏落盘，继续使用既有库的选择能力。
 */
interface BackgroundFiltersProps { items: StaticTagItem[]; filters: FilterState; onChange: (filters: FilterState) => void }

/**
 * 特征名称优先使用数据本身的中英文标签对照，遵循原工具规则。
 * 只有双语标签数量完全一致时才按位置取译名，避免错位翻译。
 * 未找到精确对应时保留原始 trait，不猜测中文含义。
 * 标签对照只影响显示，不会把 night 改为其他筛选键。
 * 英文界面直接使用原值，不向远端请求翻译服务。
 * 一个 trait 在多条记录中出现时使用首个可靠对照。
 */
// 数据中的trait可能是night，但提示词也可能写为nighttime，此时保留night。
// 精确比对避免把sea误命中seaside或把day误命中daylight。
// 末尾逗号先过滤空项，双语标签的对齐不受空尾项干扰。
// 中文缺项导致数量不同时整条跳过，不借用相邻词的译名。
// 返回的label只写入文本节点，不成为下一次过滤的参数。
// 不依靠界面语言做字符串猜测，locale明确来自应用语言状态。
// 原资料可能有多种译法，首个精确对照保持显示稳定。
// 该函数在memo构建特征列表时执行，不在每一行hover时重复查询。
// 只读遍历内置数据，不修改tags_zh来修正原始资料。
// 没有可靠译名也不会隐藏该特征，用户仍可按原值选择。
function traitLabel(value: string, items: StaticTagItem[], locale: string): string {
  if (locale !== "zh-CN") return value;
  for (const item of items) {
    const english = item.tags.split(",").map(tag => tag.trim().toLowerCase()).filter(Boolean), chinese = item.tags_zh.split(",").map(tag => tag.trim()).filter(Boolean);
    const index = english.indexOf(value.toLowerCase());
    if (index >= 0 && english.length === chinese.length) return chinese[index] || value;
  }
  return value;
}

/**
 * 场景大类使用多选并集，特征使用多选交集，说明文字明确两者关系。
 * 数据变化时重算全库计数，普通选择不会反复遍历数据生成统计。
 * 分类的固定顺序和特征的热度顺序分开，不能用同一个排序覆盖。
 * 取消已选值只影响本组，其余场景和特征保持生效。
 * 清除按钮仅重置本面板的分类，不会删除已选卡片。
 * 两区默认展开，用户可分别收起，外层侧栏负责滚动。
 * 计数表示可用条目数，不是满足其他条件后的实时交叉计数。
 * 没有结果时仍保留全部分类，便于直接撤销冲突条件。
 * 没有特征的记录可在不选特征时出现，不强塞“默认特征”。
 * 所有回调是同步状态更新，不需要防抖请求或递归重试。
 */
export function BackgroundFilters({ items, filters, onChange }: BackgroundFiltersProps) {
  const { t, locale } = useTranslation();
  // 场景大类顺序固定为自然、都市、幻想、极简，与参考工具一致。
  // 四个计数来自可用items，排除duplicate占位与无效卡片后的分母相同。
  // 同一条资料有多个大类时可在多个徽标各计一次，徽标总和不代表全集。
  // 原始categories保留中英双语，这里只用末尾英文确定固定排序。
  // 未来新增类别仍保留原文按钮，不因缺少词条而丢失条目入口。
  // 类别列表本身不会根据已选特征减少，冲突时仍能撤销其他条件。
  // memo依赖items引用，父级换库或资料更新时统计会重新计算。
  // 选择变化不在依赖中，避免每点一个复选项重新扫描整库。
  // 每个按钮使用源分类为key，同一中文显示名也不会成为身份依据。
  // 统计空列表时返回空数组，面板仍保留清除和说明文字。
  const categories = useMemo(() => listLibraryFacets(items, "categories").sort((a, b) => Object.keys(CATEGORY_LABELS).indexOf(categoryKey(a.value)) - Object.keys(CATEGORY_LABELS).indexOf(categoryKey(b.value))), [items]);
  // 特征按真实条目数降序排列，数量相同时按原值稳定排序。
  // 特征清单由数据动态生成，不把截图中的几个示例写成固定白名单。
  // indoor与outdoor是两个精确值，用户同时选择可能得到正常空结果。
  // 标签重复只在每条记录内去重，不合并两个不同来源的背景条目。
  // 使用locale作为依赖，切换语言只重算显示名，不更改筛选状态。
  // 翻译成功也保留value，用于title、键和实际过滤参数。
  // 页面关键词输入框仍在共用工具栏，不新增第二份背景内容搜索。
  // 预览加载失败不改变计数，图片网络状态与本地分类彼此独立。
  // 本组件不为每个trait启动网络请求，所有统计均是内存只读计算。
  // 标签名称作为React文本显示，不能被解释为HTML或工具指令。
  const traits = useMemo(() => listLibraryFacets(items, "traits").map(item => ({ ...item, label: traitLabel(item.value, items, locale) })), [items, locale]);
  // 选项始终生成新数组，不就地改动 React 已提交状态。
  // 同一值第二次点击即撤销，可用键盘完成同样操作。
  // 清空一组不会把另一组同时抹掉；只有清除按钮清空两组。
  // categories允许多个选中，回调不会像旧单选那样覆盖整组值。
  // traits同样保留数组，但要求全部命中的规则由过滤函数实现。
  // 当前组未选中值追加到尾部，选中值再点则只删除这一项。
  // 不在这里清空selected，用户切换场景仍保留之前明确选择的卡片。
  // 父级处理返回第一页与退出已选视图，避免多处维护页码。
  // 同一套行组件同时服务角色单选，业务差异集中在这个回调。
  // 这里没有访问事件载荷之外的DOM来推导选择，受控状态是唯一来源。
  // 按钮隐藏或面板收起不影响数组，因此活动条件不会悄悄失效。
  const toggle = (field: keyof FilterState, value: string) => onChange({ ...filters, [field]: filters[field].includes(value) ? filters[field].filter(item => item !== value) : [...filters[field], value] });
  return <div data-background-filters className="space-y-3 px-2 py-3">
    {/* 界面：全部分类按钮同时清空场景与特征，保留搜索和选择。 */}
    <button type="button" data-background-filter-clear disabled={!filters.categories.length && !filters.traits.length} onClick={() => onChange({ categories: [], traits: [] })} className="h-8 w-full rounded-lg border border-border px-3 text-left text-xs text-muted-foreground hover:bg-muted disabled:opacity-40">{t("characters.facets.clear")}</button>
    {/* 界面：四个场景大类可多选，满足其中任意一个即可。 */}
    {/* 中文分类展示与英文比较键分离，类别切换不会修改原始Tags。 */}
    {/* 没有选中场景时不限制场景，仍可只用特征组合搜索。 */}
    {/* 计数随正式数据更新重新计算，不把本轮基线数字写死在UI。 */}
    {/* 共享折叠组件保留子内容，展开后仍能看见先前选择状态。 */}
    <LibraryFacetSection prefix="background-filter" field="categories" title={t("characters.background.categories")} icon={<Mountain className="h-3.5 w-3.5 shrink-0 text-violet-500" />} defaultOpen>
      {categories.map(({ value, count }) => { const key = categoryKey(value); return <LibraryFacetOption key={value} prefix="background-filter" field="categories" value={value} label={key in CATEGORY_LABELS ? t(CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS]) : value} count={count} selected={filters.categories.includes(value)} onClick={() => toggle("categories", value)} />; })}
    </LibraryFacetSection>
    {/* 界面：特征来自数据动态统计，必须同时满足所有选中项。 */}
    <LibraryFacetSection prefix="background-filter" field="traits" title={t("characters.background.traits")} icon={<Sparkles className="h-3.5 w-3.5 shrink-0 text-pink-500" />} defaultOpen>
      {traits.map(({ value, count, label }) => <LibraryFacetOption key={value} prefix="background-filter" field="traits" value={value} label={label} count={count} selected={filters.traits.includes(value)} onClick={() => toggle("traits", value)} />)}
    </LibraryFacetSection>
    {/* 徽标表示整库条目数，不会被当前24张可见卡片截断。 */}
    {/* 说明保留在面板内部，滚动时不会额外占据固定按钮区。 */}
    {/* 选择交集为空属于正常结果，不擅自改成任意命中。 */}
    {/* 清除分类不会移除资料，全部可用记录随时能恢复。 */}
    {/* 界面：解释筛选关系与数据来源，空结果不触发自动放宽。 */}
    <p className="px-2 text-[11px] leading-5 text-muted-foreground">{t("characters.background.hint")}</p>
  </div>;
}
