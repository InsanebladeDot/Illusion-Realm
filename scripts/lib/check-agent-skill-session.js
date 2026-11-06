/**
 * 用本机 HTTP 夹具代替语言模型 API，执行真正的 Agent→Python→宿主技能工具往返。
 * 这不是模型能力评测：每一步工具选择由夹具指定，不花 token，也不访问外部模型服务。
 * 生产 runner、OpenAI 客户端、MCP 会话、宿主调度和正文读取全部保持真实实现。
 * 夹具分两轮：直接读基础指南、返回五秒动作示例，不遍历技能目录。
 * 每轮检查收到的上下文，确保系统提示和上轮工具结果真实进入下一轮模型请求。
 * 第一次只看工具声明不够，后续请求必须包含来自真实文件的对应格式字段。
 * 只监听 127.0.0.1 随机端口，不开放局域网服务，不读取用户实际 API 密钥。
 * 临时密钥通过测试进程环境注入 runner，最后恢复原值，不能写入配置或凭据文件。
 * Python 与 MCP 依赖来自项目既有运行时解析规则，缺失时应如实报前置环境错误。
 * 不假造视频生成函数或文件，不把提示词链路通过说成已经推理生成视频。
 */
const assert = require("node:assert/strict"), http = require("node:http");
const {startAgentRun,cancelAgentRun} = require("../../apps/electron/src/main/modules/agent/runner");
/**
 * 验证模型请求里的工具与上下文，而不是只统计发生过多少次 HTTP 调用。
 * 第一轮必须同时看到技能工具声明与新系统提示，保证发现入口真实可用。
 * 后续轮次检查最后一条 tool 消息，它应当是上一轮真实宿主工具的 JSON 文本。
 * 第二轮要求基础指南的精确字段，证明附属资料真实经过宿主回填。
 * 最后回答轮必须传 tool_choice=none，只有自然语言劝模型停止不能通过。
 * 两轮预算都用于真实请求，不额外追加第三轮模型总结掩盖超额。
 * content 是宿主返回的原始文字，JSON.parse 失败会明确暴露协议或结果形状错误。
 * 不检查外部参考图像，因为本轮只是文本技能读取，未开放视觉或媒体上传接口。
 * @param {number} phase 当前请求序号，从零开始
 * @param {{messages:Array<{role:string,content:string}>,tools:Array<{function:{name:string}}>,tool_choice:string}} body 兼容 API 请求
 */
function inspectRequest(phase,body) {
  // 工具清单由真实 runner 构造，模型侧必须同时看到“列出”和“读取”两个入口。
  // 只检查系统提示的关键约束，不复制整个字符串与生产文本逐字互相锁死。
  // 空工具结果或普通说明不是基础指南 JSON，解析失败应保留失败信号。
  // 最后一条工具消息按实际角色筛选，不假设它总是 messages 的固定下标。
  // 第一轮没有工具结果，所以只能验证声明和系统约束，后续才验证资料正文。
  // 已知资料入口直接读取仍须通过白名单，不通过虚构目录回执代替读取。
  // 基础指南的三个字段是格式约定，至少验证两个能区分错误文件的关键字段。
  // 这里不要求模型自主写出高质量提示词，夹具只检验输入上下文真实可用。
  assert.ok(body.tools.some(tool=>tool.function.name==="list_agent_skills"));assert.ok(body.tools.some(tool=>tool.function.name==="read_agent_skill"));
  assert.match(body.messages[0].content,/nextOffset/);assert.match(body.messages[0].content,/没有视频执行工具/);
  // 同时核对速记与 API 模式：系统指南负责少查，none 负责最后不再查。
  // 夹具明确选择一次读取，不能据此证明真实 Grok 总能自行选对工具。
  // 实际问题原文需要在工具往返后继续保留，避免恢复为旧的八秒示例。
  assert.match(body.messages[0].content,/MiniMax H3 基础速记/);assert.equal(body.tool_choice,phase ? "none" : "auto");
  assert.equal(body.messages.filter(message=>message.role==="user").at(-1).content,"若我要一个酷炫的5s动作，你怎么帮我写提示词？");
  if(!phase)return;
  const previous=JSON.parse(body.messages.filter(message=>message.role==="tool").at(-1).content);
  // 技能 ID 与文件都来自真实返回，不能只凭正文碰巧包含字段就当成读对文件。
  // 图片标签校验仍留在正式指南中，不为加快回答删掉原文或改写其摘要。
  // 基础手册长度低于读取上限，单次读取应明确返回 nextOffset=null。
  assert.equal(previous.skill,"h3-prompt-writing");assert.equal(previous.file,"references/base-en.txt");assert.equal(previous.nextOffset,null);
  assert.match(previous.content,/integrated_multimodal_description/);assert.match(previous.content,/non_diegetic_music/);
}
/**
 * SSE 消息采用 OpenAI 客户端真实消费的 chat.completion.chunk 形状。
 * 工具参数是 JSON 字符串，生产 Agent 将按流式 tool_calls 拼接并执行。
 * 返回一次合法资料调用后给最终文字，不能在第一轮谎称技能已经读取。
 * 已知基础资料路径无需先读目录和入口，缩短到两次模型往返。
 * limit 使用正式上限 24000，以便这个基础指南一次读完，无需模拟额外续读回合。
 * 具体分页连续性由 verify-agent-skills 的短分块拼接测试另行覆盖。
 * finish_reason 只用于客户端兼容，不代替真正的工具结果或最终回答判定。
 * 最终文字明确没有执行视频生成，避免测试输出被当成真实媒体产物。
 * @param {number} phase 当前轮次
 */
function responseDelta(phase) {
  // 工具调用 id 每轮不同，真实 HostBridge 仍使用自己的请求 id 关联宿主返回。
  // arguments 必须序列化为字符串，不能把对象直接塞进 OpenAI delta 字段。
  // 附属参考文件直接通过已知 skill id 定位，仍经过该技能白名单。
  // 没有调用虚构的 hub_generate_video，也没有用 generate_image 伪装视频步骤。
  // 最终文字是可复制的五秒示例，不再仅返回“已读取技能”这类过程说明。
  // 请求未带参考图，使用基础三字段，不编造 Picture 或 Audio 输入。
  // 声景和配乐各自描述，动作起落点覆盖用户要求的完整五秒。
  // 本例是模拟模型正文，不能用于证明真实云模型的动作质量或自然语言理解。
  // 明确说明未执行生成，避免把路径链路测试包装成视频已完成。
  const call={name:"read_agent_skill",arguments:{skill:"h3-prompt-writing",file:"references/base-en.txt",limit:24000}};
  return phase===0 ? {tool_calls:[{index:0,id:"fixture-skill-base",type:"function",function:{name:call.name,arguments:JSON.stringify(call.arguments)}}]} : {content:"integrated_multimodal_description: [Shot 1] 2D anime, a fighter crouches from 0 to 1 seconds, dashes and spins from 1 to 4 seconds, then lands by 5 seconds.\noverall_soundscape: Rain, footsteps and a sword whoosh.\nnon_diegetic_music: A rising electronic pulse.\n尚未执行视频生成。"};
}
/**
 * HTTP 请求以 JSON 收集，所有断言异常都在回调内转成 500 响应并记录到 state。
 * 不能让一个断言从事件回调直接抛出，造成测试进程崩溃却没有正常回收子进程。
 * state 保存第一个真实错误，主流程结束时优先报告它，便于直接定位缺失上下文。
 * 限制请求体为一 MiB，对本轮几个小文本工具结果已足够，不接受不受控输入。
 * chunk 长度按字节累计，不能因 Buffer 转字符串的时机不同漏算边界。
 * 请求地址与 POST 方法固定，防止客户端误走其他服务路由还被万能响应掩盖。
 * 每次响应结束都带 [DONE]，让 OpenAI 客户端不会一直等待下一个流片段。
 * 请求期间不记录 Authorization 内容；测试凭据不进入输出或文件。
 * @param {{phase:number,error:Error|null}} state 本轮服务状态
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 */
function serve(state,request,response) {
  // 保留原始 Buffer，不能在每个 TCP 分块单独解码 UTF-8，中文字符可能跨块。
  // 收完后统一拼接解码，确保请求体分片方式不改变 JSON 内容或中文系统提示。
  // 超限时立即销毁请求，不继续缓冲一个本不应出现的大型数据体。
  // 模拟服务只返回数据，不读取磁盘资料；资料依旧经真正宿主工具进入上下文。
  // phase 在合法响应前推进，重复的客户端重试不能被错误地当成同一轮成功。
  // 500 不返回完整断言堆栈，详细错误保存在测试 state 中供主流程报告。
  // localhost 地址及一次性端口由操作系统分配，不会覆盖用户真实 ComfyUI 服务。
  const chunks=[];let size=0;
  request.on("data",chunk=>{size+=chunk.length;if(size>1024*1024)request.destroy();else chunks.push(chunk);});
  request.on("error",error=>{state.error=error;});
  request.on("end",()=>{
    // 最多两次请求，任何额外查询都返回失败并由 state 保存具体断言。
    // 因此执行器不能靠提高 maxSteps 或重试第三次请求把本测试糊过去。
    // 最后完整 SSE 结束标记仍由同一服务代码产生，不用断连接伪造收尾。
    try {assert.equal(request.method,"POST");assert.equal(request.url,"/v1/chat/completions");assert.ok(state.phase<2);inspectRequest(state.phase,JSON.parse(Buffer.concat(chunks).toString("utf8")));const delta=responseDelta(state.phase++);response.writeHead(200,{"Content-Type":"text/event-stream"});response.end(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",created:0,model:"fixture",choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: [DONE]\n\n`);}
    catch(error) {state.error=error instanceof Error?error:new Error("fixture");response.writeHead(500);response.end("Fixture validation failed");}
  });
}
/**
 * sender 接收真实 runner 事件，测试只等待 final/error，不用页面计时或 rAF 驱动。
 * 二十秒上限限制本地模拟模型往返；没有真实采样，不能套用 GPU 生成耗时估计。
 * 事件中只有一次基础资料调用，随后必须交付示例而不是新的查询。
 * 结束后取消尚存 runId，只针对本轮测试的子进程，不清理用户其他 Electron 或 Python。
 * 测试密钥写在进程环境只是隔离手段，不代表生产环境把密钥给了渲染端。
 * server.closeAllConnections 回收 HTTP keep-alive，防止测试结束后空等连接超时。
 * 所有成功断言在 finally 清理之前，清理错误也会让调用者的 Promise 失败。
 * 服务监听地址使用实际分配端口，不能假定某个固定端口未被用户应用占用。
 * 这里没有调用 startAgentRun 的 fakeLlm 模式，是真实兼容 API 客户端读取模拟 SSE。
 * 夹具不验证模型会自主选择正确技能，只验证工具链、系统提示和返回上下文可用。
 * 返回轮数供外层检查报告，不把内存状态或服务对象暴露给生产模块。
 * @returns {Promise<number>} 实际完成的模型请求轮数
 */
async function checkAgentSkillSession() {
  // startAgentRun 会启动真正 Python 并建立 MCP 子连接，fixture API 只替代语言模型服务。
  // 环境密钥优先于磁盘凭据，因此测试不会因为用户是否保存真实 key 而改变执行路径。
  // previous 可能为空或未定义，恢复时必须区分原本不存在与一个存在但为空的变量。
  // 明确提供本机 baseUrl，所以生产默认远端地址不参与这一轮请求。
  // maxSteps=2 只留一次资料往返与一次回答，低于默认四轮仍应正常完成。
  // timer 只负责本轮测试，不修改 runner 的全局十余分钟运行超时规则。
  // sender 只收本轮 run 的事件，不挂到应用窗口，也不修改消息 store。
  // 出现 error 帧同样结束等待，让环境失败能够尽快以具体原因返回。
  // 如果 HTTP 断言记录了更具体的错误，优先抛它，避免只看到笼统模型请求失败。
  // 单次 tool_result 证明读取确实拿到了正式文件回执，不是只有调用意图。
  // 清理时只取消当前 runId，不能使用按进程名杀死所有 Python 的粗糙方式。
  // server 最后等待 close 完成，防止进程退出时遗留监听句柄或把端口泄漏给下一轮。
  const state={phase:0,error:/** @type {Error|null} */(null)},events=[],server=http.createServer((request,response)=>serve(state,request,response));
  const previous=process.env.ILLUSION_AGENT_API_KEY;let runId="";
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",()=>resolve(undefined));});
  try {
    process.env.ILLUSION_AGENT_API_KEY="fixture-local-only";const address=server.address();assert.ok(address&&typeof address!=="string");
    // 采用用户原句，不追加“必须读技能”来替产品的咨询策略制造前置条件。
    // 服务端模型仍是脚本化夹具，真正读文件和保留回答轮来自正式运行器。
    // 所有配置只作用于此测试进程，不保存为用户 Agent 的实际偏好。
    let timer;const finished=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error("Agent skill session timed out")),20000);const started=startAgentRun({sender:{send:(_channel,event)=>{events.push(event);if(event.type==="final"||event.type==="error")resolve(event);}},options:{question:"若我要一个酷炫的5s动作，你怎么帮我写提示词？",config:{baseUrl:`http://127.0.0.1:${address.port}/v1`,maxSteps:2}}});assert.ok(started.ok,JSON.stringify(started));runId=started.runId;});
    let final;try {final=await finished;} finally {clearTimeout(timer);}
    // 同时核对正式 final、请求次数和动作正文，不能只看有一次成功读取就通过。
    // 返回提示词需要三个字段与五秒落点，通用预算说明不满足这些断言。
    // 实际工具数仅一次，目录与角色库都没有参与这个咨询流程。
    // 事件与 HTTP 请求来自独立观察点，可发现 Python 内部额外往返或桥重复执行。
    // 没有视频生成调用，因此不把最终文字中的“动作”当成真实视频产物。
    // 回收 runId 在 finally 完成，即使正文断言失败也不遗留测试子进程。
    if(state.error)throw state.error;assert.equal(final.type,"final",JSON.stringify(final));assert.equal(state.phase,2);assert.match(final.text,/尚未执行视频生成/);
    assert.match(final.text,/integrated_multimodal_description:[\s\S]*5 seconds[\s\S]*overall_soundscape:[\s\S]*non_diegetic_music:/);
    assert.deepEqual(events.filter(event=>event.type==="tool_call").map(event=>event.name),["read_agent_skill"]);assert.equal(events.filter(event=>event.type==="tool_result").length,1);return state.phase;
  } finally {if(runId)cancelAgentRun(runId);if(previous===undefined)delete process.env.ILLUSION_AGENT_API_KEY;else process.env.ILLUSION_AGENT_API_KEY=previous;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
// 测试只导出一个入口，HTTP 服务与模拟状态不进入应用运行代码。
// 此检查调用真实 Python 运行时；环境缺少 mcp/openai 时应先修复测试前提。
// 调用方统一统计通过组数与退出码，这里不自行打印成功或吞掉断言错误。
module.exports = { checkAgentSkillSession };
