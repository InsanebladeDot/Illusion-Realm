"use client";

/** 编排图库排序草稿与最终确认；页面卸载只丢弃未确认的临时排列。 */
// 草稿像还没交给店员的座位便签，拖动只改便签，按保存才交回公共图库。
// 每次打开弹窗挂载一个 hook 实例，另一个图库不会借用这份临时队列。
// 全局已确认顺序仍属于 useHistoryFolderStore，不引入第二个持久化仓库。
// 这里只保留文件路径数组，图片对象随上层最新扫描结果更新。
// 取消不会恢复文件名，因为未确认时根本没有发出磁盘改名请求。
// 弹窗以目录作为实例 key；换目录不能把前一目录草稿套到新目录。
// Hook 没有系统事件、网络请求或定时器，卸载不留下后台整理工作。
import { useMemo, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { GeneratedImageFile } from "@/types/historyFolder";
import { applyHistoryImageOrder } from "@/utils/history-image-order";

/** 图片库按打开目录读取持久化队列，排序窗口只操作隔离的路径草稿。 */
// images 是原图库已经加载的全目录图片，不是当前分页缩略图。
// saved 是当前目录的已确认路径队列，缺字段时调用方传空数组。
// folder 只定位保存位置，不参与图片文件名生成。
// save 由原 store action 注入，hook 不直接读写用户 JSON。
// 状态随输入变化的几个例子：
// 第一次打开没有保存名单时，paths 来自磁盘当前扫描，用户不用先建立配置。
// 保存名单为 [A,B]、扫描新增 C 时，items 会在 A、B 后面补上 C。
// 用户随后把 B 拖到 A 前，草稿成为新的路径顺序，父层图片对象仍是原扫描对象。
// 此时关闭窗口而未确认，store 仍保留 [A,B]，下次打开不会记住这次临时换位。
// 此时确认窗口，store 接收当前完整顺序，包含打开期间被补入的有效图片。
// 拖动前源被移除时 indexOf 得到负数，这次过期回调直接不产生新草稿。
// 拖动目标被移除时同样拒绝，不凭旧位置把源插到一个不存在的目标后面。
// from 与 to 相等时不更新 state，普通放手不会引发无意义的重新保存。
// 草稿是 null 与空数组不同，使用 ?? 避免丢弃一个明确的空草稿。
// images 里没有的路径在映射时跳过，items 长度由实际图片集合决定。
// folder 参数不复制到局部 state，父层改变 key 就能明确开始新的目录会话。
// hook 返回的 confirm 只把队列交回注入的 save，不拥有关闭窗口的职责。
// 因此同一个 hook 可以被确认按钮调用，而不会暗中触发页面导航或焦点变化。
// 当前没有本地撤销栈，取消恢复的是打开前已确认值，不承诺逐次撤销拖拽。
// 该边界让显示排序与文件系统操作隔离，纯排列可以被测试而不碰图片字节。
export function useHistoryImageOrder(images: GeneratedImageFile[], saved: string[], folder: string, save: (folder: string, paths: string[]) => void) {
  // 弹窗一次打开只复制顺序，不复制图片或文件内容。
  const [draft, setDraft] = useState<string[] | null>(null);
  // null 表示尚未手动编辑，可以跟随父层的新扫描和已确认顺序。
  // 空数组是实际队列值，不能用 truthy/falsy 判断替代 null 协议。
  // ordered 同时补上新图片，打开窗口时不会漏掉先前队列之外的文件。
  // memo 依赖 images 与 saved，目录扫描有新结果时不会保留旧图片对象。
  const ordered = useMemo(() => applyHistoryImageOrder(images, saved), [images, saved]);
  // 手动移动后优先使用草稿，外部保存偏好不能覆盖用户正在排的次序。
  // 没动过时从最新 ordered 获取路径，不在挂载瞬间冻结一个尚未加载完的空库。
  const paths = draft ?? ordered.map(image => image.filePath);
  // 草稿不包含图片正文；路径重新映射后拿到的是最新名称、时间和缩略图来源。
  // 文件被外部删除后会被映射函数跳过，新图则排到已安排图片之后。
  const items = useMemo(() => applyHistoryImageOrder(images, paths), [images, paths]);
  // 拖拽回调传起止路径，先确认双方都还在当前队列，过期事件不插入幽灵成员。
  // arrayMove 返回新数组，让 React 知道是新草稿；不直接修改 saved 或父层 images。
  // 同一位置放手不产生草稿，避免普通点击也被当成一次排列修改。
  // 放手时使用当前闭包内路径，而不是拖起时的旧数组下标。
  const move = (from: string, to: string) => {
    const source = paths.indexOf(from); const target = paths.indexOf(to);
    if (source >= 0 && target >= 0 && source !== target) setDraft(arrayMove(paths, source, target));
  };
  // confirm 默认保存当前实际存在的完整列表，已经消失的文件不会再次写回。
  // 可传替换后的路径队列，便于与真实文件重命名的身份变化衔接。
  // 保存后清空本地草稿，下次渲染改读 store 返回的已确认顺序。
  // 持久化写盘仍按现有用户文档合并机制执行，本 hook 不伪造“已落盘”的反馈。
  const confirm = (paths = items.map(image => image.filePath)) => { save(folder, paths); setDraft(null); };
  // cancel 只丢弃尚未提交的排序草稿；调用方负责关闭窗口并恢复入口焦点。
  // 已确认历史顺序不会被重置成默认日期排序。
  const cancel = () => setDraft(null);
  // 对外提供内容与动作，不暴露 setDraft，调用方不能绕过身份匹配随意插入路径。
  return { items, move, confirm, cancel };
}
