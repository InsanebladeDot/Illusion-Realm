/**
 * English catalogue — keys must stay identical to `zh-CN/common.ts`
 * (enforced by `Record<Locale, Messages>` at typecheck time).
 *
 * Translation status: translated. Interpolation placeholders (`{label}`) must be
 * preserved verbatim — `interpolate()` looks them up by name.
 */
export const common = {
  "cancel": "Cancel",
  "confirm": "Confirm",
  "save": "Save",
  "delete": "Delete",
  "copy": "Copy",
  "close": "Close",
  "minimizeWindow": "Minimize",
  "maximizeWindow": "Maximize",
  "restoreWindow": "Restore window",
  "reloadPage": "Reload page (F5)",
  // 英文按钮同样说明卸载对象是内存中的模型，不是磁盘文件。
  // 请求等待与远端执行分开描述，不能用完成措辞替代服务回执。
  // 正在生成的用户需要知道执行时机，避免误以为当前任务已停止。
  // 失败提示不插入用户地址或底层错误堆栈，保留安全的重试方向。
  // 旧 preload 缺少方法时要完整重启，普通页面刷新不会更新桥接。
  // 对应中文五个实际使用的键，避免英文主题下出现缺失文案。
  // 释放量未由接口提供，因此不在翻译中虚构显存回收数字。
  // 错误与不可用分开，用户可以区分服务离线和客户端版本问题。
  // tooltip 与 aria-label 共用译文，鼠标和读屏得到相同动作含义。
  // 等待消息只在请求未结束时使用，finally 恢复原来的操作标题。
  // 接受消息通过全局 Toast 展示，不要求用户留在创建页面。
  // 不添加自动清理等尚无调用方的词条，维持当前语言门禁边界。
  "comfyMemory": "Unload models and free ComfyUI memory",
  "comfyMemoryBusy": "Sending unload request…",
  "comfyMemoryRequested": "Model unload and memory cleanup requested. During generation, ComfyUI will apply this after the current task finishes.",
  "comfyMemoryFailed": "Could not free ComfyUI memory. Check that the service is online and the server address in Settings is correct.",
  "comfyMemoryUnavailable": "This desktop bridge does not support memory cleanup. Update and fully restart the app.",
  "loading": "Loading…",
  "notImplemented": "{label} is not available yet",
  "copyFailed": "Copy failed",
  "localeNameSelf": "English"
} as const;
