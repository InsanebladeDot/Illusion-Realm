"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import type { CanvasData } from "./canvas-model";
import type { CanvasMediaKind } from "./canvas-media-import";

/**
 * 节点卡片只负责展示和采集操作意图；真正改作品仍由画布编辑器处理。
 * 这像把卡片的修改单交回总账，而不是让每张卡片各自保存一份账本。
 */
export interface CanvasEditorActions {
  updateNodeData: (id: string, patch: Partial<CanvasData>) => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  openComposer: (id: string) => void;
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
  importMedia: (target: { id: string; kind: CanvasMediaKind }) => void;
}

const CanvasEditorContext = createContext<CanvasEditorActions | null>(null);

// 这里只传“把修改交给谁”，没有在 Context 保存节点、选择或请求结果。
// React Flow 的自定义节点由库实例化，使用这个局部通道才能接回所属编辑器事务。
// Provider 挂在单个工作区内部，两个会话不会因为共用展示组件而共享撤销栈。
export function CanvasEditorActionsProvider({ value, children }: { value: CanvasEditorActions; children: ReactNode }) {
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
    updateNodeData: (...args) => current.current.updateNodeData(...args),
    duplicateSelected: () => current.current.duplicateSelected(),
    copySelected: () => current.current.copySelected(),
    openComposer: (...args) => current.current.openComposer(...args),
    cancelConnection: () => current.current.cancelConnection(),
    connectPort: (...args) => current.current.connectPort(...args),
    importMedia: (...args) => current.current.importMedia(...args),
  }), []);
  return <CanvasEditorContext.Provider value={actions}>{children}</CanvasEditorContext.Provider>;
}

export function useCanvasEditorActions() {
  // 脱离宿主使用节点属于开发接线错误，明确抛出，让应用已有错误边界处理。
  // 不能回落成空函数，否则按钮看似可点，参数却没有真正进入保存和撤销路径。
  const value = useContext(CanvasEditorContext);
  if (!value) throw new Error("CanvasEditorActionsProvider is missing");
  return value;
}
