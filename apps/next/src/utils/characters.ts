/**
 * 角色库检索（animadex）的渲染层入口。
 *
 * 怎么做：走 `animadex:search` IPC + `unwrapIpc`（失败抛带 code 的错），
 * 这里只做参数与结果的收窄，不解析内容。
 */
import type {
  // 详情匹配复用正式角色卡契约，不能另造只靠名称的展示对象。
  // reference 仍来自本地原始资料，线上不会覆盖四个分类属性。
  // 类型导入不把 Node 或 Electron 运行时带到 renderer。
  AnimadexCharacter,
  AnimadexSearchParams,
  AnimadexSearchResult,
} from "@/types/character";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { unwrapIpc } from "@/utils/ipcResult";
import { t } from "@/i18n";

/** 角色库请求走主进程（内置 fetch，无第三方 HTTP 依赖），浏览器模式下给出可读错误 */
export async function searchCharacters(
  params: AnimadexSearchParams
): Promise<AnimadexSearchResult> {
  const api = typeof window === "undefined" ? undefined : window.electronAPI;
  if (!isElectronEnvironment() || !api?.animadexSearch) {
    throw new Error(t("errors.desktopOnly.characters"));
  }
  return unwrapIpc(await api.animadexSearch(params));
}

/**
 * 本地与在线资料仅在名称、作品都一致时合并，防止同名角色串图。
 * 名称允许标签中下划线与空格互换，不猜中文译名或昵称。
 * 作品同时接受远端显示名与 slug，slug 的连字符只作格式规范化。
 * 本地身份 slug 保持稳定，避免详情补图后丢失收藏和多选状态。
 * 在线推荐 LoRA 只是参考链接，不表示已经在本地安装。
 * 本地标签优先保留，不能因线上图片补全而静默改变用户的外观筛选。
 * 无匹配返回 null，调用方显示未找到，不选择站点结果第一名。
 * 本函数不执行网络请求，便于用确定性候选验证身份边界。
 * 多个身份一致的候选仍返回 null，不依靠热度替用户消解歧义。
 * 远端属性即使比本地更完整，也不在补图过程中悄悄写回资料源。
 * 返回新卡片对象，不就地修改已进入父组件多选数组的对象。
 * @param local 已由本地分类选中的角色
 * @param candidates 正式 online 搜索得到的候选，可能同名不同作品
 */
export function mergeCharacterDetails(local: AnimadexCharacter, candidates: AnimadexCharacter[]): AnimadexCharacter | null {
  const key = (value: string) => value.trim().toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
  const matches = candidates.filter(item => key(item.name) === key(local.name) && [item.copyright,item.copyrightName].some(work => key(work) === key(local.copyright)));
  if (matches.length !== 1) return null;
  const online = matches[0];
  // 唯一身份匹配后优先采用线上明确返回的媒体，不把空值覆盖到已有封面。
  // 上游只返回缩略图时，详情也优先展示该图，避免继续用推导地址。
  // 两种线上媒体均缺失才保留本地关联地址；这不等于资源一定可访问。
  return {...local,url:online.url,thumbUrl:online.thumbUrl || online.imageUrl || local.thumbUrl,imageUrl:online.imageUrl || online.thumbUrl || local.imageUrl,hasImage:online.hasImage,loras:online.loras,rating:online.rating,favCount:online.favCount};
}
