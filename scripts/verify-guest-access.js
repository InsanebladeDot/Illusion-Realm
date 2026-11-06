/**
 * 长期游客契约：记录兼容、账户清理、后端零请求和重新登录。
 * 生产模块在隔离 VM 中执行，不读取用户文件，不连接真实服务。
 * 替换的只有文件会话存储、Electron IPC 注册表和 HTTP 传输。
 * 主进程 handler、账户客户端和浏览器预览客户端均使用真实代码。
 * 模拟令牌只用于验证状态切换，不是可用凭据，也不写入仓库文档。
 * 新格式基准先于旧格式兼容，防止只有迁移分支能工作的假通过。
 * 页面重启和实际生成由 Electron 冒烟另测，不在此伪造生成成功。
 * 任何失败以退出码 1 返回，成功摘要不会覆盖未处理的断言错误。
 */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const ts = require("../apps/next/node_modules/typescript"), { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
// 固定仓库路径和显式依赖表，遇到未知依赖直接失败，避免隐式假实现。
// TypeScript 只在内存中转译，类型正确性仍由 pnpm typecheck 检查。
// i18n 不参与权限判断，浏览器客户端仅需真实的 IPC unwrap 语义。
// process.env 使用不可联网的假地址，HTTP 本身仍由下方 fetch 替身捕获。
// VM 的模块对象独立，测试不同客户端时不会共享生产单例或内存令牌。
// 保留原生 Web 类型，使 JSON、FormData 和超时选项按真实形状构建。
function load(relative, dependencies, globals = {}) {
  // relative 由本文件固定给出，不接受命令行的任意文件路径。
  // 读取的业务代码正是当前工作区版本，源码修改会直接改变本测试行为。
  // JS 模块不做转译，保留主进程手写 CommonJS 的运行方式。
  // TS 模块只移除类型与转换 import，业务判断仍由原函数执行。
  // 模块导出通过独立 module 对象传回，不会污染 Node 的真实 require.cache。
  // 依赖替身也必须显式匹配名字，拼错 import 不会得到一个假成功对象。
  // 响应使用 Node 自带 Response，不用手写 json() 假定请求总能解析成功。
  // HTTP 替身只负责响应数据，授权头和请求路径仍由生产实现构建。
  // 这种隔离不验证 Electron 打包或实际跨域，相关结论不能从此脚本推导。
  let source = fs.readFileSync(path.resolve(__dirname, "..", relative), "utf8");
  if (relative.endsWith(".ts")) source = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  // require 只能命中当前夹具明确提供的依赖，不能意外加载真实账户文件。
  // 传输替身记录完整请求数量，但断言失败时不打印令牌或用户文档。
  // 相同 Error 类型注入所有模块，保证 instanceof 检查行为稳定。
  // 纯函数返回对象可能来自 VM，因此断言用 JSON 规范化做跨上下文比较。
  vm.runInNewContext(source, { module, exports: module.exports, Error, FormData, URLSearchParams, AbortSignal, console, process: { env: {} }, require: name => { assert(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; }, ...globals }, { filename: relative });
  return module.exports;
}
// 完整假会话满足生产 tokenData 的字段形状，便于验证正常登录仍可写回。
// 时间字段只作为后端响应字符串使用，本测试不绕过或修改服务端有效期。
// HTTP 回复严格包含 success/data，客户端仍需执行真实的 assertResponse。
// profile 只提供状态测试所需 ID，不把用户界面样例当成真实账户。
// IPC 注册表按真实 registerHandle 包装返回值，不能直接调用业务函数假通过。
// clear 失败可独立注入，验证清理失败不能以“游客已进入”返回成功。
const tokens = { sessionId: "fixture-session", accessToken: "fixture-access", refreshToken: "fixture-refresh", accessExpiresAt: "future", sessionExpiresAt: "future" };
// crypto 仅供生产客户端生成请求 ID，不参与创建真实可用的账户凭据。
// response 根据 status 设置 success，401 因此不会伪装成成功的数据包。
// 不在响应中填 message，错误提示应由客户端根据稳定错误码处理。
// 主进程 handler 的失败会由 IPC 助手打印一行预期日志，不代表测试命令失败。
// 是否失败以断言结果及进程退出码为准，不能通过搜索 stderr 判定结论。
// 相同的假 Response 形状供桌面和浏览器使用，方便对照两端行为。
// 不模拟 HTTP 缓存、代理或 DNS，本测试的网络边界是传输函数调用本身。
const response = (data, status = 200) => new Response(JSON.stringify({ success: status === 200, data }), { status });
function mainFixture() {
  // 初始故意留有一份旧账户凭据，对应旧版本游客可能残留账户文件的场景。
  // 若初始就是 null，清理入口无论是否实现都可能让零请求用例通过。
  // store.readSession 每次读取同一可变状态，以覆盖清理后的重新查询。
  // store.writeSession 使正常登录和令牌刷新有机会真的恢复凭据。
  // 网络默认返回成功，未授权用例不能依赖网络失败来掩盖漏发请求。
  // 登录路由回复完整令牌，其他路径回复资料，便于检查正式账户正向对照。
  // 所有调用按发生顺序记录，能区分登录、刷新和后续业务重试。
  // failClear 只改变文件替身的删除结果，不改变生产 handler 的成功判据。
  // handles 由生产 registerHandle 填充，参数校验在业务动作之前执行。
  // 同一个夹具可以切换网络行为，供后面的手动 Promise 竞态使用。
  let session = { ...tokens }, failClear = false, network = async url => response(url.endsWith("/auth/login") ? tokens : { id: "7" });
  const calls = [], handles = new Map(), store = { readSession: () => session, writeSession: next => { session = next; }, clearSession: () => { if (!failClear) session = null; } };
  const client = load("apps/electron/src/main/modules/account/account-client.js", { "./account-session": store, crypto }, { fetch: async (url, options) => { calls.push({ url, options }); return network(url, options); } });
  // 使用生产 IPC 包装器，同时保留参数校验和异常序列化。
  // 不创建 BrowserWindow，也不会初始化 Electron 的真实用户目录。
  // 自定义 invoke 把 event 占位，用户参数仍按原顺序传到真实 handler。
  // 将失败开关封装在夹具中，避免测试直接改写生产对象的方法。
  const ipc = load("apps/electron/src/main/ipc/result.js", { electron: { ipcMain: { removeHandler: key => handles.delete(key), handle: (key, fn) => handles.set(key, fn) } } });
  load("apps/electron/src/main/modules/account/account.handlers.js", { "../../../common/ipc-channels": { IPC_CHANNELS: C }, "../../ipc/result": ipc, "./account-session": store, "./account-client": client }).registerAccountHandlers();
  return { calls, client, store, setNetwork: value => { network = value; }, failClear: () => { failClear = true; }, invoke: (key, ...args) => handles.get(key)({}, ...args) };
}

/**
 * 登录和令牌刷新都可能在用户选择游客之前发出、之后才返回。
 * 手动控制响应 Promise，而不是通过随机延迟制造偶发竞态。
 * 进入游客本身必须立即清除凭据，不等待旧登录或旧刷新完成。
 * 完成旧请求后检查存储与返回值，不能只检查清理瞬间没有 token。
 * 登录 handler 的 revision 与刷新客户端的 sameSession 是两条独立护栏。
 * 这里分别构造反例，防止只修其中一条路径仍宣称身份隔离完成。
 */
async function verifyLateResponses() {
  const f = mainFixture(); let release;
  // delayed 的 release 由测试掌握，保证旧响应严格晚于游客清理完成。
  // 主进程的登录调用会等待这份 Response，而不是提前取得一个空成功。
  // 清理后仍交付成功数据是反证：只有 revision 检查才能阻止旧成功写盘。
  // 校验请求总数可以发现修复偷偷通过后端注销来补救身份切换的实现。
  // 不使用操作系统时钟或固定 sleep，所以测试不依赖本机性能。
  // 登录路由仍按白名单发送，游客模式限制不能阻止这个明确的账号操作。
  // 测试中的先后关系来自 await，不由偶然的网络完成顺序决定。
  // pending 最终也要被等待，不能因为跳转页面就遗弃旧请求的错误。
  // 会话最终为空，既验证调用结果也验证持久化替身未写入新 token。
  // 这里没有把凭据字段返回给用户界面；返回值必须是标准错误封装。
  const delayed = new Promise(resolve => { release = resolve; }); f.setNetwork(() => delayed);
  // 登录请求已进入传输替身，但尚未返回；随后真正调用生产游客清理 handler。
  // 旧结果仍然包含合法 tokenData，护栏必须依据操作顺序拒绝，而非格式错误。
  // 最终数据为本地 401，调用方不能在旧成功后再次 hydrate 成正式账号。
  // 传输次数只能是原来的一个登录请求，游客清理不追加 /auth/logout。
  const pending = f.invoke(C.ACCOUNT_LOGIN, {}); await f.invoke(C.ACCOUNT_ENTER_GUEST); release(response(tokens));
  const stale = await pending; assert.equal(stale.data.status, 401); assert.equal(f.store.readSession(), null); assert.equal(f.calls.length, 1);
  // 新夹具专门制造“业务请求 401 → 正在刷新”的状态，不复用前一个空会话。
  // started 通知表明确实已开始刷新，不能在刷新之前就清理导致用例恒真。
  // 刷新回复里的 token 合法且可被解析，所以存储保持空必须来自 sameSession。
  // 旧请求在游客切换后不得再用新 token 重试业务请求。
  const r = mainFixture(); let finish, notify;
  // r 与 f 的闭包互不共享，之前清空的存储不能让刷新用例轻易通过。
  // 第一个业务请求收到 401，真实客户端因此调用 performRefresh。
  // notify 在刷新 fetch 真正发生时触发，started 才能结束等待。
  // 在此之前测试不允许进入游客，确保刷新确实处于进行中。
  // finish 交付的令牌与初始形状相同，tokenData 不应把它当作损坏数据。
  // sameSession 必须发现存储已被清除，丢弃刷新结果，不调用 writeSession。
  // 请求数保持二，意味着没有再向原图片接口进行第三次带令牌重试。
  // 这项测试不撤销已发往服务器的刷新请求，只拒绝其结果在本地生效。
  // 已发送的身份接口符合白名单语义；游客选择后的业务请求仍要禁止。
  // 真实刷新令牌的服务端轮换由服务端负责，本测试不模拟服务端数据库。
  // 主进程不因此删除用户业务文档，替身范围仅为账户会话。
  // 旧请求返回 401 可供调用者展示登录提示，不应抛出未处理的主进程异常。
  const refreshed = new Promise(resolve => { finish = resolve; }), started = new Promise(resolve => { notify = resolve; });
  r.setNetwork(url => { if (url.endsWith("/auth/refresh")) { notify(); return refreshed; } return response(null, 401); });
  const privateRequest = r.client.authorized("/images/42"); await started; await r.invoke(C.ACCOUNT_ENTER_GUEST); finish(response(tokens));
  assert.equal((await privateRequest).status, 401); assert.equal(r.store.readSession(), null); assert.equal(r.calls.length, 2);
  // 浏览器预览没有主进程 revision，因此必须独立验证内存 token 不被复活。
  // clearAccountForGuest 先使旧登录失效；即使响应成功也应抛 AccountApiError。
  // 之后再访问业务路径返回 401，证明不是只拒绝了旧 Promise 的返回值。
  // fetch 仅被旧的一个登录调用，后续图库读取仍为本地拒绝。
  let deliver, requests = 0;
  const browserReply = new Promise(resolve => { deliver = resolve; });
  const browser = load("apps/next/src/api/account.ts", { "@/utils/ipcResult": {} }, { fetch: () => { requests++; return browserReply; } });
  const login = browser.loginAccount({}); await browser.clearAccountForGuest(); deliver(response(tokens));
  await assert.rejects(login, error => error.code === "UNAUTHENTICATED"); assert.equal((await browser.browserAuthorizedRequest("/images/public")).status, 401); assert.equal(requests, 1);
}

/**
 * 当前格式先做 JSON 往返，再检查无版本的旧记录是否得到同样语义。
 * 旧开始时间为 0，确保旧截止时间早已过去，迁移不能依赖“尚未过期”。
 * 不使用真实当前时间作为预期，测试跨时区或跨午夜运行仍保持确定性。
 * 未知版本、非法时间和旧格式的非法延期依旧拒绝，不能全部视为游客。
 * 新记录必须没有 expiresAt，避免换成大时间戳后仍保留隐性到期逻辑。
 * helper 的有效性只代表本地入口，下方另测账户客户端独立拦截。
 */
function verifyRecords() {
  // 纯数据常量也从当前 shared 文件加载，迁移不是测试里另写的一套规则。
  // 新记录以明确版本识别，不能通过“很远的截止时间”替代长期有效语义。
  // JSON 往返会暴露 Infinity 被转成 null 等序列化问题。
  // 固定 startedAt=123，预期字符串同时检查字段名称、版本和起始时间。
  // 旧记录 startedAt=0 合法，判据不能错误地用 truthy 检查把零当作缺失。
  // 旧截止时间 3600000 与历史格式严格对应，避免把非法输入混入兼容对照。
  // 未知版本 3 必须拒绝，不能先看到 startedAt 就无条件按 v2 处理。
  // 负数、非有限值和小数分别覆盖不同的数值错误，不能只做 typeof 检查。
  // 旧两小时记录属于形状不合法；它与旧一小时记录已到期是不同情况。
  // null 仍表示用户未选择入口，不可因为取消到期而自动创建游客身份。
  const shared = load("packages/shared/src/types/guest-session.ts", {});
  const api = load("apps/next/src/utils/guest-session.ts", { "@/types/guest-session": shared });
  const current = api.createGuestSession(123); assert.equal(JSON.stringify(current), '{"version":2,"startedAt":123}');
  assert.equal(JSON.stringify(api.readGuestSession(JSON.parse(JSON.stringify(current)))), JSON.stringify(current)); assert(api.isGuestSessionActive(current));
  // 保留旧开始时间，而不是每次打开应用重新创建一个“新游客”。
  // 截止时间只用于旧形状判定，不用于决定现在是否可以继续使用本地功能。
  // 旧文档字段迁移后消失，JSON 本身不含 Infinity、undefined 等非标准值。
  // v2 可以在系统时钟回拨时保留入口，解析过程不读取 Date.now。
  assert.equal(JSON.stringify(api.readGuestSession({ startedAt: 0, expiresAt: 3600000 })), '{"version":2,"startedAt":0}');
  for (const invalid of [null, {}, { version: 3, startedAt: 0 }, { version: 2, startedAt: -1 }, { version: 2, startedAt: Infinity }, { version: 2, startedAt: 0.5 }, { startedAt: 0, expiresAt: 7200000 }]) assert.equal(api.readGuestSession(invalid), null);
  assert.equal(api.isGuestSessionActive(null), false);
}

/**
 * 先验证非法参数不会清除已有正式账户，再执行真正的游客切换。
 * 切换成功必须在零网络请求的前提下清空存储，不调用后端 logout。
 * guest 访问 public、private 和账号资料都应本地返回 401。
 * 同时直接调用底层 HTTP 入口，防止只修 optionalAccount 漏掉其他调用者。
 * 无凭据即使传入旧 token 参数也必须拒绝，不能靠保留参数越过清理。
 * 最后重新通过登录 handler 建立会话，保证权限限制不会误伤正式账号。
 */
async function verifyMain() {
  const f = mainFixture();
  const invalid = await f.invoke(C.ACCOUNT_ENTER_GUEST, true); assert.equal(invalid.code, "INVALID_ARGUMENT"); assert(f.store.readSession());
  const cleared = await f.invoke(C.ACCOUNT_ENTER_GUEST); assert.equal(cleared.success, true); assert.equal(f.store.readSession(), null); assert.equal(f.calls.length, 0);
  // 三个入口共用真实主进程客户端，但分别覆盖带授权、可选授权和裸 HTTP。
  // 方法和路径交叉检查，GET /auth/login 也不能伪装成匿名登录请求。
  // 检查每次返回值后再核对零调用，能区分本地拒绝与远端拒绝。
  // 登入以外的新 auth 路径默认关闭，不通过前缀匹配自动开放。
  for (const route of ["/images/public", "/collections/public", "/account/me", "/auth/logout", "/auth/refresh", "/auth/unknown"]) {
    assert.equal((await f.client.authorized(route)).status, 401); assert.equal((await f.client.optionalAccount(route)).status, 401); assert.equal((await f.client.callApi(route, "GET", undefined, tokens.accessToken)).status, 401);
  }
  // 读请求之外还覆盖写入和删除，防止只禁止匿名 GET 却放行云端修改。
  // 裸调用也携带一份旧 token 参数，存储为空时仍不能依赖它访问后端。
  // HTTP 方法不改变无账户的事实，所有业务动词都需要正式会话。
  // /auth/login 的 GET 则是相反的边界：路径允许但方法不允许。
  // 公开资源路径与账户资料路径共测，避免把公开可见性误当匿名访问权限。
  // /auth/unknown 证明白名单没有退化为整个 /auth 前缀。
  // 本地 401 不附带服务器重试头，不能触发“等一下自动再试”的后台请求。
  // 业务拒绝之后计数仍为零，之前的清理动作也计入这项总数检查。
  // 正式登录对照会在后面改变计数，二者不能共用一个模糊的“大于零”判据。
  // 登录请求与匿名资源请求通过同一底层 callApi，阻止后者不能误伤前者。
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) assert.equal((await f.client.callApi("/images", method, {}, tokens.accessToken)).status, 401);
  assert.equal((await f.client.callApi("/auth/login", "GET")).status, 401); assert.equal(f.calls.length, 0);
  // 注册和邮箱激活是完整注册流程，均允许无账号调用。
  // 每次必须确实命中传输替身，不能通过假成功绕过服务端请求。
  // 登录尚未发生，所以其他业务仍应保持无账户状态。
  for (const route of ["/auth/register", "/auth/verify-email", "/auth/verification/resend"]) assert.equal((await f.client.callApi(route, "POST", {})).status, 200);
  assert.equal(f.calls.length, 3);
  // 登录 handler 负责写令牌，并在返回值里剥离 access/refreshToken。
  // 已登录用户随后访问 public 资源也必须继续成功并携带授权头。
  // 整个过程不会将虚构令牌持久化到用户磁盘。
  const login = await f.invoke(C.ACCOUNT_LOGIN, {}); assert.equal(login.data.status, 200); assert(!JSON.stringify(login).includes(tokens.accessToken)); assert(f.store.readSession());
  assert.equal((await f.client.optionalAccount("/images/public")).status, 200); assert.equal(f.calls.at(-1).options.headers.Authorization, "Bearer " + tokens.accessToken);
  // 文件清理失败的替身保留旧凭据，生产复读确认必须返回 IPC 失败。
  // 不允许 handler 无条件报告成功，否则游客会继续使用旧账号的令牌。
  // 失败过程依旧没有网络调用，用户可回到入口重试本地清理。
  const failing = mainFixture(); failing.failClear(); const denied = await failing.invoke(C.ACCOUNT_ENTER_GUEST); assert.equal(denied.success, false); assert.equal(failing.calls.length, 0);
}

/**
 * 浏览器开发预览也必须零请求拦截，不能只在 Electron 上满足游客策略。
 * 初始没有令牌，资料及图库调用直接返回 401；登录接口仍可发送请求。
 * 登录后再清除内存令牌，模拟切换为游客，确认后续请求不会重用旧 token。
 * Electron 分支用仅含清理方法的 API 替身，核对调用次数和等待顺序。
 * 清理 IPC 失败必须传播错误，不能把失败吞掉后允许游客进入。
 * 账户后端 fetch 替身不涉及 ComfyUI，不能据此声称实际生成已验证。
 */
async function verifyBrowser() {
  // 浏览器模块没有 window.electronAPI，所以会进入真实的 fetch 预览分支。
  // 传输默认成功，零调用因此能证明是调用前拦截，而非网络失败后的兜底。
  // 数据包仍使用真实 AccountEnvelope，客户端不能省略 success 检查。
  // 新模块的 browserTokens 初始为空，不从 Node 主进程夹具继承账户状态。
  // 首次资料查询的错误通过真实 assertResponse 生成，可保留现有 UI 登录提示。
  // 注册、验证和重发各触发一次请求，正向计数是三，不能返回本地假成功。
  // 登录再加资料查询使计数到五，说明正式账号请求不被永久禁用。
  // 切换游客后计数保持五，即清理和随后的公开收藏夹读取都没有网络副作用。
  // Electron 桥接分支随后单独加载，避免窗口对象改变已初始化的浏览器模块。
  // clearAccountForGuest 的成功和失败都被等待，测试结束时没有未完成的隔离动作。
  const calls = [], globals = { fetch: async (url, options) => { calls.push({ url, options }); return response(url.endsWith("/auth/login") ? tokens : { id: "7" }); } };
  const unwrap = result => { if (!result.success) throw new Error("fixture IPC failure"); return result.data; };
  const api = load("apps/next/src/api/account.ts", { "@/utils/ipcResult": { unwrapIpc: unwrap } }, globals);
  // 资料读取走 call，图库读取走 browserAuthorizedRequest，均不得漏发匿名请求。
  // assertResponse 仍生成正式 AccountApiError，页面可复用已有登录提示。
  // 只比较业务错误码，不依赖翻译文案或后端错误消息。
  await assert.rejects(api.getAccountProfile(), error => error.code === "UNAUTHENTICATED"); assert.equal((await api.browserAuthorizedRequest("/images/public")).status, 401); assert.equal(calls.length, 0);
  await api.registerAccount({}); await api.verifyEmail("fixture"); await api.resendVerification("fixture@example.test"); assert.equal(calls.length, 3);
  // 使用真实 loginAccount 提取令牌，避免直接修改模块闭包来伪造登录状态。
  // 正常资料读取应该发送网络请求，否则收紧策略会误伤正式账号。
  // clearAccountForGuest 在浏览器中只清内存，调用计数必须保持不变。
  await api.loginAccount({}); await api.getAccountProfile(); assert.equal(calls.length, 5); await api.clearAccountForGuest();
  assert.equal((await api.browserAuthorizedRequest("/collections/public")).status, 401); assert.equal(calls.length, 5);
  // 写业务也必须零调用，与主进程的全部方法限制保持一致。
  // 最后一次计数检查能发现 request 构造阶段偷发网络但仍返回本地 401 的实现。
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) assert.equal((await api.browserAuthorizedRequest("/images", method, {})).status, 401); assert.equal(calls.length, 5);
  let clears = 0;
  // Electron 清理成功与失败使用独立模块，不让之前的浏览器内存影响结果。
  // 这里验证桥接返回值处理；真正主进程清除由 verifyMain 独立覆盖。
  // clearAccountForGuest 返回的 Promise 必须等 IPC 结果，不能提前完成。
  const desktop = load("apps/next/src/api/account.ts", { "@/utils/ipcResult": { unwrapIpc: unwrap } }, { window: { electronAPI: { accountEnterGuest: async () => { clears++; return { success: true }; } } } });
  await desktop.clearAccountForGuest(); assert.equal(clears, 1);
  const broken = load("apps/next/src/api/account.ts", { "@/utils/ipcResult": { unwrapIpc: unwrap } }, { window: { electronAPI: { accountEnterGuest: async () => ({ success: false }) } } });
  await assert.rejects(broken.clearAccountForGuest(), /fixture IPC failure/);
}
// 顶层等待所有异步断言，不让 pending 请求在进程退出时被默默丢弃。
// 先当前/旧格式，再主进程及浏览器权限，以便失败时区分数据迁移和网络边界。
// 无需清理用户文件，也不停止任何 Electron 或 ComfyUI 进程。
// 摘要中的零后端请求只适用于游客业务调用；登录注册请求按设计确实发送。
// catch 是唯一失败出口，断言或模块初始化失败都以非零状态返回。
(async () => { verifyRecords(); await verifyMain(); await verifyBrowser(); await verifyLateResponses(); console.log("PASS: permanent/legacy guest records, local credential isolation, zero guest backend requests, auth flow, late login/refresh rejection and browser parity"); })().catch(error => { console.error(error); process.exitCode = 1; });
