/** 静态功能组收藏：与角色、画师一起保存在同一个用户 JSON 文档中。 */
// 这里只存可序列化资料，没有 React 状态、函数或本地媒体二进制。
// 像把收藏书目的封面地址和正文索引放在同一页，不复制整本源资料库。
// 保存条目快照使源资料升级后仍可导出当初收藏的触发词。
// 预览字段只是地址，导出 JSON 不会下载远端图片或将图片转成 base64。
import type { StaticTagItem } from "./staticTagLibrary";

// 画师与角色已有兼容字段，本类型补齐其余三个共用静态库。
// 分库身份不能混用，相同 id 的背景和动作依然是不同收藏。
export type StaticFavoriteLibrary = "pose" | "background" | "expression";

// 版本只描述这段收藏快照，不更改整个用户文档的旧版本号。
// 新字段是可选文档段，旧安装数据缺少它时正常得到空收藏。
export interface UserDataLibraryFavorites {
  version: 1;
  items: Record<StaticFavoriteLibrary, StaticTagItem[]>;
}
