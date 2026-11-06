// 创建页主区的临时视图栈：只登记宿主节点与页面实例，不保存资源草稿或业务数据。
// Zustand 仅跨组件广播宿主和可见页 id；选择器仍是原组件，因此确认契约不发生变化。
// 宿主由创建页父组件提供；portal 直接进入其子树，不依赖 nav 宽度或 fixed 坐标。
// 页面栈支持“资源分类 → 详情”的嵌套返回，退出上层时下层实例及草稿继续保留。
// 栈不是浏览历史，不持久化；它只描述当前 React 树中已打开页面的可见顺序。
// 这份状态不落盘；离开创建路由后宿主移除，后续页面仍使用各自的原弹窗布局。
import { create } from "zustand";

interface CreateMainPageState {
  // 当前创建页的正常文档流宿主；空值表示其他路由或父组件尚未挂载。
  // 没有宿主时资源弹窗回退到 body portal，保留创建路由外既有的展示方式。
  host: HTMLDivElement | null;
  // 资源页按打开顺序记录，最后一项是可见的主区页面。
  pages: string[];
  // 创建路由挂载与卸载时设置宿主；卸载必须同时清理本路由的临时页面栈。
  setHost: (host: HTMLDivElement | null) => void;
  // 页面打开时登记实例；同一 id 重复进入不改变栈顺序。
  enter: (id: string) => void;
  // 页面关闭或卸载时按 id 移除；清理顺序不应依赖调用方当前是否是栈顶。
  leave: (id: string) => void;
}

// 页面 id 来自 React 实例；不使用标题文案作为键，避免相同标题的详情互相覆盖。
// 清理时按 id 删除，不直接 pop：路由卸载和嵌套组件清理的顺序不应影响剩余页面。
// enter 去重可以承受开发模式 effect 的重复执行，不会积累无法返回的幽灵页面。
// setHost(null) 同时清空视图栈，避免下一次进入创建页时残留上一次的隐藏状态。
// store 不写本地存储，刷新页面后自然回到创建工作区，不恢复已经失效的 DOM 引用。
// 非空宿主更新保留现有栈；null 会清空，重新挂载的页面 effect 负责重新登记。
// callback ref 必须稳定，避免普通重渲染触发 null 并把正在选择的页面退栈。
// DOM 引用只在当前渲染进程有效，不允许通过 IPC、JSON 或持久化中间件传递。
// pages 只记录实例身份，不含资源 ID；相同分类可以由不同调用方独立打开。
// enter 已存在项时沿用原数组，避免重复登记触发可见顺序变化。
// leave 不存在项是幂等清理，开发模式重放 effect 也不会抛出异常。
// 最后一个页面离开后数组为空，父层自然恢复工作区，无需单独的 restore 动作。
// 不在 store 中读取 document，保证模块初始化可以发生在静态预渲染期间。
// 不设置固定的最大嵌套层数，展示层级由实际挂载的选择组件决定。
// pages 顺序表达可见优先级；只有最后一个实例显示，其余实例仅保留各自业务草稿。
// leave 过滤全表而非只删末项，能覆盖页面异常卸载或路由退出时的非 LIFO 清理。
// 所有 action 返回新的 state 对象，Zustand 订阅者只因相关值变化而重新渲染。
// 空栈对应表单显示；非空栈对应工具页显示，这是父组件唯一使用的切换判据。
export const useCreateMainPageStore = create<CreateMainPageState>((set) => ({
  // 初始状态允许其他路由继续使用原有 body 弹窗。
  host: null,
  // 页面栈为空表示创建表单占据主区。
  pages: [],
  // 清理宿主时同步清空栈，避免路由退出留下不可见的页面状态。
  setHost: (host) => set(host ? { host } : { host: null, pages: [] }),
  // 同一个实例重复登记不会复制页面，也不会改变其返回顺序。
  enter: (id) => set((state) => ({ pages: state.pages.includes(id) ? state.pages : [...state.pages, id] })),
  // 按实例 id 删除，支持嵌套页面在异常卸载顺序下安全清理。
  leave: (id) => set((state) => ({ pages: state.pages.filter((page) => page !== id) })),
}));
