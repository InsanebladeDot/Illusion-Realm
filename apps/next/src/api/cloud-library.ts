/** 完整图库/收藏夹客户端：只发送类型化业务操作，列表和单项结果继续使用同一 shared 契约。 */
import { CloudLibraryRequestSchema, CloudImageSchema, CloudCollectionSchema, type CloudLibraryRequest } from "@illusion-realm/shared";
import { unwrapIpc } from "@/utils/ipcResult";
import { AccountApiError, assertResponse, browserAuthorizedRequest } from "./account";

export async function cloudLibraryRequest(input: CloudLibraryRequest): Promise<unknown> {
  const value = CloudLibraryRequestSchema.parse(input);
  const parts = browserRequestParts(value);
  const response = window.electronAPI?.cloudLibraryRequest
    ? unwrapIpc(await window.electronAPI.cloudLibraryRequest(value))
    : await browserAuthorizedRequest(parts.path, parts.method, parts.body);
  return assertResponse(response).data;
}
function browserRequestParts(input: CloudLibraryRequest) {
  if (input.action === "listImages" || input.action === "listCollections") {
    return { path: `/${input.action === "listImages" ? "images" : "collections"}/${input.scope}?size=${input.size}&offset=${input.offset}`, method: "GET", body: undefined };
  }
  const isImage = input.action === "updateImage" || input.action === "deleteImage";
  let path = input.action === "createCollection" ? "/collections" : `/${isImage ? "images" : "collections"}/${"id" in input ? input.id : ""}`;
  if (input.action === "addItem") path += "/items";
  if (input.action === "removeItem") path += `/items/${input.imageId}`;
  const method = input.action.startsWith("delete") || input.action === "removeItem" ? "DELETE" : input.action.startsWith("update") ? "PATCH" : "POST";
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (!["action", "ownerId", "id"].includes(key) && value !== undefined) body.set(key, value);
  return { path, method, body: method === "DELETE" ? undefined : body };
}
export async function listCloudImages(scope: "mine" | "public", offset = 0) {
  const result = CloudImageSchema.array().safeParse(await cloudLibraryRequest({ action: "listImages", scope, size: 24, offset }));
  if (!result.success) throw new AccountApiError("INVALID_RESPONSE", 502);
  return result.data;
}
export async function listCloudCollections(scope: "mine" | "public", offset = 0) {
  const result = CloudCollectionSchema.array().safeParse(await cloudLibraryRequest({ action: "listCollections", scope, size: 24, offset }));
  if (!result.success) throw new AccountApiError("INVALID_RESPONSE", 502);
  return result.data;
}
export async function saveCloudCollection(input: Extract<CloudLibraryRequest, { action: "createCollection" | "updateCollection" }>) {
  const result = CloudCollectionSchema.safeParse(await cloudLibraryRequest(input));
  if (!result.success) throw new AccountApiError("INVALID_RESPONSE", 502);
  return result.data;
}
