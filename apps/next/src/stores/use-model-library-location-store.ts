// 本地模型库把浏览位置交给唯一的窗口标题栏，标题栏不读取磁盘或扫描模型。
// 类比房间门牌：页面负责写当前房间，外壳只展示，不拥有房间里的业务数据。
// 此状态只活在当前会话，不保存进用户文档，也不改变任何模型文件路径。
// 路径项仅为相对目录名称；绝对扫描根不应在拖拽标题栏中暴露。
// owner 是本次发布者的身份，旧页面清理时不能擦掉新页面写入的门牌。
// React 严格模式和快速切页都会执行清理，因此不能无条件清空共享状态。
// 筛选、排序和模型选择不改变目录，只有实际目录切换才重新发布。
// 标题栏的显示还受路由限制，页面卸载到清理之间也不会泄漏旧目录。
import { create } from "zustand";

// 不保存扫描对象或点击回调，避免全局状态意外延长整份索引的生命周期。
// 只保留展示所需的路径段，标题栏可以独立响应语言和主题变化。
// Symbol 不参与序列化，因此这份 store 刻意不使用 persist 中间件。
interface LocationState { owner: symbol | null; segments: string[] }
export const useModelLibraryLocationStore = create<LocationState>(() => ({ owner: null, segments: [] }));

// 每次发布都得到独立的清理函数，调用方在 effect 卸载时执行它。
// 旧发布者只能删除自己的值，不能影响稍后挂载的新本地库实例。
// segments 已由目录索引确定，本层不拼接磁盘路径也不执行导航。
// 这里浅复制数组，调用方之后修改原数组不会悄悄改变标题文字。
// 清理使用 setState 的原状态返回分支，身份不符时不触发订阅更新。
// 此处返回函数交给 React effect，不通过计时器猜测页面何时完成导航。
// 清理后 segments 与 owner 同时归零，不能出现“已关闭页面但仍有旧路径”的中间状态。
// 两次发布即使路径相同也有不同身份，实例之间不会互相夺走清理权限。
// 这是展示通信，不构成模型目录的权限证明或文件系统访问入口。
export function publishModelLibraryLocation(segments: string[]) {
  const owner = Symbol("model-library");
  useModelLibraryLocationStore.setState({ owner, segments: [...segments] });
  return () => useModelLibraryLocationStore.setState(state => state.owner === owner ? { owner: null, segments: [] } : state);
}
