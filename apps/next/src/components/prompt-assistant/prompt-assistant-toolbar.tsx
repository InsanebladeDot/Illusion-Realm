"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Languages, Loader2, SlidersHorizontal, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { useToastStore } from "@/stores/useToastStore";
import { copyText } from "@/utils/charactersFormat";
import { AssistantMenu } from "./assistant-menu";
import { AssistantSettings } from "./assistant-settings";
import { AssistantHistory } from "./assistant-history";
import { usePromptTransform, type PromptTarget } from "./use-prompt-transform";
export function PromptAssistantToolbar(target: PromptTarget) {
  const router = useRouter();
  const { t } = useTranslation(); const anchor = useRef<HTMLDivElement>(null);
  // 预设弹窗复用新增表单：undefined 关闭、null 新增、字符串编辑既有 id。
  // 以 id 区分同名预设，改名不影响当前选中状态或其他输入框。
  // 弹窗每次关闭后卸载，下一次打开重新读取已保存的名称和指令。
  const [expanded, setExpanded] = useState(false); const [menu, setMenu] = useState(false); const [settings, setSettings] = useState<string | null>();
  // 每个工具栏只管理自己的打开状态，记录本身由共享偏好提供。
  // 关闭历史不修改当前文本，也不触发一次新的翻译请求。
  // 从菜单进入时先收起菜单，避免两层同时拦截 Escape 和外部点击。
  const [historyOpen, setHistoryOpen] = useState(false);
  // 历史关闭后将焦点交回同一个工具栏入口，不把键盘用户留在已卸载的弹窗按钮上。
  // 使用可选 DOM 查找，来源已经因路由离开而卸载时无需再创建新的焦点目标。
  // 该回调保持稳定，资源外壳不必因父组件每次重绘而重装关闭监听。
  // 工具栏的翻译、复制和撤销仍由原 hook 管理，历史没有另一套 undo 栈。
  // 打开动作不消费 pending，冲突结果仍能回到原输入框继续确认。
  // 宽屏 body 弹窗关闭与窄屏 main 返回都调用同一来源回调。
  // 查看历史没有写盘工作，无需像批量改名那样阻止用户取消或按 Escape。
  // toolbar 即使收起到一个图标，历史入口仍可从菜单抵达，不增大常驻占位。
  // 每个实例的 historyOpen 都是局部布尔值，不把“打开了哪一页”写入用户文档。
  // 页面重新进入时默认关闭历史，保留的是内容而不是上一次浮层形态。
  const closeHistory = useCallback(() => { setHistoryOpen(false); anchor.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  const transform = usePromptTransform(target); const closeMenu = useCallback(() => setMenu(false), []);
  useEffect(() => { void usePromptAssistantStore.getState().load().catch(() => useToastStore.getState().show(t("create.promptAssistant.failed"))); }, [t]);
  // 编辑仍走原菜单到弹窗的入口，不让菜单浮层和编辑层同时拦截指针。
  // connection 继续导航到密钥页；只有 preset 会建立本地编辑草稿。
  // 新增不传 id，编辑只传原 id；任何预设正文都不进入 URL。
  const configure = (mode: "connection" | "preset", presetId?: string) => { setMenu(false); if (mode === "connection") router.push("/settings#prompt-keys"); else setSettings(presetId ?? null); };
  const copy = async () => { if (await copyText(target.read())) useToastStore.getState().show(t("create.promptAssistant.copied")); };
  const iconClass = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke disabled:opacity-40";
  return <>
    <div ref={anchor} data-prompt-assistant={target.contextId} className="absolute bottom-1.5 right-2 flex items-center rounded-full border border-border/50 bg-background/65 p-0.5 shadow-sm backdrop-blur-md" onPointerEnter={() => setExpanded(true)} onPointerLeave={() => setExpanded(false)} onFocus={() => setExpanded(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); }}>
      <button type="button" data-assistant-options title={t("create.promptAssistant.title")} aria-label={t("create.promptAssistant.title")} aria-haspopup="menu" aria-expanded={menu} className={iconClass} onClick={() => setMenu(value => !value)}><SlidersHorizontal size={15} /></button>
      <div data-assistant-actions data-expanded={expanded || menu || transform.busy} className={`flex overflow-hidden transition-[max-width,opacity] duration-200 motion-reduce:transition-none ${expanded || menu || transform.busy ? "max-w-24 opacity-100" : "max-w-0 opacity-0"}`} inert={!expanded && !menu && !transform.busy}>
        <button type="button" title={t("create.promptAssistant.copy")} aria-label={t("create.promptAssistant.copy")} className={iconClass} onClick={() => void copy()}><Copy size={14} /></button>
        <button type="button" data-assistant-undo title={t("create.promptAssistant.undo")} aria-label={t("create.promptAssistant.undo")} disabled={!transform.canUndo || transform.busy} className={iconClass} onClick={transform.revert}><Undo2 size={14} /></button>
        <button type="button" data-assistant-translate title={t(transform.busy ? "create.promptAssistant.busy" : "create.promptAssistant.translate")} aria-label={t("create.promptAssistant.translate")} disabled={transform.busy} className={iconClass} onClick={() => void transform.run()}>{transform.busy ? <Loader2 size={15} className="animate-spin" /> : <Languages size={15} />}</button>
      </div>
    </div>
    {menu && <AssistantMenu anchor={anchor} onClose={closeMenu} onConfigure={configure} onHistory={() => { setMenu(false); setHistoryOpen(true); }} />}
    {/* 翻译历史：复用资源外壳，宽屏弹窗与窄屏 main 子页保持原宿主规则。 */}
    {/* 不向历史页注入 write，确保查看或复制旧结果不会覆盖正在编辑的内容。 */}
    {historyOpen && <AssistantHistory onClose={closeHistory} />}
    {/* 弹窗：「添加 / 编辑自定义预设」复用同一表单与资源弹窗外壳。 */}
    {/* null 表示新增，不能用 truthy 判断，否则新增弹窗无法挂载。 */}
    {/* 关闭清除目标，取消编辑不会通过卸载自动保存任何草稿。 */}
    {settings !== undefined && <AssistantSettings presetId={settings ?? undefined} onClose={() => setSettings(undefined)} />}
    {transform.pending && <div data-assistant-result className="absolute inset-x-1 bottom-10 z-10 max-h-48 overflow-auto rounded-lg border border-border bg-background/95 p-3 text-xs shadow-lg backdrop-blur-md"><p className="mb-1 font-medium">{t("create.promptAssistant.result")}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{transform.pending.after}</p><div className="mt-2 flex gap-3"><button type="button" onClick={transform.applyPending} className="text-primary">{t("create.promptAssistant.apply")}</button><button type="button" onClick={transform.discard}>{t("create.promptAssistant.discard")}</button></div></div>}
  </>;
}
