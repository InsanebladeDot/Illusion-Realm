"use client";

/**
 * head：释放 ComfyUI 驻留模型的红色垃圾桶，复用现有顶栏尺寸与 Toast。
 * 请求只在用户点击时开始，首帧预渲染不读取浏览器桥接。
 * 采用独立组件让等待状态留在全局标题栏，切换业务页不会丢失。
 * 不增加确认浮层，动作只是请求远端卸载内存，没有文件删除。
 * ComfyUI 可能在任务结束后执行，因此提示只承诺请求已发送。
 * 本组件没有轮询显存，也不以返回 true 推断已释放多少内存。
 * 复用 window-caption-action 的 no-drag，鼠标操作不会拖动窗口。
 * 图标大小跟旁边 Palette 一致，红色仅强调这个清理动作。
 * 普通与窄窗跟随现有工具按钮宽度，避免新增独立布局规则。
 * 请求超时由主进程现有请求器控制，界面不另开永久等待定时器。
 * Toast 通过全局 store 显示，即使标题栏卸载也不会遗留 DOM 引用。
 */
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { freeComfyMemory } from "@/api/comfyui";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";

/**
 * 一次点击只允许一张工单在路上，ref 像门闩一样立即挡住第二次点击。
 * React 状态负责画出禁用态，但渲染尚未提交前 ref 已经可以防重入。
 * 不把这个瞬时状态持久化，重启应用不应恢复一个旧的加载中按钮。
 * 读取设置发生在点击时，后续设置改地址不会误用组件首次渲染的旧值。
 * 等待期间固定请求原来的地址，操作中途不改发给另一个服务。
 * 不订阅主进程事件，所以没有跨路由残留的 listener 要注销。
 * 没有闭包捕获 DOM；Promise 收尾只恢复局部状态与全局反馈。
 * 请求完成后组件若已卸载，React 会忽略局部状态更新。
 * HTTP 的有界超时保证离线状态最终进入 catch 并释放门闩。
 */
export function ComfyFreeMemoryButton() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const label = t(busy ? "common.comfyMemoryBusy" : "common.comfyMemory");
  // label 跟随 busy 变化，无需额外保存一份可能和按钮状态失配的提示文字。
  // ref 不参与渲染，更新门闩不会触发第二次网络请求或依赖 effect 自动执行。
  // 此按钮位于 AppShell 的标题栏，生成页切换不改变服务端请求所属地址。
  // 本地全屏隐藏标题栏时并不取消远端已经接受的清理请求。
  // 标题栏重新显示后可以再次操作，不需要从生成页恢复一个任务会话。
  // 请求成功后不改本地“模型已加载”标记，因为远端尚可能等待当前任务。
  // 失败后也不清除模型选择，服务离线不代表用户原来选中的模型不存在。
  // 模型文件与目录清单仍由设置页扫描器管理，此按钮没有扫描副作用。
  // 清理动作不携带提示词和图片，服务无需为卸载内存接收当前创作内容。
  // API 缺失通过统一错误提示处理，用户不会看到 JavaScript 方法不存在的异常。
  // 错误 Toast 的持续时间由原 store 决定，这里不留下第二个隐藏消息计时器。
  // 支持键盘原生按钮激活，无需手写 Enter/Space 监听而造成双重提交。
  // busy 由 await 的收尾恢复，HTTP 200 空响应不会要求解析出额外完成字段。
  // 接受请求的消息跨路由可见，用户不用保持在创建页等待提示。
  // 这里不统计显卡资源，各设备缓存的实际回收量由 ComfyUI 和运行时决定。
  // 回调不保存 Error 对象，避免把底层响应附带的数据留在组件状态中。

  // 捕获整条 IPC 链上的拒绝，避免事件回调产生未处理的 Promise。
  // 旧桥接和服务拒绝分别提示，前者重启更新、后者检查服务即可。
  // 不透传原始错误文案，远端响应或用户地址不会出现在全局消息中。
  // finally 同时恢复交互和门闩，失败后用户可以手动再次尝试。
  // 成功只展示信息提示，避免“释放完成”误导正在生成的用户。
  // 不清空生成任务或下载任务，服务内存释放与本地队列互不替代。
  // 两种状态都使用当前 i18n 的词条，不依赖中文异常内容做判断。
  // 缺少桥接时也通过异步 try 边界收尾，按钮不会永久处于禁用态。
  // 用户再次操作会由已有 Toast 替换前条消息，不累积新的提示容器。
  // 方法存在性只用于选择用户提示，真正的调用仍由 API 检查能力。
  // 请求接口固定发送两个标志，按钮不能调整远端命令的语义。
  // 这不是后台自动清理；每次请求都来自这个按钮的明确点击。
  const release = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await freeComfyMemory(useSettingsStore.getState().comfyServerUrl);
      useToastStore.getState().show(t("common.comfyMemoryRequested"), "info");
    } catch {
      useToastStore.getState().show(t(window.electronAPI?.comfyFreeMemory ? "common.comfyMemoryFailed" : "common.comfyMemoryUnavailable"), "error");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  // head：保持红色细线图标，禁用时只降低透明度而不扩大图标。
  // title 与 aria-label 使用同一个状态文案，读屏与鼠标提示一致。
  // aria-busy 指出请求阶段，disabled 同时阻止鼠标和键盘重复提交。
  // 保留原顶栏焦点环，键盘用户也能找到这个内存释放入口。
  // 图标由按钮提供可读名称，SVG 自身隐藏以免重复朗读。
  // 数据标记只用于稳定回归定位，不把中文标题作为测试选择器。
  // 没有自定义快捷键，避免与编辑画布或生成页现有按键冲突。
  // 不添加下拉菜单，按钮的所有可见区域都执行同一个释放动作。
  return <button type="button" data-window-free-memory aria-label={label} title={label} aria-busy={busy} disabled={busy} onClick={release} className="window-caption-action flex h-full w-8 shrink-0 items-center justify-center text-red-500 hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-stroke sm:w-[46px]"><Trash2 size={17} aria-hidden="true" /></button>;
}
