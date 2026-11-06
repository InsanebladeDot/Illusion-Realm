/** 资料库收藏导出：白名单汇总为一个 JSON，不导出用户完整配置或密钥。 */
// 角色、画师和静态标签仍沿用原存储段，避免升级时复制或覆盖旧收藏。
// 它们实际都在同一份 illusion-realm.json，导出时只拿收藏相关字段。
// 像把几个书架的收藏索引装进一个资料袋，而不是把整个书房交出去。
// 文件包含静态名称、提示词、图片地址及画师分组，图片本身不打包。
import { useCharacterFavoriteStore } from "@/stores/useCharacterFavoriteStore";
import { useArtistLibraryStore } from "@/stores/use-artist-library-store";
import { useLibraryFavoritesStore } from "@/stores/use-library-favorites-store";
import { ARTIST_ITEMS } from "@/utils/artist-library";
import { favoriteCharacterCatalog } from "@/utils/library-favorites";
// 通用下载器不再依赖已删除的漫画气泡导出模块，收藏导出的业务契约保持不变。
import { downloadBlob } from "@/utils/download-blob";

// 返回普通数据，测试可独立检查内容；真正文件下载只发生在下面的显式动作中。
// 未恢复的旧在线 slug 单独保留，导出不能悄悄漏掉用户原来的收藏身份。
// 画师来源是随包静态清单，只有命中收藏 id 的条目才进入导出。
// 画师组仍按原 id 保存，重名分组不会被名称键合并。
// 不读取 settings、agentPreferences、账户会话或其他用户文档字段。
export function collectLibraryFavorites() {
  const character = useCharacterFavoriteStore.getState();
  const artist = useArtistLibraryStore.getState().collections;
  const characters = favoriteCharacterCatalog(character.slugs, character.characters);
  return { format: "illusion-realm-library-favorites", version: 1, libraries: { character: { ids: [...character.slugs], items: characters, unresolved: character.slugs.filter(id => !characters.some(item => item.slug === id)) }, artist: { ids: [...artist.favorites], items: ARTIST_ITEMS.filter(item => artist.favorites.includes(item.id)), groups: structuredClone(artist.groups) }, ...structuredClone(useLibraryFavoritesStore.getState().data.items) } };
}

// 复用现有 Blob 下载器及临时 URL 清理，不再增加一套 JSON 文件保存 IPC。
// 同步异常由按钮调用边界提示，不能在失败后弹出一个假的导出成功。
// 用户主动导出时取最新 store 数据，不依赖菜单打开时的陈旧快照。
export function exportLibraryFavorites(): void {
  const json = JSON.stringify(collectLibraryFavorites(), null, 2);
  downloadBlob(new Blob([json], { type: "application/json" }), "illusion-realm-library-favorites.json");
}
