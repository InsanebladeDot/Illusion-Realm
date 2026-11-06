"use client";

import { useEffect, useRef } from "react";
// 发送入口使用向上箭头，对齐参考图底部右侧的小圆形按钮。
// 图标只改变外观，点击与 Enter 仍调用同一个 sendDraft。
// accessible name 来自原有发送词条，不依赖图标形状表达动作。
import { ArrowUp, Square } from "lucide-react";
// 服务商模型选择器复用创建页资源弹窗，实际发送也读取同一 store。
// 不再把默认常量当作只读标签，切换后模型参数会进入真实请求。
// 本地 UNet 与 LoRA 列表不参与远端聊天模型选择。
import { AgentModelPicker } from "@/components/agent-model-picker";
// 档位复用应用现有选择器，暗浅主题与创建页保持同样交互。
// 面板向上展开，避免底部输入区把选项挤到窗口外。
// 选择值仍由 Zustand 保存，实际发送读取相同字段。
import { SimpleSelect } from "@/components/SimpleSelect";
import { APP_NAME } from "@/data/navigation";
import { useTranslation } from "@/i18n";
import { useAgentStore, type AgentEffort } from "@/stores/useAgentStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { cn } from "@/utils/cn";
import {
  INPUT_BORDER_CLASS,
  PRIMARY_BUTTON_CLASS,
  THIN_BORDER_CLASS,
} from "@/utils/layout";
import { AgentAttachmentStrip } from "@/view/agent/AgentAttachments";
import { AgentAddMenu, AgentPermissionMenu } from "@/view/agent/AgentComposerMenus";

const EFFORT_VALUES: AgentEffort[] = ["low", "medium", "high"];
/** 输入框高度上限（约 6 行）：再长就内部滚动，别把 composer 顶到半个屏幕 */
const INPUT_MAX_HEIGHT_PX = 148;

/** 下拉共用的外观（与组装面板的模板选择器同一套观感） */
const SELECT_CLASS = cn(
  "h-7 min-w-0 rounded-md bg-background px-2 text-[11px] outline-none",
  INPUT_BORDER_CLASS
);

/**
 * 上下文 chip 行：应用名 / 「本地」/ 当前输出目录。
 *
 * 为什么第三枚是输出目录：Codex 那枚是 git 分支，而渲染进程读不到 git；
 * 输出目录是这个应用里**真实存在**、且语义最接近「当前工作区」的东西。
 */
function AgentContextChips() {
  const { t } = useTranslation();
  const outputPath = useSettingsStore((state) => state.outputPath);
  const workspace = outputPath?.trim() ?? "";

  return (
    <div
      data-agent-context
      title={t("agent.composer.context")}
      // 上下文继续保留在可访问内容中，视觉上不再以三枚胶囊占用正文输入高度。
      // 输出目录仍从正式设置读取，布局修改不改变工具访问根目录或会话权限。
      // 原有 data-agent-workspace 继续指向真实目录内容，避免丢失上下文说明。
      className="sr-only"
    >
      <span className="rounded-full bg-muted px-2 py-0.5">{APP_NAME}</span>
      <span className="rounded-full bg-muted px-2 py-0.5">
        {t("agent.composer.modeLocal")}
      </span>
      <span
        data-agent-workspace
        aria-label={t("agent.composer.workspace")}
        title={workspace || t("agent.composer.workspaceUnset")}
        className="max-w-[240px] truncate rounded-full bg-muted px-2 py-0.5"
      >
        {workspace || t("agent.composer.workspaceUnset")}
      </span>
    </div>
  );
}

/** 输入框：Enter 发送、Shift + Enter 换行（与 Codex 的输入区一致） */
function AgentComposerInput() {
  const { t } = useTranslation();
  const draft = useAgentStore((state) => state.draft);
  const setDraft = useAgentStore((state) => state.setDraft);
  const sendDraft = useAgentStore((state) => state.sendDraft);
  const running = useAgentStore((state) => state.activeAssistantMessageId !== null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 高度随内容伸缩（Codex 的输入区就是这样）。
   * 先归零再读 `scrollHeight`：不归零的话删内容时高度只增不减（scrollHeight 不会变小）。
   */
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    const next = Math.min(element.scrollHeight, INPUT_MAX_HEIGHT_PX);
    element.style.height = `${next}px`;
    element.style.overflowY = element.scrollHeight > INPUT_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [draft]);

  return (
    <textarea
      ref={inputRef}
      data-agent-input
      aria-label={t("agent.composer.placeholder")}
      rows={1}
      value={draft}
      placeholder={t("agent.composer.placeholder")}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        // 中文输入法确认候选词时不提交，避免半个角色名被发送。
        // Shift+Enter 仍然换行，生成期间仅阻止再次启动。
        // 停止使用显式按钮，Escape 留给选择器关闭。
        if (event.nativeEvent.isComposing || event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        // 正在跑就不接受回车发送（一次只跑一个 run，避免把队列语义搅进来）
        if (!running) void sendDraft();
      }}
      // 输入区预留约两行视觉高度，单行提问也保持参考图的舒适留白。
      // 高度增长仍受原来的 148px 上限约束，长草稿通过输入框内部滚动。
      // min-w-0 避免长英文草稿把模型、权限和发送按钮挤出 main。
      className="min-h-[52px] w-full min-w-0 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground/65"
    />
  );
}

/** 查询深度：每档明确标注模型往返次数，不冒称改变远端内部思考强度。 */
// 使用已有 SimpleSelect，避免系统原生 select 在暗色下弹出异色菜单。
// 菜单在按钮上方，composer 始终固定于底部，列表不会越出窗口。
// 不开放任意轮数输入；运行中的档位变化只影响下一次提交。
// 低、中、高分别对应 2/4/6，具体参数由 store 的发送快照落实。
// 通过白名单校验 onChange，组件返回字符串也不扩大 AgentEffort 联合类型。
// 原生选择器标记保留在容器，回归应检查按钮和 role=option。
// 标签含轮数，让用户知道查询深度对等待和费用的实际影响。
// 权限菜单与模型弹窗继续独立，不把查询深度误作文件权限。
// 面板依靠主题变量配色，不覆盖全局 SimpleSelect 的样式。
// 原触发器尺寸保持紧凑，不额外增加一行工具栏。
// 已选中项还要留出勾选图标宽度，中档文字不能被省略号截断。
// 面板比触发器略宽，但靠右定位，窄窗口仍留在输入区内。
// 选项字号与紧凑触发器一致，减少下拉菜单的突兀感。
// 局部设置不改变创建页其他选择器的尺寸。
// 透明主题表面由共享组件处理，不使用浏览器原生菜单。
// 关闭菜单仍保留当前档位，不产生额外请求或重置输入。
// 六轮是可选上限，角色出现歧义时仍可提前结束并询问用户。
// 低档适合单次查询，复杂任务可以由用户确认后再次提问。
// 这不是改变模型温度或供应商内部思考等级的控件。
function AgentEffortSelect() {
  const { t } = useTranslation();
  const effort = useAgentStore((state) => state.effort);
  const setEffort = useAgentStore((state) => state.setEffort);
  return (
    <div data-agent-effort>
      <SimpleSelect value={effort} options={EFFORT_VALUES.map(value => ({ value, label: t(value === "low" ? "agent.composer.effortLow" : value === "high" ? "agent.composer.effortHigh" : "agent.composer.effortMedium") }))}
        onChange={value => { const next = EFFORT_VALUES.find(item => item === value); if (next) setEffort(next); }}
        ariaLabel={t("agent.composer.effort")} triggerClassName={SELECT_CLASS}
        optionClassName="text-xs!"
        panelClassName="top-auto! bottom-full! mb-1.5 mt-0! min-w-28 right-0! left-auto!" />
    </div>
  );
}

/** 发送位置在运行中直接变为停止，不用寻找页头入口。 */
// 启动占位消息已经出现时就能停止，不等待后台返回 runId。
// 不禁用运行中的按钮，否则用户无法中止长时间思考。
// 停止图标使用实心方形，与发送箭头明确区分。
// aria-label 和 title 同步切换，键盘和读屏也知道当前动作。
// 停止调用 store 的立即冻结逻辑，后台终止由原 IPC 完成。
// 保留 data-agent-send 兼容既有入口，新增标记只在可停止时出现。
// 按钮大小始终不变，生成状态切换不会推动模型选择器。
// 已提交的 ComfyUI 任务独立管理，此按钮停止 Agent 回答。
// stop label 明确写回答，避免用户以为 GPU 队列会一并清空。
// store 捕获异步取消异常，按钮无需另建一套生命周期。
// 页头保留停止入口，长对话滚动与底部输入区都能操作。
// 本地回复冻结不依赖网络是否能够及时断开连接。
function AgentSendButton() {
  const { t } = useTranslation();
  const sendDraft = useAgentStore((state) => state.sendDraft);
  const cancelRun = useAgentStore((state) => state.cancelRun);
  const running = useAgentStore((state) => state.activeAssistantMessageId !== null);
  const label = t(running ? "agent.status.stop" : "agent.composer.send");
  return (
    <button type="button" data-agent-send data-agent-composer-stop={running || undefined}
      onClick={() => void (running ? cancelRun() : sendDraft())} title={label} aria-label={label}
      className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full", PRIMARY_BUTTON_CLASS)}>
      {running ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="h-4 w-4" />}
    </button>
  );
}

/**
 * Agent 页的输入区（composer）—— 对齐 Codex 底部那一块：
 * 可访问上下文说明 → 附件条（有图才显示）→ 输入框 →
 * 底排「左：+ / 权限；右：模型 / 强度 / 发送」。
 *
 * 位置与 Codex 一致：**权限紧跟 `+` 右边**；模型与强度在右侧（模型可切换、与运行参数同源）。
 * 「新聊天」不在这里 —— 它在左栏与标题栏上（Codex 也放在侧栏）。
 */
export function AgentComposer() {
  return (
    // 界面：底部输入区与消息阅读列使用同一 800px 容器和响应式 padding。
    // mx-auto 把输入表面居中，宽屏两侧留白，不再横跨整个 Agent 工作区。
    // 底部固定来自父级 flex 流，消息滚动不把输入区带走，也无需 absolute 覆盖。
    // 窄屏仍保留 16px 内侧空间，桌面端与助手正文左右边缘严格对齐。
    // 上边距只提供底部呼吸空间，不额外占一个灰色工具栏。
    // 附件条按原逻辑有内容才显示，图片选择和移除功能不受限宽影响。
    // stage 提供实际滚动条占位，输入列使用相同的有效视口宽度与中心。
    // 负向偏移占位的一半，对齐正文而不是包含滚动条的外部工作区中心。
    // max-width 仍为 800px，宽屏只移动中心，不压缩既定阅读宽度。
    <div data-agent-composer className="relative mx-auto w-[calc(100%-var(--agent-scrollbar-width,0px))] max-w-[800px] shrink-0 -left-[calc(var(--agent-scrollbar-width,0px)/2)] px-4 pb-4 pt-2 sm:px-8">
      <div
        className={cn(
          // 表面采用大圆角、细边线和弱阴影，层次接近参考图底部输入卡片。
          // 颜色从主题变量读取，暗色下不出现固定白色外框或过深背景。
          // 内部 padding 独立于阅读列外侧 padding，正文起点仍与消息对齐。
          "rounded-[24px] border bg-background px-3 py-2 shadow-[0_4px_24px_rgba(0,0,0,0.04)]",
          THIN_BORDER_CLASS
        )}
      >
        <AgentContextChips />
        <AgentAttachmentStrip />
        <AgentComposerInput />
        {/* 界面：极窄窗口工具栏允许换行，权限、模型和发送不会互相覆盖。 */}
        {/* 宽屏保持左右一行，换行只发生在真实内容宽度不足时。 */}
        {/* 左侧权限组不压成逐字竖排，右侧组通过 margin-left 保持靠右。 */}
        {/* 输入框高度由内容决定，工具栏增加一行不会盖住可编辑正文。 */}
        {/* 按钮都保留真实可点击尺寸，不靠缩小字体隐藏空间不足。 */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
          <div className="flex shrink-0 items-center gap-1">
            <AgentAddMenu />
            <AgentPermissionMenu />
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {/* 界面：服务商 / 聊天模型，点击后复用创建页的响应式弹窗。 */}
            {/* 模型名来自持久化选择，不再仅展示共享默认常量。 */}
            {/* 切换不会修改当前运行的模型快照，仅影响下一次发送。 */}
            <AgentModelPicker />
            <AgentEffortSelect />
            <AgentSendButton />
          </div>
        </div>
      </div>
    </div>
  );
}
