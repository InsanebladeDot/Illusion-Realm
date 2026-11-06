/**
 * 浏览器 Blob 下载器：为导出功能创建一次性链接，并在触发下载后释放 URL。
 *
 * 这个工具不关心漫画、收藏或文件内容，调用方负责提供 Blob 与下载文件名。
 * 临时 URL 像一次性取件码：点击后立刻作废，避免长时间占用浏览器内存。
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  // 调用方必须在真实用户动作中使用它，避免页面加载时自动弹出下载。
  // blob 可以是图片或 JSON；这里不检查 MIME，因为业务层更了解预期格式。
  // fileName 只作为浏览器建议名，不被拼成磁盘路径，也不会绕过保存策略。
  // 该函数不返回“保存成功”，浏览器接管后无法证明用户最终保留了文件。
  // Electron 与普通浏览器都支持 object URL，因此无需增加新的 IPC 通道。
  // 不把 anchor 插入文档，避免临时节点进入键盘顺序或辅助技术阅读树。
  // 下载动作保持同步，后续 revoke 不会在事件循环里长期留下临时地址。
  // 若 createObjectURL 抛错，异常由调用按钮的既有错误边界接住。
  // anchor.click 抛错时同样向上抛，不在通用工具里伪造成功提示。
  // 本工具没有重试；重复下载是否允许属于各业务自己的规则。
  // 不接收远程 URL，防止一个“下载工具”悄悄变成网络请求封装。
  // 不读取 Blob 内容，所以不会在日志或异常中暴露导出的用户数据。
  // 浏览器可能按自身策略调整重名文件，调用方不能假设磁盘上的最终名称。
  // 页面卸载不需要额外清理，因为临时 URL 已在本次调用末尾释放。
  // 该方法只适合已在内存中的 Blob，不用于大文件流式保存。
  // 需要系统保存对话框的业务仍应通过 Electron 已有 IPC 完成。
  // URL 只服务本次同步点击；浏览器已接收下载后即可释放。
  const url = URL.createObjectURL(blob);
  // 原生链接保留浏览器下载行为，不引入 Electron 或 Node 能力。
  const anchor = document.createElement("a");
  // 文件内容来自 Blob，文件名由对应业务边界决定。
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // 释放只撤销临时地址，不会取消浏览器已经开始的下载。
  URL.revokeObjectURL(url);
}
