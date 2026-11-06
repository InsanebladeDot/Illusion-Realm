"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Cloud, Heart, ImageIcon, Info, MessageSquare, Settings, Video } from "lucide-react";
import { useTranslation, type MessageKey } from "@/i18n";
import { useProfileStore } from "@/stores/useProfileStore";
import role from "@/assets/icon/Nav/sidebar.webp";
import { PROFILE_REFERENCE_POSTS, type ProfileContentTab } from "./profile-reference-data";
import { postTitleKey } from "./profile-posts-panel";
import { ProfileDialog } from "./profile-dialog";
// 今日数据与主面板使用同一账本，只把查询窗口缩到本机今天。
// 模型调用按每张图片的每个实际模型累计，不与图片数相加当总生成量。
import { useGenerationHistoryStore } from "@/stores/use-generation-history-store";
import { summarizeGenerationHistory } from "@/utils/generation-statistics";

interface ProfileSideProps { sample: boolean; statistics: boolean; onTab: (tab: ProfileContentTab) => void }

/** 实际概览只取 store 已有的帖子/关注/粉丝；作品总数与获赞没有可靠来源，保持未知。 */
function Overview({ sample, onTab }: Pick<ProfileSideProps, "sample" | "onTab">) {
  const { t } = useTranslation(), stats = useProfileStore(state => state.stats);
  const rows = [{ label: "creations", value: sample ? 186 : "—" }, { label: "totalLikes", value: sample ? 468 : "—" }, { label: "published", value: sample ? 42 : stats.posts }, { label: "followers", value: sample ? 36 : stats.followers }, { label: "following", value: sample ? 128 : stats.following }];
  return <section className="pr-panel pr-overview"><header><h2>{t("profile.ui.myData")}</h2><button type="button" onClick={() => onTab("private")}>{t("profile.ui.privateHint")} ›</button></header><div>{rows.map(row => <div key={row.label}><span>{t(`profile.ui.${row.label}` as MessageKey)}</span><strong>{row.value}</strong></div>)}</div></section>;
}

/** 相对时间来自历史截图，仅样例显示；跳转真实云端入口仍受原组件权限约束。 */
function Activity({ sample, onTab }: Pick<ProfileSideProps, "sample" | "onTab">) {
  const { t } = useTranslation();
  return <section className="pr-panel pr-activity"><header><h2>{t("profile.ui.recentActivity")}</h2><button type="button" onClick={() => onTab("posts")}>{t("profile.ui.seeAll")} ›</button></header>
    {sample ? PROFILE_REFERENCE_POSTS.slice(0, 4).map((post, i) => <button className="pr-activity-row" type="button" key={post.id} onClick={() => onTab(i === 1 ? "cloudCollections" : i === 3 ? "cloudImages" : "posts")}><img src={post.image} alt="" /><div><p>{t(`profile.ui.activity${i + 1}` as MessageKey)}</p><small>{t(`profile.ui.activityTime${i + 1}` as MessageKey)}</small></div></button>) : <p className="pr-empty-note">{t("profile.ui.noActivity")}</p>}
  </section>;
}

function Shortcuts({ onTab }: Pick<ProfileSideProps, "onTab">) {
  const { t } = useTranslation();
  return <section className="pr-panel pr-shortcuts"><h2>{t("profile.ui.shortcuts")}</h2><div className="pr-shortcut-grid">
    <button type="button" onClick={() => onTab("posts")}><MessageSquare />{t("profile.ui.myWorks")}</button><button type="button" onClick={() => onTab("cloudCollections")}><Heart />{t("profile.ui.myCollections")}</button><button type="button" onClick={() => onTab("cloudImages")}><Cloud />{t("profile.ui.cloudImages")}</button><Link href="/settings"><Settings />{t("profile.ui.settings")}</Link>
    </div><Link href="/create" className="pr-promo"><strong>{t("profile.ui.promo")}</strong><p>{t("profile.ui.promoHint")}</p><span>{t("profile.ui.create")} →</span><img src={PROFILE_REFERENCE_POSTS[4].image} alt="" /></Link>
  </section>;
}

/** 今日图片和模型使用来自本机账本；视频仍未接入，三行不是可相加的互斥类别。 */
/**
 * 今日卡的真实数据来源：
 * 直接将同一个账本交给一天窗口汇总，边界与七天卡保持一致。
 * 图片次数采用今天确认保存的图片数量，不从当前图库可见数量推算。
 * 模型调用采用今日各模型使用次数之和，包含主模型与非零 LoRA。
 * 这个模型调用数可以大于图片数，不能再与图片数相加当作今日总生成。
 * 视频本轮没有接入记录，继续显示未知而不是伪造零。
 * 已有样例中的 24、3、1 仍只在显式样例模式显示。
 * 真实总生成在本轮表示图片总数，说明按钮解释音视频未纳入范围。
 * 今天的记录变化时组件自动重算，无需从服务器轮询个人账户。
 * 模型、图片和视频三个图标继续沿用原卡片，未创建第二套今日统计布局。
 */
function Today({ sample }: { sample: boolean }) {
  const { t } = useTranslation(), [info, setInfo] = useState(false);
  // 主模型与 LoRA 每张图各记一次，重复加载的同身份已在提取阶段去重。
  // 查询复用纯汇总器，切换样例不会写入或删除今天的真实任务。
  // 未接入视频必须显示破折号，避免误导用户今天确实没有生成视频。
  const history = useGenerationHistoryStore(state => state.data);
  const today = useMemo(() => summarizeGenerationHistory(history, 1), [history]);
  const actual = { imageGeneration: today.total, videoGeneration: "—", modelCalls: [...today.usage.main, ...today.usage.lora].reduce((sum, model) => sum + model.value, 0) };
  return <section className="pr-panel pr-today"><header><h2>{t("profile.ui.today")}</h2><button type="button" onClick={() => setInfo(true)} aria-label={t("profile.ui.today")}><Info size={14} /></button></header>
    <p className="pr-today-total">{t("profile.ui.generate")} <strong>{sample ? 28 : today.total}</strong> {sample && <span>↑ 16%</span>}</p>
    <div className="pr-today-rows">{([{ key: "imageGeneration", count: 24, Icon: ImageIcon }, { key: "videoGeneration", count: 3, Icon: Video }, { key: "modelCalls", count: 1, Icon: Settings }] as const).map(({ key, count, Icon }) => <p key={key}><Icon size={18} />{t(`profile.ui.${key}`)}<strong>{sample ? count : actual[key]}</strong></p>)}</div>
    <img className="pr-today-art" src={role.src} alt="" /><span className="pr-today-message">{t("profile.ui.encouragement")}</span>
    {info && <ProfileDialog title={t("profile.ui.today")} onClose={() => setInfo(false)}><p>{t(sample ? "profile.ui.todayHint" : "profile.ui.actualStats")}</p></ProfileDialog>}
  </section>;
}

/** 最近作品为静态参考卡片；查看只打开图片，不冒充历史记录或启动真实二创任务。 */
function RecentCreations({ sample, onTab }: Pick<ProfileSideProps, "sample" | "onTab">) {
  const { t } = useTranslation(), [selected, setSelected] = useState<number | null>(null);
  const items = [PROFILE_REFERENCE_POSTS[0], PROFILE_REFERENCE_POSTS[2], PROFILE_REFERENCE_POSTS[4], PROFILE_REFERENCE_POSTS[5]];
  const current = items.find(post => post.id === selected);
  return <section className="pr-panel pr-recent"><header><h2>{t("profile.ui.recentCreations")}</h2><button type="button" onClick={() => onTab("posts")}>{t("profile.ui.moreRecords")} ›</button></header>
    {sample ? items.map(post => <button className="pr-recent-row" type="button" key={post.id} onClick={() => setSelected(post.id)}><img src={post.image} alt="" /><div><strong>{t(postTitleKey(post))}</strong><p>{post.date} 14:32</p><p>animaBase · 1024 × 1024</p></div></button>) : <p className="pr-empty-note">{t("profile.ui.noActivity")}</p>}
    {current && <ProfileDialog title={t(postTitleKey(current))} onClose={() => setSelected(null)}><img className="pr-detail-image" src={current.image} alt={t(postTitleKey(current))} /><small>{t("profile.ui.chartHint")}</small></ProfileDialog>}
  </section>;
}

export function ProfileSide({ sample, statistics, onTab }: ProfileSideProps) {
  return <aside className="pr-side" data-profile-side>
    {/* side：帖子概览 / 私密统计右栏，复用真实功能入口。 */}
    {statistics ? <><Today sample={sample} /><RecentCreations sample={sample} onTab={onTab} /></> : <><Overview sample={sample} onTab={onTab} /><Activity sample={sample} onTab={onTab} /><Shortcuts onTab={onTab} /></>}
  </aside>;
}
