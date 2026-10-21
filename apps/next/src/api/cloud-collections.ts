/** 收藏夹页组装：每次核验修订，过期游标重新取第一页；最多四张并行读取，避免瞬时请求洪峰。 */
import { AccountApiError } from "./account";
import { getCloudCollection, getCloudCollectionItems, getCloudImage } from "./cloud-images";
import type { CloudImage } from "@illusion-realm/shared";

export interface CollectionImageResult { imageId: string; image: CloudImage | null; error: unknown }
async function resolveImages(items: { imageId: string }[]): Promise<CollectionImageResult[]> {
  const results: CollectionImageResult[] = [];
  for (let start = 0; start < items.length; start += 4) {
    const batch = await Promise.all(items.slice(start, start + 4).map(async item => {
      try { return { imageId: item.imageId, image: await getCloudImage(item.imageId), error: null }; }
      catch (error) { return { imageId: item.imageId, image: null, error }; }
    }));
    results.push(...batch);
  }
  return results;
}
export async function readCollectionPage(id: string, cursor?: string, revision?: string) {
  const collection = await getCloudCollection(id);
  let reset = Boolean(cursor && revision !== collection.revision);
  let page;
  try { page = await getCloudCollectionItems(id, reset ? undefined : cursor); }
  catch (error) {
    if (!(error instanceof AccountApiError) || error.code !== "REVISION_CONFLICT" || !cursor) throw error;
    reset = true; page = await getCloudCollectionItems(id);
  }
  if (cursor && page.revision !== revision && !reset) { reset = true; page = await getCloudCollectionItems(id); }
  const images = await resolveImages(page.items);
  const authFailure = images.find(item => item.error instanceof AccountApiError && item.error.status === 401);
  if (authFailure) throw authFailure.error;
  return { collection: { ...collection, revision: page.revision }, images, nextCursor: page.nextCursor, reset };
}
