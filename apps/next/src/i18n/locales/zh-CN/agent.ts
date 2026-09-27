/**
 * Agent 页面（`view/agent/**`）词条。
 * 命名约定：`agent.<语义>`，例如 `agent.hero.title`。
 */
export const agent = {
  title: "Agent",
  newChat: "新聊天",
  sessions: {
    title: "会话",
    empty: "还没有会话 —— 点「新聊天」开始。",
    untitled: "未命名会话",
    delete: "删除会话",
  },
  hero: {
    title: "你想让 Agent 在 Illusion Realm 里做什么？",
    subtitle: "目前是界面骨架：消息只写进本地会话，还没有接后端。",
  },
  composer: {
    placeholder: "随心输入 · Enter 发送，Shift + Enter 换行",
    send: "发送",
    context: "本次对话的上下文",
    modeLocal: "本地",
    workspace: "输出目录",
    workspaceUnset: "未设置输出目录",
    permission: "权限",
    permissionReadonly: "只读",
    permissionFull: "完全访问",
    model: "模型",
    modelUnset: "未扫描到模型",
    effort: "强度",
    effortLow: "低",
    effortMedium: "中",
    effortHigh: "高",
  },
  status: {
    shellOnly: "界面骨架 · 未接入后端",
    shellOnlyTitle:
      "Agent 后端还没接：发送只会写入本地会话，不会真的调用模型。",
    pending: "（Agent 后端尚未接入：这条消息只写进了本地会话）",
  },
  message: {
    you: "你",
    agent: "Agent",
  },
} as const;
