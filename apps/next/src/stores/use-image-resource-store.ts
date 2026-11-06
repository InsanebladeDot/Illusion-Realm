"use client";

/**
 * 图片模式资源草稿：把原创建页的三个局部字段迁入同一内存 store。
 * 编辑工具只在用户点击同步时读取，不订阅并自动覆盖自己的选择。
 * 不持久化磁盘，也不改变用户数据文档格式。
 * 页面重新挂载后仍能读取上次图片模式选择，避免同步到演示默认值。
 * 编辑与图片模式继续拥有各自的资源数组，任一侧调权重不会反向修改另一侧。
 */
import { create } from "zustand";
import type { SetStateAction } from "react";
import type { SelectedModel } from "@/types/model";
import type { SelectedExtension } from "@/types/extension";
import { DEFAULT_SELECTED_MODEL } from "@/data/models";
import { DEFAULT_MODEL_SERIES_ID } from "@/data/modelSeries";

// 字段名沿用原创建页，原有生成、二创回填、系列切换无需另一层数据适配。
// seriesId 保留 string 契约，系列控件仍负责其受支持选项。
// selectedModel 保存资源版本 id，不保存卡片显示名称或服务端临时路径。
// selectedExtensions 的行顺序与权重直接对应原来的 LoRA 注入链。
// React setter 契约保留函数式更新，公共多选控件无需改动。
// store 无 IPC 和网络副作用，选择资源不会自动生成或下载文件。
// 该状态属于普通图片模式，不在这里保存编辑工具自己的资源。
// 因此快速同步完成后，两个模式之间没有持续的响应式绑定。
// 主模型组 id 与版本 id 必须成对保留，不能只复制卡片标题。
// 扩展的 extensionId 指向真实版本，weight 是用户当前设置的数值。
// 数组未使用排序器，原先手动追加 LoRA 的顺序仍具有生成意义。
// 初始资源可能来自演示数据，快速同步入口须验证实际扫描结果。
// 类型层不声称模型文件已安装，安装与服务端可见性属于不同检查边界。
// 这里不存 ComfyUI 服务地址，同步资源不能顺带切换生成目标。
// setter 接收完整替换与函数式补丁，与 React 原来局部状态行为一致。
// 这种契约保留已有弹窗的确认与取消语义，打开菜单不会提交草稿。
// 不订阅本地扫描来自动清除选择，用户目录调整后仍可看到旧选择并修正。
// 实际生成入口继续使用原目录校验，不把内存可读等同于文件存在。
// 不记录模型路径到日志，调试输出不能借本 store 泄露用户目录。
// 没有新增序列化字段，现有用户数据迁移与版本号无需改变。
// 页面重建时默认模型 effect 可以校正无效版本，但合法自选版本应保留。
// 同步入口始终读取最新状态，不依赖某个页面是否还持有 React 闭包。
// 三个字段共享一个域，后续若增加同步确认只需要读取一次一致快照。
// 当前动作仍遵循原先调用顺序，不额外引入异步事件或延迟通知。
// 本模块不触碰生成队列，运行任务已经冻结的资源不会被 setter 追溯更改。
// store 常驻只保证本进程会话，不能据此宣称关闭客户端后还能恢复选择。
// 编辑入口取得资源后另做克隆，避免使用同一行对象作为可变草稿。
// 控件本身继续由创建页装配，store 不反向依赖任何视图组件。
interface ImageResourceState {
  seriesId: string; selectedModel: SelectedModel; selectedExtensions: SelectedExtension[];
  setSeriesId: (value: SetStateAction<string>) => void;
  setSelectedModel: (value: SetStateAction<SelectedModel>) => void;
  setSelectedExtensions: (value: SetStateAction<SelectedExtension[]>) => void;
}

// 初始系列和模型继续引用原页面常量，避免迁移改变首次启动行为。
// 空扩展表示图片模式尚未选 LoRA，不从编辑模式借用默认编辑文件。
// 每个 setter 只修改自己的字段，保留原系列切换回调的清空策略。
// 函数式回调从最新 state 求值，连续确认多个扩展不会丢掉前一项。
// 非函数入参保持原 React setter 的替换语义，二创仍可一次回填完整列表。
// setter 不主动校验本地文件存在性，运行和快速同步各自在提交边界检查。
// 默认对象仅被读取，后续更新均替换字段而不修改模块常量。
// 不添加持久化中间件，重启不会加载可能已经失效的资源 id。
// 这里不接收 File 或 Blob，图片字节仍由独立编辑会话拥有。
// getState 允许用户操作瞬间读取，不需要创建页持续发布镜像快照。
// 订阅值与实际生成读取同源，避免点击同步拿到上一帧 effect 缓存。
// 路由切换只解除订阅，当前资源不会因图片表单卸载回到初始值。
export const useImageResourceStore = create<ImageResourceState>((set) => ({
  seriesId: DEFAULT_MODEL_SERIES_ID, selectedModel: DEFAULT_SELECTED_MODEL, selectedExtensions: [],
  setSeriesId: (value) => set((s) => ({ seriesId: typeof value === "function" ? value(s.seriesId) : value })),
  setSelectedModel: (value) => set((s) => ({ selectedModel: typeof value === "function" ? value(s.selectedModel) : value })),
  setSelectedExtensions: (value) => set((s) => ({ selectedExtensions: typeof value === "function" ? value(s.selectedExtensions) : value })),
}));
