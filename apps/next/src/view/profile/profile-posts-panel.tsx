"use client";

// 下拉选项沿用原业务值，菜单外观、滚动与键盘操作统一复用采样器组件。
import { SimpleSelect } from "@/components/SimpleSelect";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, MoreVertical, ThumbsUp } from "lucide-react";
import { useTranslation, type MessageKey } from "@/i18n";
import { ProfileArtworkCard } from "@/components/profile/profile-artwork-card";
import { ProfileDialog } from "./profile-dialog";
import { PROFILE_CATEGORIES, PROFILE_REFERENCE_POSTS, type ProfileCategory, type ProfileContentTab, type ProfileReferencePost } from "./profile-reference-data";

export function postTitleKey(post: ProfileReferencePost): MessageKey { return `profile.ui.post${post.id}` as MessageKey; }
function descriptionKey(post: ProfileReferencePost): MessageKey { return `profile.ui.description${post.id}` as MessageKey; }
interface PostCardProps { post: ProfileReferencePost; liked: boolean; comments: number; onLike: () => void; onOpen: () => void; onMenu: () => void }

/**
 * 帖子卡复用收藏作品的封面与正文骨架，样式调整只需维护一个组件。
 * 评论、喜欢和更多菜单仍使用原有回调，复用不改变帖子交互状态。
 * 日期来自帖子自身，卡片公共层不填造发布时间或点赞数量。
 * 菜单位于标题旁，评论与喜欢位于 footer，保留原来的键盘访问顺序。
 * 评论数包含本页新增评论；样例点赞只在原始夹具计数上加一。
 * 帖子标识由 kind 保留，收藏卡不会被帖子筛选或专项选择器误计。
 * 描述继续显示完整词条的截断预览，详情中的全文不受卡片压缩影响。
 * footer 的时间与按钮作为插槽传入，不在共用组件中判断业务分支。
 * 不对卡片增加父级点击，避免菜单打开时同时触发详情。
 */
function PostCard({ post, liked, comments, onLike, onOpen, onMenu }: PostCardProps) {
  const { t } = useTranslation(), title = t(postTitleKey(post));
  return <ProfileArtworkCard kind="post" id={post.id} image={post.image} title={title} category={t(`profile.ui.${post.category}`)} description={t(descriptionKey(post))} onOpen={onOpen} headingAction={<button type="button" aria-label={t("profile.ui.more")} onClick={onMenu}><MoreVertical size={16} /></button>} footer={<><time dateTime={post.date}>{post.date}</time>
        <button type="button" aria-pressed={liked} aria-label={t("profile.ui.like", { title })} onClick={onLike}><ThumbsUp size={14} />{post.likes + Number(liked)}</button>
        <button type="button" aria-label={t("profile.ui.comment", { title })} onClick={onOpen}><MessageCircle size={14} />{post.comments + comments}</button>
      </>} />;
}

/**
 * 评论只传回本页父组件；React 文本节点负责转义，不解析用户输入为 HTML。
 * 空白评论不提交，长度由浏览器限制为 300 字符；刷新后没有历史恢复行为。
 */
function PostDetail({ post, comments, onComment, onClose }: { post: ProfileReferencePost; comments: string[]; onComment: (value: string) => void; onClose: () => void }) {
  const { t } = useTranslation(), [value, setValue] = useState("");
  return <ProfileDialog title={t(postTitleKey(post))} onClose={onClose}>
    <img className="pr-detail-image" src={post.image} alt={t(postTitleKey(post))} /><p>{t(descriptionKey(post))}</p><small>{t("profile.ui.commentHint")}</small>
    <ul className="pr-comments">{comments.map((comment, i) => <li key={i}>{comment}</li>)}</ul>
    <form onSubmit={event => { event.preventDefault(); if (value.trim()) { onComment(value.trim()); setValue(""); } }}>
      <textarea aria-label={t("profile.ui.commentPlaceholder")} placeholder={t("profile.ui.commentPlaceholder")} value={value} onChange={event => setValue(event.target.value)} required maxLength={300} rows={3} />
      <button className="pr-button" type="submit">{t("profile.ui.submit")}</button>
    </form>
  </ProfileDialog>;
}

function PostFilters({ category, setCategory, sort, setSort }: { category: ProfileCategory; setCategory: (value: ProfileCategory) => void; sort: string; setSort: (value: string) => void }) {
  const { t } = useTranslation();
  return <header className="pr-post-toolbar"><div className="pr-categories" aria-label={t("profile.ui.category")}>
    {PROFILE_CATEGORIES.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{t(`profile.ui.${item}`)}</button>)}
  </div><SimpleSelect
 ariaLabel={t("profile.ui.sort")}
 value={String(sort)}
 onChange={(value) => setSort(value)}
 className="min-w-0" portal
 options={[{ value: String("new"), label: t("profile.ui.newest") }, { value: String("popular"), label: t("profile.ui.popular") }, { value: String("old"), label: t("profile.ui.oldest") }]}
 /></header>;
}

interface SampleState { liked: number[]; saved: number[]; privatePosts: number[]; comments: Record<number, string[]> }
/** 分类与互动筛选取交集；先 filter 生成新数组再 sort，避免改动共享夹具顺序。 */
function selectPosts(tab: ProfileContentTab, category: ProfileCategory, sort: string, state: SampleState) {
  return PROFILE_REFERENCE_POSTS.filter(post => (category === "all" || post.category === category)
    && (tab !== "likes" || state.liked.includes(post.id)) && (tab !== "privatePosts" || state.privatePosts.includes(post.id)))
    .sort((a, b) => sort === "popular" ? b.likes + Number(state.liked.includes(b.id)) - a.likes - Number(state.liked.includes(a.id)) : sort === "old" ? b.id - a.id : a.id - b.id);
}

/**
 * 点赞、收藏、可见范围与评论都是非持久化状态，不请求 API、不写用户文档。
 * 三个帖子视图共用此实例，返回帖子时保留刚完成的样例互动和分类选择。
 * saved 仅改变更多菜单中的收藏状态；正式收藏夹标签继续显示真实云端资源。
 * 实际模式使用现有帖子空态，不把参考图中的作者内容展示为当前账户真实发布。
 */
export function ProfilePostsPanel({ sample, tab }: { sample: boolean; tab: ProfileContentTab }) {
  const { t } = useTranslation(), [category, setCategory] = useState<ProfileCategory>("all"), [sort, setSort] = useState("new");
  const [state, setState] = useState<SampleState>({ liked: [], saved: [], privatePosts: [4], comments: {} });
  const [selected, setSelected] = useState<ProfileReferencePost | null>(null), [menu, setMenu] = useState<ProfileReferencePost | null>(null);
  const toggle = (field: "liked" | "saved" | "privatePosts", id: number) => setState(current => ({ ...current, [field]: current[field].includes(id) ? current[field].filter(item => item !== id) : [...current[field], id] }));
  const posts = sample ? selectPosts(tab, category, sort, state) : [];
  return <section className="pr-panel pr-posts" aria-label={t("profile.ui.posts")}>
    {/* 界面：「帖子」内容分类、排序与作品卡片；所有样例互动只存在组件内存。 */}
    <PostFilters category={category} setCategory={setCategory} sort={sort} setSort={setSort} />
    <div className="pr-post-grid">{posts.map(post => <PostCard key={post.id} post={post} liked={state.liked.includes(post.id)} comments={state.comments[post.id]?.length ?? 0} onLike={() => toggle("liked", post.id)} onOpen={() => setSelected(post)} onMenu={() => setMenu(post)} />)}</div>
    {!posts.length && <div className="pr-empty"><h3>{t(sample ? "profile.ui.empty" : "profile.tabs.emptyPostsTitle")}</h3><p>{t(sample ? "profile.ui.sampleEmpty" : "profile.tabs.emptyPostsDescription")}</p><Link className="pr-button" href="/create">{t("profile.tabs.goCreate")}</Link></div>}
    {selected && <PostDetail post={selected} comments={state.comments[selected.id] ?? []} onClose={() => setSelected(null)} onComment={value => setState(current => ({ ...current, comments: { ...current.comments, [selected.id]: [...(current.comments[selected.id] ?? []), value] } }))} />}
    {menu && <ProfileDialog title={t(postTitleKey(menu))} onClose={() => setMenu(null)}>
      <button className="pr-choice" type="button" onClick={() => { toggle("saved", menu.id); setMenu(null); }}>{t(state.saved.includes(menu.id) ? "profile.ui.unsave" : "profile.ui.save")}</button>
      <button className="pr-choice" type="button" onClick={() => { toggle("privatePosts", menu.id); setMenu(null); }}>{t(state.privatePosts.includes(menu.id) ? "profile.ui.publicAction" : "profile.ui.privateAction")}</button>
      <button className="pr-choice" type="button" onClick={() => { setSelected(menu); setMenu(null); }}>{t("profile.ui.detail")}</button>
    </ProfileDialog>}
  </section>;
}
