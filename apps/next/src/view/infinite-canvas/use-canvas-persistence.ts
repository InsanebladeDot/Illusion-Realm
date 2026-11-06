"use client";

// 保存沿用全应用的分段缓存和写盘入口，不能重新读旧文件再覆盖其他 store 刚改的设置。
// 像把画布页装进同一本活页夹，只换这一页，不能拿过时的整本副本盖住别人的新内容。
// 显式保存成功后才记录签名；正在输入、选中和测量变化不会被误称为“已保存”。
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { createUserDataSectionPersistStorage, flushUserDataSave } from "@/utils/userDataStorage";
import type { UserDataInfiniteCanvas } from "@/types/infinite-canvas";
import type { CanvasAction, CanvasState } from "./canvas-reducer";
import { parseCanvasDocument } from "./canvas-document";
import { serializeCanvas, type CanvasDocument } from "./canvas-model";

const storage = createUserDataSectionPersistStorage<UserDataInfiniteCanvas>("infiniteCanvas");

// storage 共用的是用户文档写盘机制，作品、加载状态与已保存签名仍归当前 Hook 实例。
// busy 防止当前会话同时读写；跨业务分段合并由既有 userDataStorage 统一维护。
export function useCanvasPersistence(state: CanvasState, dispatch: Dispatch<CanvasAction>) {
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "loadError" | "saveError">("loading");
  const [saved, setSaved] = useState<string | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  // 拖动像先拿着卡片试位置；松手前仍用抓取前的作品判断是否已保存。
  // 旧实现每个鼠标事件都序列化全部节点和长提示词，计算量与可见像素无关。
  // drag 快照在整个手势中保持同一引用，缓存可避免逐帧重新构造大 JSON。
  // 松手后切回真实 nodes，再计算一次，最终坐标仍会正确显示未保存。
  // Escape 恢复原位置时也重算，不让取消手势留下假的未保存提示。
  // 名称、归属和连线仍在依赖里，真正编辑这些字段不能被缓存吞掉。
  // save 继续序列化确认时的输入，这里的缓存只服务状态显示，不代替写盘。
  const nodes = state.drag?.nodes ?? state.nodes;
  // 起手快照虽是另一数组，序列化时不包含选择和测量，所以签名值与原作品相同。
  // 因此只点中再取消不会误报工程内容已变，更不会自动写一次用户文档。
  // 一笔拖动最多在开始和结束重算，而不是与鼠标事件数量成正比地重算。
  // 多选移动也使用同一份 drag 快照，不为每张被选卡单独生成保存签名。
  // 拖动期间编辑器本身仍保存实时坐标，视觉反馈不会因为签名缓存而延后到松手。
  // 暂存的是 JSON 签名，不是延迟执行文件写入，数据保存契约保持显式提交。
  // 保存失败后的重试仍用最新输入，不把失败之前缓存的旧坐标重新盖回去。
  // 大文件媒体仍只序列化引用，优化不会引入二进制缓存或 Blob URL。
  const signature = useMemo(() => JSON.stringify(serializeCanvas({ name: state.name, workspace: state.workspace, nodes, edges: state.edges })), [state.name, state.workspace, nodes, state.edges]);
  // 这里读取磁盘格式而非 React Flow 缓存；解析失败只改变错误状态，不替用户清空原图。
  // 成功恢复会清掉选择和历史，避免把上次关闭时的临时交互当成持久化作品。
  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await storage.getItem("infiniteCanvas");
      const document = parseCanvasDocument(result?.state);
      if (alive.current) { dispatch({ type: "restore", document }); setSaved(JSON.stringify(document)); setStatus("ready"); }
    } catch { if (alive.current) setStatus("loadError"); }
    finally { busy.current = false; }
  }, [dispatch]);
  useEffect(() => {
    alive.current = true;
    // 水合只在异步读取边界启动，不在 effect 同步连发状态更新。
    void Promise.resolve().then(load);
    // 不取消已经交给统一写盘器的文档操作，但不允许卸载后的结果再改 React 状态。
    // 真实文件句柄和原子写入策略属于主进程；渲染层没有临时路径或自建文件监听。
    return () => { alive.current = false; };
  }, [load]);
  // 保存期间还可以编辑，成功签名只对应提交时的快照；后来的内容继续显示未保存。
  // IPC 失败保留当前节点，并允许重试；没有自动空文档回写或固定延时的成功动画。
  const save = async (input: CanvasDocument = state) => {
    // 当前作品处于拖动中时不保存半途坐标，Escape 取消会立即释放这份事务。
    // Ctrl+S 可传刚刚失焦提交的图引擎快照，普通按钮默认保存当前已确认的会话。
    if (busy.current || status === "loadError" || status === "loading" || state.drag) return;
    busy.current = true;
    setStatus("saving");
    try {
      const document = parseCanvasDocument(serializeCanvas(input));
      // setItem 先合并画布段，flush 再写整本用户文档，其他模块的设置不会被画布覆盖。
      // schema 解析后的快照与签名字段顺序相同，后加音频模式也不会产生假脏状态。
      await storage.setItem("infiniteCanvas", { state: document });
      await flushUserDataSave();
      if (alive.current) { setSaved(JSON.stringify(document)); setStatus("ready"); }
    } catch { if (alive.current) setStatus("saveError"); }
    finally { busy.current = false; }
  };
  const reload = () => { if (!busy.current) { setStatus("loading"); void load(); } };
  // 保存失败仍允许编辑和重试；只有尚未可靠读取旧作品时才锁住编辑入口。
  return { status, dirty: saved !== signature, save, load: reload, editable: status !== "loading" && status !== "loadError" };
}
