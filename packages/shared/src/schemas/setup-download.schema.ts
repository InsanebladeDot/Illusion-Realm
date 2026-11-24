/** 一键安装只接受内置清单编号，不接受任意下载地址或写入路径。 */
import { z } from "zod";
import downloads from "../data/setup-downloads.json";

// 编号来自同一份内置清单，新增依赖不再手工改两份枚举。
export const SetupDownloadIdSchema = z.enum(downloads.files.map(file => file.id) as [string, ...string[]]);

export const SetupDownloadIdsSchema = z.array(SetupDownloadIdSchema).min(1).max(downloads.files.length)
  .refine(values => new Set(values).size === values.length);
export type SetupDownloadId = z.infer<typeof SetupDownloadIdsSchema>[number];
export interface SetupDownloadItem {
  id: SetupDownloadId;
  status: "added" | "existing" | "present" | "failed";
  task: import("../types/model-download").ModelDownloadTask | null;
  error: import("../types/model-download").ModelDownloadError | null;
}
export interface SetupDownloadResult { items: SetupDownloadItem[] }

export const SetupCheckModeSchema = z.enum(["inspect", "verify"]);
export type SetupCheckMode = z.infer<typeof SetupCheckModeSchema>;
export type SetupCheckStatus = "missing" | "found" | "ready" | "mismatch" | "unavailable";
export interface SetupCheckItem { id: SetupDownloadId; status: SetupCheckStatus }
export interface SetupCheckResult { items: SetupCheckItem[] }
