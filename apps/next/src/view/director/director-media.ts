// 图片由幻域已有本地图片桥接落盘；工程只保存地址，不能每十秒再写一份 Base64。
// 同一次保存内相同图片只写一次，避免全景和图片板引用同一张图时重复占磁盘。
// 写图失败直接中断保存，原工程文档保持不变；新文件不冒充已经完成的场景。
import { unwrapIpc } from "@/utils/ipcResult";
import type { DirectorDocument as Doc } from "@illusion-realm/shared/types/director";
import { buildLocalFileUrl } from "@/utils/localFileUrl";

export type DirectorMediaWriter = (image: string) => Promise<string>;

// 缓存像本次会话的收据本：按图片内容登记地址，连续自动保存不用反复写同一张图。
// 只留下摘要和写盘承诺，不把大段 Base64 长期留在 Map；最多保存十六张收据。
// 路径是既有图片服务产生的，不允许调用方用缓存绕过文件写入权限。
// 失败收据立即移除，下次操作可以重试；未写成的文件不能命中“成功缓存”。
export function createDirectorMediaWriter(): DirectorMediaWriter {
  const receipts = new Map<string, Promise<string>>();
  return async (image) => {
    const bytes = new TextEncoder().encode(image);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const key = Array.from(new Uint8Array(hash), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    const cached = receipts.get(key);
    if (cached) return cached;
    const pending = persistDirectorImage(image);
    receipts.set(key, pending);
    if (receipts.size > 16) receipts.delete(receipts.keys().next().value!);
    try {
      return await pending;
    } catch (error) {
      receipts.delete(key);
      throw error;
    }
  };
}

export async function persistDirectorMedia(
  scene: Doc,
  write: DirectorMediaWriter = persistDirectorImage,
): Promise<Doc> {
  const result = structuredClone(scene);
  const stored = new Map<string, string>();
  const store = async (value: string) => {
    if (!value.startsWith("data:")) return storedMediaPath(value);
    const cached = stored.get(value);
    if (cached) return cached;
    const path = await write(value);
    stored.set(value, path);
    return path;
  };
  result.panoramaUrl = await store(result.panoramaUrl);
  for (const prop of result.props)
    if (prop.imageUrl) prop.imageUrl = await store(prop.imageUrl);
  return result;
}

// 磁盘路径是工程的地址，localfile 是浏览器的只读门票，两者不能混存。
// 像把收货地址换成导航链接：打开时生成链接，保存时仍抄回原始地址。
// 只解析本项目的固定主机与参数，不解码任意协议或任意查询字段。
// 不把 https 或 blob 当成 Windows 路径再包装，避免出现双重编码。
// 这个转换不读取文件；缺图会由原组件的纹理加载器报告。
function storedMediaPath(value: string): string {
  if (!value.startsWith("localfile://local/")) return value;
  const path = new URL(value).searchParams.get("path");
  if (!path) throw new Error("director-invalid-media-path");
  return path;
}

// 只给即将送入 iframe 的副本换 URL，当前画布与磁盘文档保持原样。
// 场景中目前只有全景和图片道具需要此处理，模型来自固定静态目录。
// data URL 是原组件刚选中的本地图片，仍须等保存时通过图片服务落盘。
// previewPath 属于宿主场景卡片，不交给原三维引擎加载。
export function playableDirectorScene(scene: Doc): Doc {
  const result = structuredClone(scene);
  const playable = (value: string) => /^(data:|blob:|https?:|localfile:)/.test(value)
    ? value : buildLocalFileUrl(value) ?? "";
  result.panoramaUrl = playable(result.panoramaUrl);
  for (const prop of result.props)
    if (prop.imageUrl) prop.imageUrl = playable(prop.imageUrl);
  return result;
}
export async function persistDirectorImage(image: string): Promise<string> {
  const api = window.electronAPI;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    image,
  );
  if (!api || !match) throw new Error("director-invalid-image");
  const directory = unwrapIpc(await api.getDefaultOutputPath());
  const extension = match[1] === "jpeg" ? "jpg" : match[1];
  const paths = unwrapIpc(
    await api.saveGeneratedImages(directory, [
      {
        filename: `director-${crypto.randomUUID()}.${extension}`,
        dataBase64: match[2],
      },
    ]),
  );
  if (!paths[0]) throw new Error("director-image-not-written");
  return paths[0];
}
