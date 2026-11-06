"use client";

/**
 * 画师收藏和分组由Zustand维护，复用用户JSON文档的节流写盘。
 * 不使用独立localStorage，安装版与其他本地设置使用相同保存路径。
 * 收藏仅保存源ID，画师名称改动不会创建另一份冗余资料。
 * 水合由AppShell统一安排，避免初始空状态覆盖已有收藏。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ArtistLibrarySchema, EMPTY_ARTIST_LIBRARY, type ArtistLibraryData } from "@illusion-realm/shared/schemas/artist-library.schema";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

/**
 * 集合修改采用不可变副本，组件只订阅同一个collections对象。
 * groupId为空时不执行隐式创建，必须显式使用saveGroup。
 * assign允许跨页批量加入或移除，不影响已有生成提示词。
 * 删除组保留默认收藏；取消收藏则清理该画师在所有组的关联。
 * 名称最多60字、最多200个分组，和持久化schema保持一致。
 */
interface ArtistState { collections: ArtistLibraryData; toggle: (id: string) => void; saveGroup: (id: string, name: string) => void; deleteGroup: (id: string) => void; assign: (group: string, ids: string[], add: boolean) => void }

/**
 * 外部文档不直接断言为运行时状态，先按schema校验再规范化。
 * 未知版本或非法形状退回空收藏，源文档其他段不受影响。
 * 每个收藏ID去重，组成员只保留仍在收藏中的ID。
 * 相同分组ID只取第一条，避免React重复key和操作对象歧义。
 * schema剥除不认识的字段，不允许落盘方法或浏览器对象。
 * 空文档是正常旧版本输入，不输出含私人内容的诊断日志。
 */
function normalize(value: unknown): ArtistLibraryData {
  const parsed = ArtistLibrarySchema.safeParse(value);
  if (!parsed.success) return structuredClone(EMPTY_ARTIST_LIBRARY);
  const favorites = [...new Set(parsed.data.favorites)];
  return { version: 1, favorites, groups: parsed.data.groups.filter((group, index, groups) => groups.findIndex(item => item.id === group.id) === index).map(group => ({ ...group, artistIds: [...new Set(group.artistIds)].filter(id => favorites.includes(id)) })) };
}

/**
 * 所有写操作只改变本段，统一storage负责合并其他用户设置。
 * 取消收藏不会删除源画师，全部列表仍能立即找到它。
 * 新组ID使用UUID，不把用户命名用作程序标识或文件名。
 * 重命名保留ID和成员，当前正在浏览的分组不会失效。
 * 分组达到上限时不继续添加；UI同时禁用新建按钮。
 * assign先确认目标真实存在，避免删除组后迟到操作重建幽灵组。
 * 批量加入自动收藏这些画师，分组成员永远是收藏的子集。
 * 批量移除只改当前组，不删除默认收藏或其他组关系。
 * 对空选择执行assign保持原状态，避免空写盘。
 * partialize只返回版本化数据，不把action函数放入JSON。
 * merge使用current里的方法，文档无法覆盖toggle等操作。
 * persist的异步失败交由应用统一storage处理，不打印画师收藏内容。
 */
/**
 * 文档采用version:1的嵌套段，未来格式升级必须显式迁移而非猜字段。
 * 旧用户没有该段时normalize提供完整默认对象，调用方不必逐个可选链。
 * 保存快照是collections本身，不能包成state.collections再落盘造成形状漂移。
 * hydrate的saved来自持久化适配器state，merge把它重新装回collections。
 * 组名截断发生在写操作，schema读取侧仍拒绝超长的外部脏文档。
 * 取消收藏过滤每个组的成员数组，不保留悬空的该画师ID。
 * 同一画师再次收藏不会自动恢复以前手动移除的组关系。
 * 空ids批量操作返回空patch，既有集合引用不受影响。
 * 新建组后不自动切换浏览分类，用户可选择何时进入该组。
 * 删除组不修改favorites数组，默认收藏列表与组的生命周期独立。
 * 重名组允许存在，但UUID区分实际操作对象，不按名称误删另一组。
 * 收藏按钮的ID由正式清单提供，store不会从标签拼写猜ID。
 * 成员去重使用Set保留原选择顺序，重复批量加入不会虚增徽标。
 * 版本化数据只有序列化字段，敏感账号与API配置不进入本段。
 * 清空分组成员不等于删除分组，空组仍可作为下一次收藏的目标。
 * 所有action为同步状态修改，异步落盘延迟由公共storage统一安排。
 * 此store不暴露任意文件写入接口，主进程沿用已有用户文档保存边界。
 * 水合前UI不执行自动写入，避免尚未读出的收藏被初始空值覆盖。
 */
export const useArtistLibraryStore = create<ArtistState>()(persist<ArtistState, [], [], ArtistLibraryData>((set) => ({
  collections: structuredClone(EMPTY_ARTIST_LIBRARY),
  toggle: id => set(({ collections: value }) => { const exists = value.favorites.includes(id); return { collections: { ...value, favorites: exists ? value.favorites.filter(item => item !== id) : [...value.favorites, id], groups: exists ? value.groups.map(group => ({ ...group, artistIds: group.artistIds.filter(item => item !== id) })) : value.groups } }; }),
  saveGroup: (id, name) => set(({ collections: value }) => { const clean = name.trim().slice(0, 60); if (!clean) return {}; return { collections: { ...value, groups: id ? value.groups.map(group => group.id === id ? { ...group, name: clean } : group) : value.groups.length < 200 ? [...value.groups, { id: crypto.randomUUID(), name: clean, artistIds: [] }] : value.groups } }; }),
  deleteGroup: id => set(({ collections: value }) => ({ collections: { ...value, groups: value.groups.filter(group => group.id !== id) } })),
  assign: (id, ids, add) => set(({ collections: value }) => { if (!ids.length || !value.groups.some(group => group.id === id)) return {}; return { collections: { ...value, favorites: add ? [...new Set([...value.favorites, ...ids])] : value.favorites, groups: value.groups.map(group => group.id === id ? { ...group, artistIds: add ? [...new Set([...group.artistIds, ...ids])] : group.artistIds.filter(item => !ids.includes(item)) } : group) } }; }),
}), { name: "illusion-realm-artist-library", storage: createUserDataSectionPersistStorage<ArtistLibraryData>("artistLibrary"), partialize: state => state.collections, merge: (saved, current) => ({ ...current, collections: normalize(saved) }), skipHydration: true }));
