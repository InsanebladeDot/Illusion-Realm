"use client";

// 下拉选项沿用原业务值，菜单外观、滚动与键盘操作统一复用采样器组件。
import { SimpleSelect } from "@/components/SimpleSelect";

import { useState } from "react";
import { Bookmark, Heart, Search } from "lucide-react";
import { useTranslation } from "@/i18n";
import { ProfileArtworkCard } from "@/components/profile/profile-artwork-card";
import { ProfileDialog } from "./profile-dialog";
import { COLLECTION_CATEGORIES, type CollectionSample } from "./profile-collection-data";
import type { ProfileCollectionsState } from "./use-profile-collections";
import role from "@/assets/icon/Nav/sidebar.webp";

/**
 * 界面：收藏作品卡，骨架与帖子卡复用同一个 ProfileArtworkCard。
 * 封面、类别、标题、正文和 footer 的布局不在这里复制。
 * 收藏按钮是封面按钮的兄弟节点，点击移除不会同时打开详情。
 * 心形只更新样例喜欢，不把参考赞数写入任何账户字段。
 * 日期直接取样例 ISO 日期，浏览器不会按时区偏移成另一天。
 * tags 已在词条中包含分隔符，作为普通文本渲染而非解析 HTML。
 * 所有按钮名称由当前语言生成，图标不作为唯一可访问名称。
 * id 只标识界面样例，不能交给云端删除接口使用。
 * 图与标题共用查看回调，键盘与指针都能打开同一详情。
 * 取消收藏直接调用父级控制器，最近列表和分类计数随之更新。
 * 类别 chip 显示该作品的分类，而非用户当前选择的筛选分类。
 * 固定的 saved 状态表示卡片仍在收藏列表，取消后整卡从网格移除。
 */
function SavedArtwork({ item, state }: { item: CollectionSample; state: ProfileCollectionsState }) {
  const { t } = useTranslation(), title = t(item.title), liked = state.liked.includes(item.id);
  return <ProfileArtworkCard kind="collection" id={item.id} title={title} image={item.image} category={t(`profile.collections.${item.category}`)} description={t(item.tags)} onOpen={() => state.setSelected(item.id)}
    coverAction={<button type="button" className="pr-bookmark" aria-label={t("profile.collections.remove", { title })} onClick={() => state.remove(item.id)}><Bookmark size={14} fill="currentColor" /></button>}
    footer={<><time dateTime={item.date}>{item.date}</time><button type="button" aria-pressed={liked} aria-label={t("profile.ui.like", { title })} onClick={() => state.toggleLike(item.id)}><Heart size={14} fill={liked ? "currentColor" : "none"} />{item.likes + Number(liked)}</button></>} />;
}

/**
 * 界面：「我的收藏夹」样例面板；外层仍显示个人主页的样例声明。
 * 实际模式另用原来的 CloudCollectionsPanel，不用静态作品冒充云端列表。
 * 分类 pills 与右侧分类调用同一个 setter，两个入口的选中状态同步。
 * 分类计数显示全部仍收藏的样例数，搜索只缩小中部可见结果。
 * 搜索按标题、标签和分类取交集，排序在筛选结果上执行。
 * 无结果提供清除筛选，保留当前收藏和喜欢状态，不暗中恢复已取消项。
 * 管理弹窗明确说明数据边界，恢复样例必须由用户主动点击。
 * 详情复用原生 ProfileDialog，沿用焦点归还、Escape 和可访问标题。
 * 详情只呈现已知图片、标签和日期，不捏造生成模型与作者信息。
 * 网格复用 .pr-post-grid，足够宽时四至五列，稀疏结果不拉大卡片。
 * 搜索框有可访问名称，图标为辅助提示，不依赖 placeholder 表达用途。
 * clear 仅重置查询与分类，最热门或最早的排序偏好仍保留。
 * 切换标签通过 hidden 保留本面板，管理与详情状态不会凭空重建。
 * 动作均在内存中完成，不产生异步成功提示或账户写操作。
 * 详情取消收藏后随控制器关闭，避免展示已移出当前收藏的对象。
 * 文案与图片来自同一条样例，不根据列表下标误配筛选后的作品。
 * 本面板不重复渲染侧栏，避免窄屏时出现两组分类或最近收藏。
 * 宽度不足时工具条可换行，正文仍由个人主页容器负责纵向滚动。
 * 分类行不复用帖子分类状态，绘画心得与收藏角色分类不是同一个口径。
 * 作品标题始终来自作品自身词条，搜索切换不会把数组下标误当成 ID。
 * 分类按钮使用实际计数，取消最后一项后对应分类仍显示零。
 * 搜索结果空态与全部取消收藏使用同一空态，管理入口始终可用。
 * 最近列表的查看请求回到此处渲染详情，侧栏不会再额外打开另一个弹窗。
 * 当前详情存在时图片地址与标题保持一一对应，不根据排序重新取图。
 * 封面按钮没有父级导航，收藏夹中的查看不会跳转到真实图片 API。
 * 选择排序不更改分类，搜索清空也不会暗中撤销当前排序。
 * 选项文案与可访问名称均来自同一个 locale，语言切换不出现混合标题。
 * 网格节点使用稳定 ID 作为 key，本地喜欢更新不重建其他卡片。
 * 标签当前只作文本展示，未承诺点击单个标签会提交搜索。
 * 管理提示使用常规正文，用户可选中复制以确认样例数据范围。
 * 恢复按钮只重置本地控制器，实际云端组件始终拥有自己的状态。
 * 面板底部管理入口与侧栏入口指向同一弹窗，窄屏无须滚到侧栏才可恢复。
 * 收藏按钮的移除操作与详情中的取消操作共用同一函数。
 * 恢复样例会关闭管理弹窗，下一次打开仍读取当前完整计数。
 * 没有历史收藏数据时不依靠截图计数推断账户中存在八张作品。
 * 用户切到实际内容后看到的是原云端文件夹，样例搜索不会作用到服务器。
 * 云端写入失败或权限错误由真实面板原有反馈处理，不被本地交互吞掉。
 * 卡片无需了解模式开关，宿主负责只在正确的数据模式下显示它。
 * 截图附带的旧收藏标记不会作为图片交互，右上角按钮由真实 DOM 绘制。
 * 日期节点包含 dateTime，文字展示与机器读取保持一致。
 * 搜索内容不拼接到 HTML、URL 或文件路径中，仅用于本地字符串匹配。
 * 面板本身不监听全局键盘，原生 dialog 负责自身焦点和关闭键。
 * 每个标签都保留 role=tabpanel 的外层关系，本面板不再创建重复标签页。
 * 高度由内容决定，新增行可滚动，不通过固定面板高度截断下方作品。
 * 右侧列表不传入未知作者、模型、分辨率，避免把参考图当作元数据来源。
 * 插画及新增两张截图裁切图使用打包资源，离线启动也能呈现样例。
 * 更换主题只改变公共色彩 token，不重置搜索、收藏或喜欢状态。
 * 作品卡与帖子卡保持相同宽高约束，后续调整只需维护共用样式。
 * 稀疏筛选仍使用 auto-fill 网格，单项结果不会铺满整行。
 * 窄屏标题与控件自然换行，不使用 transform 缩放文字掩盖空间不足。
 * 所有交互回调都由 React 绑定，图片资源没有内嵌脚本或事件字符串。
 */
export function ProfileCollectionsPanel({ state }: { state: ProfileCollectionsState }) {
  const { t } = useTranslation(), [managing, setManaging] = useState(false), item = state.selected;
  return <section className="pr-panel pr-saved" data-profile-collections>
    <header className="pr-saved-toolbar"><h2>{t("profile.cloud.myCollections")}</h2><label className="pr-saved-search"><Search size={15} /><input aria-label={t("profile.collections.search")} placeholder={t("profile.collections.search")} value={state.search} onChange={event => state.setSearch(event.target.value)} /></label><SimpleSelect
 ariaLabel={t("profile.collections.sort")}
 value={String(state.sort)}
 onChange={(value) => state.setSort(value)}
 className="min-w-0" portal
 options={[{ value: String("new"), label: t("profile.collections.newest") }, { value: String("old"), label: t("profile.collections.oldest") }, { value: String("popular"), label: t("profile.ui.popular") }]}
 /></header>
    {/* 界面：分类与计数；侧栏共享同一控制器，不独立计算另一套选中项。 */}
    <div className="pr-saved-categories" aria-label={t("profile.collections.categories")}>{COLLECTION_CATEGORIES.map(key => <button type="button" key={key} data-collection-category={key} aria-pressed={state.category === key} onClick={() => state.setCategory(key)}>{t(`profile.collections.${key}`)} <span>{state.counts[key]}</span></button>)}</div>
    <div className="pr-post-grid">{state.visible.map(value => <SavedArtwork key={value.id} item={value} state={state} />)}</div>
    {!state.visible.length && <div className="pr-empty"><h3>{t("profile.ui.empty")}</h3><button type="button" className="pr-button" onClick={() => { state.setSearch(""); state.setCategory("all"); }}>{t("profile.collections.clear")}</button></div>}
    <button type="button" className="pr-saved-manage" data-collection-manage onClick={() => setManaging(true)}>{t("profile.collections.manage")}</button>
    {managing && <ProfileDialog title={t("profile.collections.manage")} onClose={() => setManaging(false)}><p>{t("profile.collections.sampleHint")}</p><button type="button" className="pr-button" onClick={() => { state.reset(); setManaging(false); }}>{t("profile.collections.reset")}</button></ProfileDialog>}
    {item && <ProfileDialog title={t(item.title)} onClose={() => state.setSelected(null)}><img className="pr-detail-image" src={item.image} alt={t(item.title)} /><p>{t(item.tags)}</p><time dateTime={item.date}>{item.date}</time><button type="button" className="pr-choice" onClick={() => state.remove(item.id)}>{t("profile.ui.unsave")}</button></ProfileDialog>}
  </section>;
}

/**
 * side：收藏分类、最近收藏和底部鼓励插画，与主区读取同一状态。
 * 最近项不受主区的查询影响，取消收藏才移除，符合独立捷径的含义。
 * 分类数量来自当前八条样例的剩余量，不保留参考图的 128 等展示统计。
 * 管理链接聚焦并点击主区同一管理按钮，避免维护第二个管理弹窗实例。
 * 分类名允许长英文收缩；数值不消失，由样式控制两端对齐。
 * 列表整行用于详情查看，右侧移除按钮独立，不嵌套在查看按钮内。
 * 空最近列表提供已有空态文案，仍保留分类与恢复管理入口。
 * 插画只是装饰，alt 为空，不重复朗读主区作品内容。
 * 侧栏保留个人主页共用 data-profile-side 标识，继承原有响应式下移。
 * 真正的云端收藏页仍显示原来的 ProfileSide，不套用样例计数。
 * 最近日期来自作品数据，不增加截图中无法证实的小时分钟。
 * 取消按钮通过标题区分作品，屏幕阅读器能识别要移除哪一项。
 * 操作后不跳转路由，也不更改云端资源分页或登录状态。
 * 同一对象的 liked 状态仍由主卡控制，侧栏不再复制心形计数。
 * 插画背景使用主题 token，浅色与深色切换不出现硬编码白色区域。
 * 顶部 pills 与侧栏的 aria-pressed 一致，键盘用户可获知当前分类。
 * 管理动作使用页面内固定选择器，目标缺失时安全无操作。
 * 没有文件、网络或 IPC 副作用，所有交互均受页面样例声明约束。
 */
export function ProfileCollectionsSide({ state }: { state: ProfileCollectionsState }) {
  const { t } = useTranslation();
  return <aside className="pr-side pr-saved-side" data-profile-side><section className="pr-panel"><header><h2>{t("profile.collections.categories")}</h2><button type="button" onClick={() => document.querySelector<HTMLButtonElement>("[data-collection-manage]")?.click()}>{t("profile.collections.manage")} ›</button></header>
    <div className="pr-saved-category-list">{COLLECTION_CATEGORIES.map(key => <button type="button" key={key} data-collection-side-category={key} aria-pressed={state.category === key} onClick={() => state.setCategory(key)}><Bookmark size={14} /><span>{t(`profile.collections.${key}`)}</span><small>{state.counts[key]}</small></button>)}</div></section>
    <section className="pr-panel"><header><h2>{t("profile.collections.recent")}</h2></header>{state.recent.map(item => <div className="pr-saved-recent" key={item.id}><button type="button" onClick={() => state.setSelected(item.id)}><img src={item.image} alt="" /><span><strong>{t(item.title)}</strong><small>{item.date}</small><small>{t(`profile.collections.${item.category}`)}</small></span></button><button type="button" aria-label={t("profile.collections.remove", { title: t(item.title) })} onClick={() => state.remove(item.id)}><Bookmark size={14} /></button></div>)}
      {!state.recent.length && <p className="pr-empty-note">{t("profile.cloud.noCollections")}</p>}<div className="pr-saved-promo"><p>{t("profile.collections.encouragement")}</p><img src={role.src} alt="" /></div></section>
  </aside>;
}
