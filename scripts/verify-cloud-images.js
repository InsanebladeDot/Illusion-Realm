/** 云端图片契约回归：只用内存会话和模拟 HTTP，不读取真实凭据，不上传任何云端文件。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("../apps/next/node_modules/typescript");
const root = path.join(__dirname, "..");
let assertions = 0;
function check(name, test) { test(); assertions++; console.log(`PASS ${name}`); }
function load(relative, dependencies, globals = {}) {
  let source = fs.readFileSync(path.join(root, relative), "utf8");
  if (relative.endsWith(".ts")) source = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, Uint8Array, FormData, Blob, URLSearchParams, AbortSignal, Error, URL,
    require: name => { if (name in dependencies) return dependencies[name]; throw new Error(`Unexpected dependency: ${name}`); },
    process: { env: { ILLUSION_REALM_API_URL: "http://fixture.invalid/api/v1" } }, ...globals,
  }, { filename: relative });
  return module.exports;
}
const fixtureSession = { sessionId: "fixture-session", accessToken: "fixture-access", refreshToken: "fixture-refresh", accessExpiresAt: "", sessionExpiresAt: "" };
function fixture() {
  let session = { ...fixtureSession }, network = async () => new Response("{}", { status: 500 });
  const calls = [];
  const store = { readSession: () => session, writeSession: value => { session = value; }, clearSession: () => { session = null; } };
  const client = load("apps/electron/account-client.js", { "./account-session": store, crypto }, { fetch: async (url, options) => { calls.push({ url, options }); return network(url, options); } });
  const handles = new Map();
  const ipc = load("apps/electron/ipcHandlers.js", { electron: { ipcMain: { removeHandler: key => handles.delete(key), handle: (key, fn) => handles.set(key, fn) } } });
  const { IPC_CHANNELS: channels } = require("../apps/electron/ipcChannels");
  const library = load("apps/electron/cloud-library-request.js", { "./account-client": client, "./account-session": store });
  load("apps/electron/ipc-handlers/cloud-images.handlers.js", { "../ipcChannels": { IPC_CHANNELS: channels }, "../ipcHandlers": ipc, "../account-client": client, "../account-session": store, "../cloud-library-request": library }).registerCloudImageHandlers();
  return { calls, client, store, channels, setNetwork: fn => { network = fn; }, invoke: (key, ...args) => handles.get(key)({}, ...args) };
}
function json(data, status = 200, headers = {}) { return new Response(JSON.stringify({ success: status === 200, code: status === 200 ? "OK" : "UNAUTHENTICATED", data }), { status, headers }); }
// 合法 1×1 PNG，追加一个合法的 prompt tEXt 块，证明上传没有重新编码或移除生成信息。
function pngWithMetadata() {
  const original = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const payload = Buffer.from('tEXtprompt\0{"fixture":"preserve-original"}');
  let crc = 0xffffffff;
  for (const byte of payload) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  const chunk = Buffer.alloc(payload.length + 8); chunk.writeUInt32BE(payload.length - 4); payload.copy(chunk, 4); chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return new Uint8Array(Buffer.concat([original.subarray(0, -12), chunk, original.subarray(-12)]));
}
const upload = { ownerId: "7", requestId: "8ae08b19-ecf2-4a94-b80d-d42d0b7f50cc", title: "Fixture", visibility: "private", presentationMode: "imageOnly", fileName: "fixture.png", bytes: pngWithMetadata() };

async function verifyMultipart() {
  const f = fixture(), ids = [], files = [];
  let attempts = 0;
  f.setNetwork(async (url, options) => {
    if (url.endsWith("/account/me")) return json({ id: "7" });
    if (url.endsWith("/auth/refresh")) return json({ ...fixtureSession, accessToken: "fixture-next", refreshToken: "fixture-next-refresh" });
    const request = new Request(url, options), form = await request.formData();
    assert.match(request.headers.get("content-type"), /^multipart\/form-data; boundary=/);
    assert.equal(options.headers["Content-Type"], undefined);
    ids.push(form.get("requestId")); files.push(new Uint8Array(await form.get("file").arrayBuffer()));
    assert.deepEqual([...form.keys()].sort(), ["file", "presentationMode", "requestId", "title", "visibility"].sort());
    return ++attempts === 1 ? json(null, 401) : json({ id: "42" });
  });
  const result = await f.invoke(f.channels.CLOUD_IMAGE_UPLOAD, upload);
  check("multipart keeps PNG tEXt bytes and reuses UUID through 401 refresh", () => { assert.equal(result.data.status, 200); assert.deepEqual(ids, [upload.requestId, upload.requestId]); for (const bytes of files) assert.deepEqual(bytes, upload.bytes); });
  check("refresh credentials never appear in IPC response", () => assert(!JSON.stringify(result).includes("fixture-next")));
  const before = f.calls.length;
  for (const invalid of [{ ...upload, bytes: new Uint8Array([1]) }, { ...upload, bytes: new Uint8Array(16 * 1024 * 1024 + 1) }, { ...upload, requestId: "invalid" }, { ...upload, fileName: "../escape.png" }, { ...upload, visibility: "invalid" }]) {
    const failure = await f.invoke(f.channels.CLOUD_IMAGE_UPLOAD, invalid);
    assert.equal(failure.code, "INVALID_ARGUMENT");
  }
  check("invalid PNG, size, UUID, filename and enums are rejected before HTTP", () => assert.equal(f.calls.length, before));
  const wrong = await f.invoke(f.channels.CLOUD_IMAGE_UPLOAD, { ...upload, ownerId: "8" });
  check("account mismatch cannot upload under another owner", () => { assert.equal(wrong.data.status, 401); assert.equal(attempts, 2); });
}
async function verifyReadsAndCooldown() {
  const f = fixture(); f.store.clearSession();
  f.setNetwork(async () => json(null, 503, { "Retry-After": "12", "X-Request-Id": "fixture-request" }));
  const result = await f.invoke(f.channels.CLOUD_IMAGE_GET, "18446744073709551615");
  check("anonymous public lookup preserves large string ID and Retry-After", () => { assert.equal(result.data.retryAfter, "12"); assert.equal(result.data.requestId, "fixture-request"); assert.equal(f.calls[0].options.headers.Authorization, undefined); assert(f.calls[0].url.endsWith("18446744073709551615")); });
  await f.invoke(f.channels.CLOUD_COLLECTION_ITEMS, { id: "8", cursor: "8:2:-4:9&size=100" });
  check("collection pagination encodes cursor and keeps fixed page size", () => { const query = new URL(f.calls.at(-1).url).searchParams; assert.equal(query.get("size"), "24"); assert.equal(query.get("cursor"), "8:2:-4:9&size=100"); });
  const invalid = await f.invoke(f.channels.CLOUD_IMAGE_GET, "../account/me");
  check("read IPC cannot call arbitrary endpoints", () => assert.equal(invalid.code, "INVALID_ARGUMENT"));
}
async function verifyRefreshRace() {
  const f = fixture(); let refreshCount = 0;
  f.setNetwork(async (url, options) => {
    if (url.endsWith("/auth/refresh")) { refreshCount++; await new Promise(resolve => setTimeout(resolve, 10)); return json({ ...fixtureSession, accessToken: "fixture-next" }); }
    return options.headers.Authorization === "Bearer fixture-access" ? json(null, 401) : json({ id: "42" });
  });
  const results = await Promise.all([f.client.authorized("/images/42"), f.client.authorized("/collections/8")]);
  check("parallel unauthorized requests refresh rotating token once", () => { assert.equal(refreshCount, 1); assert(results.every(item => item.status === 200)); });
  const changed = fixture();
  changed.setNetwork(async url => {
    if (url.endsWith("/auth/refresh")) { changed.store.writeSession({ ...fixtureSession, sessionId: "another-session" }); return json({ ...fixtureSession, accessToken: "fixture-stale" }); }
    return json(null, 401);
  });
  const denied = await changed.client.authorized("/images/42");
  check("account switch during refresh cannot resurrect old session", () => { assert.equal(denied.status, 401); assert.equal(changed.store.readSession().sessionId, "another-session"); assert.equal(changed.calls.length, 2); });
  const unavailable = fixture();
  unavailable.setNetwork(async url => url.endsWith("/auth/refresh") ? json(null, 503, { "Retry-After": "5" }) : json(null, 401));
  const delayed = await unavailable.client.authorized("/images/42");
  check("temporary refresh outage keeps session and retry delay", () => { assert.equal(delayed.status, 503); assert.equal(delayed.retryAfter, "5"); assert.equal(unavailable.store.readSession().sessionId, fixtureSession.sessionId); });
}
class ApiError extends Error { constructor(code) { super(code); this.code = code; this.status = 409; } }
async function verifyLibraryOperations() {
  const f = fixture();
  f.setNetwork(async url => json(url.endsWith("/account/me") ? { id: "7" } : null));
  const fieldValues = { ownerId: "7", id: "8", title: "Title & 图", visibility: "private", presentationMode: "imageOnly", expectedRevision: "18446744073709551615" };
  const cases = [
    [{ action: "listImages", scope: "mine", size: 24, offset: 24 }, "/images/mine?size=24&offset=24", "GET"],
    [{ action: "listCollections", scope: "public", size: 24, offset: 0 }, "/collections/public?size=24&offset=0", "GET"],
    [{ action: "updateImage", ...fieldValues }, "/images/8", "PATCH"],
    [{ action: "deleteImage", ownerId: "7", id: "8" }, "/images/8", "DELETE"],
    [{ action: "createCollection", ownerId: "7", requestId: upload.requestId, name: "Archive & 图", description: "", visibility: "private" }, "/collections", "POST"],
    [{ action: "updateCollection", ownerId: "7", id: "8", revision: "2", name: "Archive", description: "", visibility: "public" }, "/collections/8", "PATCH"],
    [{ action: "deleteCollection", ownerId: "7", id: "8" }, "/collections/8", "DELETE"],
    [{ action: "addItem", ownerId: "7", id: "8", imageId: "42", sortOrder: "-9223372036854775808" }, "/collections/8/items", "POST"],
    [{ action: "removeItem", ownerId: "7", id: "8", imageId: "42" }, "/collections/8/items/42", "DELETE"],
  ];
  const shared = load("packages/shared/src/schemas/cloud-image.schema.ts", { zod: require("../packages/shared/node_modules/zod") });
  const webCalls = [];
  const renderer = load("apps/next/src/api/cloud-library.ts", {
    "@illusion-realm/shared": shared, "@/utils/ipcResult": {}, "./account": {
      AccountApiError: ApiError, assertResponse: response => response.body,
      browserAuthorizedRequest: async (...args) => { webCalls.push(args); return { body: { data: null } }; },
    },
  }, { window: {} });
  for (const [input, target, method] of cases) {
    const result = await f.invoke(f.channels.CLOUD_LIBRARY_REQUEST, input);
    assert.equal(result.success, true); assert.equal(result.data.status, 200);
    const sent = f.calls.at(-1);
    assert.equal(new URL(sent.url).pathname + new URL(sent.url).search, "/api/v1" + target);
    assert.equal(sent.options.method, method);
    await renderer.cloudLibraryRequest(input);
    const web = webCalls.at(-1); assert.equal(web[0], target); assert.equal(web[1], method);
    if (method === "POST" || method === "PATCH") {
      assert.match(sent.options.headers["Content-Type"], /^application\/x-www-form-urlencoded/);
      const params = new URLSearchParams(sent.options.body);
      assert.equal(params.has("ownerId"), false); assert.equal(params.has("action"), false);
      params.sort(); web[2].sort(); assert.equal(params.toString(), web[2].toString());
      for (const [key, value] of Object.entries(input)) if (!["action", "ownerId", "id"].includes(key)) assert.equal(params.get(key), value);
    }
  }
  check("all nine library operations use documented paths, methods and form fields in desktop and browser", () => assert.equal(webCalls.length, 9));
  const previous = f.calls.length;
  const badRequests = [
    { action: "__proto__" }, { action: "constructor" }, { action: "GET", path: "/auth/login" },
    { action: "listImages", scope: "mine", size: 101, offset: 0 },
    { action: "deleteImage", ownerId: "7", id: "../account/me" },
    { action: "deleteImage", ownerId: "7", id: "8", url: "https://unexpected.invalid" },
    { action: "addItem", ownerId: "7", id: "8", imageId: "42", sortOrder: "9223372036854775808" },
    { action: "updateImage", ...fieldValues, expectedRevision: 2 },
  ];
  for (const input of badRequests) {
    assert.equal((await f.invoke(f.channels.CLOUD_LIBRARY_REQUEST, input)).code, "INVALID_ARGUMENT");
    assert.equal(shared.CloudLibraryRequestSchema.safeParse(input).success, false);
  }
  check("shared schema and main reject unsafe operations, pagination, revisions and signed-order overflow", () => assert.equal(f.calls.length, previous));
  const mismatch = await f.invoke(f.channels.CLOUD_LIBRARY_REQUEST, { action: "deleteImage", ownerId: "9", id: "8" });
  check("library mutations check current account before writing", () => { assert.equal(mismatch.data.status, 401); assert(f.calls.at(-1).url.endsWith("/account/me")); });
}
async function verifyCollectionRevision() {
  let active = 0, maximum = 0, conflict = false;
  const pageCursors = [];
  const imagesApi = {
    getCloudCollection: async () => ({ id: "8", revision: "2" }),
    getCloudCollectionItems: async (_id, cursor) => { pageCursors.push(cursor); if (cursor && conflict) throw new ApiError("REVISION_CONFLICT"); return { revision: "2", items: Array.from({ length: 9 }, (_, i) => ({ imageId: String(i + 1) })), nextCursor: null }; },
    getCloudImage: async id => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 1)); active--; return { id }; },
  };
  const api = load("apps/next/src/api/cloud-collections.ts", { "./account": { AccountApiError: ApiError }, "./cloud-images": imagesApi });
  const result = await api.readCollectionPage("8", "old-cursor", "1");
  check("changed revision resets to first page without merging old cursor", () => { assert.equal(result.reset, true); assert.deepEqual(pageCursors, [undefined]); });
  check("collection image reads use at most four concurrent requests", () => { assert.equal(result.images.length, 9); assert.equal(maximum, 4); });
  conflict = true; pageCursors.length = 0;
  const raced = await api.readCollectionPage("8", "raced-cursor", "2");
  check("409 cursor race automatically reloads first page", () => { assert.equal(raced.reset, true); assert.deepEqual(pageCursors, ["raced-cursor", undefined]); });
}
(async () => {
  await verifyMultipart(); await verifyReadsAndCooldown(); await verifyRefreshRace(); await verifyCollectionRevision(); await verifyLibraryOperations();
  console.log(`ALL PASS (${assertions} cloud image contract checks)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
