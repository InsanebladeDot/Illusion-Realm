/** 工程库只接收固定业务动作；目录由主进程分配，界面不能指定磁盘路径。 */
import { z } from "zod";
import { InfiniteCanvasDocumentSchema, InfiniteCanvasWorkspaceSchema, InfiniteCanvasMediaSchema } from "./infinite-canvas.schema";

const Id = z.string().uuid();
const Name = z.string().min(1).max(80).refine(value => value === value.trim());
export const CanvasLibraryRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("list") }).strict(),
  z.object({ operation: z.literal("create"), name: Name, folderId: Id.nullable() }).strict(),
  z.object({ operation: z.literal("folder"), name: Name }).strict(),
  z.object({ operation: z.literal("removeFolder"), id: Id }).strict(),
  z.object({ operation: z.literal("move"), ids: z.array(Id).min(1).max(200), folderId: Id.nullable() }).strict(),
  z.object({ operation: z.literal("remove"), ids: z.array(Id).min(1).max(200) }).strict(),
  z.object({ operation: z.literal("purgeDeleted") }).strict(),
  z.object({ operation: z.literal("load"), id: Id }).strict(),
  z.object({ operation: z.literal("close"), id: Id }).strict(),
  z.object({ operation: z.literal("resources"), id: Id, workspace: InfiniteCanvasWorkspaceSchema.optional() }).strict(),
  z.object({ operation: z.literal("libraryResources") }).strict(),
  z.object({ operation: z.literal("importLibraryResources"), files: z.array(InfiniteCanvasMediaSchema).min(1).max(200) }).strict(),
  // 删除只接受选中文件的快照；按当前草稿核对引用，整批预检及草稿保存成功后才删除。
  z.object({ operation: z.literal("deleteResources"), id: Id, scope: z.enum(["project", "library"]), document: InfiniteCanvasDocumentSchema,
    resources: z.array(z.object({ path: z.string().min(1).max(32768), identity: z.string().min(1).max(1024) }).strict()).min(1).max(2000) }).strict(),
  z.object({ operation: z.literal("restoreResource"), id: Id, workspace: InfiniteCanvasWorkspaceSchema.optional(), resourceId: Id }).strict(),
  z.object({ operation: z.literal("retainResource"), id: Id, workspace: InfiniteCanvasWorkspaceSchema.optional(), resourceId: Id, retained: z.boolean() }).strict(),
  z.object({ operation: z.literal("save"), id: Id, document: InfiniteCanvasDocumentSchema }).strict(),
]);
export type CanvasLibraryRequest = z.infer<typeof CanvasLibraryRequestSchema>;
export interface CanvasLibraryEntry {
  id: string;
  name: string;
  folderId: string | null;
  updatedAt: number;
  nodeCount: number;
}
export interface CanvasLibraryFolder { id: string; name: string }
export interface CanvasLibrarySnapshot { entries: CanvasLibraryEntry[]; folders: CanvasLibraryFolder[] }
export interface CanvasResourceItem {
  /** 列表读取时的文件身份；手动删除前再次核对，防止同路径被外部替换。 */
  identity: string;
  id: string | null;
  media: NonNullable<z.infer<typeof InfiniteCanvasDocumentSchema>["nodes"][number]["data"]["media"]>;
  ownership: "managed" | "unknown";
  state: "active" | "trashed" | "blocked";
  retained: boolean;
  expiresAt: number | null;
}
export interface CanvasResourceSnapshot { resourceItems: CanvasResourceItem[]; truncated: boolean }
export interface CanvasResourceDeleteResult { removed: string[]; failed: string[] }
export interface CanvasResourceImportResult { imported: number; rejected: string[] }
export type CanvasLibraryResult = CanvasLibrarySnapshot | CanvasLibraryEntry | CanvasResourceSnapshot | CanvasResourceDeleteResult | CanvasResourceImportResult | z.infer<typeof InfiniteCanvasDocumentSchema> | null;
