"use client";

/**
 * 画师侧栏只提供真实收藏分组和参考工具的七种排序。
 * 分类外壳、折叠行和数量徽标复用角色/背景的组件。
 * 分组编辑就地展开，使用主题输入，不调用原生prompt/confirm。
 * 当前选中的跨页画师可批量加入组，源画师资料不会被修改。
 */
import { useState } from "react";
import { Folder, ArrowDownWideNarrow, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useArtistLibraryStore } from "@/stores/use-artist-library-store";
import { ARTIST_SORTS, type ArtistSort } from "@/utils/artist-library";
import { LibraryFacetOption, LibraryFacetSection } from "./library-facet-section";

/**
 * group空字符串代表全部，favorites代表默认收藏且不能重命名或删除。
 * selectedIds为父组件完整草稿，不从当前网格猜批量操作对象。
 * onGroup改变时父级统一返回第一页并退出只看已选。
 * sort与seed留在弹窗状态，保存收藏不改变当前排序。
 * count是全库本地条目数，默认收藏与分组分别显示成员数。
 * 分组中的同一画师只记一次，由持久化store统一去重。
 */
interface ArtistFiltersProps { group: string; sort: ArtistSort; count: number; selectedIds: string[]; onGroup: (group: string) => void; onSort: (sort: ArtistSort) => void }

/**
 * 编辑id为null时不展示编辑区，空字符串表示新建组。
 * 重命名时保存原id，避免成员关系因为改名丢失。
 * 点击删除前展开组可看到成员；按钮文案明确只删除分组。
 * 删除活动组立即返回全部，不保留已经不存在的过滤条件。
 * 满200组时禁用新建，校验与schema上限保持一致。
 * 保存空名称时按钮禁用，store仍有第二道空值校验。
 * 批量移除只移除本组关系，默认收藏不会随之减少。
 * 显式操作才写盘，搜索或切换排序不会污染用户文档。
 * 编辑区关闭不会保存草稿，按取消可保留原分组。
 * label使用词条；分组名称按用户输入原样作为文本显示。
 * 排序随机按钮可重复点击，父级为每次点击生成新seed。
 * 每个分组操作独立button，不嵌套在分类选择button里。
 */
/**
 * 库总数来自父组件正式清单，不把40600写死在侧栏展示代码。
 * 默认收藏计数包含所有分页的收藏ID，不只统计当前可见卡片。
 * 组计数使用持久化成员数组，重复加入由store去重后再显示。
 * 折叠收藏区保留内部表单状态，展开后尚未保存的组名不会突然清空。
 * 编辑状态仅本组件生命周期内存在，关闭modal会丢弃未保存表单。
 * 点击新建先清空组名，不能把上次正在重命名的文字带入新组。
 * 选择重命名会填入准确的当前组名，保存继续使用原UUID。
 * 删除正在编辑的组时关闭编辑表单，避免随后提交已经不存在的目标。
 * 删除非活动组时不改变当前筛选，其他组的成员继续展示。
 * 按钮禁用状态由选择数量决定，零选中时不会写入空成员列表。
 * 默认收藏没有批量移出入口，取消收藏仍由明确的卡片心形操作完成。
 * 组成员移除后卡片可能从当前列表消失，但原多选草稿仍在父级。
 * 用户可切换只看已选继续处理这些条目，不需要重新扫描所有分页。
 * 新建和改名共用一个submit处理，键盘Enter与保存按钮行为一致。
 * form阻止浏览器默认导航，保存不会重载整个创建页。
 * 输入maxLength和store截断一起限制长度，不能只依赖浏览器输入约束。
 * 分组名称为空或纯空白时既不提交也不关闭，保留用户继续输入机会。
 * 取消是type=button，不会误触发表单submit。
 * 组名作为React文本展示，不成为目录名、CSS类或模块导入路径。
 * 编辑与删除小图标均有可访问名称，不能只依靠视觉猜操作。
 * 删除文案明确保留收藏，避免用户误以为会删除实际模型或本地文件。
 * 排序由父级受控，收起再展开不会把当前排序恢复成默认值。
 * 作品数和独特性各有升降序，不把降序按钮当作可反复翻转的隐式开关。
 * 名称A–Z与Z–A使用两个明确值，便于工具和键盘识别当前状态。
 * 随机是动作入口，重复点击允许换一份顺序而非只能取消选择。
 * 每个排序按钮aria-pressed直接比较受控值，不根据CSS颜色反推。
 * 折叠区图标只是分类提示，不参与画师模型或权重选择。
 * 这个面板不提供自定义画师上传，所有ID都来自随包参考数据。
 * 没有给未收录画师编造作品数或分数，用户仍可直接编辑主提示词。
 * 主题信息从父窗口共享变量取得，组名输入不会在暗色下留白。
 * 集合变更由store订阅立即通知徽标，页面无需手动刷新组列表。
 * 同一组中批量加入多个画师使用当前完整selectedIds，不读取主区DOM。
 */
export function ArtistFilters({ group, sort, count, selectedIds, onGroup, onSort }: ArtistFiltersProps) {
  const { t } = useTranslation();
  const { collections, saveGroup, deleteGroup, assign } = useArtistLibraryStore();
  const [editing, setEditing] = useState<string | null>(null), [name, setName] = useState("");
  const button = "rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-40";
  return <div data-artist-filters className="space-y-3 px-2 py-3">
    {/* 界面：全部与默认收藏是固定入口，自定义组只展示真实保存的成员。 */}
    <LibraryFacetOption prefix="artist-filter" field="group" value="" label={t("characters.artist.all")} count={count} selected={!group} onClick={() => onGroup("")} />
    <LibraryFacetSection prefix="artist-filter" field="groups" title={t("characters.artist.collections")} icon={<Folder size={14} />} defaultOpen>
      <LibraryFacetOption prefix="artist-filter" field="group" value="favorites" label={t("characters.artist.favorites")} count={collections.favorites.length} selected={group === "favorites"} onClick={() => onGroup("favorites")} />
      {/* 用户分组的选择、重命名与删除各自独立；删除不删除画师或默认收藏。 */}
      {collections.groups.map(item => <div key={item.id}><LibraryFacetOption prefix="artist-filter" field="group" value={item.id} label={item.name} count={item.artistIds.length} selected={group === item.id} onClick={() => onGroup(item.id)} /><div className="flex justify-end gap-2 pb-1"><button type="button" data-artist-group-rename={item.id} title={t("characters.artist.rename")} aria-label={t("characters.artist.rename")} onClick={() => { setEditing(item.id); setName(item.name); }} className={button}><Pencil size={12} /></button><button type="button" data-artist-group-delete={item.id} title={t("characters.artist.deleteGroup")} aria-label={t("characters.artist.deleteGroup")} onClick={() => { deleteGroup(item.id); if (group === item.id) onGroup(""); if (editing === item.id) setEditing(null); }} className={button}><Trash2 size={12} /></button></div></div>)}
      {/* 新建与改名共用一份表单，避免一个功能再复制一套弹窗。 */}
      <button type="button" data-artist-group-new disabled={collections.groups.length >= 200} onClick={() => { setEditing(""); setName(""); }} className={button}>{t("characters.artist.newGroup")}</button>
      {editing !== null && <form className="mt-2 space-y-2" onSubmit={event => { event.preventDefault(); if (name.trim()) { saveGroup(editing, name); setEditing(null); } }}><input data-artist-group-name value={name} maxLength={60} aria-label={t("characters.artist.groupName")} placeholder={t("characters.artist.groupName")} onChange={event => setName(event.target.value)} className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-accent-stroke" /><div className="flex gap-2"><button type="submit" data-artist-group-save disabled={!name.trim()} className={button}>{t("common.save")}</button><button type="button" onClick={() => setEditing(null)} className={button}>{t("common.cancel")}</button></div></form>}
      {/* 只有实际自定义组提供成员操作，默认收藏通过各卡片心形按钮维护。 */}
      {/* 加入会自动收藏，移出只清除当前分组关系；两者均支持跨页选择。 */}
      {collections.groups.some(item => item.id === group) && <div className="mt-2 flex flex-col gap-2"><button type="button" data-artist-group-add disabled={!selectedIds.length} onClick={() => assign(group, selectedIds, true)} className={button}>{t("characters.artist.addSelected")}</button><button type="button" data-artist-group-remove disabled={!selectedIds.length} onClick={() => assign(group, selectedIds, false)} className={button}>{t("characters.artist.removeSelected")}</button></div>}
    </LibraryFacetSection>
    {/* 界面：排序来源为参考工具的作品数、独特性、名称与随机。 */}
    {/* 评分是本地资料指标，不声称能代表所有生成模型的绘画质量。 */}
    <LibraryFacetSection prefix="artist-filter" field="sort" title={t("characters.toolbar.sort")} icon={<ArrowDownWideNarrow size={14} />} defaultOpen>{ARTIST_SORTS.map(value => <button type="button" key={value} data-artist-order={value} aria-pressed={sort === value} onClick={() => onSort(value)} className={`flex h-8 w-full items-center rounded-lg px-3 text-left text-xs ${sort === value ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"}`}>{t(`characters.artist.sort.${value}`)}</button>)}</LibraryFacetSection>
    {/* 说明区保留数据来源和操作边界，预览联网失败不影响收藏。 */}
    <p className="px-2 text-[11px] leading-5 text-muted-foreground">{t("characters.artist.hint")}</p>
  </div>;
}
