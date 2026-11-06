/**
 * English catalogue — keys must stay identical to `zh-CN/agent.ts`
 * (enforced by apps/next/scripts/mirror-locale.mjs + the ratchet in check-i18n-en.mjs).
 *
 * Translation status: 未翻译（值是 zh-CN 的镜像）；翻完一批评这个文件即可。
 */
export const agent = {
  "providers": {
    "siliconflow": "SiliconFlow", "euzhi": "Euzhi · Grok", "title": "Choose a chat model",
    // 应用只提交当前暂选，点击卡片时不再直接更换聊天模型。
    // 英文保持相同动作含义，不能把这一步描述成发起聊天。
    // 与中文键一致，按钮状态继续复用已有加载词条。
    "apply": "Apply",
    "description": "Choose a provider and model using your own API key. Changes apply to the next conversation request.",
    "search": "Search models", "refresh": "Refresh", "input": "Input / million tokens", "output": "Output / million tokens",
    "free": "Free", "budget": "Budget", "premium": "Premium", "recommended": "Low cost pick", "unknownPrice": "Not published",
    "group": "Reference group: {group}", "longPrice": "Above {count} input tokens: input {input} / output {output} per million",
    "unavailable": "Unavailable with this key", "unverified": "Key permissions not checked", "visible": "Listed for this key · inference not yet verified",
    "priceNote": "Published reference prices per million tokens. Groups, caching, long context and top-up discounts may change the bill.",
    "recommendNote": "Ranked by base price for one million input plus one million output tokens; newer versions break ties. Usage can change the cheapest choice.",
    "pricingLink": "View live provider pricing", "updated": "Prices checked: {time}", "live": "Live catalog", "cache": "Local cache", "snapshot": "Bundled reference catalog",
    "authError": "Key verification failed. Check this provider's API key, model permissions and group. Public prices remain available.",
    "refreshError": "Could not refresh the catalog or key visibility. The latest available reference data has been kept; try again later.",
    "loading": "Loading models…", "empty": "No matching available models", "saveFailed": "Could not save the model selection. Please retry.",
    "selectionUnavailable": "The model is unavailable or settings could not be loaded. Check the model picker and retry.",
    "euzhiHelp": "Create an Euzhi API key and choose an available Grok group. Only Grok chat models are integrated here.",
    "tokenLink": "Open Euzhi token settings", "keyIsolation": "Euzhi keys are stored separately on this device and are never shared with SiliconFlow."
  },
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
    "modelTitle": "Choose a provider and chat model. Changes apply to the next conversation request.",
    "effort": "Query depth",
    "effortLow": "Low · 2 rounds",
    "effortMedium": "Medium · 4 rounds",
    "effortHigh": "High · 6 rounds",
    "add": "添加",
    "addMenuLabel": "添加内容",
    "addImage": "添加图片",
    "addImageHint": "Send images with your message, including multiple images and follow-up questions",
    "imageReadFailed": "Could not read images, or their format or size exceeds the limits (8 images, 8 MB each, 32 MB encoded context). Adjust attachments and retry; your draft is retained.",
    "attachmentPreview": "放大预览",
    "attachmentRemove": "移除附件",
    "attachmentCount": "{count} 张图片"
  },
  "status": {
    "idle": "就绪",
    "generating": "生成中…",
    "stop": "Stop response",
    "stopFailed": "The response is frozen, but the background stop request failed. Retry or close the app.",
    "tools": "识别到 {count} 个工具"
  },
  "notice": {
    "missingKeyTitle": "No API key configured yet",
    "missingKeyBody": "The Agent needs your own model key before it can chat.",
    "missingKeyLink": "Fill it in under Settings"
  },
  "message": {
    "process": "Worked · {count} steps",
    "you": "你",
    "agent": "Agent",
    "reasoning": "思考",
    "toolRunning": "调用中…",
    "cancelled": "已停止",
    "imageLoadFailed": "Failed to load image",
    "openGeneratedImage": "View generated image: {name}"
  }
} as const;
