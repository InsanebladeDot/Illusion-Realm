"use client";

// 会话栏开合仅为本页展示状态，不新增持久化字段或改变 Agent 会话身份。
// 默认收起给正文留出截图中的完整阅读宽度，用户仍能随时打开已有会话。
// 状态不放入全局 store，切换布局不能触发模型请求或中断正在运行的任务。
import { memo, useEffect, useRef, useState } from "react";
// 助手正文由共享阅读组件解析；消息 store、工具过程和附件结构保持原有契约。
// 用户文本仍按普通文字展示，不把用户写出的 Markdown 提前解释为模型回复。
// 引入组件而非修改会话内容，历史消息无需迁移，复制与上下文继续拿到原文。
import { AgentAnswer } from "@/components/AgentAnswer";
import {
  AlertCircle,
  Brain,
  Bot,
  Loader2,
  Plus,
  Square,
  Trash2,
  Wrench,
  ChevronRight,
  PanelLeft,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import {
  useAgentStore,
  type AgentMessage,
  type AgentRunStep,
  type AgentSession,
} from "@/stores/useAgentStore";
import { AgentComposer } from "@/view/agent/AgentComposer";
import { AgentKeyNotice } from "@/view/agent/AgentKeyNotice";
import { AgentImageThumbnails } from "@/view/agent/AgentAttachments";
import { AgentGeneratedImages } from "@/view/agent/AgentGeneratedImages";
import { cn } from "@/utils/cn";
import { subscribeAgentEvents } from "@/utils/electronBridge";
import { THIN_DIVIDER_CLASS } from "@/utils/layout";

/** 未开始对话时主区居中的那一屏（对应 Codex 的「你想让我们在 X 中构建什么？」） */
function AgentHero() {
  const { t } = useTranslation();
  return (
    <div
      data-agent-hero
      className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Bot className="h-7 w-7" />
      </span>
      <h2 className="text-xl font-semibold tracking-tight">
        {t("agent.hero.title")}
      </h2>
      <p className="max-w-md text-xs text-muted-foreground">
        {t("agent.hero.subtitle")}
      </p>
    </div>
  );
}

/**
 * 过程区：模型思考 + 工具调用（参数与输出）。
 * 放在回答文本**上方** —— 和 Codex 一样：先看到做了什么，再看到结论。
 */
// summary 只提供真实的运行状态与过程项数量，不伪造当前契约未返回的执行耗时。
// 原生 details 支持键盘开合，关闭时仍保留过程内容，重绘不会丢掉工具结果。
// 正文可以独立流式更新，折叠过程不会阻止 Agent 事件继续写入原 store。
// streaming 结束只更新摘要文字，不强制把用户手动展开的 details 再次关上。
// 不把 open 做成受控属性，避免每个 token 到达时覆盖用户当前的展开选择。
// 子列表仍包含原来的 data-agent-step 和 tool 名称标记，旧回归能继续定位结果。
// 列表内的 JSON 参数和工具输出不经过 Markdown，不会误把路径或尖括号解析成标签。
// summary 的 count 是收到的过程项数，包含推理和工具项，不冒称调用模型次数。
function AgentMessageSteps({ steps, streaming }: { steps: AgentRunStep[]; streaming?: boolean }) {
  const { t } = useTranslation();
  if (steps.length === 0) return null;

  return (
    // 界面：回复上方的执行过程摘要，默认折叠，与截图的 Worked 行位置一致。
    // 不用整个消息卡片作为触发器，选择正文或复制时不会意外展开工具参数。
    // marker 隐藏后用独立箭头指示状态，展开时旋转但不占据额外一行。
    // 分隔线只属于过程摘要，助手正文外面不再套一圈边框。
    // 未返回过程事件的纯文本回答不生成一个虚构的“已调用工具”摘要。
    // 工具输出按原样保留在折叠区，仍可选中、复制和滚动查看。
    <details data-agent-process className="group mb-4 border-b border-border/50 pb-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke [&::-webkit-details-marker]:hidden">{t(streaming ? "agent.status.generating" : "agent.message.process", { count: steps.length })}<ChevronRight size={13} className="transition-transform group-open:rotate-90" /></summary>
    {/* 界面：过程区内部滚动，展开长思考不会挤走正文与输入区。 */}
    {/* 整个过程列表限高，多个工具结果也不会叠成长屏。 */}
    {/* 默认折叠仍由 details 管理，不因 token 到达重新展开。 */}
    <ul data-agent-steps className="mt-3 max-h-64 space-y-1.5 overflow-y-auto overscroll-contain">
      {steps.map((step, index) =>
        step.kind === "reasoning" ? (
          <li
            key={`reasoning-${index}`}
            data-agent-step="reasoning"
            className="rounded-lg bg-muted/40 px-2.5 py-2"
          >
            <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Brain className="h-3.5 w-3.5" />
              {t("agent.message.reasoning")}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {step.text}
            </p>
          </li>
        ) : (
          <li
            key={step.id}
            data-agent-step="tool"
            data-agent-tool={step.name}
            className="rounded-lg bg-muted/40 px-2.5 py-2"
          >
            <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              {step.state === "running" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wrench className="h-3.5 w-3.5" />
              )}
              {step.name}
              {step.state === "running" ? (
                <span className="font-normal">
                  · {t("agent.message.toolRunning")}
                </span>
              ) : null}
            </p>
            {Object.keys(step.arguments).length > 0 ? (
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {JSON.stringify(step.arguments)}
              </p>
            ) : null}
            {step.output ? (
              <p
                data-agent-tool-output
                className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs"
              >
                {step.output}
              </p>
            ) : null}
          </li>
        )
      )}
    </ul></details>
  );
}

/**
 * 单条消息（过程区 / 正文 / 附件 / 失败 / 已停止）。
 *
 * **为什么 memo**：流式追加时只有正在接收的那一条会被重建（store 里其余消息引用不变），
 * 没有 memo 的话每个 token 都会重渲染整段会话 —— 长回答时界面会明显跟不上流
 * （实测：8k 字符的回答会让整页长时间无响应）。
 */
const AgentMessageRow = memo(function AgentMessageRow({
  message,
}: {
  message: AgentMessage;
}) {
  const { t, locale } = useTranslation();
  return (
    <li
      data-agent-message
      data-agent-role={message.role}
      className={cn(
        // 用户块占满阅读列供气泡贴右，助手块使用同一列的左边界。
        // 不在 li 上设置浅色底，否则时间与图片也会被包进用户气泡。
        // min-w-0 让 Markdown 内部代码块自行滚动，不把父容器撑宽。
        "min-w-0",
        message.role === "user"
          ? "flex flex-col items-end gap-3 pt-6"
          : "w-full py-1"
      )}
    >
          {/* 界面：用户轮次的时间居中显示，读取真实消息时间并按当前语言格式化。 */}
          {/* 不使用客户端当前时间冒充历史发送时间，切换会话后时间仍可核对。 */}
          {/* 角色名保留给辅助阅读，视觉上不再重复显示“你 / Agent”标签。 */}
          {/* 时间用 time 的 dateTime 属性提供机器可读值，页面语言只改变可见格式。 */}
          {/* 不显示未经记录的“耗时”，发送时间与执行时长不是同一种事实。 */}
          {/* 多轮提问各自带时间；没有依赖随时间更新的计时器，后台运行也不会冻结。 */}
          {/* 用户正文仍用 pre-wrap，提问中的换行、星号和代码语法按原文展示。 */}
          {/* 时间独立于气泡宽度，短提问也不会把时间拖到最右侧。 */}
          {/* 当前语言来自订阅的 i18n hook，切换语言后日期格式同步更新。 */}
          {/* 只对用户消息显示轮次时间，避免助手每个增量块重复占一行时间。 */}
          {message.role === "user" && <time data-agent-timestamp dateTime={new Date(message.createdAt).toISOString()} className="mb-3 w-full text-center text-[11px] text-muted-foreground">{new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(message.createdAt)}</time>}
          <p className="sr-only">
            {message.role === "user"
              ? t("agent.message.you")
              : t("agent.message.agent")}
          </p>
          {/* 界面：用户图片位于气泡上方并靠右，仍复用附件的大图预览能力。 */}
          {/* 仅移动展示位置，不把 object URL 或图片路径拼进用户正文。 */}
          {/* 助手附件仍在回复之后显示，实际生成图片继续使用专用结果组件。 */}
          {/* 空数组不会留下图片占位，气泡与时间之间的空间由角色布局统一控制。 */}
          {/* 预览交互仍由 AgentImageThumbnails 拥有，不在消息行重复维护预览索引。 */}
          {/* 用户附件只渲染一次，下面助手分支通过角色判断避免重复显示。 */}
          {message.role === "user" && Boolean(message.attachments?.length) && <AgentImageThumbnails attachments={message.attachments ?? []} className="max-w-full justify-end" />}
          {/* 界面：助手执行过程折叠行；不会在用户提问上显示工具摘要。 */}
          <AgentMessageSteps steps={message.steps ?? []} streaming={message.streaming} />
          {message.text ? (
            <div
              // 钩子只挂在**助手**那一条上：用户消息也带同名钩子时，
              // `querySelector('[data-agent-answer]')` 会先命中用户那条（自检脚本踩过）
              data-agent-answer={message.role === "agent" ? "" : undefined}
              className={cn(
                // 用户气泡最多占列宽约七成，窄屏为八成八，保留左右角色方向感。
                // 助手正文保持透明，没有背景卡片、角色头像或多余内缩。
                // 短句宽度随内容收缩，长句在最大宽度后自然换行。
                message.role === "user" ? "min-w-0 max-w-[88%] rounded-[22px] bg-muted/65 px-4 py-3 text-sm leading-6 break-words sm:max-w-[72%]" : "min-w-0 break-words text-sm",
                message.steps && message.steps.length > 0 ? "mt-2" : null
              )}
            >
              {/* 界面：只有 Agent 回复解析 Markdown，避免用户输入里的星号与标签被改写。 */}
              {/* 外层必须为 div，标题、列表和表格不能嵌在 p 中，否则浏览器会修正 DOM。 */}
              {/* data-agent-answer 继续只落在助手消息，既有冒烟和定位逻辑仍命中同一条。 */}
              {/* streaming 不拼接到正文，消息持久化和复制都不包含视觉上的尾标。 */}
              {/* 历史字符串直接复用；切换展示方式不发送新的模型请求或增加 token 消耗。 */}
              {/* 工具参数及输出位于上方独立区域，不经过 Markdown 解析或链接识别。 */}
              {message.role === "agent" ? <AgentAnswer text={message.text} streaming={message.streaming} /> : <p className="whitespace-pre-wrap">{message.text}</p>}
            </div>
          ) : message.streaming ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("agent.status.generating")}
            </p>
          ) : null}
          {message.role !== "user" && message.attachments && message.attachments.length > 0 ? (
            <AgentImageThumbnails
              attachments={message.attachments}
              className="mt-2"
            />
          ) : null}
          {message.generatedImages && message.generatedImages.length > 0 ? (
            <AgentGeneratedImages images={message.generatedImages} />
          ) : null}
          {message.error ? (
            <p
              data-agent-message-error
              className="mt-2 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{message.error}</span>
            </p>
          ) : null}
          {message.cancelled ? (
            <p
              data-agent-message-cancelled
              className="mt-2 text-xs text-muted-foreground"
            >
              {t("agent.message.cancelled")}
            </p>
          ) : null}
    </li>
  );
});

/** 对话区：一轮提问 + 助手的**真实流式回答**（每条消息一行，行内 memo 见上） */
function AgentMessageList({ session }: { session: AgentSession }) {
  return (
    <ul
      data-agent-messages
      // 界面：阅读列宽与底部 composer 使用相同 800px 上限和左右内边距。
      // 外层视口负责滚动，ul 自身不再创建第二层垂直滚动区。
      // 用户轮次之间加大留白，助手段落内部间距继续由 Markdown 组件管理。
      // 窄屏先收缩列宽，不把气泡固定成桌面宽度导致横向溢出。
      // 末尾留白让最后一个复制按钮与输入框保持距离，不被底部控件遮住。
      className="mx-auto flex w-full max-w-[800px] flex-col gap-9 px-4 pb-8 pt-6 sm:px-8"
    >
      {session.messages.map((message) => (
        <AgentMessageRow key={message.id} message={message} />
      ))}
    </ul>
  );
}

/** 会话列表（本页左栏）：一行一个会话，悬停出现删除按钮 */
function AgentSessionList() {
  const { t } = useTranslation();
  const sessions = useAgentStore((state) => state.sessions);
  const activeSessionId = useAgentStore((state) => state.activeSessionId);
  const selectSession = useAgentStore((state) => state.selectSession);
  const deleteSession = useAgentStore((state) => state.deleteSession);

  if (sessions.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
        {t("agent.sessions.empty")}
      </p>
    );
  }

  return (
    <ul data-agent-sessions className="flex flex-col gap-0.5">
      {sessions.map((session) => {
        const active = session.id === activeSessionId;
        return (
          <li key={session.id} className="group relative">
            <button
              type="button"
              data-agent-session={session.id}
              aria-current={active ? "true" : undefined}
              onClick={() => selectSession(session.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-8 text-left text-xs transition-colors",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <span className="min-w-0 truncate">{session.title}</span>
            </button>
            <button
              type="button"
              data-agent-session-delete={session.id}
              aria-label={t("agent.sessions.delete")}
              title={t("agent.sessions.delete")}
              onClick={() => deleteSession(session.id)}
              className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Agent 页 —— 仿 Codex 的对话界面。
 *
 * 区域（沿用 AGENTS.md 的区域词表）：
 * - `rail`  本页左栏 = 会话列表（新聊天 / 会话 / 未接入提示）
 * - `stage` 右侧主区 = 对话区（没消息时显示 hero）
 * - `composer` 底部输入区（见 `AgentComposer`）
 *
 * 现状：后端已接通（Python sidecar + 事件流），会话仍**只存在内存里**：切走这一页就没了
 * （落盘要等用户数据文档的格式变更，见 `useAgentStore` 的注释）。
 * 没配 API Key 时 `sendDraft` 会在拉起进程之前拦下，并在输入区上方给出
 * 「去设置里填写」的可点提示（见 `AgentKeyNotice`）。
 */
export function AgentPage() {
  const { t } = useTranslation();
  // 默认只展示对话，截图中的连续正文不需要常驻占用 248px 的会话列表。
  // 开合只控制已有 aside 的显示，不卸载正文或丢失正在生成的消息。
  // 新聊天入口另外保留在顶部，收起列表后仍可创建并切换到新会话。
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const sessions = useAgentStore((state) => state.sessions);
  const activeSessionId = useAgentStore((state) => state.activeSessionId);
  const createSession = useAgentStore((state) => state.createSession);
  const applyEvent = useAgentStore((state) => state.applyEvent);
  const running = useAgentStore((state) => // 页头与输入区使用同一运行标记，启动 IPC 等待期间也能停止。
    // runId 只用于后台协议，不能作为是否显示停止入口的唯一依据。
    // 用户选择其他会话不重建后台运行，本标记仍准确反映全局忙碌。
    state.activeAssistantMessageId !== null);
  const toolNames = useAgentStore((state) => state.toolNames);
  const cancelRun = useAgentStore((state) => state.cancelRun);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 原生滚动条占用宽度随平台与窗口状态变化，输入框应与实际阅读视口居中对齐。
  // 只读取当前容器几何，不把 Windows 的滚动条宽度硬编码为某个像素数。
  // CSS 变量写在本页 stage，其他页面或全局导航不会获得这个补偿。
  // ResizeObserver 在侧栏开合、窗口变宽或滚动条出现时重新测量内容宽度。
  // 观察的是滚动元素，不观察被偏移的 composer，避免形成几何反馈循环。
  // 没有滚动条时差值为零，输入表面自然恢复整个 stage 的水平中心。
  // update 不修改正文或滚动位置，只同步阅读列和输入框共同使用的宽度差。
  // 不依赖 requestAnimationFrame，窗口被遮挡也不需要等待下一次绘制才能更新。
  // effect 清理时撤销本轮观察，切换页面不会继续持有旧 DOM。
  // 页面实际 viewport 仍由 CSS 自适应，测量只补偿浏览器原生滚动条占位。
  // 与正文长度无关，不在每个 token 事件里创建新的 observer。
  // 系统显示缩放后的值已经是 CSS 像素，不再乘设备像素比造成重复补偿。
  // 向下取值不需要缓存，overlay scrollbar 为零时也会正确覆盖上次的非零宽度。
  // 补偿写到父元素后由 composer 读取，组件间不新增全局 Zustand 状态。
  // 使用字符串 px 保持 calc 的长度类型，不能把无单位数字直接代入位置表达式。
  // 观察初次立即测量，短回复还未出现滚动时输入框也不会先错位一帧。
  useEffect(() => {
    const element = scrollRef.current; if (!element) return;
    const update = () => element.parentElement?.style.setProperty("--agent-scrollbar-width", `${element.offsetWidth - element.clientWidth}px`);
    update(); const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? null;
  const lastMessage = activeSession?.messages[activeSession.messages.length - 1];

  /**
   * 订阅主进程推来的事件流：挂载时订、卸载时退。
   * `applyEvent` 只认当前 `runId`，所以取消 / 重开后迟到的帧会自己丢掉 —— 不需要在这里过滤。
   */
  useEffect(() => subscribeAgentEvents(applyEvent), [applyEvent]);

  /** 流式追加时把视图钉在最底部（写 scrollTop 即可，不需要节拍） */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [
    lastMessage?.text.length,
    lastMessage?.generatedImages?.length,
    activeSession?.messages.length,
  ]);

  return (
    // 界面：聊天工作区使用主题背景，助手正文与周围页面保持同一底色。
    // overflow-hidden 将横向约束留在工作区，Markdown 长代码在块内滚动。
    // rounded-inherit 沿用 main 展示区圆角，不额外叠一层灰底消息容器。
    <div data-agent-workspace className="flex h-full min-h-0 overflow-hidden rounded-[inherit] bg-background">
      {/* rail：本页左栏 = 会话列表 */}
      <aside
        data-agent-sidebar
        aria-hidden={!sessionsOpen}
        className={cn(
          // 小窗口也可以打开会话列表，通过父区域流式重排而不是覆盖聊天输入。
          // 列表关闭时 display:none，键盘不会聚焦到不可见的删除或切换按钮。
          // 宽度不超过工作区一半，仍给对话和停止按钮保留可用空间。
          // aria-hidden 与 display 状态一致，关闭列表不保留一个只视觉透明的交互层。
          // 不使用覆盖式抽屉，用户切换会话时仍能明确看到剩余的聊天区域。
          // 列表内部删除动作维持原 store 行为，不因为收起而隐式删掉任何会话。
          sessionsOpen ? "flex w-[210px] max-w-[45%] shrink-0 flex-col border-r" : "hidden",
          THIN_DIVIDER_CLASS
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Bot className="h-4 w-4" />
            {t("agent.title")}
          </span>
          <button
            type="button"
            data-agent-sidebar-new-chat
            onClick={() => createSession()}
            title={t("agent.newChat")}
            aria-label={t("agent.newChat")}
            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("agent.newChat")}
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
            {t("agent.sessions.title")}
          </p>
          <AgentSessionList />
        </div>
      </aside>

      {/* stage：对话区；min-w-0 允许表格与代码块在自身容器内滚动。 */}
      {/* flex 子项默认最小宽度会跟随最长代码行，造成整个 main 横向溢出。 */}
      {/* 这里只取消内容最小宽度，侧边会话栏和输入框的原有宽度策略保持不变。 */}
      {/* 宽度约束由父级展示区域提供，不用固定像素模拟某个截图宽度。 */}
      {/* 代码块仍保留完整字符，通过块内滚动查看，而不是在数据层截断。 */}
      {/* stage：页头、消息、密钥提示、输入区固定为四行，只有消息行可缩小和滚动。 */}
      {/* minmax(0,1fr) 阻止长回复或附件反向撑高工作区，输入区始终贴住展示区底部。 */}
      {/* 采用容器布局而非窗口 absolute，展开会话栏或调整窗口后仍在 main 内对齐。 */}
      <div data-agent-stage className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto_auto] overflow-hidden">
        <header
          className={cn(
            // 页头只显示会话标题与操作，去掉重复的介绍段落和显眼分隔线。
            // 标题截断防止长提问挤掉停止按钮；完整消息仍能在阅读列内看到。
            // gap 和 min-w-0 允许紧凑窗口继续显示基本聊天操作。
            "flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 text-muted-foreground"
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            {/* 界面：展开会话列表和新聊天；均绑定已有真实会话动作。 */}
            {/* 不绘制没有实现的 Changes、Sources 或子 Agent 面板占位。 */}
            {/* aria-expanded 与实际列表状态同步，键盘用户也能感知开合。 */}
            {/* 顶部新聊天按钮永远可用，初次进入且列表关闭也能开始新会话。 */}
            {/* 两处入口调用同一个 createSession，不产生并行但互不关联的草稿容器。 */}
            {/* 顶栏不添加假的更多菜单，截图中的操作只复用当前实际存在的能力。 */}
            {/* 消息标题保持单行，超长用户提问不会推高固定输入区域的布局。 */}
            <button data-agent-sessions-toggle type="button" aria-label={t("agent.sessions.title")} aria-expanded={sessionsOpen} onClick={() => setSessionsOpen(value => !value)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted"><PanelLeft size={15} /></button>
            <button data-agent-new-chat type="button" aria-label={t("agent.newChat")} title={t("agent.newChat")} onClick={() => createSession()} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted"><Plus size={15} /></button>
            <p className="truncate text-xs font-medium text-foreground">
              {activeSession?.title ?? t("agent.title")}
            </p>
          </div>
          {running ? (
            <div className="flex shrink-0 items-center gap-2">
              <span
                data-agent-status="generating"
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("agent.status.generating")}
              </span>
              <button
                type="button"
                data-agent-stop
                onClick={() => void cancelRun()}
                title={t("agent.status.stop")}
                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Square className="h-3 w-3" />
                {t("agent.status.stop")}
              </button>
            </div>
          ) : (
            <span
              data-agent-status="idle"
              title={toolNames.length > 0 ? toolNames.join("、") : undefined}
              className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground"
            >
              {toolNames.length > 0
                ? t("agent.status.tools", { count: toolNames.length })
                : t("agent.status.idle")}
            </span>
          )}
        </header>

        {/* stage：仅消息历史滚动；composer 固定在同一个工作区底部。 */}
        {/* 区域标记供回归读取真实边界，不依赖某一层 DOM 的偶然排列顺序。 */}
        {/* 滚动内容不会跑到应用 nav 或自定义 head 下方。 */}
        <div data-agent-scroll ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          {activeSession && activeSession.messages.length > 0 ? (
            <AgentMessageList session={activeSession} />
          ) : (
            <AgentHero />
          )}
        </div>

        {/* 界面：密钥缺失反馈与正文同宽，普通聊天不额外占一条空白栏。 */}
        {/* 是否显示仍由原组件判断，不因布局修改而隐藏实际配置错误。 */}
        {/* 外层限宽只约束提示条，不改变跳转设置和密钥刷新逻辑。 */}
        <div className="mx-auto w-full max-w-[800px] sm:px-4"><AgentKeyNotice /></div>
        <AgentComposer />
      </div>
    </div>
  );
}
