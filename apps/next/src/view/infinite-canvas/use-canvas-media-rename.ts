"use client";

// 节点标题改名复用图库已有的真实文件改名接口，不再开一条任意文件操作通道。
// 只有带真实图片资产的卡片改磁盘文件，空卡与其他节点仍走原标题事务。
// 像先到档案室改原件，再把新编号交回工作单，不能只在屏幕上换一行文字。
// 返回结果使用实际文件名，重复名、非法名和权限问题继续由原服务判定。
// 画布导入已复制到自己的资产目录，改名不会重新上传或重新编码图片。
// 原始后缀、PNG 内嵌元数据与旁车处理继续复用图库服务的既有规则。
// 这项操作不移动工程目录，也不按节点名称推断另一份资产路径。
// 双击标题产生草稿；真正提交后才进入本入口，Escape 不发出文件请求。
import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import { renameGeneratedImageOnDisk } from "@/utils/generatedImages";
import { canvasFilePrefix } from "./canvas-media-name";
import { relinkCanvasMedia } from "./canvas-media-rename";
import type { useCanvasEditor } from "./use-canvas-editor";

// ref 保存最新会话命令，避免文件服务返回时把用户其他新编辑覆盖成请求前快照。
// lock 是本次操作互斥，不是全局模型任务状态，也不写进工程 JSON。
// 宿主用 busy 将原工作区 inert，鼠标、快捷键和新生成不会同时改变同一资产。
// 卸载后不再更新局部 busy，但已经完成的文件改名仍须把新引用保存到原文档。
// 保存由原分段用户文档服务执行，不能直接读旧 JSON 再覆盖账号或其他设置。
// 文件成功而保存失败时保留新路径与原保存错误，用户可从正常保存入口重试。
// 不假装文件和用户文档具有跨文件原子事务，进程中断恢复属于现有保存边界。
// 文件改名不加入虚假的 undo；历史索引同步重定向，其他编辑仍可撤销。
type Editor = ReturnType<typeof useCanvasEditor>;
interface Session { editor: Editor; locked: boolean; alive: boolean }

// current 在请求完成时重新读取，更新目标由请求时的节点和原文件身份确定。
// 即便同时存在两个同名图片，也只修改完整路径相同的那一份媒体。
// 没有图片的节点标题继续限于八十字符，不把空图片节点变成磁盘空文件。
// 仅去两侧空白，内部空格、中文与点由现有名称服务和扩展保护规则处理。
// 没改正文时直接返回，不制造保存、撤销记录或“成功”提示。
// 正在保存或拖动时拒绝开始，避免拿半途坐标作为改名后的持久化工程。
// 目录从当前媒体地址截取，只用作原图库接口的作用根，不借标题拼文件夹。
// 主进程仍验证图片存在、后缀、根内路径和同名冲突，前端检查不代替权限。
// 成功结果进入同一个 reducer，当前节点、手动输入和历史会在一次分派中更新。
// 保存明确传更新后的作品，不等待下一次 React 渲染猜测闭包是否已经刷新。
// 如果离开页面，原保存器仍执行文件写入，但自身 alive 保护不再修改卸载页面。
// finally 始终释放互斥，不能因为重名失败让整个画布永久不可编辑。
// 错误提示不含用户完整路径；原文件服务的原始异常不直接铺在画布上。
// 本入口不缓存图片二进制，改标题不会让大图转 Base64 或重新请求模型生成。
// 不在 catch 中返回一个假的新名称，失败时原媒体引用和标题继续保留。
// 提交顺序一：从当前节点读取素材；没有节点时静默结束，不创建替代节点。
// 提交顺序二：取得文件操作锁，再请求原图库接口，避免同一次失焦重复发起。
// 提交顺序三：收到实际路径后，根据最新会话计算重定向文档。
// 提交顺序四：先更新当前图和索引，再将同一份文档交给原保存器。
// 提交顺序五：无论成功失败都释放锁，下一次用户操作才可继续。
// 输入框只是工作标题时不执行文件步骤，保留原先普通标题编辑的事务语义。
// 图片为空时用户可先命名计划，之后导入真实文件会按文件主体显示。
// value等于当前主体时提前返回，包括Escape恢复旧值造成的失焦。
// 这样取消动作不会查询磁盘，也不会因为已有同名目标而误报冲突。
// 开始前检查persistence状态，避免正在恢复旧工程时写入一份不完整节点图。
// 保存中不能改名；否则旧路径的在途写入可能在新引用之后覆盖磁盘。
// 资源目录截取保留平台原路径形式，不需要渲染层导入Node的dirname。
// 原服务只在传入作用根内操作图片，不能由新名称中的目录部分搬到别处。
// 扩展名保护属于原服务，输入“人物正面”仍保持原png或webp格式。
// 主进程明确拒绝目标已存在，不覆盖另一个模型生成的同名图片。
// 目标不存在但目录不可写时服务失败，当前文档没有提前改成新路径。
// 媒体正文未变，现有预览可能因地址key改变重新加载，这不是重新生成图片。
// 函数不把旧播放器或图片DOM缓存下来，引用切换后的资源清理由原媒体组件完成。
// 保存失败不会把新路径又伪装成旧路径，磁盘上已经改名的事实必须准确展示。
// 顶部saveError负责告知未完成保存，不能因为文件改名成功就打印整工程已保存。
// 保留当前文档可继续手动保存，不清空用户尚未写盘的其他节点参数。
// 捕获只覆盖本次文件请求与保存拒绝，不能吞掉其他后台队列自己的失败状态。
// 取消信号不能撤销已完成的磁盘重命名，因此离开页面时继续必要的引用保存。
// 这不同于可直接丢弃的只读模型查询，两者不能共用“卸载后忽略一切”的策略。
// session只保存小对象和回调，不含二进制、File或可跨边界泄漏的IPC事件对象。
// 工作区busy由原宿主消费，侧栏与画布没有各维护一把互不知情的文件操作锁。
// 组件重新渲染时不会重启请求，真正的启动点只有标题提交事件。
// 只有文件服务返回的oldPath参与索引替换，不用某个节点的最近点击名称找同源。
// 单张图片在图中出现多次时，重命名体现的是同一资产变化，不是复制多份文件。
// 真要保持两张不同文件名，应先导入独立资产；本入口不偷偷复制来制造分叉。
// 请求结束后不强制fitView或移动镜头，用户观察当前构图的位置保持不变。
// 重命名不取消已完成图片结果，也不改变请求模型、采样器或图片宽高。
// 用户可见错误使用现有双语词条，不能把Node错误文本和私人目录返回到页面。
// 返回的Promise由包装动作显式消费，卡片不留下一个无人处理的异步拒绝。
async function renameNode(session: { current: Session }, setBusy: (value: boolean) => void, id: string, name: string) {
  const { editor } = session.current;
  const node = editor.nodes.find(item => item.id === id);
  const value = name.trim();
  if (!node || !value || session.current.locked || !editor.persistence.editable || editor.drag || editor.persistence.status === "saving") return;
  const media = node.data.kind === "image" ? node.data.media : undefined;
  if (!media) { editor.updateNodeData(id, { title: value }); return; }
  if (canvasFilePrefix(media.name) === value) return;
  session.current.locked = true;
  setBusy(true);
  try {
    const folder = media.path.slice(0, Math.max(media.path.lastIndexOf("/"), media.path.lastIndexOf("\\")));
    // 原图库接口接收完整候选文件名，会剥掉最后一个后缀再保留源格式。
    // 因此把原扩展附回请求，不能直接传含点主体而被误截成第一个片段。
    // 例如主体“人物.正面”提交“人物.正面.png”，实际仍生成同主体的png文件。
    // 这里只适配旧接口参数语义，不修改图库其他调用方或另造一套文件名清理器。
    // 源路径已经由图片服务验证扩展，不能根据输入主体中的点猜目标格式。
    const extension = media.path.slice(media.path.lastIndexOf("."));
    const result = await renameGeneratedImageOnDisk(folder, media.path, value + extension);
    const current = session.current.editor;
    const document = relinkCanvasMedia(current, result);
    current.relinkMedia(result);
    await current.persistence.save(document);
  } catch { session.current.editor.notify(t("create.renameImageDialog.failed"), "error"); }
  finally { session.current.locked = false; if (session.current.alive) setBusy(false); }
}

// 一个 Hook 对应一个工作区；两个实例不共享文件锁、选中节点或临时标题。
// effect 更新会话引用而不是通知所有卡片重绘，Context 仍复用原稳定转发机制。
// 首次事件发生在挂载后，此时 ref 已有当前 editor，不会读取空会话。
// 后续更新只替换 editor，不能把正在进行的 locked 状态重置成 false。
// 清理只标记局部视图离开，不取消已经发生的磁盘改名或丢弃必要的引用保存。
// busy 只用于原宿主的操作隔离，不新增遮罩、成功弹窗或假进度。
// 返回动作仍通过明确的 id 和草稿文字调用，不从 document.activeElement 猜对象。
export function useCanvasMediaRename(editor: Editor) {
  const [busy, setBusy] = useState(false);
  const session = useRef<Session>({ editor, locked: false, alive: true });
  useEffect(() => { session.current.editor = editor; });
  useEffect(() => { const value = session.current; value.alive = true; return () => { value.alive = false; }; }, []);
  return { busy, rename: (id: string, name: string) => { void renameNode(session, setBusy, id, name); } };
}
