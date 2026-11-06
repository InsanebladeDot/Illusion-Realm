"use client";

// 工程导出不替代现有草稿保存；导入完整包后仍由原保存按钮写回当前用户草稿。
// 两个操作共享互斥门闩，系统框取消只给取消反馈，不改变节点或清空原项目。
import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import { unwrapIpc } from "@/utils/ipcResult";
import { parseCanvasDocument } from "./canvas-document";
import { serializeCanvas } from "./canvas-model";
import type { useCanvasEditor } from "./use-canvas-editor";

// 工程交换与当前草稿是两个不同的确认动作。
// 保存草稿仍写 illusion-realm.json 的一个分段。
// 导出只打包调用时的作品快照，不改变当前已保存签名。
// 导入把新图交给原 restore 命令，之后可由用户保存为当前草稿。
// busy 是界面状态，用于显示处理中和隔离背景操作。
// running 是同步门闩，连续点击在 React 重渲染前也不会启动第二次请求。
// alive 标记当前页面寿命，不把迟到请求反馈给下一次挂载。
// 这些 ref 都属于当前 Hook 实例，不共享项目任务状态。
// 离开页面不向旧 editor 派发恢复命令。
// 已开始的主进程写包仍可能完成，不能声称卸载就撤销磁盘操作。
// 成功保存的外部工程不会因页面关闭被删除。
// 当前没有导出取消任务按钮，系统保存框阶段可以取消。
// 界面没有用定时器猜测写包进度。
// 只有真实 IPC 返回才结束这次工程操作。
// 若 preload 版本缺少接口，明确进入错误提示而非浏览器假回落。
// 读取中的原草稿不可被导入覆盖，editable 保护同原保存入口。
// 拖动中的工程不导出，避免快照包含尚未提交的手势位置。
// 同一个 run 仅合并相同的互斥、异常和恢复机制。
// 打开与导出的业务参数仍由各自桥接方法表达。
// 导出接收序列化文档，绝不把 React Flow 的 DOM 缓存塞进 IPC。
// 打开返回对象后再次 parseCanvasDocument，复用正式恢复契约。
// 打开框取消返回 null，不调用 restore。
// 导出返回路径是完成信号，界面只显示固定成功文案。
// 成功文案不会展示完整私有路径。
// 失败 catch 保留原编辑数据，只更新就近状态消息。
// finally 不论成功失败都释放 running，用户可以重试。
// 卸载后仍释放门闩，但不再调用 setBusy。
// 返回动作通过 void 启动已自行捕获的 Promise，不留下未处理拒绝。
// 未保存确认由页面在调用 open 前完成，本 Hook 不再复制对话框。
// 这套接口不承担工程列表、云同步或自动备份。
export function useCanvasProject(editor: ReturnType<typeof useCanvasEditor>) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // 异步返回先检查页面寿命；导出完成不会将旧快照回盖到用户继续编辑的新内容。
  // IPC 只回文件路径或已验证工程，不在渲染层处理二进制包或访问 Node API。
// operation 只有 open 与 export，不能从外部字符串选择任意通道。
// 系统框由主进程负责，渲染层不读取 node:fs。
// unwrapIpc 把真实失败交给统一 catch，不将失败 data 当成空工程。
// 返回对象与返回字符串分支明确区分，不能拿路径字符串恢复节点。
// 异步结束检查 alive 发生在任何界面写入之前。
// 导入完成的作品有新的目录归属，旧工程文件不被移动。
// 导出完成不写回刚才的快照，避免覆盖用户已经继续编辑的内容。
// 当前页面忙碌时背景 inert，普通画布快捷键同样暂停。
// 动作回调不缓存初次 editor，当前渲染总能拿到最新已确认数据。
// 出错提示说明版本、完整性与文件权限，不能只显示“请稍后”。
  const run = async (operation: "open" | "export") => {
// 打开工程的异步结果可能晚于路由切换。
// 检查 running 保证当前实例同一时刻只有一项工程操作。
// 检查 editable 保证草稿读取失败不会被新工程静默覆盖。
// 检查 drag 防止导出包含正在移动但尚未确认的坐标。
// 这三种拒绝不改 UI 成功文案，也不启动系统框。
// 系统框返回 null 时，当前节点选择与参数保持原状态。
// 系统框返回坏工程时，catch 只设置 projectFailed。
// 导出返回字符串时，绝不调用 openDocument。
// 打开返回文档时，先 parse 再 restore，失败仍留在原图。
// 没有把失败恢复写成 openDocument(empty)，避免错误清场。
// 工程包里不包含 undo，因此新图 past/future 清空符合交换语义。
// 本会话剪贴板保留，用户可继续跨工程粘贴先前明确复制的内容。
// 原草稿签名由 persistence 根据文档重新计算，不强制标成已保存。
// 所以成功导入后仍能提示用户保存当前草稿。
// 工程导出成功也不会擅自把未保存状态清掉。
// 用户要确认草稿落盘，应使用原保存按钮或 Ctrl+S。
// 工程文件可以选择任意输出位置，但渲染层只接业务完成结果。
// 处理完成之前背景 inert 阻止隐含的菜单或尺寸更新。
// 离开页面不会回写新工程，避免旧请求污染下次挂载。
// 已经写出的外部包仍然保留，用户不会因关闭页面失去完成文件。
    if (running.current || !editor.persistence.editable || editor.drag) return;
    running.current = true; setBusy(true);
    try {
      const api = window.electronAPI;
      if (!api?.canvasOpenProject || !api.canvasExportProject) throw new Error("canvas-desktop-required");
      const result = operation === "open" ? unwrapIpc(await api.canvasOpenProject()) : unwrapIpc(await api.canvasExportProject(serializeCanvas(editor)));
      if (!alive.current) return;
      if (result && typeof result !== "string") editor.openDocument(parseCanvasDocument(result));
      editor.setMessage(t(result ? operation === "open" ? "canvas.projectOpened" : "canvas.projectExported" : "canvas.importCancelled"));
    } catch { if (alive.current) editor.setMessage(t("canvas.projectFailed")); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  return { busy, open: () => { void run("open"); }, export: () => { void run("export"); } };
}
