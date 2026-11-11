"use client";

import { useState } from "react";
import { Cloud, Heart, LockKeyhole, MessageCircle, MessageSquare, Shield, FolderHeart } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useAccountStore } from "@/stores/useAccountStore";
import { CloudImagesPanel } from "./cloud-images-panel";
import { CloudCollectionsPanel } from "./cloud-collections-panel";
import { ProfilePostsPanel } from "./profile-posts-panel";
import { ProfileStatisticsPanel } from "./profile-statistics-panel";
import { ProfileSide } from "./profile-side";
import { PROFILE_TAB_ORDER, type ProfileContentTab } from "./profile-reference-data";
// 收藏样例复用作品卡片；真实云端面板仍单独保留权限与分页逻辑。
// 主区和右栏读取同一个 hook 实例，避免取消收藏后数量或最近列表不同步。
// 仅在显式样例模式显示截图作品，不把它们呈现为账户实际收藏。
import { ProfileCollectionsPanel, ProfileCollectionsSide } from "./profile-collections-panel";
import { useProfileCollections } from "./use-profile-collections";

const TAB_ICONS = { posts: MessageSquare, likes: Heart, privatePosts: Shield, private: LockKeyhole, cloudImages: Cloud, cloudCollections: FolderHeart, comments: MessageCircle, received: MessageCircle };

/**
 * 方向键使用自动激活模式，同时移动焦点和内容，Home/End 跳到两端。
 * 帖子、喜欢及私密帖子共用同一 panel，aria-controls 因而指向同一个稳定节点。
 * 评论入口保留在六个参考标签之后，避免视觉复刻删除已有产品入口。
 */
function ProfileTabBar({ active, onTab }: { active: ProfileContentTab; onTab: (tab: ProfileContentTab) => void }) {
  const { t } = useTranslation();
  return <div className="pr-tabs" role="tablist" aria-label={t("profile.tabs.ariaLabel")} onKeyDown={event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const i = PROFILE_TAB_ORDER.indexOf(active);
    const index = event.key === "Home" ? 0 : event.key === "End" ? PROFILE_TAB_ORDER.length - 1 : (i + (event.key === "ArrowRight" ? 1 : -1) + PROFILE_TAB_ORDER.length) % PROFILE_TAB_ORDER.length;
    onTab(PROFILE_TAB_ORDER[index]); event.currentTarget.querySelector<HTMLButtonElement>(`[data-profile-content-tab="${PROFILE_TAB_ORDER[index]}"]`)?.focus();
  }}>{PROFILE_TAB_ORDER.map(tab => {
    const Icon = TAB_ICONS[tab];
    return <button type="button" role="tab" id={`profile-tab-${tab}`} aria-controls={`profile-panel-${["likes", "privatePosts"].includes(tab) ? "posts" : tab}`} tabIndex={active === tab ? 0 : -1} aria-selected={active === tab} data-profile-content-tab={tab} key={tab} onClick={() => onTab(tab)}><Icon size={17} />{t(`profile.ui.${tab}`)}</button>;
  })}</div>;
}

function EmptyComments({ received }: { received: boolean }) {
  const { t } = useTranslation();
  return <div className="pr-panel pr-empty"><h3>{t("profile.tabs.emptyPrefix")}{t(received ? "profile.ui.received" : "profile.ui.comments")}</h3><p>{t("profile.tabs.comingSoon")}</p></div>;
}

/**
 * visited 只延迟首次挂载；离开云端标签后以 hidden 隐藏，保留重试 UUID 与上传草稿。
 * accountId 作为云端组件 key，切换账户时丢弃上个账户的私有会话状态。
 * 私密统计复用历史 private 标识；privatePosts 明确表示样例帖子的可见范围。
 * 页面不因切换统计而改写全局导航折叠偏好，由应用外壳自行响应窗口尺寸。
 */
export function ProfileTabs({ sample }: { sample: boolean }) {
  // 控制器属于整个标签宿主，离开收藏页后再返回不丢失本页互动。
  // 实际模式仅隐藏样例展示，不写入云端草稿或覆盖原来的列表状态。
  // 搜索与分类同时传给两处展示组件，不额外建立全局持久化 store。
  const collections = useProfileCollections();
  const [active, setActive] = useState<ProfileContentTab>("posts"), [visited, setVisited] = useState<ProfileContentTab[]>([]);
  const accountId = useAccountStore(state => state.profile?.id ?? null);
  const onTab = (tab: ProfileContentTab) => { setActive(tab); setVisited(current => current.includes(tab) ? current : [...current, tab]); };
  const postsVisible = ["posts", "likes", "privatePosts"].includes(active);
  return <div className="pr-layout" data-profile-layout={active === "private" ? "statistics" : "posts"}>
    {/* 标签栏占据网格首行，正文与右栏共享下一行；像同一层书架，自然顶齐。 */}
    {/* 不用标签高度换算偏移，字体或容器宽度变化后仍由浏览器统一排版。 */}
    {/* 这里只移动原组件的装配位置，标签选择、方向键和面板 ID 继续沿用原实现。 */}
    {/* 云端面板仍留在原正文宿主，改变对齐不会卸载其草稿或重新发起请求。 */}
    {/* 收藏分类与普通数据侧栏共用同一网格位置，不分别维护定位数值。 */}
    {/* 单列时侧栏由容器规则排到正文下方，标签不横跨正文与侧栏形成额外空白。 */}
    <ProfileTabBar active={active} onTab={onTab} />
    <div className="pr-main">
      {/* 界面：帖子、喜欢与仅自己可见共用一份样例状态，不切换卸载。 */}
      <div id="profile-panel-posts" role="tabpanel" aria-labelledby={`profile-tab-${postsVisible ? active : "posts"}`} hidden={!postsVisible}><ProfilePostsPanel sample={sample} tab={active} /></div>
      <div id="profile-panel-private" role="tabpanel" aria-labelledby="profile-tab-private" hidden={active !== "private"}><ProfileStatisticsPanel sample={sample} /></div>
      <div id="profile-panel-comments" role="tabpanel" aria-labelledby="profile-tab-comments" hidden={active !== "comments"}><EmptyComments received={false} /></div>
      <div id="profile-panel-received" role="tabpanel" aria-labelledby="profile-tab-received" hidden={active !== "received"}><EmptyComments received /></div>
      {/* 界面：「云端图片」「收藏夹」保留原有真实接口、权限和重试状态；账户变化清空私有会话。 */}
      <div id="profile-panel-cloudImages" className="pr-panel pr-cloud" role="tabpanel" aria-labelledby="profile-tab-cloudImages" hidden={active !== "cloudImages"}>{visited.includes("cloudImages") && <CloudImagesPanel key={accountId ?? "guest"} ownerId={accountId} active={active === "cloudImages"} />}</div>
      {/* 界面：「收藏夹」样例与真实内容共用原标签；真实组件保持挂载但在样例模式不加载。 */}
      {/* 云端 active 需要同时满足实际模式与当前标签，隐藏时不继续触发刷新请求。 */}
      {/* role 与标签 ID 仍只有一个，避免模式切换产生重复 aria-controls 目标。 */}
      {/* 样例组件不以账户作为 key，切换账户不会把样例互动落到真实收藏记录中。 */}
      {/* 实际组件仍以账户 ID 为 key，跨账户不复用前一个用户的私有数据。 */}
      {/* 隐藏真实列表只停止加载通知，编辑器草稿和重试 ID 沿用原来的挂载实例。 */}
      {/* 宿主的 hidden 同时覆盖两种模式，其他标签不会露出任何收藏内容。 */}
      {/* 样例网格保持挂载，搜索与排序往返标签时继续有效。 */}
      {/* 账户模式开关位于个人主页，不在本标签另建一套容易失步的模式状态。 */}
      {/* 因而侧栏与主区总是在同一模式下展示，避免样例分类配真实文件夹列表。 */}
      <div id="profile-panel-cloudCollections" role="tabpanel" aria-labelledby="profile-tab-cloudCollections" hidden={active !== "cloudCollections"}>
        <div hidden={!sample}><ProfileCollectionsPanel state={collections} /></div>
        <div className="pr-panel pr-cloud" hidden={sample}>{visited.includes("cloudCollections") && <CloudCollectionsPanel key={accountId ?? "guest"} ownerId={accountId} active={!sample && active === "cloudCollections"} />}</div>
      </div>
      {/* side：只在样例收藏夹切换为分类与最近收藏，其他标签仍保留原右栏。 */}
      {/* 分类控件与主区直接共用同一对象，真实云端不读取这些样例计数。 */}
      {/* 侧栏沿用外层栅格定位，窄屏时由既有容器规则下移而不覆盖作品。 */}
    </div>{sample && active === "cloudCollections" ? <ProfileCollectionsSide state={collections} /> : <ProfileSide sample={sample} statistics={active === "private"} onTab={onTab} />}
  </div>;
}
