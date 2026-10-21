> 前端迁移快照，导出日期：2026-10-15。来源：后端仓库 `architecture/frontend-image-upload-api.md`。包内链接已调整；源码、脚本、本地路径及凭据配置说明均指后端工程，不要求在前端创建或执行。更新时从后端重新导出。

# 前端图片上传接口

更新日期：2026-10-15

本文描述前端使用的图片上传、图库与收藏夹契约。账户登录、access token 刷新方式见 [前端账户接口文档](frontend-account-api.md)。

## 1. 基本信息

| 项目 | 值 |
| --- | --- |
| 上传接口 | `POST /api/v1/images` |
| 读取接口 | `GET /api/v1/images/{id}` |
| 上传认证 | `Authorization: Bearer <accessToken>` |
| 上传正文 | `multipart/form-data` |
| 当前文件类型 | PNG |
| 默认文件上限 | 16 MiB |

前端把文件提交给 Illusion Realm 后端，不要直接调用 FreeImage.host，也不要在浏览器中保存或使用图床 API key。后端负责图床上传、回读验证以及 MySQL 记录。

## 2. 上传字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `requestId` | string | 是 | 标准 UUID。开始一次上传时生成；同一次失败重试必须复用原值 |
| `title` | string | 是 | 去除首尾空白后 1–100 字符 |
| `visibility` | string | 否 | `private` 或 `public`，默认 `private` |
| `presentationMode` | string | 否 | `imageOnly` 或 `withGenerationInfo`，默认 `imageOnly` |
| `file` | File | 是 | PNG 文件 |

不要手动设置 `Content-Type` 请求头。浏览器会为 `FormData` 自动生成包含 boundary 的正确请求头。

## 3. TypeScript 示例

```ts
export type ImageVisibility = "private" | "public";
export type ImagePresentationMode = "imageOnly" | "withGenerationInfo";

export interface ImageView {
  id: string;
  ownerId: string;
  revision: string;
  title: string;
  fileName: string;
  mimeType: "image/png";
  sizeBytes: string;
  width: number;
  height: number;
  visibility: ImageVisibility;
  presentationMode: ImagePresentationMode;
  parseState:
    | "pending"
    | "parsed"
    | "partial"
    | "no_metadata"
    | "unsupported"
    | "failed"
    | "not_applicable";
  sourceUrl: string;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T | null;
  requestId: string;
}

export async function uploadImage(input: {
  apiBaseUrl: string;
  accessToken: string;
  file: File;
  title: string;
  visibility?: ImageVisibility;
  presentationMode?: ImagePresentationMode;
  requestId?: string;
}): Promise<ImageView> {
  const requestId = input.requestId ?? crypto.randomUUID();
  const body = new FormData();
  body.set("requestId", requestId);
  body.set("title", input.title);
  body.set("visibility", input.visibility ?? "private");
  body.set("presentationMode", input.presentationMode ?? "imageOnly");
  body.set("file", input.file, input.file.name);

  const response = await fetch(`${input.apiBaseUrl}/api/v1/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}` },
    body,
  });
  const payload = (await response.json()) as ApiResponse<ImageView>;
  if (!response.ok || !payload.success || !payload.data) {
    throw Object.assign(new Error(payload.message), {
      status: response.status,
      code: payload.code,
      requestId: payload.requestId,
      retryAfter: response.headers.get("Retry-After"),
      uploadRequestId: requestId,
    });
  }
  return payload.data;
}
```

网络中断或未知结果时，重试应复用原 `requestId`。用户重新选择文件、标题、可见性或展示模式时，应生成新的 UUID。相同 `requestId` 搭配不同内容会返回 `REVISION_CONFLICT`。

## 4. 成功响应

HTTP `200`：

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "id": "42",
    "ownerId": "7",
    "revision": "1",
    "title": "Moonlight",
    "fileName": "moonlight.png",
    "mimeType": "image/png",
    "sizeBytes": "53237",
    "width": 1151,
    "height": 898,
    "visibility": "private",
    "presentationMode": "imageOnly",
    "parseState": "pending",
    "sourceUrl": "https://iili.io/example.png",
    "createdAt": "2026-10-15T05:30:00Z"
  },
  "requestId": "server-request-id"
}
```

所有数据库 ID、revision 和字节数都按字符串处理，不要转为 JavaScript `number`。`sourceUrl` 是后端已经回读并核对 SHA-256 的图片直链，可以直接用于 `<img src>`。

## 5. 读取图片

```ts
export async function getImage(apiBaseUrl: string, id: string, accessToken?: string) {
  const response = await fetch(`${apiBaseUrl}/api/v1/images/${encodeURIComponent(id)}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  return (await response.json()) as ApiResponse<ImageView>;
}
```

公开图片允许匿名读取。私有图片只有所有者可读取；不存在和无权访问均返回 `404 NOT_FOUND`。不要依靠前端隐藏实现私有权限。

## 6. 错误处理

| HTTP | code | 前端处理 |
| --- | --- | --- |
| 400 | `INVALID_ARGUMENT` | 检查 UUID、标题、枚举值、PNG 类型、大小或像素尺寸 |
| 401 | `UNAUTHENTICATED` | 尝试刷新 access token；刷新失败后重新登录 |
| 409 | `QUOTA_EXCEEDED` | 提示用户空间额度不足 |
| 409 | `REVISION_CONFLICT` | 不要用同一 requestId 上传不同内容，生成新 UUID 后重试 |
| 429 | `RATE_LIMITED` | 读取 `Retry-After`，禁用重复提交并延迟重试 |
| 502 | `STORAGE_REJECTED` | 图床响应或回读验证失败；保留同一 requestId 稍后重试 |
| 503 | `SERVICE_UNAVAILABLE` | Redis、数据库、图床或上传功能暂不可用；读取 `Retry-After` 后重试 |

错误响应示例：

```json
{
  "success": false,
  "code": "RATE_LIMITED",
  "message": "Too many requests",
  "data": null,
  "requestId": "server-request-id"
}
```

服务端当前限制每用户每分钟最多 20 次上传、全局最多 4 个同时上传任务。前端仍应在单个上传进行期间禁用重复点击，但服务端 Redis 才是跨窗口、跨实例的并发控制来源。

## 7. 直链与私有图片说明

FreeImage.host 的 `sourceUrl` 是公开直链。`visibility=private` 会阻止其他用户通过 Illusion Realm API 查询图片，但无法让第三方图床直链变成需要登录的私有地址。前端不得把 `private` 描述为图床文件加密，也不要把直链写入公开日志、埋点或分享内容。

当前没有受支持的图床删除 API。删除业务记录时不能向用户承诺图床文件已经物理删除。

## 8. 图片库接口

| 方法与路径 | 认证 | 功能 |
| --- | --- | --- |
| `GET /api/v1/images/mine?size=24&offset=0` | 必须 | 当前用户已上传且未删除的图片 |
| `GET /api/v1/images/public?size=24&offset=0` | 可匿名 | 所有可公开展示的图片 |
| `GET /api/v1/images/{id}` | 可匿名 | 公开图片或当前用户自己的私有图片 |
| `PATCH /api/v1/images/{id}` | 必须且为所有者 | 修改标题、可见性和展示方式 |
| `DELETE /api/v1/images/{id}` | 必须且为所有者 | 逻辑删除并立即停止 API 访问 |

列表的 `data` 是 `ImageView[]`，`size` 范围 1–100，`offset` 从 0 开始。修改使用查询/form 字段 `expectedRevision`、`title`、`visibility`、`presentationMode`；修订不匹配返回 `409 REVISION_CONFLICT`。删除只删除 Illusion Realm 中的可访问记录，不保证 FreeImage.host 直链物理删除。

## 9. 收藏夹接口

收藏夹对象：

```ts
export interface CollectionView {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  visibility: "private" | "public";
  revision: string;
  createdAt: string;
}
```

| 方法与路径 | 认证 | 参数/功能 |
| --- | --- | --- |
| `POST /api/v1/collections` | 必须 | `requestId` UUID、`name`、可选 `description`、可选 `visibility` |
| `GET /api/v1/collections/mine?size=24&offset=0` | 必须 | 当前用户收藏夹列表 |
| `GET /api/v1/collections/public?size=24&offset=0` | 可匿名 | 公开收藏夹列表 |
| `GET /api/v1/collections/{id}` | 可匿名 | 公开收藏夹或所有者自己的私有收藏夹 |
| `PATCH /api/v1/collections/{id}` | 必须且为所有者 | `revision`、`name`、可选 `description`、`visibility` |
| `DELETE /api/v1/collections/{id}` | 必须且为所有者 | 逻辑删除收藏夹，不删除原图片 |
| `POST /api/v1/collections/{id}/items` | 必须且为所有者 | `imageId`、可选 `sortOrder` |
| `DELETE /api/v1/collections/{id}/items/{imageId}` | 必须且为所有者 | 取消收藏，不删除原图片 |
| `GET /api/v1/collections/{id}/items?size=24&cursor=...` | 可匿名 | 按游标读取当前仍可访问的图片引用 |

只能收藏自己的图片或当前公开图片。公开收藏夹不会使私有图片公开，匿名读取公开收藏夹时会过滤私有、删除或失效图片。收藏夹内容响应：

```ts
export interface CollectionItemPage {
  items: Array<{ imageId: string; sortOrder: string; addedAt: string }>;
  nextCursor: string | null;
  revision: string;
}
```

继续分页时原样传回 `nextCursor`。收藏夹在分页期间发生修改会返回 `409 REVISION_CONFLICT`，前端应清空旧页并从第一页重新加载。

## 10. Redis 行为

图片上传的速率限制、重复请求抑制和全局并发名额由 Redis 原子脚本承担。“我的图片”和“我的收藏夹”使用按用户 ID 隔离的 30 秒 Redis 热点缓存，写操作递增版本键，使后续读取进入新缓存空间。

公开列表、单项详情和收藏夹内容需要实时执行可见性检查，当前直接查询 TiDB，避免公开资源撤回时因失效通知失败继续暴露正文。Redis 缓存故障时“我的”列表有界回源 TiDB；上传准入故障返回 503。账户状态、资源所有权、私有访问、修订冲突和最终业务数据始终以 TiDB 为准。
