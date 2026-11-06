"use client";

/**
 * 蒙版重绘的交接按钮与工作流选择，复用已有编辑草稿和生成表单。
 * 导出按钮本身不生成；用户进入参数表单确认模型和提示词后才入队。
 * 不在 UI 内上传图片，也不维护第二个推理状态。
 */
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { useAnimaEditStore } from "@/stores/use-anima-edit-store";

// 导出结果变化时原工具会清空 exports，按钮随之移除，不能提交旧笔迹。
// image 必须是原 RGB 加透明通道的 PNG，独立黑白 mask 不能代替它。
// onUseMask 只负责导入和切页，生成按钮仍在已有 Anima 编辑表单中。
// 正在运行的编辑任务不能被新的蒙版覆盖，领域门闩比局部按钮状态更可靠。
// importing 同样禁止交接，避免两个不同源图同时争抢当前编辑草稿。
// busy 防止连续点击重复解码，但不承担任务排队生命周期。
// 异步错误作为页面可读提示保留，不记录原图字节或用户路径。
// 该组件不拥有 Blob 的对象 URL，不需要在卸载时回收其他组件的素材。
// 按钮为 type=button，嵌入工具后不能触发外层表单 submit。
// 用户可先下载 PNG 再交接，两种操作互不清空导出结果。
// 交接进入对应模板草稿，文字模型选择保留在原模式，不隐式注入蒙版。
// 尚未安装补丁的情况由运行前检查报告，不能把成功导入称作生成就绪。
export function MaskGenerationAction({ image, onUseMask }: { image: Blob; onUseMask: (image: Blob) => Promise<void> }) {
  const { t } = useTranslation(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const locked = useAnimaEditStore(state => Boolean(state.taskId || state.importing));
  // 门闩订阅同时覆盖从其他页面提交的任务，不只看当前蒙版页的局部 busy。
  // Promise 的所有拒绝都在此消费，事件 handler 不留下未处理异常。
  // finally 释放的是交接按钮，不会修改已有生成任务的活动标记。
  // 用户切回蒙版后仍可继续修改和重新导出，现有画布不被卸载。
  // pending 时禁用同一个按钮，防止双击造成两次源图替换。
  // 成功不自动提交推理，允许用户先检查模式标签和参数。
  const handleUseMask = async () => { if (busy || locked) return; setBusy(true); setError(""); try { await onUseMask(image); } catch { setError(t("create.maskEditor.exportFailed")); } finally { setBusy(false); } };
  return <div className="space-y-2"><button type="button" data-mask-use-generation disabled={busy || locked} onClick={() => { void handleUseMask(); }} className="rounded-lg border border-border bg-accent px-3 py-2 text-xs text-accent-foreground disabled:opacity-40">{t("create.maskEditor.useGeneration")}</button>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}

