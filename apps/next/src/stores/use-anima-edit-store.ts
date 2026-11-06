"use client";

/**
 * 文字编辑的会话草稿：Zustand 保留输入和结果，页面卸载只解除订阅。
 * 运行本身由公共队列负责；本 store 不创建第二套调度或磁盘持久化格式。
 * File 与 blob URL 仅在本次应用进程有效，不写入用户数据 JSON。
 * 重进编辑页复用同一草稿，模型、LoRA 权重和采样参数也不会回到默认值。
 * 显式替换或移除素材时释放源 URL；结果替换时释放结果的独立展示 URL。
 * 队列缩略图拥有另一份 URL，清空编辑草稿不能破坏历史任务卡片。
 */
// Zustand 是同一渲染进程内的状态容器，不通过 React Context 注入全局草稿。
// 页面只订阅状态；异步执行仍由 utils 中的队列服务持有。
// 切换 Next 路由不重新加载此模块，因此任务完成后可更新同一个草稿。
// 这里没有 Electron 或 Node 引用，素材字节继续留在浏览器安全边界内。
// 类型导入不会把主进程运行时或文件 API 带进渲染 bundle。
// 默认参数取同一工作流常量，初始化值不能与实际构建器分叉。
// React SetStateAction 仅描述公共组件现有接口，不让 React 接管任务生命周期。
import { create } from "zustand";
import type { SetStateAction } from "react";
import type { SelectedModel } from "@/types/model";
import type { SelectedExtension } from "@/types/extension";
import { ANIMA_EDIT_DEFAULTS, type AnimaEditSettings } from "@/utils/comfy/anima-edit-workflow";
import type { AnimaEditResult } from "@/utils/comfy/run-anima-edit";

// 一个源对象同时承载文件、显示 URL 和解码尺寸，避免混用不同素材的信息。
// File 冻结的是浏览器选中的字节，不以可变的磁盘路径重新读取。
// 宽高是自然像素尺寸，不能用受响应式布局影响的显示矩形代替。
// source 的生命周期由显式用户操作决定，与 React effect 清理无关。
export interface EditSource { file: File; url: string; width: number; height: number }
// queued 对应公共队列真实等待状态，不能把等待其他任务显示为推理中。
// checking/uploading 期间停止只抑制后续提交，generating 才需要远端确认。
// saving 已有写入副作用，stopping 则阻止重复停止同一请求。
export type EditPhase = "idle" | "queued" | "checking" | "uploading" | "generating" | "saving" | "stopping";
// patch 只修改展示会话的数据字段，不能覆盖 store 的动作函数。
// taskId 关联公共卡片，同时作为同步防重入门闩，不依赖按钮下一帧禁用。
// importing 独立于生成阶段，图片未完成解码时不能提交旧素材。
// error 保留最后一次可读提示，idle 不代表上一次任务成功。
// extensions=null 表示尚未初始化；空数组则明确表示用户已移除全部 LoRA。
// 因此重新进入页面不能把用户删除的编辑 LoRA 再次自动加入。
// 随机模式属于表单偏好，不改变图片 Meta 的参数结构。
// 每次提交才抽取值，草稿保留最近的自定义 seed 供切回。
// 默认 custom 保持原模板语义，骰子显式启用 random。
// 编辑工具共用此模式，切页不会重置随机状态。
interface EditData {
  seedMode: 'random' | 'custom';
  // null 表示没有已验证素材，运行入口仍需显示缺原图提示。
  // 不存上传后的服务端名称，以便重试时重新上传原始字节。
  source: EditSource | null;
  // 包含输入中的 seed 字符串，不能在用户尚未提交时提前 Number 取整。
  // 快捷指令与助手写回同一对象，导出和运行均从这里读取。
  settings: AnimaEditSettings;
  // 资源 id 用于恢复版本选择，显示名称不作为服务端加载路径。
  // 目录和模型类型仍由原 buildGenerateParams 在提交时校验。
  selectedModel: SelectedModel | null;
  // 行顺序就是 LoRA 注入顺序，不能在恢复时按展示名称重新排序。
  // 每行权重独立保留，不能重挂载后退回模板默认强度一。
  extensions: SelectedExtension[] | null;
  // 只有生成且保存成功才写结果，原图不能冒充失败任务的输出。
  // 结果同时携带实际解码宽高和保存路径，便于返回后直接下载。
  result: AnimaEditResult | null;
  // 此 id 与公共任务卡片、生成 IPC 和取消 IPC 完全一致。
  // 完成或拒绝后清空，不移除公共列表中保留的终态记录。
  taskId: string | null;
  // 细阶段由真实执行边界写入，不用动画结束事件驱动业务状态。
  // 全局卡片可合并检查和上传为活动状态，表单保留更细提示。
  phase: EditPhase;
  // 导入可跨路由等待解码，返回时仍需显示其实际是否结束。
  // 无论导入成功失败都由最新版本请求负责恢复此状态。
  importing: boolean;
  // 只保存用户可读说明，不将异常 stack 或任意 IPC 动态对象写入 UI。
  // 新运行或新导入主动清除旧错误，而不是用短时定时器隐藏问题。
  error: string;
}
// setter 保持 React 的函数式更新契约，公共模型选择组件可原样复用。
// 参数更新合并基于最新状态，连续修改不同字段不会互相覆盖。
// selectedModel 为 null 时仍使用既有编辑默认 UNet，不猜测扫描列表第一项。
// 结果更新拥有明确资源释放点，页面多次挂载不需要重复 effect 管理 URL。
// patch 不隐式取消任务，只有公共队列的显式停止入口能改变执行过程。
interface EditStore extends EditData {
  // 细阶段与导入原子写入相关字段，避免 UI 组合出不一致的源图和尺寸。
  // 资源 URL 的所有权操作必须走专用动作或导入函数，不能仅丢掉引用。
  patch: (value: Partial<EditData>) => void;
  // setter 接受函数，滑条、指令和随机 seed 可保留各自修改之外的字段。
  // 入队时另做深克隆，所以后续草稿更新不会追溯改变已提交任务。
  setSettings: (value: SetStateAction<AnimaEditSettings>) => void;
  // 公共模型选择器只需要原 setter 契约，不暴露整个 store 给菜单实现。
  // 选择取消不调用此动作，现有模型不会因打开弹窗而被清空。
  setSelectedModel: (value: SetStateAction<SelectedModel | null>) => void;
  // 删除与权重修改按最新数组求值，连续点击不能复活已经删掉的版本。
  // 初始化只填 null，调用此动作写入 [] 后保留用户的明确空选择。
  setExtensions: (value: SetStateAction<SelectedExtension[]>) => void;
  // 新结果接管旧结果后释放旧 URL，避免每次运行累积 Blob 展示引用。
  // 传入结果的 URL 必须独立于队列缩略图，不能共享后分别释放。
  setResult: (value: AnimaEditResult | null) => void;
}

// 初始配置复制默认对象，表单更新不能修改模块级默认常量。
// 不使用 persist 中间件：blob URL 在下次启动已无效，不能伪装成重启恢复。
// 跨路由恢复依赖模块常驻，完整关闭客户端后的生成恢复不在此次契约内。
// 模型状态与其他创建模式独立，编辑选择不能覆盖普通图片页的模型草稿。
// source 默认空值仍要求用户选择原图，不能用演示图满足运行前置条件。
// setResult 仅释放旧展示 URL，不删除已经落盘的生成图片。
export const useAnimaEditStore = create<EditStore>((set) => ({
  seedMode: 'custom', source: null, settings: { ...ANIMA_EDIT_DEFAULTS }, selectedModel: null, extensions: null,
  result: null, taskId: null, phase: "idle", importing: false, error: "",
  // shallow patch 保留没有变动的草稿字段及动作，不重置模型选择。
  // 异步回调从 getState 取得动作，不依赖已卸载页面的 setter。
  // 页面不注册 reset cleanup，切页就是解除订阅而不是销毁会话。
  patch: (value) => set(value),
  // 设置更新只改变草稿，不能自动提交，也不会重启一个已在排队的任务。
  // 字段值的最终合法性在导出或提交的构建器内校验，不在 setter 静默修正。
  // 字符串 seed 可保留空输入和中间编辑态，避免用户打字时数字被重排。
  // 此动作不执行网络或 IPC，可用于手动输入、预设与异步助手的统一回写。
  // 提交快照与草稿对象分离，运行任务的参数不会被这类回写追溯更改。
  setSettings: (value) => set((state) => ({ settings: typeof value === "function" ? value(state.settings) : value })),
  setSelectedModel: (value) => set((state) => ({ selectedModel: typeof value === "function" ? value(state.selectedModel) : value })),
  // 函数式扩展更新用于公共组件批量删除或改变权重，读取的是最新数组。
  // null 只存在于首次初始化前，此时函数式变更按空数组处理。
  // 普通初始化由模型 hook 提供实际扫描版本，不在领域 store 反向读取设置。
  // store 不依赖封面或弹窗组件，资源显示实现可以独立变化。
  // 选中列表不自动排序或去掉零权重，保持用户可见顺序与实际工作流一致。
  setExtensions: (value) => set((state) => ({ extensions: typeof value === "function" ? value(state.extensions ?? []) : value })),
  // URL 回收只发生在显式替换结果时，隐藏画布和路由切换不会触发。
  // 已保存路径不在回收范围，revokeObjectURL 只影响内存展示句柄。
  // 任务历史有自己的 URL，因此裁剪历史与清空草稿互不破坏。
  // 单一动作保证旧 URL 在失去最后一个草稿引用前被及时释放。
  // 最新结果保留到下一次运行或用户换图，返回页面可立即看到。
  // 此动作没有文件写入副作用，不会因 React 重渲染重复保存。
  setResult: (result) => set((state) => { if (state.result) URL.revokeObjectURL(state.result.image.objectUrl); return { result }; }),
}));
