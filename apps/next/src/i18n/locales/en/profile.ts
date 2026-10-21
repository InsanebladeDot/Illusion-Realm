/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const profile = {
  cover: { change: "Preview cover", reset: "Reset cover", preview: "Profile cover preview", hint: "Page preview only; not saved after refresh" },
  cloud: {
    resourceScope: "Resource scope", mine: "Mine", publicLibrary: "Public", myImages: "My images", publicImages: "Public images", myCollections: "My collections", publicCollections: "Public collections", refresh: "Refresh",
    editImage: "Edit image", deleteImage: "Delete image", save: "Save", createCollection: "New collection", editCollection: "Manage collection", deleteCollection: "Delete collection",
    collectionName: "Collection name", description: "Description (optional)", addToCollection: "Add to collection", chooseCollection: "Choose my collection", collected: "Added to collection", removeFromCollection: "Remove from collection",
    noCollections: "No collections yet", createFirst: "You have no collections yet. Create one in Cloud collections first.", collectionPrivacy: "A public collection does not make private images public. Removing an item or deleting a collection keeps the original images.",
    deleteImageHint: "I understand: this removes the cloud image record and API access, but does not guarantee physical deletion from the image host.",
    deleteCollectionHint: "I understand: this deletes the collection and keeps the original images.",
    images: "Cloud images", imagesDescription: "Manage, share and organize your creative assets", manageImages: "Manage your image assets", collections: "Collections", upload: "Upload image", uploading: "Uploading and verifying…", retry: "Retry upload",
    collectionOwner: "Created by {name}", noCover: "No cover yet", lookupById: "View collection by ID", backToCollections: "Back to collections", collectionsDescription: "Keep your favorite creations together",
    file: "Choose a PNG image", fileHint: "Original PNG, up to 16 MiB. Generation metadata is preserved without recompression.",
    title: "Image title", visibility: "Visibility", private: "Private", public: "Public", presentation: "Presentation",
    imageOnly: "Image only", withGenerationInfo: "With generation info", login: "Sign in to upload cloud images.", goLogin: "Sign in",
    privacy: "Private restricts this app's API; the image host URL remains public. Image-only presentation does not remove PNG generation metadata.",
    success: "Image uploaded", recent: "Images from this session", recentHint: "Only uploads and ID lookups from this session are shown, not your entire cloud library.",
    imageId: "Image ID", lookup: "View", searchPlaceholder: "Search image name or ID", filter: "Filter images", all: "All", noSearchResults: "No matching images", statsLoaded: "Loaded images", statsPublic: "Public", statsPrivate: "Private", statsHint: "Counts, name search and filters apply to loaded images. Enter a full image ID and press Enter to look it up in the cloud.", empty: "No images yet", preview: "Preview {title}", dimensions: "{width} × {height} px",
    id: "ID: {id}", collectionId: "Collection ID", collectionHint: "Create, manage and view cloud collections, or look up an accessible collection by ID.",
    collectionEmpty: "No accessible images in this collection.", loadMore: "Load more", loading: "Loading…", unavailable: "Image is no longer accessible",
    revisionReset: "The collection changed. The first page has been reloaded.", cooldown: "Retry in {seconds} seconds.", requestId: "Diagnostic ID: {id}",
    error: {
      generic: "The operation failed. Please try again later.", invalidPng: "Choose a valid PNG no larger than 16 MiB.",
      invalid: "Check the title, image and ID before retrying.", unauthenticated: "Your session expired. Please sign in again.",
      quota: "Your cloud storage quota is exhausted.", conflict: "The submission conflicts with existing content. Change the input and submit again.",
      rate: "Too many requests. Wait before retrying.", storage: "Image hosting or original-file verification failed. You can retry this upload.",
      service: "The upload or account service is temporarily unavailable. Please retry later.", notFound: "The content does not exist or you do not have access.",
      response: "The server response does not match the API contract. Please retry later.",
    },
  },
  "edit": {
    "title": "编辑公开资料",
    "description": "更新你的个人资料，所有人可见。",
    "avatarLabel": "头像",
    "avatarPreviewAlt": "头像预览",
    "uploadAvatar": "上传新头像",
    "avatarHint": "JPG、PNG 或 GIF，最大 10MB。",
    "uploadFailed": "上传失败",
    "bioLabel": "简介（显示在个人主页）",
    "bioPlaceholder": "介绍一下你自己…",
    "bioCounterUnit": " 字符",
    "socialLabel": "社交媒体",
    "addSocial": "添加社交媒体",
    "saved": "公开资料已保存",
    "save": "保存更改"
  },
  "crop": {
    "title": "Crop avatar", "hint": "Drag the image or use arrow keys to position it. Scroll up to zoom in or down to zoom out, or use the zoom slider. The circle is a preview; the saved image is a static 512 × 512 square.",
    "dragHint": "Avatar crop area. Drag the image, use arrow keys to adjust, or scroll to zoom.", "zoom": "Zoom", "reset": "Reset", "confirm": "Use this avatar", "failed": "Could not crop the avatar. Please choose the image again."
  },
  "stats": {
    "posts": "帖子",
    "followers": "粉丝",
    "following": "已关注"
  },
  "tabs": {
    "emptyPostsTitle": "暂无帖子",
    "emptyPostsDescription": "你还没有创建任何帖子。",
    "goCreate": "去创建",
    "emptyPrefix": "暂无",
    "comingSoon": "此区域内容即将推出。",
    "fallbackLabel": "内容",
    "ariaLabel": "个人主页内容",
    "privateOnly": "仅自己可见",
    "allPosts": "全部帖子",
    "gridView": "网格视图",
    "listView": "列表视图"
  },
  "errors": {
    "invalidImageType": "请选择图片文件",
    "imageTooLarge": "图片大小不能超过 10MB",
    "readFailed": "读取图片失败"
  }
} as const;
