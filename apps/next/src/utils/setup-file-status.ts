/** 清单和下载队列按目标路径对上，名称相同但目录不同的模型是不同文件。 */
import type { ModelDownloadTask } from "@illusion-realm/shared";

export function normalizeSetupPath(path: string) {
  return path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
}

export function findSetupFileTask(root: string, relativePath: string, tasks: ModelDownloadTask[]) {
  if (!root) return undefined;
  const target = `${normalizeSetupPath(root)}/${relativePath.toLowerCase()}`;
  return tasks.findLast(task => normalizeSetupPath(task.filePath) === target);
}
