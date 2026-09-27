const { IPC_CHANNELS } = require("./ipcChannels");
const { registerHandle } = require("./ipcHandlers");

/**
 * 入参/出参类型直接引用 shared 的声明（仅类型层 import，运行期不 require）：
 * 这样主进程实现与渲染进程消费的类型是**同一份**，签名漂移会立刻编译失败。
 *
 * @typedef {import("@illusion-realm/shared").AnimadexSearchParams} AnimadexSearchParams
 * @typedef {import("@illusion-realm/shared").AnimadexSearchResult} AnimadexSearchResult
 *
 * @typedef {object} NormalizedLora
 * @property {string} name
 * @property {string} url
 * @property {string} thumb
 *
 * @typedef {object} NormalizedCharacter
 * @property {string} slug
 * @property {string} name
 * @property {string} copyright
 * @property {string} copyrightName
 * @property {string} trigger
 * @property {string[]} tags
 * @property {number} count
 * @property {string} url
 * @property {string} thumbUrl
 * @property {string} imageUrl
 * @property {boolean} hasImage
 * @property {NormalizedLora[]} loras
 * @property {{ up: number, down: number }} rating
 * @property {number} favCount
 */

const ANIMADEX_BASE_URL = "https://animadex.net";
const SEARCH_PATH = "/api/characters/search";
const REQUEST_TIMEOUT_MS = 20000;
const MAX_PAGE_SIZE = 60;

/**
 * 解析正整数，非法或越界时回落到 fallback
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} [max]
 * @returns {number}
 */
function toPositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

/**
 * 规范化一行结果，避免把上游多余字段透传到界面
 * @param {unknown} raw
 * @returns {NormalizedCharacter | null} 缺少 name 时返回 null（调用方会过滤掉）
 */
function normalizeCharacter(raw) {
  if (!raw || typeof raw !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  const name = typeof record.name === "string" ? record.name : "";
  if (!name) return null;

  const rating = /** @type {{ up?: unknown, down?: unknown }} */ (record.rating ?? {});

  return {
    slug: typeof record.slug === "string" ? record.slug : "",
    name,
    copyright: typeof record.copyright === "string" ? record.copyright : "",
    copyrightName:
      typeof record.copyright_name === "string" ? record.copyright_name : "",
    trigger: typeof record.trigger === "string" ? record.trigger : "",
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag) => typeof tag === "string")
      : [],
    count: Number(record.count) || 0,
    url: typeof record.url === "string" ? record.url : "",
    thumbUrl: typeof record.thumb_url === "string" ? record.thumb_url : "",
    imageUrl: typeof record.img_url === "string" ? record.img_url : "",
    hasImage: Boolean(record.has_image),
    loras: Array.isArray(record.loras)
      ? record.loras
          .filter((lora) => lora && typeof lora === "object")
          .map((lora) => {
            const item = /** @type {Record<string, unknown>} */ (lora);
            return {
              name: typeof item.name === "string" ? item.name : "",
              url: typeof item.url === "string" ? item.url : "",
              thumb: typeof item.thumb === "string" ? item.thumb : "",
            };
          })
      : [],
    rating: {
      up: Number(rating.up) || 0,
      down: Number(rating.down) || 0,
    },
    favCount: Number(record.fav_count) || 0,
  };
}

/**
 * 检索角色库
 * @param {AnimadexSearchParams} [params]
 * @returns {Promise<AnimadexSearchResult>}
 */
async function searchCharacters(params = {}) {
  const query = new URLSearchParams({
    page: String(toPositiveInt(params.page, 1)),
    page_size: String(toPositiveInt(params.pageSize, 36, MAX_PAGE_SIZE)),
  });

  const keyword = typeof params.q === "string" ? params.q.trim() : "";
  if (keyword) query.set("q", keyword);

  const copyright =
    typeof params.copyright === "string" ? params.copyright.trim() : "";
  if (copyright) query.set("copyright", copyright);

  if (params.sort === "recent" || params.sort === "az") {
    query.set("sort", params.sort);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  /** @type {Response} */
  let response;
  try {
    response = await fetch(
      `${ANIMADEX_BASE_URL}${SEARCH_PATH}?${query.toString()}`,
      { headers: { Accept: "application/json" }, signal: controller.signal }
    );
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    if (isAbort) {
      throw new Error(`请求超时（${REQUEST_TIMEOUT_MS / 1000}s）`);
    }
    throw new Error(
      `网络请求失败：${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `HTTP ${response.status}${detail ? `：${detail.slice(0, 160)}` : ""}`
    );
  }

  const data = /** @type {Record<string, unknown>} */ (
    (await response.json().catch(() => ({}))) ?? {}
  );
  const results = Array.isArray(data.results)
    ? /** @type {NormalizedCharacter[]} */ (
        data.results.map(normalizeCharacter).filter(Boolean)
      )
    : [];

  return {
    total: Number(data.total) || 0,
    page: Number(data.page) || Number(query.get("page")),
    pageSize: Number(data.page_size) || Number(query.get("page_size")),
    pages: Number(data.pages) || 1,
    results,
  };
}

/**
 * 注册角色库通道。
 * 实际注册统一走 ipcHandlers 的包装器（返回 IpcResult）。
 * @returns {void}
 */
function registerAnimadexIpc() {
  registerHandle(
    IPC_CHANNELS.ANIMADEX_SEARCH,
    /**
     * @param {Electron.IpcMainInvokeEvent} _event
     * @param {AnimadexSearchParams} [params]
     */
    async (_event, params) => {
      try {
        return await searchCharacters(params ?? {});
      } catch (error) {
        throw new Error(
          `角色库请求失败：${error instanceof Error ? error.message : "未知错误"}`
        );
      }
    }
  );
}

module.exports = {
  registerAnimadexIpc,
  searchCharacters,
  normalizeCharacter,
  ANIMADEX_BASE_URL,
  SEARCH_PATH,
};
