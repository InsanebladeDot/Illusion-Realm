"use client";

/**
 * 共用视频列表已有的拖拽编排：只通知两个稳定 id，不替业务保存数组。
 * 像搬动书架上的书，容器负责认出起点和终点，书里的内容仍归原主人。
 * 视频使用竖排策略，提示词使用换行策略；手柄和内容由各调用方呈现。
 */
import type { ReactNode } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, verticalListSortingStrategy } from "@dnd-kit/sortable";

// 公共组件的职责边界：
// 它从视频 ClipPlaylist 原有实现抽出，视频不再自己维护另一份 DndContext。
// 本文件使用现有 dnd-kit 依赖，不需要给应用再安装一套拖拽库。
// 容器只需要顺序 id，不需要知道片段路径、分类正文或用户配置结构。
// 因此不会为了共享拖拽把视频剪辑规则带进提示词编辑器。
// ids 应与实际渲染顺序相同；如果两者不同，动画目标会和最终队列错位。
// 每个 id 在当前容器内必须唯一；同名分类应使用不同的业务 id。
// 其他容器可以使用同样的 id，因为每个 DndContext 单独管理自己的成员。
// children 负责实际 DOM，本组件不额外插入有宽高的外框干扰原 flex 排列。
// 调用方继续控制滚动区，本组件不把页面滚动接管成另一个全局监听器。
// layout 描述真实几何：wrap 允许分类折行，vertical 对应单列片段卡片。
// rect 策略比较各项矩形，不能把换行分类硬当成一条横向直线。
// 竖排策略保留视频原有让位方式，不把视频卡片改成格子布局。
// 列表只共享布局算法，卡片间距、主题和选中样式仍在各业务组件。
// 传感器的使用方式：
// PointerSensor 在手柄收到按下事件后等待移动阈值，减少误触。
// 只在手柄挂 listeners，正文区域仍可正常选中、输入、点击和滚动。
// 四像素阈值沿用原视频设定，没有给两个调用方添加不同灵敏度。
// 触摸设备需要手柄 touch-none，否则浏览器可能提前把动作当作滚动。
// 不把 touch-none 加到整张卡片，避免用户在内容上滑动时无法滚动列表。
// KeyboardSensor 为原生按钮提供空格提起和放下的路径。
// sortableKeyboardCoordinates 依据候选项位置计算移动，适配上下换行。
// 不能直接用固定像素步长，因为每个分类名称的宽度可能不同。
// 键盘提起后 Escape 由库取消，不额外在页面重复注册取消监听。
// 两个传感器使用同一 onDragEnd，鼠标和键盘不会保存出两套顺序。
// 传感器由库在交互结束和卸载时移除临时监听，不手写 document 事件队列。
// 事件只在 renderer 内处理，不扩展 preload，也不把 DOM 身份传给主进程。
// 提交规则：
// 拖动过程的 transform 只是视觉让位，还没有变更业务数组。
// 只有放手成功才调用 onMove，取消不会留下一个已经保存的中间位置。
// 库的 active 表示正在拖的项，over 表示当前匹配的目标，不是最终数组。
// 同一项上放手无需写入，可以避免没有变化的持久化通知。
// 空 over 表示库没有给出有效目标，此时保留原业务顺序。
// closestCenter 根据中心距离选候选，空白间隙仍可能匹配邻近成员。
// 因此这里承诺的是尊重库的目标结果，而非鼠标越过某条边界就一定取消。
// 只有候选缺失或 Escape 才应被当成取消，不用视觉位置猜用户意图。
// 事件中的 id 类型允许数字，但当前应用的业务身份统一使用字符串。
// 转换后仍检查 ids，不把未知身份直接传进业务动作。
// 成员检查在放手时执行，不信任拖起那一刻的旧列表。
// 业务若因删除或切换工作区移除了起点，这次拖动不会重新插回它。
// 业务若正在忙，disabled 阻止最后提交；子项也应同步禁用抓取点。
// 只禁止容器提交并不能隐藏手柄，所以调用方仍负责可见禁用状态。
// onMove 不返回新列表，避免公共容器持有可能过期的对象副本。
// 图片动作会用 Zustand 的最新 state 取分类，视频则沿用原数组回调。
// 这里不负责撤销栈；未来若业务增加撤销，应放在原业务动作边界。
// 这里也不负责落盘，不会把蒙版会话误写成图片的永久偏好。
// 异常与生命周期：
// 排序回调是同步 UI 动作，不在这里发网络请求或创建后台任务。
// 业务回调若以后需要异步保存，应由业务端处理失败与用户反馈。
// 本容器不捕获异常并假装成功，以免掩盖回调本身的错误。
// 不额外缓存 ids，渲染拿到新队列时库也能马上得到同一顺序。
// 多个容器不会通过模块变量共享 active 或 over。
// 关闭面板时由 React 卸载当前拖拽上下文，不保留悬空操作状态。
// 重新打开只读取业务现有队列，不从某个临时动画快照恢复。
// 分类栏的开关只是是否允许拖拽，不是提示词是否按队列拼接的开关。
// 保留这个区分可以避免关闭手柄后正文突然恢复默认顺序。
// 测试应检查真实手柄输入和回调结果，而不是只判断组件被导入。
// 共享后的视频/GIF 仍需要回归，类型相同不等于运行行为一定相同。
interface SortableListProps {
  /** 与子项 useSortable 的 id 一致，禁止使用随位置变化的数组下标。 */
  ids: string[];
  /** 竖向片段列表和会换行的分类栏采用各自真实的排列方式。 */
  layout: "vertical" | "wrap";
  /** 业务禁用时连拖拽结束也拒绝，防止操作途中开始生成仍提交旧事件。 */
  disabled?: boolean;
  /** 回调收到身份而非对象快照，调用方可以从最新状态中取出完整内容。 */
  onMove: (activeId: string, overId: string) => void;
  /** 公共容器不规定卡片外观，原视频行与提示词按钮保留自己的布局。 */
  children: ReactNode;
}

export function SortableList({ ids, layout, disabled = false, onMove, children }: SortableListProps) {
  // 保留视频原有的四像素阈值，普通点击不会轻易变成一次排序。
  // PointerSensor 同时处理鼠标、触控笔和触屏，手柄自行禁用触屏滚动。
  // 键盘坐标读取实际可排序矩形，分类换行后也能用上下方向定位。
  // 两个传感器由当前容器持有，不使用全局拖拽状态，不会串到其他实例。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // 只有放到另一个仍存在的成员上才提交；Escape 取消不会进入这个回调。
  // 仅尊重库给出的有效目标，不为缺失目标擅自补一个队尾位置。
  // 使用最新 props 的成员表校验，拖拽期间被删除的分类不能复活。
  // 锁检查同时覆盖开始后才被禁用的情况，不只依赖手柄是否可点击。
  const handleEnd = ({ active, over }: DragEndEvent) => {
    if (disabled || !over || active.id === over.id) return;
    const source = String(active.id);
    const target = String(over.id);
    if (ids.includes(source) && ids.includes(target)) onMove(source, target);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
      {/* 可排序区域：只共享碰撞、传感器与队列协议，不共享视频或提示词业务。 */}
      <SortableContext items={ids} strategy={layout === "vertical" ? verticalListSortingStrategy : rectSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
