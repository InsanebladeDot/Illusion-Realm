"use client";

/**
 * 界面：角色侧栏分类，使用本地资料的真实性别、发色、瞳色与作品。
 * 来源菜单保留在线浏览；默认本地分类下的详情再匹配线上资料。
 * 四类均支持独立展开，不使用横向下拉占用角色网格上方空间。
 * 颜色名称只作显示翻译，实际回调仍是 blue/blonde 等原值。
 * 数字是整库分类记录数，与当前页长度、站点热度分开。
 * 所有分类共用同一外层滚动区，展开多个区段不会互相抢固定高度。
 * 作品按数量排列并支持关键词过滤，避免几千个系列只能靠滚动寻找。
 * 选中同一项再次点击可清除，多个属性之间仍是交集关系。
 */
import { useState } from "react";
import { CircleDot, Flame, Monitor, UserRound } from "lucide-react";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import type { AnimadexSearchParams, AnimadexSearchResult } from "@/types/character";
import { cn } from "@/utils/cn";
// 角色与背景复用分类折叠、计数行，避免两套相似 UI 独立维护。
// 热门作品截断仅影响菜单，搜索仍覆盖完整分类，不限制角色结果。
// 这些纯展示组件不会额外查询模型或修改角色的本地身份。
import { LibraryFacetOption, LibraryFacetSection } from "@/view/create/tagLibrary/library-facet-section";
import { characterWorkFacets } from "@/utils/library-facets";

// 显式映射供词条审计与类型检查识别，不动态拼出不存在的颜色 key。
// 这里只翻译资料里已有的类别，不建立另一份可筛选颜色数据。
// 新资料出现未知颜色时回退原值，不能错误映射成某种现有颜色。
const COLOR_LABELS = {black:"characters.reference.colors.black",blonde:"characters.reference.colors.blonde",white:"characters.reference.colors.white",brown:"characters.reference.colors.brown",blue:"characters.reference.colors.blue",pink:"characters.reference.colors.pink",red:"characters.reference.colors.red",purple:"characters.reference.colors.purple",green:"characters.reference.colors.green",yellow:"characters.reference.colors.yellow"} as const;
// 图标与标题顺序遵循参考图：性别、发色、瞳色、热门作品。
// 每种属性使用独立键，不能把同名颜色的计数或选中状态混用。
// 颜色点缀仅标识分类；面板背景、正文与 hover 跟随当前主题。
const SECTIONS = [{field:"gender",label:"characters.reference.gender",Icon:UserRound,color:"text-pink-500"},{field:"hair",label:"characters.reference.hair",Icon:Flame,color:"text-rose-500"},{field:"eye",label:"characters.reference.eye",Icon:CircleDot,color:"text-sky-500"},{field:"copyright",label:"characters.reference.copyright",Icon:Monitor,color:"text-violet-500"}] as const;

/**
 * filters 与 IPC 共享字段名，组件不直接读取磁盘或请求外网。
 * facets 决定真实分类集合，facetCounts 提供同一批次的数字。
 * 来源切换由父组件重置页码及筛选；分类变化不会关闭选择器。
 * online 模式沿用原在线作品导航，不假装远端支持四属性。
 * 本地未加载时可暂时没有 facets，不能写入截图中的示例计数。
 * props 中的回调不修改收藏，也不会提前应用角色提示词。
 */
interface CharacterReferenceFiltersProps {
  // 在线与本地共用侧栏入口；来源变化不能仅换标签而继续显示上一批卡片。
  // 父级负责重置搜索条件，本组件只回传用户明确选择的来源。
  // local 对应本地筛选与按需线上详情，不是第二份需要用户维护的库。
  source: "local" | "online";
  filters: Pick<AnimadexSearchParams, "copyright" | "gender" | "hair" | "eye">;
  // 分类值来自整库，空结果页仍必须允许用户切换其他颜色或作品。
  // 不能从当前二十四张卡片推导作品表，否则热门项之外的数据会消失。
  // 未加载时 facets 可缺省，来源控件和收藏仍保持可用。
  facets: AnimadexSearchResult["facets"];
  // 每个原值的数量有明确字段归属，不能混合两个 blue 分类的记录。
  // 数字与分类同批返回，未知数量用破折号展示而不是谎报零项。
  // 这里不展示站点实时数量，原始 post_count 也不能替代角色条目数。
  facetCounts: AnimadexSearchResult["facetCounts"];
  onSourceChange: (source: "local" | "online") => void;
  onChange: (filters: CharacterReferenceFiltersProps["filters"]) => void;
}

/**
 * 属性名称翻译不改变筛选值，只改善侧栏阅读。
 * 只有性别的两个明确标签映射为单人女性/男性，其他值原样保留。
 * 空值不在分类中出现，由“全部”按钮统一清除当前项。
 * 色名标题已经标注发色/瞳色，因此行中只需显示颜色文本。
 * 作品名保持参考库原文，避免猜中文译名造成身份混淆。
 * 大小写差异的匹配由主进程处理，此处不二次修改源值。
 */
function useReferenceLabel() {
  const { t } = useTranslation();
  return (field: string, value: string) => {
    if (field === "gender") return value === "1girl" ? t("characters.reference.female") : value === "1boy" ? t("characters.reference.male") : value;
    if (field === "copyright") return value;
    return value in COLOR_LABELS ? t(COLOR_LABELS[value as keyof typeof COLOR_LABELS]) : value;
  };
}

/**
 * 默认展开性别与作品，开合由角色和背景共用的区段组件管理。
 * 每项开合独立保存，展开发色不会自动关闭瞳色或作品。
 * 作品搜索只影响可见分类，不修改已经生效的角色搜索条件。
 * 清除按钮只清当前属性，保留其他条件和多选草稿。
 * 四项列表在同一外层滚动，不设置互相冲突的 flex-1。
 * 图标区保留固定宽度，让标题、行文字与数量徽标分别对齐。
 * 行高度40px提供紧凑但可点击的间距，数字徽标不参与标题排版。
 * 选择态用主题 muted 表面与文字加强，避免暗色下出现粗红边。
 * 统计从服务返回，不按前端分页截断后重新计算。
 * 资料还未加载时仍能切到在线来源，不把用户困在空面板。
 * aria-expanded 与隐藏内容一致，键盘可使用原生按钮操作。
 * 本组件没有异步副作用，路由离开时无需清理额外网络任务。
 */
export function CharacterReferenceFilters({source,filters,facets,facetCounts,onSourceChange,onChange}: CharacterReferenceFiltersProps) {
  // 标题与固定颜色展示名走 i18n，角色名和作品名保持资料原文。
  // 作品排序按条目数，数量相同时按原名稳定排序，不随 React 渲染随机跳位。
  // 展开状态只存在本组件，不会写入用户账户或污染其他资源选择器。
  // 搜索作品没有防抖网络请求，因为它只筛内存分类菜单。
  // 用户清空作品搜索后恢复全部类别，不改变已经选择的其他三个属性。
  // 再次点击选中项可取消，键盘也能通过同一个原生 button 路径完成。
  // 数量徽标只读展示，不是第二个独立可点击筛选入口。
  // 每行 title 保留原值，即使中文颜色显示名有合并别称也可以核对。
  // 来源入口保持使用应用已有下拉组件，四类本体则采用截图的可展开列表。
  // 外层 sidebar 负责高度与滚动，内层不增加会相互抢高度的 flex-1。
  // 默认展开区的内容用原生 hidden 裁掉，不依赖 CSS 动画结束才禁止点击。
  // 多个区段共享当前筛选对象，选择性别后再选眼睛不会覆盖先前条件。
  // 热门作品使用记录数排序，不能用角色图片数量或站点点赞数替代。
  // 标题箭头的旋转只表示当前展开状态，不把活动筛选误作开合状态。
  // 菜单收起后筛选依旧生效，再次展开可核对当前高亮项。
  // 搜索框仅在作品区显示，性别和颜色列表短，无需再加一排输入控件。
  // 数据更新导致缺少当前分类时不擅自选相近值，父级仍保留用户条件。
  // 作品名字过长不会推开数字徽标，用户可通过 title 查看完整原文。
  const { t } = useTranslation(), label = useReferenceLabel();
  // 作品搜索仅筛侧栏菜单，不会隐式改写父组件的角色姓名搜索。
  // 热门之外的作品通过这个入口仍可找到，不把前30名当作全库。
  // 清除分类时一并恢复默认热门列表，已选角色草稿保持不变。
  const [workQuery,setWorkQuery] = useState("");
  return <div data-character-reference-filters className="space-y-3 px-2 py-3">
    {/* 界面：来源置于左侧分类顶部，主工具栏只保留原搜索、多选等动作。 */}
    <SimpleSelect value={source} ariaLabel={t("characters.reference.source")} options={[{value:"local",label:t("characters.reference.local")},{value:"online",label:t("characters.reference.online")}]} onChange={value=>onSourceChange(value==="online"?"online":"local")} className="w-full" portal />
    {/* 界面：清除四个分类条件，不清除关键词、收藏或已选卡片。 */}
    {/* 按钮禁用取决于真实条件，收起分类不会误报无筛选。 */}
    {/* 清空后父级照常重新查询第一页，不在前端伪造完整角色结果。 */}
    {source === "local" && <button type="button" data-character-reference-clear disabled={!Object.values(filters).some(Boolean)} onClick={() => { setWorkQuery(""); onChange({}); }} className="h-8 w-full rounded-lg border border-border px-3 text-left text-xs text-muted-foreground hover:bg-muted disabled:opacity-40">{t("characters.facets.clear")}</button>}
    {/* 界面：四类可以同时展开；列表项和计数均来自本地原始记录。 */}
    {source === "local" && SECTIONS.map(({field,Icon,color,label:title}) => {
      // 作品只默认显示整库数量最多的30项；搜索时使用全部作品。
      // 当前活动作品始终留在菜单中，筛选不会因为截断而不可撤销。
      // 性别与颜色来自真实 facets，不复制示例截图里的固定数量。
      const values = field === "copyright" ? characterWorkFacets(facets?.copyright || [], facetCounts?.copyright || {}, workQuery, filters.copyright) : facets?.[field] || [];
      return <LibraryFacetSection key={field} prefix="character-reference" field={field} title={t(title)} icon={<Icon className={cn("h-3.5 w-3.5 shrink-0",color)} />} defaultOpen={field === "gender" || field === "copyright"}>
          {/* 界面：大量作品可以先按原名搜索；不会把搜索文字直接当分类提交。 */}
          {field === "copyright" && <input type="search" value={workQuery} aria-label={t("characters.reference.searchWorks")} placeholder={t("characters.reference.searchWorks")} onChange={event=>setWorkQuery(event.target.value)} className="my-1 h-8 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke" />}
          {/* 全部按钮只重置当前分类，其余条件保留，因此四类可交叉组合。 */}
          <button type="button" onClick={()=>onChange({...filters,[field]:""})} aria-pressed={!filters[field]} className="flex h-8 w-full items-center rounded-xl px-3 text-left text-xs text-muted-foreground hover:bg-muted">{t("characters.reference.all")}</button>
          {/* 数量右对齐且不缩水；长作品名截断，title 保留完整原值。 */}
          {values.map(value => <LibraryFacetOption key={value} prefix="character-reference" field={field} value={value} label={label(field,value)} count={facetCounts?.[field]?.[value]} selected={filters[field] === value} onClick={() => onChange({...filters,[field]:filters[field] === value ? "" : value})} />)}
      </LibraryFacetSection>;
    })}
    {/* 界面：说明分类与线上补全的关系，计数不能被误读为远端实时统计。 */}
    {source === "local" && <p className="px-2 text-[11px] leading-5 text-muted-foreground">{t("characters.reference.hint")}</p>}
  </div>;
}
