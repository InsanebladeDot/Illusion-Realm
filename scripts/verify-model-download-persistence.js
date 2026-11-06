/**
 * 下载持久化跨进程回归的父进程，真实启动四次Electron，复用隔离磁盘与本地HTTP服务。
 * 不用require.cache模拟重启：每个阶段都有新的jobs Map和WebContents拥有者编号。
 * 第零阶段强制退出，覆盖没有before-quit收尾时仍能恢复传输前检查点的情况。
 * 第一阶段恢复并续传，再建立另一个任务通过正式suspendDownloads执行正常挂起。
 * 第二阶段续传正常挂起的任务，移除一条完成记录并检查不会删除成品。
 * 第三阶段确认完成记录保留、已移除记录不复活，队列落盘结果跨重启稳定。
 * 本地HTTP服务模拟200、206、ETag及分块传输，不访问Civitai或消耗真实下载额度。
 * HTTPS仅在子进程隔离下载Session内转发，生产URL允许集和网络安全代码不修改。
 * 子进程使用真实manager、文件提交和SHA-256实现，不替换持久化函数返回成功。
 * Range记录保留在父进程，能独立验证新进程确实发出断点请求而非重新从零下载。
 * 测试图片和模型均为临时字节夹具，不读取账户用户文档或用户模型目录。
 * 认证参数使用固定无权限字符串，只用来验证公开队列不会泄露URL凭据。
 */
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const http = require("node:http"), { promisify } = require("node:util"), { execFile } = require("node:child_process");
const executable = require("electron"), run = promisify(execFile);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-download-restart-")), body = Buffer.alloc(1024 * 1024, 42), ranges = [];
/**
 * 每次请求生成一条独立发送定时器，连接关闭必须取消，避免旧进程继续消耗测试资源。
 * 首次无Range返回完整200；恢复有Range时只发送offset之后的字节并提供精确Content-Range。
 * 固定强ETag让无SHA请求也能安全续传，If-Range应与此值一致。
 * 每二毫秒发送16KiB，使测试可在完整文件结束前可靠观察到部分数据。
 * 最终文件逐字节比较，错误拼接或忽略range都不能靠状态completed蒙混。
 * 本服务未模拟真实互联网超时、代理或账号授权，相关安全回归仍由原有网络专项覆盖。
 * @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res
 */
function serve(req, res) {
  const offset = Number(/^bytes=(\d+)-$/.exec(req.headers.range || "")?.[1] || 0);
  if (offset) ranges.push({ offset, validator: req.headers["if-range"] });
  res.writeHead(offset ? 206 : 200, { "Content-Type": "application/octet-stream", "Content-Length": body.length - offset, ETag: '"restart-fixture"', ...(offset ? { "Content-Range": `bytes ${offset}-${body.length - 1}/${body.length}` } : {}) });
  let position = offset;
  const timer = setInterval(() => { res.write(body.subarray(position, position + 16384)); position += 16384; if (position >= body.length) { clearInterval(timer); res.end(); } }, 8);
  res.on("close", () => clearInterval(timer));
}
/**
 * 阶段输入来自同一个root，但每次Electron都独立从磁盘读取正式JSON。
 * 父进程不向子进程传任务对象，只传临时根、监听端口和阶段编号。
 * 任务id由生产randomUUID创建，父脚本不伪造固定id或预先创建队列文件。
 * 第一阶段结束时有一条已完成记录和一条传输中记录，覆盖混合队列。
 * 第二阶段恢复原任务后又正常挂起新任务，避免只测试一种退出路径。
 * 第三阶段移除的只是第一条记录，最终留下两条真实完成的历史。
 * 第四阶段没有新下载，纯粹证明磁盘清单决定下一次列表内容。
 * 若程序只在内存保留Map，第一轮重启就会因为条目数不符失败。
 * 若程序只保存界面任务却未保存原临时文件名，actual partial与任务id检查会失败。
 * 若程序只保存received未检查真实文件，partial长度断言会揭示最后写入与事件节流的差别。
 * 若保存了任务但丢失validator，无SHA任务无法发出正确If-Range，父进程会拒绝。
 * 如果重试总是从零开始，父进程ranges数量不是两条，不能得到通过结果。
 * 如果206拼接偏移错误，最终文件逐字节比较会失败，即使UI已经显示completed。
 * 如果移除记录仅操作本地store，最后一阶段会再次看到seed并失败。
 * 如果清理把成品一起删除，第二阶段之后的文件读取会直接失败。
 * 认证串检查读取整个正式JSON，不能靠界面没有显示token通过。
 * 服务器验证器使用带引号的强ETag，验证落盘与读取没有破坏HTTP头原文。
 * 父进程只接受两条续传请求，额外重试或重复launch也会被计数揭示。
 * 每个offset必须严格小于全长，防止发出bytes=全长-却实际重下仍被误判。
 * 父进程不根据子进程输出文本决定通过，退出码和独立磁盘/请求断言共同决定结果。
 * 子进程stderr即使只包含普通Chromium信息也保留显示，不把错误输出悄悄丢掉。
 * 服务绑定127.0.0.1与随机端口，避免暴露测试接口到局域网或依赖固定端口空闲。
 * 请求只包含测试常量与Range头，不发送真实账户Authorization。
 * 所有内容字节一致，因此最终哈希与字节比较可重复，不使用随机样本造成偶发差异。
 * 真实来源重定向、网络代理与限速不属于本机服务器的验证结论。
 * 正常挂起使用生产导出的suspendDownloads；主应用before-quit负责调用它的连接代码另经类型检查。
 * 这里不声称已操作用户当前客户端的关闭按钮或重启了其真实会话。
 * 只启动测试Electron进程，不终止用户正在运行的Electron实例。
 * 失败时留存的root便于检查.part和JSON配对，不能把失败现场当作用户冗余文件清理。
 * server.closeAllConnections确保测试失败也会关掉仍在发送部分文件的连接。
 * 这些回归专门验证持久化因果链，不能用一次成功完整下载替代跨进程测试。
 * 最终完成历史保留策略与用户允许全部保留的选择一致。
 * 串行执行四个阶段，前一进程真正退出后才启动下一进程，不背靠背并行跑Electron冒烟。
 * 每个子进程的userData和模型路径都在本测试root里，不使用用户正在运行的应用实例。
 * execFile直接传参数数组，临时路径含空格时也不会被shell重新解释。
 * 每阶段上限三十秒，子进程异常或超时让父检查失败，不能把缺失结果当作通过。
 * 子进程每阶段会执行具体文件/状态断言，stdout仅用于显示对应实际阶段结果。
 * 全阶段后读取正式队列，独立确认版本号、条目数与清理结果。
 * 公开队列不得包含固定token字符串，防止仅在UI中隐藏凭据而磁盘仍保留它。
 * 两次续传应分别发送If-Range，第一条无SHA任务尤其依赖跨进程保留的ETag。
 * 每次offset应在零与文件全长之间，不能通过完整重下载产生假断点成功。
 * server在finally关闭，失败路径也不保留监听端口或活跃传输定时器。
 * 临时夹具保留供检查，测试不递归删除磁盘目录。
 * 顶层catch设置非零退出码，适合直接放入CI或独立运行。
 */
async function main() {
  const server = http.createServer(serve); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    for (const phase of [0, 1, 2, 3]) {
      const result = await run(executable, [path.join(__dirname, "fixtures/model-download-restart.cjs"), root, String(server.address().port), String(phase)], { timeout: 30000, env: { ...process.env, ILLUSION_CIVITAI_SECRET_DIR: path.join(root, "secrets") } });
      process.stdout.write(result.stdout); if (result.stderr) process.stderr.write(result.stderr);
    }
    const text = fs.readFileSync(path.join(root, "browser/model-download-queue.json"), "utf8"), queue = JSON.parse(text);
    assert.equal(queue.version, 1); assert.equal(queue.jobs.length, 2); assert.ok(queue.jobs.every(job => job.task.status === "completed")); assert.ok(!text.includes("fixture-token-must-not-persist"));
    assert.equal(ranges.length, 2); assert.ok(ranges.every(item => item.offset > 0 && item.offset < body.length && item.validator === '"restart-fixture"'));
    console.log("PASS download persistence: crash restart, graceful suspension, Range/If-Range, completed history and durable removal");
    console.log("DOWNLOAD_RESTART_FIXTURE", root);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
