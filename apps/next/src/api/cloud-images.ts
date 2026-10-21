/** 云端图片客户端：校验响应、保留字符串 ID，上传不重编码 PNG，重试沿用调用者 UUID。 */
import {
  CLOUD_IMAGE_MAX_BYTES, CloudIdSchema, CloudImageSchema, CloudImageUploadSchema,
  CloudCollectionSchema, CloudCollectionItemsSchema, CloudCollectionPageSchema,
  type CloudImageUpload, type AccountApiResponse,
} from "@illusion-realm/shared";
import { AccountApiError, assertResponse, browserAuthorizedRequest } from "./account";
import { unwrapIpc } from "@/utils/ipcResult";

export async function readCloudPng(file: File): Promise<Uint8Array<ArrayBuffer>> {
  if (!file.size || file.size > CLOUD_IMAGE_MAX_BYTES) throw new AccountApiError("INVALID_PNG", 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) throw new AccountApiError("INVALID_PNG", 400);
  return bytes;
}

export async function uploadCloudImage(input: CloudImageUpload) {
  const value = CloudImageUploadSchema.parse(input);
  let response: AccountApiResponse;
  if (window.electronAPI?.cloudImageUpload) response = unwrapIpc(await window.electronAPI.cloudImageUpload(value));
  else {
    const form = new FormData();
    form.set("requestId", value.requestId); form.set("title", value.title);
    form.set("visibility", value.visibility); form.set("presentationMode", value.presentationMode);
    form.set("file", new Blob([new Uint8Array(value.bytes)], { type: "image/png" }), value.fileName);
    response = await browserAuthorizedRequest("/images", "POST", form);
  }
  return parseCloudImage(response);
}
function parseCloudImage(response: AccountApiResponse) {
  const parsed = CloudImageSchema.safeParse(assertResponse(response).data);
  if (!parsed.success) throw new AccountApiError("INVALID_RESPONSE", 502);
  return parsed.data;
}
export async function getCloudImage(id: string) {
  CloudIdSchema.parse(id);
  const response = window.electronAPI?.cloudImageGet ? unwrapIpc(await window.electronAPI.cloudImageGet(id)) : await browserAuthorizedRequest(`/images/${id}`);
  return parseCloudImage(response);
}
export async function getCloudCollection(id: string) {
  CloudIdSchema.parse(id);
  const response = window.electronAPI?.cloudCollectionGet ? unwrapIpc(await window.electronAPI.cloudCollectionGet(id)) : await browserAuthorizedRequest(`/collections/${id}`);
  const parsed = CloudCollectionSchema.safeParse(assertResponse(response).data);
  if (!parsed.success) throw new AccountApiError("INVALID_RESPONSE", 502);
  return parsed.data;
}
export async function getCloudCollectionItems(id: string, cursor?: string) {
  const value = CloudCollectionItemsSchema.parse({ id, cursor });
  const query = new URLSearchParams({ size: "24" });
  if (cursor) query.set("cursor", cursor);
  const response = window.electronAPI?.cloudCollectionItems ? unwrapIpc(await window.electronAPI.cloudCollectionItems(value)) : await browserAuthorizedRequest(`/collections/${id}/items?${query}`);
  const parsed = CloudCollectionPageSchema.safeParse(assertResponse(response).data);
  if (!parsed.success) throw new AccountApiError("INVALID_RESPONSE", 502);
  return parsed.data;
}
