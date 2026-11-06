/**
 * runner：直接调用 Agent 的 NDJSON 运行与事件转发实现。
 * agent.handlers：复用 Agent 的参数校验与 IPC 注册。
 * icon.png：图像样本改从统一 assets 目录读取。
 */
/**
 * Agent 图片传输回归：正式 runner → stdin → Python → OpenAI HTTP 请求。
 * 本机 HTTP 替身捕获真正发送的 JSON，不使用假模型跳过 SDK 序列化。
 * 不访问 Euzhi，不使用真实账户，不代表线上视觉权限或识图质量已验证。
 * 测试图片来自应用图标，不读取用户照片；密钥和文档使用临时隔离目录。
 * 先验证当前图片，再验证历史追问，最后检查非法数据被主进程拒绝。
 * 任一断言失败显式退出非零，服务器与仍在运行的子进程在 finally 关闭。
 */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-agent-vision-contract-'));
// 即使开发机已配置真实 key，本轮也不能读取或覆盖它。
// 所有 HTTP 认证使用固定测试值；stdout 不输出完整请求和图片字节。
// runner 的旧内部 loopback 路径保留，仅为本测试，不通过 renderer 暴露任意地址。
process.env.ILLUSION_AGENT_SECRET_DIR = root; delete process.env.ILLUSION_AGENT_API_KEY;
const { startAgentRun, cancelAgentRun } = require("../apps/electron/src/main/modules/agent/runner");
const { validateRunArgs } = require("../apps/electron/src/main/modules/agent/agent.handlers");
// handler 模块只用于 Electron IPC 校验，不在 Node 中注册 ipcMain。
// validateRunArgs 可以纯调用；测试确认图片约束实际接在生产入口上。
// 两张不同格式的内容用相同 PNG MIME，仅测试图片字节而不依赖文件名。
const image = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, "../apps/electron/assets/icon.png")).toString('base64');
const second = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let runId = '', requests = [];
/**
 * 只监听回环地址，外部网络不能把真实用户请求发送进这个测试服务器。
 * 捕获 OpenAI SDK 最终 JSON，能发现 Python 丢弃图片或改成普通路径的错误。
 * SSE 只返回固定文字，模拟协议收尾，不模拟模型真的理解了图片。
 * 第二次调用使用同一服务器，历史附件不能被缓存假象代替。
 */
const server = http.createServer((request, response) => {
  // Python 使用的是真正 AsyncOpenAI，测试不能只断言 JS payload 中出现 images。
  // SDK 最终会把用户 content 序列化成 JSON，这正是此前尚未验证的边界。
  // 请求路径必须为 chat/completions，误用 Responses 格式会立即失败。
  // 固定假 key 的认证头证明请求走到了预期本地客户端配置，而非开发机 .env。
  // 回环监听仅为测试使用，正式 renderer 的 endpoint 仍受 provider 允许集约束。
  // 接收完整正文后才 JSON.parse，覆盖 base64 跨多个流片段的实际情况。
  // 不把请求正文逐行打印，测试图片也应遵循避免把图像内容写入日志的惯例。
  // 请求捕获保存在内存数组，finally 关闭服务后进程退出即释放。
  // 只返回两段最小流式事件，排除模型随机回答对传输断言的影响。
  // 第一段有 content、第二段 finish_reason=stop，模拟正式 SDK 的常见收尾形态。
  // [DONE] 标记结束事件流，不以断开 TCP 连接代替正常协议完成。
  // 返回体不包含 image_url，因此前端收到图片字节只能来自错误的回显。
  // 服务器异常返回四百而非伪造成功，Python 应产生 error 帧使测试失败。
  // 本替身不模拟服务商限额、内容检查、视觉识别或真实收费。
  // 两轮图片请求使用独立 Agent 运行，每轮都必须重新经过 stdin 和 HTTP。
  // 分块拼接真实请求体，不假定大图 data URL 恰好在一个 TCP chunk 内。
  // 断言只比较固定 fixture，不将任何收到的 Authorization 写入日志。
  // 错误返回 JSON 并结束连接，避免测试异常让 Python 永久等待。
  let body = ''; request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    try {
      assert.equal(request.url, '/v1/chat/completions'); assert.equal(request.headers.authorization, 'Bearer vision-test-key'); requests.push(JSON.parse(body));
      const frame = (delta, finish_reason) => 'data: ' + JSON.stringify({ id: 'vision-test', object: 'chat.completion.chunk', created: 0, model: 'grok-4.7', choices: [{ index: 0, delta, finish_reason }] }) + '\n\n';
      response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end(frame({ content: 'vision fixture accepted' }, null) + frame({}, 'stop') + 'data: [DONE]\n\n');
    } catch { response.writeHead(400); response.end('{}'); }
  });
});
/**
 * 运行完整 Python sidecar，等到正式 final/error 事件，不直接调用消息构造器。
 * 等待有三十秒上限，任何错误帧都应失败，不能把有进程退出当作成功。
 * 每轮保留 runId 供 finally 取消，避免失败后遗留 MCP 进程。
 * baseUrl 是本地替身，provider 省略使用旧内部调用兼容路径。
 */
async function execute(images, history = []) {
  // 当前问题固定是普通文本，图片存在与否成为唯一变化维度。
  // 历史参数从测试传给正式 runner，没有直接调用 Python 内部函数来冒充串联。
  // 所有事件由真正 stdout 解码转发，final 不是测试在 collector 中自行追加的。
  // 等待 final 之前不读取 requests，防止只启动进程就过早宣布成功。
  // 三十秒预算高于本地 MCP 初始化正常耗时，又能暴露无响应连接。
  // 检查 error 帧与 final 帧两个条件，不能把先失败后错误收尾的运行算通过。
  // cancelAgentRun 仅回收当前测试 runId，不枚举操作系统中的其他 Python。
  // 收尾清空 runId，外层 finally 只取消尚未完成的运行。
  // 事件输出不应包含 data:image；输入图与生成图片产物属于不同方向的契约。
  // apiKey 在这里是固定内部 fixture，生产 IPC 仍拒绝 renderer 传入 apiKey。
  // maxSteps 限为两轮，但服务器不要求工具调用，所以一次模型回复即可结束。
  // 正式 hostTools 清单仍随 payload 传输，未删除现有工具以制造特殊测试实现。
  // allowedRoots 未扩大，没有授权本地模型读取用户任意目录。
  // 模型 ID 保持 Grok，测试验证接口格式，不将其他模型行为当成 Grok 识图结论。
  // 第三次执行传空数组，用独立请求证明文本兼容路径也能跑到最终事件。
  // 文本响应固定，不需要通过自然语言猜测模型“看见”了什么。
  // 正式图片转标准 image_url 块发生在 Python，JS 只传 images 字段。
  // 如果 stdio 入口仍只读取 question/history，HTTP 图片断言会明确失败。
  // 如果 core.stream 仍构造字符串 content，HTTP 图片断言同样失败。
  // 如果 SDK 序列化修改了图片数据，解码后原字节比较会发现差异。
  // 整个测试链路无外部域名请求，不消耗真实模型额度。
  // sender 捕获的是正式事件通道，图片内容不应反射到这条输出流。
  // 主进程 payload 仍会覆盖 hostTools，测试不伪造一份与正式不同的工具清单。
  // 原始输入图只进入 messages，不作为工具生成图片产物返回。
  const events = [], address = server.address();
  const result = startAgentRun({ sender: { send: (_channel, event) => events.push(event) }, options: { question: 'describe fixture', images, history, config: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'vision-test-key', model: 'grok-4.7', maxSteps: 2 } } });
  assert.equal(result.ok, true); runId = result.runId;
  const deadline = Date.now() + 30000;
  while (!events.some(event => event.type === 'final' || event.type === 'error') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(events.some(event => event.type === 'final')); assert.ok(!events.some(event => event.type === 'error'));
  assert.ok(!JSON.stringify(events).includes('data:image/')); cancelAgentRun(runId); runId = '';
}
/**
 * 当前双图必须解码后逐字节等于原图，不能只检查 image_url 键存在。
 * 第二轮不附新图，通过历史图片继续提问，最后一条 user 应恢复普通字符串。
 * 无图运行作为负向对照，证明实现没有将所有消息一律改成错误的数组结构。
 * IPC 负向覆盖 blob/路径、非法角色、超数量，避免新通道跳过输入验证。
 */
async function main() {
  // 端口由系统分配，不占用用户的 ComfyUI 或开发服务器端口。
  // 最终服务商路由另由 provider 专项覆盖，本测试验证标准 HTTP 内容而非线上权限。
  // 断言必须在真实请求出现之后执行，空 requests 不得被当作零项通过。
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    // 双图正向：不同数据 URL 必须保留顺序，不能只保留数组第一张。
    // 第二张是一像素 PNG，第一张是应用图标，避免两张完全一致掩盖重复首图错误。
    // 用户文字应成为数组的第一个 text 块，而不是与 base64 拼接成字符串。
    // 先比较两个完整 URL，再比较第一张的解码字节，分别覆盖结构与内容。
    // 原始 Buffer 从应用资源读取，不由被测代码生成期望值。
    // 第二轮保持系统消息在索引零，所以第一条历史用户消息应在索引一。
    // 历史助手消息必须仍为普通文本，不应被套上用户图片结构。
    // 新 user 消息不含图片时 content 应是字符串，不能重复继承上一条图片。
    // 历史图片仍存在说明继续讨论“上一张图”时有实际视觉上下文。
    // 第三轮无历史且无新图，作为完全纯文本的独立对照。
    // 当前与历史的区分不能仅由数组长度推断，要断言准确的消息位置。
    // 正向 IPC 用合法 data URL 证明校验器没有无条件拒绝所有新图片。
    // blob 负向对应修复前的浏览器预览地址，远端无法读取它。
    // file 负向保证不能把用户磁盘路径作为远端图像 URL 泄露。
    // HTTP 负向防止新增能力变成任意第三方图片抓取器。
    // 九图负向使用每张均合法的数据，只检验数量上限而非 MIME 恰好失败。
    // system 历史负向不带图片，确保角色保护不是仅对有图片分支生效。
    // assistant 图片负向使用合法 PNG，单独检验角色与图片方向的约束。
    // 每项 negative 都调用生产 validateRunArgs，不能测试未被运行入口使用的 helper。
    // 负向不启动 sidecar，非法输入必须在任何模型 HTTP 请求之前被拒绝。
    // summary 在所有正负断言完成后输出，不能被最后一次普通请求成功覆盖早期错误。
    // 没有断言图片语义，所以测试结果不会被描述成“Grok 已识别应用图标”。
    // 本地服务器只证明真实发送格式，线上服务商的模型权限仍需要真实 API Key。
    // 未来若改成 Responses API，这份 chat/completions 对照必须随传输契约同步更新。
    // 主进程依旧拥有 key 注入，测试没有修改 providerRunConfig 的固定站点策略。
    // 测试不会写入用户的默认密钥目录，临时目录通过环境变量定向在本进程生效。
    // 不删除测试夹具目录，失败时仍可核查已使用的图像源文件。
    // finally 对成功和失败都执行，不能因为 assert 抛出而留下监听端口。
    // 捕获的是服务端 JSON 结果，测试中不会调用代理或图床来使 blob 地址“可见”。
    // 图片字符串比较保留大小写和所有 padding，不进行可能掩盖损坏的模糊匹配。
    // 这里的固定 fake 凭据不作为产品文档中的用户配置示例。
    await execute([image, second]); const content = requests[0].messages.at(-1).content;
    assert.equal(content[0].text, 'describe fixture'); assert.deepEqual(content.slice(1).map(part => part.image_url.url), [image, second]);
    assert.deepEqual(Buffer.from(content[1].image_url.url.split(',')[1], 'base64'), fs.readFileSync(path.join(__dirname, "../apps/electron/assets/icon.png")));
    await execute([], [{ role: 'user', content: 'first image', images: [image] }, { role: 'assistant', content: 'first answer' }]);
    assert.equal(requests[1].messages[1].content[1].image_url.url, image); assert.equal(requests[1].messages.at(-1).content, 'describe fixture');
    await execute([]); assert.equal(requests[2].messages.at(-1).content, 'describe fixture');
    assert.equal(validateRunArgs([{ question: 'valid', images: [image] }]), null);
    for (const images of [['blob:local'], ['file:///private.png'], ['https://invalid.example/a.png'], Array(9).fill(second)]) assert.ok(validateRunArgs([{ question: 'invalid', images }]));
    assert.ok(validateRunArgs([{ question: 'invalid', history: [{ role: 'system', content: 'inject' }] }]));
    assert.ok(validateRunArgs([{ question: 'invalid', history: [{ role: 'assistant', content: 'invalid', images: [second] }] }]));
    console.log('PASS Agent vision: exact HTTP image bytes, two images, image history, text compatibility and IPC rejection');
  } finally { if (runId) cancelAgentRun(runId); await new Promise(resolve => server.close(resolve)); }
}
// 测试只在全部 await 和断言完成后返回，任何异常设置非零退出码。
// 不输出捕获请求对象，避免将未来误传的真实凭据或图像写到控制台。
// 独立临时目录留作调查，不清理用户目录或其他 Electron 窗口。
main().catch(() => { console.error('FAIL Agent vision contract'); process.exitCode = 1; });
