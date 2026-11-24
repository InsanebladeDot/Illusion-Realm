// 原“导出到画布”出口适配成本机文件；无 OSS 或其他外部上传。
export async function a(file, category, options = {}) {
  const result = await window.__videoLocalImport(file);
  options.progress?.(1);
  return result;
}
