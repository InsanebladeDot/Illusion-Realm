/**
 * user-data：从 storage 取得主进程 JSON 文档读写能力。
 * model-download-network：复用下载专用会话和网络传输约束。
 * user-data：只迁移实现位置，版本合并与默认值仍由渲染侧负责。
 * model-download-network：下载连接策略属于主进程，页面不自行读取 Cookie 或认证头。
 * user-data：读文档时的路径解析继续委托统一根目录，不能改成模块旁的文件。
 */
/**
 * 单个Electron生命周期的下载恢复夹具，由父脚本串行启动并共享一个临时目录。
 * 每次运行重新加载真实下载manager，跨进程没有内存Map、Promise或旧owner可以复用。
 * 只替换隔离Session的HTTPS响应，文件传输、ETag处理、hash和原子队列写入都走生产代码。
 * userData与模型根均来自父进程临时目录，不能碰真实账户或现有模型。
 * 第零阶段的app.exit刻意绕过正常挂起，模拟进程被结束后的检查点恢复。
 * 第一阶段的suspendDownloads覆盖正常关闭时取消网络、关闭句柄并保存最终断点。
 * 两种退出方式后都必须恢复同一任务编号，不重新创建新下载来掩盖旧记录丢失。
 * 最终文件逐字节验证，确保续传不是把两个完整文件拼接或仅修改任务状态。
 */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), { EventEmitter } = require("node:events"), { createHash } = require("node:crypto");
const { app } = require("electron"), [root, port, phaseText] = process.argv.slice(2), phase = Number(phaseText);
app.disableHardwareAcceleration(); app.setPath("userData", path.join(root, "browser"));
const userData = require("../../apps/electron/src/main/storage/user-data");
userData.readUserData = () => ({ data: { settings: { paths: { searchPath: root } } }, filePath: "", isNew: false });
const manager = require("../../apps/electron/src/main/modules/models/downloads/model-download-manager"), { getDownloadSession } = require("../../apps/electron/src/main/modules/models/downloads/model-download-network");
const owner = Object.assign(new EventEmitter(), { id: 900 + phase, isDestroyed: () => false, send: () => undefined }), body = Buffer.alloc(1024 * 1024, 42);
const request = { modelType: "LORA", baseModel: "SDXL", modelName: "Persistence", fileName: "seed.safetensors", category: "", sha256: "", previewUrl: "", downloadUrl: "https://civitai.red/api/download/models/1?token=fixture-token-must-not-persist&format=SafeTensor" };
const tasks = () => manager.listDownloads(owner.id), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
/**
 * 有界主进程轮询，不使用页面rAF，也不需要一个可见窗口才能推进下载。
 * 等待条件读取manager真实状态，不能注入received或强制设为completed。
 * 超过六秒直接失败，避免网络错误或恢复失效时脚本无限等待。
 * 父脚本另有进程时限，两层看门狗分别定位业务等待与整个阶段卡死。
 * @param {()=>boolean} condition
 */
async function wait(condition) { for (let i = 0; i < 300; i++) { if (condition()) return; await delay(20); } throw new Error("download restart condition timed out"); }
/**
 * 任务必须真实进入completed，失败或取消不能结束等待并被误判为成功。
 * 等待后比较模型字节，与服务器固定夹具完全一致才算完成。
 * SHA为空的任务依赖HTTP验证器续传，完整字节比较是独立的反证通道。
 * @param {string} id
 */
async function completed(id) { await wait(() => tasks().find(task => task.id === id)?.status === "completed"); const task = tasks().find(task => task.id === id); assert.deepEqual(fs.readFileSync(task.filePath), body); return task; }
/**
 * 恢复后任务应为cancelled并有可用断点，不能保留downloading假装网络仍在运行。
 * received必须等于实际.part长度，退出前节流进度不是恢复偏移的权威来源。
 * 部分字节严格小于文件全长，避免已经完成的任务碰巧通过断点判断。
 * @param {string} name
 */
function partial(name) {
  const task = tasks().find(item => item.fileName === name); assert.equal(task.status, "cancelled");
  assert.ok(task.received > 0 && task.received < body.length); assert.equal(task.bytesPerSecond, 0); assert.equal(task.received, fs.statSync(path.join(task.folderPath, ".download-" + task.id + ".part")).size); return task;
}
/**
 * 夹具准备与身份约束：
 * owner由EventEmitter模拟WebContents事件接口，仅send为空操作，不伪造任务执行结果。
 * 每个阶段owner编号不同，恢复函数必须把旧记录重新绑定到当前调用者。
 * manager.listDownloads仍按owner过滤，如果只是照搬旧编号会返回空列表。
 * 读取设置只提供临时模型根目录，生产downloadTarget负责解析loras分类路径。
 * 不手工创建.part；只有writeModel实际打开并写入服务器字节后才会出现断点。
 * seed、crash和graceful同属一个模型目录，验证队列不是按目录误合并任务。
 * 三个文件名分别独立，文件归属与移除边界可以互相作对照。
 * 请求只有稳定Civitai模型入口，Session转发不会改变manager保留的来源地址。
 * URL里的固定token不具有真实权限，父进程用它验证落盘公开请求的脱敏。
 * format参数必须保留，说明脱敏没有把公开格式选择一起丢掉。
 * 未设置previewUrl，避免把封面网络成功与模型续传混成一个测试命题。
 * 真实下载任务仍会调用生产sidecar提交函数，测试不绕过最终文件提交。
 * 强制退出阶段的断言：
 * seed完整下载后再建立crash任务，确保已完成与下载中记录同时进入下一份快照。
 * 下载中进度超过64KiB但尚未达到1MiB，保证存在可用而未完成的前缀。
 * app.exit立刻结束Electron，不运行suspendDownloads，也不执行主应用before-quit保存。
 * 下一进程必须依据传输前和响应头后的检查点找到这个未正常收尾的任务。
 * 恢复字节从.part读取，不要求等于退出前最后一次节流事件中的received。
 * 在新进程检查速度为零，避免旧运行速度被误认为仍有网络活动。
 * 继续请求保持同一task.id，不能新建任务后把旧孤立文件留在原地。
 * 第一轮完成后立刻比较整个文件内容，排除重新命名空文件或只切状态的实现。
 * 正常挂起阶段的断言：
 * gr​​aceful请求包含完整SHA-256，生产writeModel会重哈希保留前缀与新收到的后缀。
 * 挂起等待job.running结束，保证网络中止和文件句柄关闭已完成。
 * 挂起后的partial检查与下次启动相同，直接证明正常收尾保存的是可恢复暂停状态。
 * 下一阶段重试仍须返回completed并逐字节匹配服务器内容。
 * 如果文件句柄未关闭，Windows中的继续或清理操作可能失败，跨阶段会暴露此问题。
 * 移除与历史阶段的断言：
 * 移除seed是已完成记录，不允许删除seed.safetensors模型文件。
 * 删除后manager应返回true，并且队列写入完成后才退出进程。
 * 最后一次启动必须恰好剩两条completed记录，而不是空列表或重新出现三条。
 * 剩余两条记录逐个读取成品，历史列表不能仅保留元信息而丢掉文件。
 * 最后阶段仍调用suspendDownloads，确保测试不在尚有写入链时随意退出。
 * 边界与失败处理：
 * 等待completed不接受failed作为可替代终态，下载异常必须使阶段超时并失败。
 * 所有wait都有六秒上限，本地服务器断开不能让测试永久挂起。
 * Electron启动失败会被父进程三十秒上限发现，不由本夹具伪造通过输出。
 * 顶层catch打印测试异常并退出1，不经过可能把process.exitCode丢掉的app.quit。
 * 测试路径可以出现在隔离失败诊断中，但不引用用户真实模型或账户目录。
 * 夹具不依赖DOM、CSS或主题，不能把界面截图通过当作文件持久化通过。
 * 强制退出只结束当前测试进程，父进程HTTP服务继续存活供下一阶段使用。
 * 网络服务每次重新接收连接，续传证明跨进程请求恢复而不是复用旧TCP会话。
 * 本测试不模拟操作系统断电或存储硬件故障，结论限于进程退出和文件系统可用。
 * 阶段编号来自父脚本固定序列，未知参数不会由生产应用读取或暴露给用户。
 * 阶段零先完成seed，再启动crash任务；两种状态同时存在于同一持久化快照。
 * crash任务不提供SHA，恢复必须依赖保存的ETag与If-Range，不能只靠hash分支通过。
 * 观察到部分进度后直接退出，保留打开传输所创建的.part，模拟未调用正常退出钩子。
 * 阶段一用新owner认领任务，证明旧WebContents编号不会把恢复记录隐藏掉。
 * 续传完成后创建graceful任务并提供SHA，覆盖另一条安全续传判据。
 * 正常挂起会等待文件关闭并保存cancelled，下一阶段仍须从同一.part继续。
 * 阶段二完成graceful后移除seed记录，必须保留seed模型内容。
 * 阶段三只读取恢复历史，应仅有两个完成任务，不得让seed记录复活。
 * 每阶段完成都等待适用的持久化边界，异常由顶层catch转为非零退出码。
 * 所有任务都在最大三个并发限制内，测试没有放宽生产并发规则。
 * 模拟服务器只提供模型字节，不覆盖真实Civitai认证、封面下载与来源UI展示。
 * 原有verify-model-downloads继续覆盖这些现有功能，本夹具专注跨进程持久化。
 */
async function checks() {
  const session = getDownloadSession(); session.protocol.handle("https", input => globalThis.fetch(`http://127.0.0.1:${port}/model`, { headers: input.headers, signal: input.signal }));
  await manager.restoreDownloads(owner);
  if (phase === 0) {
    assert.equal(tasks().length, 0); await completed(manager.startDownload(owner, request).id);
    const task = manager.startDownload(owner, { ...request, fileName: "crash.safetensors" }); await wait(() => tasks().find(item => item.id === task.id).received > 65536);
  } else if (phase === 1) {
    assert.equal(tasks().length, 2); assert.equal(tasks().find(task => task.fileName === "seed.safetensors").status, "completed");
    const old = partial("crash.safetensors"), resumed = await manager.retryDownload(owner.id, old.id); assert.equal(resumed.id, old.id); await completed(old.id);
    const task = manager.startDownload(owner, { ...request, fileName: "graceful.safetensors", sha256: createHash("sha256").update(body).digest("hex") }); await wait(() => tasks().find(item => item.id === task.id).received > 65536);
    await manager.suspendDownloads(); partial("graceful.safetensors");
  } else if (phase === 2) {
    assert.equal(tasks().length, 3); const old = partial("graceful.safetensors"); await manager.retryDownload(owner.id, old.id); await completed(old.id);
    const seed = tasks().find(task => task.fileName === "seed.safetensors"); assert.equal(await manager.removeDownload(owner.id, seed.id), true); assert.deepEqual(fs.readFileSync(seed.filePath), body); await manager.suspendDownloads();
  } else { assert.equal(tasks().length, 2); assert.ok(tasks().every(task => task.status === "completed" && task.fileName !== "seed.safetensors")); for (const task of tasks()) assert.deepEqual(fs.readFileSync(task.filePath), body); await manager.suspendDownloads(); }
  console.log("PASS real Electron restart phase", phase); app.exit(0);
}
app.whenReady().then(checks).catch(error => { console.error(error); app.exit(1); });
