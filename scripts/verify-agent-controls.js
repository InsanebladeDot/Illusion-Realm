/**
 * Agent 角色查询与停止边界的无网络回归。
 * 角色 HTTP 仅替换 fetch，解析、归一化和工具映射全部使用正式实现。
 * 停止测试仅替换子进程，不执行真实 taskkill，更不会终止用户进程。
 * 测试不验证上游角色资料准确性，也不声称真实模型遵守所有语义提示。
 * Python 循环、时间预算和真实进程树各有独立配对回归。
 */
const assert = require('node:assert/strict'), { EventEmitter } = require('node:events'), { PassThrough } = require('node:stream');
const { queryCharacters } = require('../apps/electron/src/main/modules/agent/character-tools');
const tick = () => new Promise(resolve => setImmediate(resolve));

/**
 * 验证复用的请求确实指向 Animadex，并限制返回八个候选。
 * URLSearchParams 检查中文与作品编码，避免简单字符串拼接破坏查询。
 * 同名候选要求确认，单候选才允许进入后续回答。
 * 空结果同样要确认，不能假装已识别用户所需角色。
 * tags 与 trigger 保留原值，推荐 LoRA 只返回名字，不当作已安装清单。
 * 刻意给许多 tag，检查摘要截断，防止无界结果扩大云端上下文。
 * 空查询必须在 fetch 之前拒绝，不允许模型借空字符串列举整站。
 * HTTP 失败必须拒绝 Promise，不能用空结果冒充一次成功查询。
 * fetch 在 finally 恢复，后续测试不会继承角色服务替身。
 * 数据均在内存生成，不访问私人文件或真实角色端点。
 * 参数作品是用户明确给出的字符串，本测试不模拟译名猜测。
 * total 来自站点总数，不能用本页数组长度推断是否唯一。
 * returned source 不含本机路径，避免把目录混入查询结果。
 * 断言针对执行返回值，不通过搜索函数源码推断行为存在。
 * 这里只验证宿主协议，歧义后硬性结束由 Python fixture 负责。
 */
// 缩略图链接不交给模型，角色身份确认不需要下载二进制资源。
// 返回 tag 上限二十四只缩小上下文，不改动创建页的完整数据。
// 推荐 LoRA 名称用于下一次本地查询，不直接把上游 URL 当作下载授权。
// 单候选验证使用同一 HTTP 归一化，防止只在 mock 返回值上添加确认标记。
// 空查询的计数对照确保拒绝发生在网络请求之前。
// 所有 fetch 断言由生产 searchCharacters 调用触发，不是测试直接拼 URL。
// 模拟 503 只检查错误可见性，不声称生产服务器曾发生故障。
// args 的前后空格应规范化，角色中文不能被错误强转为空值。
// 此组专门覆盖保留的在线来源，显式 source 避免误测默认离线目录。
// 本地四属性与空字段另由 verify-character-reference 读取真实内置数据验证。
// 模拟网络数据只证明在线兼容行为，不冒充本地八千条资料验证。
async function checkCharacters() {
  const original = global.fetch; let calls = 0, total = 2;
  global.fetch = async url => { calls++; const parsed = new URL(url); assert.equal(parsed.origin, 'https://animadex.net'); assert.equal(parsed.searchParams.get('q'), '爱丽丝'); assert.equal(parsed.searchParams.get('copyright'), '作品'); assert.equal(parsed.searchParams.get('page_size'), '8'); return Response.json({ total, results: total ? [{name:'Alice',copyright_name:'Work',trigger:'alice',tags:Array(30).fill('tag'),loras:[{name:'recommended'}]}] : [] }); };
  try {
    const result = JSON.parse(await queryCharacters({source:"online",query:' 爱丽丝 ',copyright:'作品'})); assert.equal(result.needsConfirmation,true); assert.equal(result.characters[0].trigger,'alice'); assert.equal(result.characters[0].tags.length,24); assert.deepEqual(result.characters[0].suggestedLoras,['recommended']);
    total=0; assert.equal(JSON.parse(await queryCharacters({source:"online",query:'爱丽丝',copyright:'作品'})).needsConfirmation,true);
    total=1; assert.equal(JSON.parse(await queryCharacters({source:"online",query:'爱丽丝',copyright:'作品'})).needsConfirmation,false);
    const before = calls; await assert.rejects(queryCharacters({source:"online",query:''})); assert.equal(calls,before);
    global.fetch = async () => new Response('',{status:503}); await assert.rejects(queryCharacters({source:"online",query:'爱丽丝'}),/503/);
  } finally { global.fetch = original; }
}

/**
 * 假 child 提供真实 Node 字节流，runner 仍按换行解析 NDJSON。
 * 测试不直接调用 emit 私有函数，因此可捕获取消后解析迟到帧的回归。
 * spawn/runtime/tool 三个边界均在 require runner 之前替换。
 * child 不提供 PID，正式 killProcessTree 只调用假 kill，绝不运行 taskkill。
 * 宿主工具挂起至取消之后才返回，验证晚到的图片与 stdin 回执都被丢弃。
 * 取消前先确认工具确已开始，避免测成“根本没启动”的恒真结果。
 * 在途工具不可撤销已发生的副作用，本断言只验证后续转发隔离。
 * 取消后额外写入 host_request，必须不再调用任何宿主实现。
 * answer_delta 与 final 都迟到，任何一帧泄漏都应让事件数断言失败。
 * 再次取消返回 false，与首次成功撤销的 true 区分。
 * 清理显式发送 exit 并 cancelAll，防止测试遗留十二分钟计时器。
 * 替换的模块导出在 finally 恢复，不污染同进程后续检查。
 * payload 可能包含环境凭据，所以只比较写入次数，不打印内容。
 * sender 只收集本次窗口事件，不引入广播或额外 preload 能力。
 * 被测代码仍是真实 runner：activeRuns、解析、工具执行和回执路径均未替换。
 * kill 次数确认后台终止入口确实执行，而非单纯冻结 UI。
 * 真实操作系统进程树另由 verify-agent-events 的慢流用例验证。
 * 测试没有把 process.exitCode 与 app.quit 混用，失败直接设置非零退出。
 * 相同工具的早到与迟到请求构成正反对照，确保门槛不是永远关闭。
 * stdout 的每帧都有完整换行，避免半行缓冲偶然遮蔽取消错误。
 * 事件在 setImmediate 之后断言，给异步工具完成和管道消费明确机会。
 * 不依赖固定一秒等待，减少机器速度差异造成的假通过。
 * 旧运行的退出不会触发成功 final，cancelled 路径维持用户主动停止的语义。
 * 无真实文件输出、网络请求或生图任务参与本例。
 */
// 取消之前至少有一帧正常答复，可排除 emit 永久关闭造成的伪通过。
// 第一项工具已挂起，取消后的 resolve 专门测试 await 之后的存活检查。
// 第二项工具请求在取消后才出现，专门测试 await 之前的执行检查。
// 两种门槛缺一都会让此测试出现不同断言失败，有助于定位错误。
// images 的值只是标记，不会写入硬盘，更不会在 UI 中加载真实图片。
// child.stdin 使用真实流捕获写入次数，不能只检查 sender 的事件数量。
// 事件帧中既有 answer_delta 也有 final，防止仅过滤增量而放过最终覆盖。
// activeRuns 删除后再次取消 false，证明不是仅给 child 打了 killed 标记。
// 旧进程 exit 触发真实 finish，清理协议通道和 watchdog。
// 手动清理只针对自己构造的假 child，没有全局进程枚举。
// Module cache 失效确保 runner 读取的是替换后的 spawn 方法。
// 单元结束删除缓存，后续加载可重新读取已恢复的原始依赖。
// 若在 runner 初始化前失败，Node 会报告异常并退出非零，不输出假 PASS。
// 工具参数中不含本地路径，终端断言失败也不会泄露用户文件位置。
// fakeLlm 配置只隔离凭据，不会切换 runner 的事件转发实现。
// 凭据解析在本例不是目标，因此用透明替身防止访问真实安全存储。
// IPC handler 范围校验由真实 Chromium 回归继续覆盖。
// 当前测试结果只说明停止门槛有效，不代表所有宿主任务都可撤销。
async function checkStop() {
  const cp = require('node:child_process'), locate = require('../apps/electron/src/main/modules/agent/locate'), host = require('../apps/electron/src/main/modules/agent/host-tools');
  // Node 没有 Electron.app，凭据解析边界在本例保持纯配置透传。
  // 不读取开发机 .env 或安全存储，避免测试依赖真实账号状态。
  // 真正 provider 选择由既有 provider 契约回归验证，本例专注取消门槛。
  const provider = require('../apps/electron/src/main/modules/agent/provider-run-config'); const resolveConfig = provider.providerRunConfig; provider.providerRunConfig = config => config;
  const originals = {spawn:cp.spawn,resolve:locate.resolveAgentRuntime,find:host.findHostTool}; let kills=0, toolCalls=0, release;
  const child = new EventEmitter(); Object.assign(child,{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:()=>{kills++;return true;}});
  const events=[],writes=[]; child.stdin.on('data',data=>writes.push(data)); cp.spawn=()=>child; locate.resolveAgentRuntime=()=>({command:'mock',args:[],cwd:process.cwd()});
  host.findHostTool=()=>({run:()=>{toolCalls++; return new Promise(resolve=>{release=resolve;});}});
  const runnerPath=require.resolve('../apps/electron/src/main/modules/agent/runner'); delete require.cache[runnerPath]; const runner=require(runnerPath);
  const frame=value=>child.stdout.write(JSON.stringify(value)+'\n');
  try {
    const handle=runner.startAgentRun({sender:{send:(channel,payload)=>events.push(payload)},options:{question:'test',config:{fakeLlm:true}}}); assert.equal(handle.ok,true);
    frame({type:'answer_delta',step:1,text:'before'}); frame({type:'host_request',id:'one',name:'query',arguments:{}}); await tick(); assert.equal(events.length,1); assert.equal(toolCalls,1);
    assert.equal(runner.cancelAgentRun(handle.runId),true); const count=writes.length;
    frame({type:'answer_delta',step:1,text:'late'}); frame({type:'final',text:'late',steps:1}); frame({type:'host_request',id:'two',name:'query',arguments:{}});
    release({result:'late',images:['ignored.png']}); await tick(); assert.equal(events.length,1); assert.equal(writes.length,count); assert.equal(toolCalls,1); assert.equal(kills,1); assert.equal(runner.cancelAgentRun(handle.runId),false);
  } finally { runner.cancelAllAgentRuns(); child.emit('exit',0); provider.providerRunConfig=resolveConfig; cp.spawn=originals.spawn; locate.resolveAgentRuntime=originals.resolve; host.findHostTool=originals.find; delete require.cache[runnerPath]; }
}

// 串行执行，fetch 与进程替身的作用域互不交叉。
// 失败打印断言而不输出 payload，对凭据和用户目录保持隔离。
// 顶层 catch 把任何异步错误转换为退出 1，CI 不会误判通过。
// 通过消息仅描述模拟覆盖范围，不冒充外部服务实测。
checkCharacters().then(checkStop).then(()=>process.stdout.write('PASS Agent character query and cancellation boundaries\n')).catch(error=>{console.error(error);process.exitCode=1;});
