/**
 * English catalogue — keys must stay identical to `zh-CN/agent.ts`
 * (enforced by apps/next/scripts/mirror-locale.mjs + the ratchet in check-i18n-en.mjs).
 *
 * Translation status: 未翻译（值是 zh-CN 的镜像）；翻完一批评这个文件即可。
 */
export const agent = {
  "title": "Agent",
  "newChat": "新聊天",
  "sessions": {
    "title": "会话",
    "empty": "还没有会话 —— 点「新聊天」开始。",
    "untitled": "未命名会话",
    "delete": "删除会话"
  },
  "hero": {
    "title": "你想让 Agent 在 Illusion Realm 里做什么？",
    "subtitle": "问一句试试：它会调用本地工具（模型清单 / 算数 / 列目录），并把过程显示出来。"
  },
  "composer": {
    "placeholder": "随心输入 · Enter 发送，Shift + Enter 换行",
    "send": "发送",
    "context": "本次对话的上下文",
    "modeLocal": "本地",
    "workspace": "输出目录",
    "workspaceUnset": "未设置输出目录",
    "permission": "权限",
    "permissionReadonly": "只读",
    "permissionFull": "完全访问",
    "permissionChange": "更改权限",
    "permissionTitle": "应如何批准 Agent 的操作？",
    "permissionReadonlyHint": "只读取本地文件，不修改、不联网",
    "permissionFullHint": "可以修改文件与访问互联网",
    "model": "模型",
    "modelTitle": "模型来自共享配置（工作区根 .env / packages/shared/src/data/agent.ts）",
    "effort": "强度",
    "effortLow": "低",
    "effortMedium": "中",
    "effortHigh": "高",
    "add": "添加",
    "addMenuLabel": "添加内容",
    "addImage": "添加图片",
    "addImageHint": "把本地图片挂到这条消息上（后端接入后随消息一起发给 Agent）",
    "attachmentPreview": "放大预览",
    "attachmentRemove": "移除附件",
    "attachmentCount": "{count} 张图片"
  },
  "status": {
    "idle": "就绪",
    "generating": "生成中…",
    "stop": "停止生成",
    "tools": "识别到 {count} 个工具"
  },
  "notice": {
    "missingKeyTitle": "No API key configured yet",
    "missingKeyBody": "The Agent needs your own model key before it can chat.",
    "missingKeyLink": "Fill it in under Settings"
  },
  "message": {
    "you": "你",
    "agent": "Agent",
    "reasoning": "思考",
    "toolRunning": "调用中…",
    "cancelled": "已停止",
    "imageLoadFailed": "Failed to load image",
    "openGeneratedImage": "View generated image: {name}"
  }
} as const;
