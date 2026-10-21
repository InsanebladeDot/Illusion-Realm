/** 云端图片与收藏夹契约：ID / revision / 字节数保留字符串，上传只接受原始 PNG。 */
import { z } from "zod";

export const CLOUD_IMAGE_MAX_BYTES = 16 * 1024 * 1024;
export const CloudIdSchema = z.string().regex(/^[1-9][0-9]{0,19}$/);
export const ImageVisibilitySchema = z.enum(["private", "public"]);
export const ImagePresentationSchema = z.enum(["imageOnly", "withGenerationInfo"]);
export const CloudImageUploadSchema = z.object({
  requestId: z.string().uuid(), ownerId: CloudIdSchema, title: z.string().trim().min(1).max(100),
  visibility: ImageVisibilitySchema, presentationMode: ImagePresentationSchema,
  fileName: z.string().min(1).max(255).refine(value => !/[\\/\u0000-\u001f]/.test(value)),
  bytes: z.instanceof(Uint8Array).refine(value => value.byteLength > 0 && value.byteLength <= CLOUD_IMAGE_MAX_BYTES),
});
export const CloudCollectionItemsSchema = z.object({ id: CloudIdSchema, cursor: z.string().max(256).optional() });
export const CloudImageSchema = z.object({
  id: CloudIdSchema, ownerId: CloudIdSchema, revision: z.string().regex(/^[0-9]+$/), title: z.string(), fileName: z.string(),
  mimeType: z.literal("image/png"), sizeBytes: z.string().regex(/^[0-9]+$/), width: z.number().int().positive(), height: z.number().int().positive(),
  visibility: ImageVisibilitySchema, presentationMode: ImagePresentationSchema,
  parseState: z.enum(["pending", "parsed", "partial", "no_metadata", "unsupported", "failed", "not_applicable"]),
  sourceUrl: z.string().url().refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }), createdAt: z.string(),
});
export const CloudCollectionSchema = z.object({
  id: CloudIdSchema, ownerId: CloudIdSchema, name: z.string(), description: z.string().nullable(),
  visibility: ImageVisibilitySchema, revision: z.string(), createdAt: z.string(),
});
export const CloudCollectionPageSchema = z.object({
  items: z.array(z.object({ imageId: CloudIdSchema, sortOrder: z.string(), addedAt: z.string() })), nextCursor: z.string().nullable(), revision: z.string(),
});
export type CloudImageUpload = z.infer<typeof CloudImageUploadSchema>;
export type CloudImage = z.infer<typeof CloudImageSchema>;
export type CloudCollection = z.infer<typeof CloudCollectionSchema>;

const ListFields = { scope: z.enum(["mine", "public"]), size: z.number().int().min(1).max(100), offset: z.number().int().min(0).max(2147483647) };
const OwnedFields = { ownerId: CloudIdSchema, id: CloudIdSchema };
const CollectionFields = { name: z.string().trim().min(1).max(100), description: z.string().max(1000), visibility: ImageVisibilitySchema };
/** 有限业务操作，不接受客户端提供的 URL、HTTP 方法或令牌。 */
export const CloudLibraryRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("listImages"), ...ListFields }).strict(),
  z.object({ action: z.literal("listCollections"), ...ListFields }).strict(),
  z.object({ action: z.literal("updateImage"), ...OwnedFields, expectedRevision: CloudIdSchema, title: z.string().trim().min(1).max(100), visibility: ImageVisibilitySchema, presentationMode: ImagePresentationSchema }).strict(),
  z.object({ action: z.literal("deleteImage"), ...OwnedFields }).strict(),
  z.object({ action: z.literal("createCollection"), ownerId: CloudIdSchema, requestId: z.string().uuid(), ...CollectionFields }).strict(),
  z.object({ action: z.literal("updateCollection"), ...OwnedFields, revision: CloudIdSchema, ...CollectionFields }).strict(),
  z.object({ action: z.literal("deleteCollection"), ...OwnedFields }).strict(),
  z.object({ action: z.literal("addItem"), ...OwnedFields, imageId: CloudIdSchema, sortOrder: z.string().regex(/^-?(0|[1-9][0-9]{0,18})$/).refine(value => BigInt(value) >= BigInt("-9223372036854775808") && BigInt(value) <= BigInt("9223372036854775807")).optional() }).strict(),
  z.object({ action: z.literal("removeItem"), ...OwnedFields, imageId: CloudIdSchema }).strict(),
]);
export type CloudLibraryRequest = z.infer<typeof CloudLibraryRequestSchema>;
