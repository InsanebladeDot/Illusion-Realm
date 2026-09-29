const { app, protocol } = require("electron");
const { promises, createReadStream, statSync } = require("fs");
const { join, extname, resolve, sep } = require("path");
const { Readable } = require("stream");

/**
 * 自定义协议：
 * 1) app://      —— 服务 Next.js 静态导出（out/）资源。
 *    Next 静态导出的 HTML 使用绝对路径（/_next/...），若以 file:// 加载会解析到磁盘根目录而 404，
 *    导致样式/脚本/图片全丢；用 app:// 后渲染进程与静态导出同源，客户端路由与 fetch 均可用。
 * 2) localfile:// —— 只读方式服务本机任意媒体文件（图片 / 视频预览用），支持 HTTP Range。
 *
 * 本文件与其余 electron 主进程文件保持一致，使用 CommonJS。
 */
/**
 * Next.js 静态导出目录：
 * - 开发态：apps/next/out（apps/electron 的兄弟目录，直接读源码构建产物）
 * - 打包后：extraResources 复制到 resources/next-out
 */
function resolveOutDir() {
  const candidates = [
    join(__dirname, "..", "next", "out"),
    join(process.resourcesPath || "", "next-out"),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      // 尝试下一个候选
    }
  }
  return candidates[0];
}

const OUT_DIR = resolveOutDir();

/**
 * 扩展名 → MIME。
 * 显式 Record 标注：后续用动态扩展名索引（MIME_TYPES[ext]），否则会报 TS7053。
 * @type {Record<string, string>}
 */
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  // 3D 模型（3D 视角弹框若改为直接 fetch 时需要正确的 MIME）
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".flv": "video/x-flv",
  ".wmv": "video/x-ms-wmv",
  ".ts": "video/mp2t",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
};

// 必须在 app ready 之前注册（privileges 只在此处声明一次）
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
  {
    scheme: "localfile",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

/**
 * 把 Node 可读流转成 Response 可接受的 BodyInit。
 *
 * 为什么需要这个函数：`Readable.toWeb()` 返回的是 **node:stream/web** 的 ReadableStream，
 * 与 DOM lib 里的 ReadableStream 在类型上不兼容（两个同名但不同的声明），
 * 直接传给 `new Response()` 会报 TS2345。运行期两者完全互通（Electron 已验证）。
 * 这里用显式窄化而不是 `any`，并集中在一处，避免类型断言散落各处。
 *
 * @param {import("fs").ReadStream} stream
 * @returns {BodyInit}
 */
function toBodyInit(stream) {
  return /** @type {BodyInit} */ (/** @type {unknown} */ (Readable.toWeb(stream)));
}

/**
 * app:// 请求处理：把静态导出目录（OUT_DIR）下的文件作为响应返回
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleAppRequest(request) {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);
  if (!pathname || pathname === "/") {
    pathname = "/index.html";
  }
  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  const basePath = join(OUT_DIR, pathname);
  const candidates = [basePath];
  // 兼容 /cartoon -> cartoon.html 与 /cartoon/index.html 两种导出形态
  if (!extname(basePath)) {
    candidates.push(`${basePath}.html`, join(basePath, "index.html"));
  }

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    // 防目录穿越：必须位于 out/ 内
    if (resolved !== OUT_DIR && !resolved.startsWith(`${OUT_DIR}${sep}`)) {
      continue;
    }
    try {
      const stat = await promises.stat(resolved);
      if (!stat.isFile()) continue;
      const data = await promises.readFile(resolved);
      const ext = extname(resolved).toLowerCase();
      return new Response(data, {
        headers: {
          "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        },
      });
    } catch {
      // 尝试下一个候选
    }
  }

  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * 本地文件服务（图片 / 视频预览）：localfile://local/?path=<绝对路径>
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleLocalFileRequest(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("path");
  if (!target) {
    return new Response("Missing path", { status: 400 });
  }

  // URLSearchParams.get() 已完成百分号解码；再次 decode 会破坏文件名里的字面 `%`。
  const resolved = resolve(target);
  let stat;
  try {
    stat = await promises.stat(resolved);
  } catch {
    return new Response("Not Found", { status: 404 });
  }
  if (!stat.isFile()) {
    return new Response("Not Found", { status: 404 });
  }

  const mime =
    MIME_TYPES[extname(resolved).toLowerCase()] || "application/octet-stream";
  const total = stat.size;
  const rangeHeader = request.headers.get("range");

  // Range 请求：返回 206，便于 <video> 拖动进度条
  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : total - 1;
      const safeEnd = Math.min(end, total - 1);
      if (Number.isFinite(start) && start <= safeEnd) {
        const stream = createReadStream(resolved, { start, end: safeEnd });
        return new Response(toBodyInit(stream), {
          status: 206,
          headers: {
            "Content-Type": mime,
            "Content-Length": String(safeEnd - start + 1),
            "Content-Range": `bytes ${start}-${safeEnd}/${total}`,
            "Accept-Ranges": "bytes",
          },
        });
      }
    }
  }

  const stream = createReadStream(resolved);
  return new Response(toBodyInit(stream), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
    },
  });
}

function registerAppProtocol() {
  app.whenReady().then(() => {
    protocol.handle("app", handleAppRequest);
    protocol.handle("localfile", handleLocalFileRequest);
  });
}

module.exports = { registerAppProtocol, OUT_DIR, MIME_TYPES };
