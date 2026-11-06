"use client";

import { useState } from "react";
import { useTranslation } from "@/i18n";
import { COLLECTION_CATEGORIES, COLLECTION_SAMPLES, type CollectionCategory } from "./profile-collection-data";

/**
 * 收藏样例的单一数据源：主区分类、侧栏计数和最近收藏共用同一实例。
 * 数据只在当前个人主页挂载期间存在，刷新后恢复八条截图样例。
 * 不调用收藏 API，不把参考图中的作品写入真实账户或本机用户文档。
 * saved 保存仍被收藏的样例 ID，取消后主区和侧栏同时移除该项。
 * liked 与收藏状态分开，喜欢操作不会误取消收藏或改变分类计数。
 * category 只能取固定分类，名称和搜索标签从当前语言词条读取。
 * search 去掉首尾空白并统一大小写，允许查标题、标签或分类名称。
 * 分类与搜索取交集，不在搜索时重置用户已经选中的分类。
 * counts 基于全部仍收藏的样例计算，不随当前搜索结果波动。
 * 因此全部计数始终等于分类计数之和，不沿用截图中的虚构 128 项。
 * 最近列表取所有仍收藏的作品，按日期降序，独立于主区排序和搜索。
 * 主区 popular 使用当前本地点赞后的数量，撤回点赞会重新排序。
 * 日期为固定 ISO 日期字符串，字典序与先后顺序一致，不依赖系统时区。
 * filter 返回新数组，sort 不会修改共享夹具或影响其他个人主页入口。
 * 选中项按 ID 从完整样例表读取；筛选改变不会意外切换已打开的详情。
 * 取消收藏时关闭详情，避免继续显示已经不在收藏列表中的作品。
 * 管理入口的恢复操作重置筛选与本地互动，不构造云端写入成功提示。
 * 返回值直接交给两个展示组件，避免主区和侧栏各自维护副本。
 * 分类计数允许为零，空分类按钮仍保留，用户可以识别分类体系。
 * 清空搜索不恢复已经取消的收藏，恢复必须走管理入口的显式操作。
 * 热门排序比较相等时保留原始稳定顺序，不随机重排相同赞数的卡片。
 * 返回最近项前先复制数组，不能让侧栏排序改变主区筛选输入。
 * 样例 ID 都来自固定表，展示层不接收任意云端 ID 来调用这些操作。
 * 图片详情与管理弹窗由展示组件负责，控制器只提供被选中的样例对象。
 */
export function useProfileCollections() {
  const { t } = useTranslation(), [category, setCategory] = useState<CollectionCategory>("all");
  const [search, setSearch] = useState(""), [sort, setSort] = useState("new"), [selected, setSelected] = useState<number | null>(null);
  const [saved, setSaved] = useState(() => COLLECTION_SAMPLES.map(item => item.id)), [liked, setLiked] = useState<number[]>([]);
  // saved 是分类与最近列表的共同分母；搜索只影响 visible，不改变实际样例收藏数量。
  // 同一语言下对查询与字段一起转小写，英文搜索与中文搜索沿用相同匹配规则。
  // 基于当前 t 重新计算，切换语言后不保留上一语言的搜索索引。
  const items = COLLECTION_SAMPLES.filter(item => saved.includes(item.id)), query = search.trim().toLocaleLowerCase();
  const counts = Object.fromEntries(COLLECTION_CATEGORIES.map(key => [key, items.filter(item => key === "all" || item.category === key).length])) as Record<CollectionCategory, number>;
  const visible = items.filter(item => (category === "all" || item.category === category) && `${t(item.title)} ${t(item.tags)} ${t(`profile.collections.${item.category}`)}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => sort === "popular" ? b.likes + Number(liked.includes(b.id)) - a.likes - Number(liked.includes(a.id)) : sort === "old" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  // 收藏与喜欢分开更新，重复点击心形能够撤回，不增加重复 ID。
  // 函数式更新使用最新列表，连续点击不覆盖上一轮 React 尚未提交的状态。
  // 移除不删除素材文件；这些图是公共打包资源而非下载任务或账户原图。
  const toggleLike = (id: number) => setLiked(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const remove = (id: number) => { setSaved(current => current.filter(value => value !== id)); setSelected(null); };
  // 恢复样例同时清除筛选和详情，八项重新出现时不会被旧查询隐藏。
  // 实际云端面板拥有独立生命周期，本重置函数不会操作其分页或编辑草稿。
  // 初始 ID 清单每次重新映射，避免调用方意外共享一个可变数组。
  const reset = () => { setSaved(COLLECTION_SAMPLES.map(item => item.id)); setLiked([]); setCategory("all"); setSearch(""); setSort("new"); setSelected(null); };
  // 最近收藏只取前五个样例，日期排序独立于主区的热门或最早排序。
  // 选中项不存在时回落 undefined，详情宿主据此不渲染，而非显示空图。
  // setter 只改变本页内存，不触发主进程 IPC 或用户数据持久化。
  // 主、侧区共同使用本对象，取消收藏后的计数无需跨组件事件同步。
  // 样例状态即使暂时被实际模式隐藏也保留，返回时延续本页互动。
  // 类型由 hook 返回值推导，展示组件不再维护第二份控制器接口。
  return { category, setCategory, search, setSearch, sort, setSort, visible, counts, liked, toggleLike, remove, reset, selected: COLLECTION_SAMPLES.find(item => item.id === selected), setSelected, recent: [...items].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5) };
}

/**
 * 展示组件的控制器类型与 hook 保持一致，不复制分类或操作签名。
 * 只作 TypeScript 类型使用，不在调用处再次运行 hook。
 * 两个组件必须接收同一个实例，否则取消收藏与计数会各自变化。
 */
export type ProfileCollectionsState = ReturnType<typeof useProfileCollections>;
