"use client";

// 系统框和拖放共用受管导入流程：复制完成后才把引用交给原画布事务。
import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { useReactFlow } from "@xyflow/react";
import { t } from "@/i18n";
import { unwrapIpc } from "@/utils/ipcResult";
import type { CanvasNode } from "./canvas-model";
import type { useCanvasEditor } from "./use-canvas-editor";
import { canvasImageInputs, canvasInputRule } from "./canvas-input-rules";
import { createMediaNode, mediaAccept, readCanvasMedia, type CanvasMediaKind } from "./canvas-media-import";

interface ImportTarget { id: string; kind: CanvasMediaKind; reference?: boolean; batch?: boolean }
type ImportMode = "copy" | "move";
// 替换目标在打开选择框时固定，不跟随后续选择；null 明确表示批量新增。

// 新节点落在当前画布中心；替换保留节点身份和连线，目标已删除则新建。
// 只按成功复制的文件更新画布，部分失败单独报告；解码状态由媒体卡片判断。
async function applyMediaImport(editor: ReturnType<typeof useCanvasEditor>, flow: ReturnType<typeof useReactFlow>, input: HTMLInputElement | null, files: readonly File[], destination: ImportTarget | null, active: () => boolean, mode: ImportMode) {
  if (!editor.persistence.editable || !files.length) return;
  const host = input?.closest("[data-infinite-canvas]")?.getBoundingClientRect();
  if (!host) return;
  const position = flow.screenToFlowPosition({ x: host.left + host.width / 2 - 142, y: host.top + host.height / 2 - 142 });
  const candidates = prepareFiles(files, destination);
  const targetNode = destination?.reference ? editor.nodes.find(node => node.id === destination.id) : undefined;
  if (destination?.reference && destination.kind !== "audio" && (!targetNode || (targetNode.data.inputImages?.length ?? 0) + canvasImageInputs(destination.id, editor).length + candidates.media.length > (canvasInputRule(targetNode.data)?.max ?? 0))) { editor.notify(t("canvas.imageInputOverflow"), "error"); return; }
  if (!candidates.media.length) { reportMediaImport(editor, 0, candidates.rejected); return; }
  // 等文件操作完成再用返回地址；模式只属于本次请求，Ctrl+X 剪节点不等于移动文件。
  const result = unwrapIpc(await window.electronAPI!.canvasImportMedia({ name: editor.name || t("canvas.untitled"), workspace: editor.workspace, files: candidates.media, mode }));
  // 复制期间离开页面不把迟到结果写进已卸载图；磁盘副本不因此删除源文件。
  // 工程目录身份来自主进程，不能根据用户标题自行拼磁盘地址。
  if (!active()) return;
  editor.setWorkspace(result.workspace);
  if (destination?.reference && targetNode) {
    if (destination.kind === "audio") editor.updateNodeData(destination.id, { audioParameters: { ...targetNode.data.audioParameters, reference: result.media[0] } });
    else editor.updateNodeData(destination.id, { inputImages: [...(targetNode.data.inputImages ?? []), ...result.media] });
    reportMediaImport(editor, result.media.length, result.rejected);
    return;
  }
  const nodes: CanvasNode[] = [];
  let replaced = false;
  for (const media of result.media) {
    if (!replaced && destination && flow.getNode(destination.id)) { editor.updateNodeData(destination.id, { media }); replaced = true; }
    else nodes.push(createMediaNode(media, position, nodes.length));
  }
  editor.importMedia(nodes);
  const rejected = [...candidates.rejected, ...result.rejected];
  reportMediaImport(editor, nodes.length + Number(replaced), rejected);
}

// 同批成功的素材会保留；只要有文件被拒绝，就显示文件名，方便重试。
function reportMediaImport(editor: ReturnType<typeof useCanvasEditor>, count: number, rejected: readonly string[]) {
  if (rejected.length) {
    editor.notify(t("canvas.importRejected", { names: rejected.join("、").slice(0, 240) }), "error");
    return;
  }
  editor.notify(t("canvas.imported", { count }), "success");
}

// 按文件逐项分类、取路径和检查替换类型，一项失败不阻止同批其他文件。
function prepareFiles(files: readonly File[], destination: ImportTarget | null) {
  const media = [];
  const rejected = [];
  for (const file of files) {
    try {
      const item = readCanvasMedia(file);
      if (!item || destination && item.kind !== destination.kind) rejected.push(file.name);
      else media.push(item);
    } catch { rejected.push(file.name); }
  }
  return { media, rejected };
}

function useNativeFileCancel(input: RefObject<HTMLInputElement | null>, target: RefObject<ImportTarget | undefined>, editor: ReturnType<typeof useCanvasEditor>) {
  // 监听 input 自身的原生取消，不用焦点或延时猜测；取消只清本次目标。
  useEffect(() => {
    // 清理使用安装时的 input，避免误解绑后来替换的新元素。
    const element = input.current;
    const cancel = () => { target.current = undefined; editor.notify(t("canvas.importCancelled")); };
    element?.addEventListener("cancel", cancel);
    return () => element?.removeEventListener("cancel", cancel);
  }, [editor, input, target]);
}

// running 像门闩，在 await 前关上，防止快速导入重复分配目录；finally 一定放开。
// 卸载只忽略迟到的界面更新，不强删已经复制成功的文件。
function useMediaImportOperation(editor: ReturnType<typeof useCanvasEditor>, flow: ReturnType<typeof useReactFlow>, input: RefObject<HTMLInputElement | null>) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // 同一工作区串行复制，避免两批导入同时给未分配的项目建立不同目录。
  // 失败恢复 busy 并保留旧图；finally 只清自己的门闩，不伪造成功。
  const importFiles = async (files: readonly File[], destination: ImportTarget | null, mode: ImportMode) => {
    if (running.current || !files.length) return;
    running.current = true;
    setBusy(true);
    editor.notify(t(mode === "move" ? "canvas.movingMedia" : "canvas.importing"));
    try { await applyMediaImport(editor, flow, input.current, files, destination, () => alive.current, mode); }
    catch { if (alive.current) editor.notify(t("canvas.importFailed"), "error"); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  return { busy, importFiles };
}

// 视频先确认复制或移动，确认前不操作磁盘；图片和音频直接复制。
// 每次默认复制，待确认文件和目标仅保留在当前实例。
function useVideoImportChoice(operation: ReturnType<typeof useMediaImportOperation>, editor: ReturnType<typeof useCanvasEditor>) {
  // 固定本次文件与接收节点；确认后异常由 operation 收口。
  // 已开始的磁盘移动没有可靠回滚，不能显示假取消；卸载也不删除完成的副本。
  const [pending, setPending] = useState<{ files: readonly File[]; destination: ImportTarget | null } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const request = (files: readonly File[], destination: ImportTarget | null) => {
    if (pending || operation.busy || !files.length) return;
    if (!prepareFiles(files, destination).media.some(media => media.kind === "video")) { void operation.importFiles(files, destination, "copy"); return; }
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPending({ files, destination });
  };
  const confirm = (mode: ImportMode) => {
    if (!pending) return;
    setPending(null);
    void operation.importFiles(pending.files, pending.destination, mode);
  };
  const cancel = () => { setPending(null); editor.notify(t("canvas.importCancelled")); };
  return { pending: !!pending, request, confirm, cancel, returnFocus };
}

// 一个工作区共用一个 input，底栏新增、卡片替换和参考图用目标参数区分。
export function useCanvasMediaImport(editor: ReturnType<typeof useCanvasEditor>) {
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<ImportTarget | undefined>(undefined);
  const flow = useReactFlow();
  useNativeFileCancel(input, target, editor);
  const operation = useMediaImportOperation(editor, flow, input);
  const choice = useVideoImportChoice(operation, editor);
  const busy = operation.busy;
  const importFiles = (files: readonly File[], destination: ImportTarget | null = target.current ?? null) => choice.request(files, destination);


  // 在原点击事件内同步打开系统框，异步延迟可能丢失浏览器的用户激活许可。
  const pick = (destination?: ImportTarget) => {
    // 草稿未可靠读出或桌面桥接不可用时不能导入，避免覆盖旧作品或存临时 Blob。
    if (!editor.persistence.editable) return;
    if (!window.electronAPI?.getPathForFile || !window.electronAPI?.canvasImportMedia) { editor.notify(t("canvas.importDesktop"), "error"); return; }
    target.current = destination;
    // 先清 value，重复选同一文件也能触发；每次按目标重设类型和多选规则。
    if (input.current) { input.current.accept = mediaAccept(destination?.kind); input.current.multiple = !destination || !!destination.reference || !!destination.batch; input.current.value = ""; input.current.click(); }
  };

  // 立即拷贝 FileList 再清 input，异步流程不保留 React 事件。
  const changed = (event: ChangeEvent<HTMLInputElement>) => {
    void importFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
    target.current = undefined;
  };
  // 外部拖放显式传 null，不能继承上一次系统框的替换目标。
  return { inputRef: input, pick, changed, busy, choice, importFiles: (files: readonly File[], destination: ImportTarget | null = null) => { void importFiles(files, destination); } };
}
