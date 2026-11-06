"use client";
// 模型加载设置由各模式传入真实模板和独立草稿，四个入口共用一套控件。
// 像同一张登记表由不同柜台填写：字段从模板来，选择结果仍归各自业务。
// 这里只更新文件名，不加载模型、不提交生成，也不修改模板连接。
import { isMinimaxWorkflow } from "@/data/videoForm";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCw, Settings2 } from "lucide-react";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { fetchComfyModelLists } from "@/api/comfyui";
import type { ComfyApiPrompt, ComfyModelLists } from "@/types/comfy";
import { getVideoWorkflowTemplate } from "@/utils/comfy/videoWorkflow";
import { getVideoModelNames, getWorkflowAuxiliarySlots, type VideoModelOverrides, type VideoModelSlot } from "@/utils/comfy/video-workflow-models";

// templateOverride 接受图片、编辑和音频的真实图，视频继续按 workflowId 获取。
// mediaKind 只决定 VAE 标签，不能借这个展示参数切换实际生成工作流。
// disabled 显式传给按钮及下拉框，Portal 菜单也能在任务锁定时关闭。
interface SettingsProps { workflowId: string; overrides: VideoModelOverrides; onChange: (value: VideoModelOverrides) => void; onReset: () => void; disabled: boolean; templateOverride?: ComfyApiPrompt; mediaKind?: "image" | "video" | "audio" }
// 没有独立加载槽的 checkpoint 工作流不请求无用的辅助清单。
// 展开后才挂载此 hook；请求中切换服务地址或卸载时丢弃旧回包。
// 失败仍保留默认与本地项，不用清空当前选择表达网络错误。
// 列表请求与生成请求分开；展开设置不会向 ComfyUI 排入生成任务。
// 当前只保存最近一次列表快照，不把完整服务端文件清单写入用户文档。
// 强制刷新复用已有 API 缓存入口，不在组件里新增另一套请求地址拼接。
// active 像回包的收件人签名，页面离开后旧包到达也不能再签收进状态。
// 这个标记只阻止过期回写，不声称能取消底层已经发出的网络请求。
// 刷新序号参与 effect 生命周期，前一个请求会先失效，再接收本次刷新结果。
// finally 只恢复当前活跃请求的完成状态，失败不让刷新按钮永久转圈。
// 空列表可能是确实没安装文件，只有缺少合法列表字段才作为失败显示。
// enabled=false 时不产生请求，内置 checkpoint 因而不会出现无意义的加载动画。
function useVideoModelLists(enabled: boolean) {
  const server = useSettingsStore((state) => state.comfyServerUrl);
  const [snapshot, setSnapshot] = useState<{ server: string; lists: ComfyModelLists | null; error: boolean } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [request, setRequest] = useState<{ server: string; refresh: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // 辅助设置只依赖 CLIP/VAE，主模型清单缺失不应误报这个面板失败。
    // 请求带原服务地址，旧地址的列表不能被展示给新服务器。
    fetchComfyModelLists(server, true).then((lists) => { if (active) setSnapshot({ server, lists, error: !Array.isArray(lists.clips) || !Array.isArray(lists.vaes) }); })
      .catch(() => { if (active) setSnapshot({ server, lists: null, error: true }); })
      .finally(() => { if (active) setRequest({ server, refresh }); });
    return () => { active = false; };
  }, [server, refresh, enabled]);
  // loading 按请求身份计算，切换工作流后不会等待一个永远没发出的请求。
  // reload 只更新当前实例；另一个模式的展开状态和选择不受影响。
  return { lists: snapshot?.server === server ? snapshot.lists : null, error: enabled && snapshot?.server === server && snapshot.error, loading: enabled && (request?.server !== server || request.refresh !== refresh), reload: () => setRefresh((value) => value + 1) };
}
// 当前值即使暂时不在服务器清单也保留，用户能看到并主动修正旧选择。
// 选择工作流默认时删除对应覆盖键，不把默认文件名固定进草稿。
// 这样模板更新后仍能沿用新默认，而不是被上次打开面板锁死。
// 一行只接收一个真实 loader 的 id，两个 VAE 即使同名也不是同一配置项。
// 默认选项的值为空，标签显示完整默认路径，提交端仍可以使用更新后的模板。
// 当前自定义值优先补进选项，目录改名后用户仍知道自己上次选了什么。
// 去重只针对这一行候选文件，不会删除另一个槽的默认项或选择。
// 本地扫描的目录转换沿用已有工具，不用 basename 截断多层模型路径。
// 列表分组与兼容性由原模型工具负责，公共表单不猜测文件大小对应什么模型。
// 选择回调复制覆盖对象，不能原地修改父组件 state 后让 React 漏掉更新。
// 清除单个槽只删除该键，同一个工作流另一个 VAE 的覆盖继续保留。
// 表单不自动帮用户改选第一项，刷新或服务断连不会悄悄换掉生成资源。
function VideoModelSlotSelect({ slot, overrides, lists, onChange, minimax, disabled }: { slot: VideoModelSlot; overrides: VideoModelOverrides; lists: ComfyModelLists | null; onChange: (value: VideoModelOverrides) => void; minimax: boolean; disabled: boolean }) {
  const { t } = useTranslation();
  const models = useSettingsStore((state) => state.models);
  const paths = useSettingsStore((state) => state.paths);
  const names = getVideoModelNames(slot, models, paths, lists, minimax ? "minimax" : undefined);
  const value = overrides[slot.id] || "";
  const options = [{ value: "", label: t("create.videoModels.default", { name: slot.defaultName }) }, ...[...new Set([...(value ? [value] : []), ...names])].map((name) => ({ value: name, label: name }))];
  function select(name: string) {
    const next = { ...overrides };
    if (name) next[slot.id] = name; else delete next[slot.id];
    onChange(next);
  }
  return <div data-video-model-slot={slot.id} className="flex min-w-0 items-center gap-2"><span title={t(slot.label)} className="w-20 shrink-0 whitespace-nowrap text-xs font-medium">{slot.category === "clips" ? "CLIP" : t(slot.label)} {slot.position}</span>
    {/* 共用下拉框负责长路径省略、浮层避让和键盘选择，业务只接收真实文件名。 */}
    <SimpleSelect value={value} options={options} disabled={disabled} onChange={select} ariaLabel={`${t(slot.label)}${slot.position ? ` ${slot.position}` : ""}`} portal className="min-w-0 flex-1" triggerClassName="text-xs" />
  </div>;
}
// 加载行由模板实际存在的输入派生，不从产品模式名字推断节点数量。
// mediaKind 省略时沿用视频标签，既有视频调用不必为展示改写业务参数。
// fieldSet 负责普通后代的禁用，Portal 菜单额外接收 disabled 避免绕过锁定。
// 错误提示与当前选项并存，用户能区分列表查询失败和没有选择过模型。
// 重置动作交给调用方，所以图片可只清当前系列，音频可只清当前参考分支。
// 没有复制生成、上传或磁盘写入动作，所有实际副作用仍在原业务边界。
function VideoModelSettingsBody(props: SettingsProps) {
  const { t } = useTranslation();
  // 当前模板决定字段，不能把视频的三个固定下拉框复制到所有模式。
  // 缺省模式仍是视频，已有 MiniMax 与 Wan 调用保持相同模板来源。
  // 辅助槽过滤与构建校验同源，pixel_space 不作为可选磁盘文件展示。
// 模板变化只重新提取槽，不回调 onChange 自动覆盖用户草稿。
// 当前选择不以列表下标保存，排序和服务端新增文件不会移动已选身份。
// 列表加载成功也不改写模板，只更新可供选择的候选项。
// CLIP 标签保持行业名称，VAE 标签按媒体用途区分，正文说明仍走翻译词条。
// 展开内容由本实例挂载和销毁；收起后不在后台保留额外列表订阅。
// 此时服务列表可能仍在返回，hook 清理会将它视为无收件人的旧回包。
// fieldset 使用语义边界将错误、动作与加载槽归为同一个设置组。
// 按钮 type 明确为 button，放在编辑 form 内不会意外提交生成。
// 刷新只重新查询列表，不等于从磁盘重新扫描全部模型或计算哈希。
// 选项显示完整服务端名称，触发器的省略只影响排版而不是传回的字符串。
// 长路径由共用下拉框 title 和菜单提供阅读，不在这里再加一套模型详情弹窗。
// 模板没有独立辅助加载器时不出现重置按钮，避免提供无状态可重置的动作。
  const slots = useMemo(() => getWorkflowAuxiliarySlots(props.templateOverride ?? getVideoWorkflowTemplate(props.workflowId), props.mediaKind), [props.workflowId, props.templateOverride, props.mediaKind]);
  const remote = useVideoModelLists(slots.length > 0);
  return <fieldset disabled={props.disabled} className="min-w-0 space-y-3 rounded-lg border border-border bg-background p-3" data-video-model-settings>
    <p className="text-xs leading-relaxed text-muted-foreground">{t("create.videoModels.hint")}</p>
    {/* 无独立加载槽时解释 checkpoint 的来源，不提供点了没有效果的操作。 */}
    {slots.length === 0 ? <p data-workflow-model-embedded className="text-xs leading-relaxed text-muted-foreground">{t("create.videoModels.embedded")}</p> : <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><button type="button" disabled={props.disabled} onClick={props.onReset} className="rounded-md border border-border px-2 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{t("create.videoModels.reset")}</button><button type="button" disabled={props.disabled || remote.loading} data-video-model-refresh onClick={remote.reload} className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><RefreshCw size={12} className={remote.loading ? "animate-spin" : ""} />{t("create.videoModels.refresh")}</button></div>}
    {remote.loading && <p role="status" className="text-xs text-muted-foreground">{t("common.loading")}</p>}
    {remote.error && <p role="alert" className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">{t("create.videoModels.listFailed")}</p>}
    {/* 四个入口共用相同行结构，id 使用原工作流槽位，不能用展示顺序作索引。 */}
    {slots.map((slot) => <VideoModelSlotSelect key={slot.id} slot={slot} overrides={props.overrides} lists={remote.lists} onChange={props.onChange} minimax={isMinimaxWorkflow(props.workflowId)} disabled={props.disabled} />)}
  </fieldset>;
}
// 保留原文件路径以免无关重命名，导出名表达它已供所有工作流复用。
// 展开状态属于当前实例，不保存到模型覆盖里，也不触发任何生成操作。
// 原视频定位标记保留给既有回归，新增用途标记供跨模式隔离检查。
export function WorkflowModelSettings(props: SettingsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return <section className="space-y-2 px-2 py-2 sm:px-3" data-video-model-section data-workflow-model-kind={props.mediaKind ?? "video"}>
    {/* 界面：「模型加载设置」默认收起，展开才加载可选模型清单 */}
    <button type="button" data-video-model-toggle disabled={props.disabled} aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 rounded-md px-1 py-2 text-xs text-muted-foreground hover:bg-muted"><Settings2 size={14} /><span>{t("create.videoModels.title")}</span><ChevronDown size={14} className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`} /></button>
    {open && <VideoModelSettingsBody {...props} />}
  </section>;
}
