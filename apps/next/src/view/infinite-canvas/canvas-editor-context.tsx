"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import type { CanvasData } from "./canvas-model";
import type { CanvasMediaKind } from "./canvas-media-import";
import type { CanvasReferenceVoice } from "@illusion-realm/shared";

/**
 * 节点卡片只负责展示和采集操作意图；真正改作品仍由画布编辑器处理。
 * 这像把卡片的修改单交回总账，而不是让每张卡片各自保存一份账本。
 */
export interface CanvasEditorActions {
  generationStore: import("zustand").StoreApi<import("./canvas-generation-state").CanvasGenerationState>;
  cancelGeneration: (id?: string) => void;
  // 标题提交交回所属工作区，卡片不自行获取用户目录或操作磁盘。
  // 没有真实图片的标题仍走普通节点事务，真实图片先完成文件改名。
  // 这个动作按节点 id 定位，不会因随后切换高亮改错另一个标题。
  renameNode: (id: string, name: string) => void;
  generateImage: (id: string, count?: number) => void;
  updateNodeData: (id: string, patch: Partial<CanvasData>) => void;
  openAnnotation: (id: string, annotationId?: string) => void;
  startDrag: () => void;
  stopDrag: () => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  openComposer: (id: string) => void;
  // 侧栏由工作区统一拥有，一个实例只打开一个节点的图片配置。
  // 身份由触发器传入，不从最后点击的卡片或 DOM 顺序猜目标。
  // 这只是打开意图，模型和提示词仍归原节点事务。
  openImageSettings: (id: string) => void;
  openDirector: (id: string) => void;
  // 视频放大复用主区节点网预览，不申请系统全屏。
  openPreview: (id: string) => void;
  cancelConnection: () => void;
  connectPort: (id: string, type: "source" | "target") => void;
  // 节点只传自己的身份和类型，真正的 File 与路径处理仍归工作区入口。
  // 这样空卡和更换按钮共用导入流程，不在每张卡片挂一套文件选择器。
  // 目标是稳定节点 ID，不能用当前高亮序号在系统框关闭后再猜一次。
  // 文件选择由宿主发起，节点只通知意图，不获得任意文件读取权限。
  // 跨类型替换在导入边界拒绝，展示层不能修改 kind 来迁就选择结果。
  // 这个回调不接生成队列，点击导入也不会清理当前提示词。
  // Context 只承载动作，媒体引用仍属于原节点 data 与原编辑器撤销栈。
  // 多个节点引用同一回调不等于共享播放状态，每个内容组件单独管理真实媒体元素。
  importMedia: (target: { id: string; kind: CanvasMediaKind; reference?: boolean }) => void;
  useReferenceVoice: (id: string, voice: CanvasReferenceVoice) => Promise<void>;
}

const CanvasEditorContext = createContext<CanvasEditorActions | null>(null);
// 尺寸锁是本工作区的显示状态；独立通知卡片，不把所有动作回调变成响应式数据。
const CanvasFixedSizeContext = createContext(false);
export const useCanvasFixedSize = () => useContext(CanvasFixedSizeContext);

// 这里只传“把修改交给谁”，没有在 Context 保存节点、选择或请求结果。
// React Flow 的自定义节点由库实例化，使用这个局部通道才能接回所属编辑器事务。
// Provider 挂在单个工作区内部，两个会话不会因为共用展示组件而共享撤销栈。
export function CanvasEditorActionsProvider({ value, children, fixedSize = false }: { value: CanvasEditorActions; children: ReactNode; fixedSize?: boolean }) {
  // 动作通道像固定的分机号码：搬卡片不必通知全体卡片换电话号码。
  // 宿主每帧都会产生新闭包；若直接作 Context value，会强迫全部消费者渲染。
  // 稳定外壳只转发动作，提交后更新接收方，既不广播坐标也不缓存旧 editor。
  // layout effect 在用户下一次操作前同步更新，取消、导入仍看到最新所属实例。
  // 不在渲染中写 ref，避免并发渲染尚未提交的回调泄漏给当前页面。
  // 每个 Provider 自己持有这份转发器，没有把业务状态迁进全局 Context。
  // 节点自己的状态与数据变化仍会更新；稳定的是动作地址，不是显示值。
  // 媒体事件的播放进度也不受此 memo 限制，继续由各播放器自己刷新。
  const current = useRef(value);
  // current 只装回调，没有将节点、路径或播放器对象放进新的共享状态。
  // updateNodeData 的参数仍由被操作卡片提供，转发器不从全局选择猜目标。
  // importMedia 同样传递原目标类型，图片卡不会因为回调稳定就接收视频替换。
  // copySelected 在执行时调用最新选择，不会复制上一次渲染时的旧高亮。
  // openComposer 仍返回当前工作区，另一个 Provider 的 current 完全独立。
  // 端口连接的临时起点仍归原连接 Hook，稳定地址不共享连接草稿。
  // duplicateSelected 继续使用原命令历史，不在转发层另造一个复制实现。
  // cancelConnection 必须也转发最新回调，避免取消时清理已退役的图实例。
  // 挂载时 useRef 已有首份可用动作，因此子节点首次接收事件不会遇到空方法。
  // 后续提交只更新 ref，Context value 不变，不会通知所有节点执行组件函数。
  // 这里不在 effect 中 setState，所以更新回调不会额外安排第二次整图渲染。
  // 转发器不吞异常，原业务入口仍负责用户反馈和异步失败恢复。
  useLayoutEffect(() => { current.current = value; }, [value]);
  const actions = useMemo<CanvasEditorActions>(() => ({
    // 稳定转发器总取最新回调，文件操作锁与错误仍归所属工作区。
    // 不缓存当前标题或文件地址，否则切换节点后会提交旧值。
    // 转发只通知用户意图，不增加另一个保存器或撤销栈。
    generationStore: value.generationStore,
    cancelGeneration: (...args) => current.current.cancelGeneration(...args),
    renameNode: (...args) => current.current.renameNode(...args),
    generateImage: (...args) => current.current.generateImage(...args),
    updateNodeData: (...args) => current.current.updateNodeData(...args),
    openAnnotation: (...args) => current.current.openAnnotation(...args),
    startDrag: () => current.current.startDrag(),
    stopDrag: () => current.current.stopDrag(),
    duplicateSelected: () => current.current.duplicateSelected(),
    copySelected: () => current.current.copySelected(),
    openComposer: (...args) => current.current.openComposer(...args),
    // 稳定动作通道只转发最新宿主回调，不缓存当前选中节点。
    // 换节点后旧侧栏不能继续往新节点写参数，目标身份由上层明确管理。
    // 打开侧栏不会造成所有媒体卡重新挂载或打断播放。
    openImageSettings: (...args) => current.current.openImageSettings(...args),
    openDirector: (...args) => current.current.openDirector(...args),
    openPreview: (...args) => current.current.openPreview(...args),
    cancelConnection: () => current.current.cancelConnection(),
    connectPort: (...args) => current.current.connectPort(...args),
    importMedia: (...args) => current.current.importMedia(...args),
    useReferenceVoice: (...args) => current.current.useReferenceVoice(...args),
  }), [value.generationStore]);
  return <CanvasFixedSizeContext.Provider value={fixedSize}><CanvasEditorContext.Provider value={actions}>{children}</CanvasEditorContext.Provider></CanvasFixedSizeContext.Provider>;
}

export function useCanvasEditorActions() {
  // 脱离宿主使用节点属于开发接线错误，明确抛出，让应用已有错误边界处理。
  // 不能回落成空函数，否则按钮看似可点，参数却没有真正进入保存和撤销路径。
  const value = useContext(CanvasEditorContext);
  if (!value) throw new Error("CanvasEditorActionsProvider is missing");
  return value;
}
