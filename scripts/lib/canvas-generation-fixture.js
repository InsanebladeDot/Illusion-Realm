// 自动回归的外部服务边界：真实本机HTTP替代ComfyUI，固定图片替代模型推理。
// preload、工作流构建、队列、元数据保存与画布复制均继续使用生产代码。
// 不读取用户密钥，也不访问收费图片接口；这不是实际模型质量或性能证据。
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { nativeImage } = require("electron");
const { registerHandle } = require("../../apps/electron/src/main/ipc/result");
const C = require("../../apps/electron/src/common/ipc-channels").IPC_CHANNELS;

// 测试把外部服务边界放在 HTTP 上，产品仍必须走 preload 与真实主进程处理器。
// JSON 辅助器只写服务响应，不包装 Electron 的 IpcResult。
// 如果把两种封装混用，生产 ComfyUI 客户端会看不到 prompt_id。
// 状态码参数用于构造真实提交失败，不能总是返回二百再只在正文写 error。
// 响应结束后不会再发送第二份结果，因此每条路由都必须 return 当前处理。
// 服务器不设置浏览器 CORS 通行证，因为访问者是生产主进程 HTTP 客户端。
// 此夹具不允许渲染层直接请求它来绕过 IPC。
// 返回的 JSON 没有用户模型权重，仅含模板名字与测试任务元数据。
// 服务错误由正式处理器转成标准失败，测试不直接向节点注入错误提示。
// 接口存在不证明真实 ComfyUI 自定义节点已经安装，这一点需在报告分开说明。
function json(response, value, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(value));
}
// 这里消费真实请求流，能发现生产适配器忘记序列化 JSON 的问题。
// 只有 JSON 路由调用此函数，上传图片的 multipart 流在自己的路由单独消费。
// 将 multipart 强行 JSON.parse 会把正确上传误判为产品失败。
// 请求体来自隔离本机测试，不从用户密钥或生产服务捕获回放。
// 解析失败会走服务器 catch，返回五百并让产品按失败处理。
// 夹具不吞掉非法正文并回一个空成功对象。
// 字节累计为文本只适用于这些小工作流请求，不能推广为产品大媒体读写方案。
// 生产上传器对文件大小的限制仍在正式实现，这个测试服务不是安全校验替身。
// 服务收到多少真实 POST 由 state.requests 记录，不能用预期数量填充成功计数。
// 同一进程关闭服务后这些内存记录消失，不写入用户工程或任务历史。
async function body(request) {
  let text = "";
  for await (const chunk of request) text += chunk;
  return JSON.parse(text);
}

// 从版本化模板读取真实资源名，夹具不能把错误模型静默替换成另一个名字。
// 模型列表只证明解析匹配，不把这些文件名当作真正加载过的权重。
// 模型枚举取自三个真实工作流文件，避免夹具在另一份硬编码表里漏掉编辑默认 LoRA。
// 读取的是 API 图的 inputs，而不是可视化节点标题。
// unet_name 和 ckpt_name 都被收集，使 Anima 与 SDXL 可以各自解析真实模板身份。
// clip_name 与 vae_name 保障辅助加载器前置检查仍真实执行。
// lora_name 必须包含图片编辑模板依赖，不能用无扩展的假图绕过编辑模型检查。
// 集合允许跨类别重名，因为测试只验证路径匹配，不模拟完整模型仓库的分类隔离。
// 真实服务类别校验仍由独立合同测试和主进程实现保护。
// 模板改名后夹具会随受版本控制的数据变化，不从用户磁盘扫描不确定文件。
// 路径相对仓库固定目录，运行从根目录进行，错误路径必须导致用例失败。
// 这里读取 JSON 不能被误报为加载过 safetensors 权重。
// 文件内容没有改写，后续各请求仍通过生产构建器生成独立 prompt。
// 列表用于前置模型解析，结果图像是后面明确标注的固定媒体夹具。
// 同名路径精确匹配与 basename 回退的完整反证由原编辑验证脚本覆盖。
// 本专项重点是 UI 到真实队列的链路，不再手写第二份资源解析算法。
// 模型不存在时产品应在上传前失败，夹具列表只让正常 golden 具备这一前提。
function modelNames() {
  const files = ["videoWorkflower/minnimax/minimax h3 图生视频-首尾帧.json", "videoWorkflower/minnimax/minimax h3 参考视频.json", "utillswWorkflower/Seedvr2_upscaled_image/utility_seedvr2_3b_int8_upscale_video.json","audioWorkflower/MiniMax_Audio/Audio_Minimax.json", "audioWorkflower/MiniMax_Audio/Audio_Reference_Minimax.json", "utillswWorkflower/Seedvr2_upscaled_image/utility_seedvr2_7b_int8_upscale_image.json", "imageWorkflower/Anima/标准anima生成流.json", "imageWorkflower/SDXL/标准SDXL生成.json", "imageWorkflower/Moss_Image/文生图.json", "utillswWorkflower/AnimaEdit2.json", "utillswWorkflower/Minimax_h3_image/image_p_h3_image_edit.json"];
  return files.flatMap(file => Object.values(JSON.parse(fs.readFileSync(path.resolve("apps/next/src/data/comfy", file), "utf8"))))
    .flatMap(node => Object.entries(node.inputs).filter(([key]) => /^(unet_name|clip_name|vae_name|lora_name|ckpt_name)$/.test(key)).map(([, value]) => value));
}

// 结果图片具有本次工作流要求的真实像素；不能用1×1返回值自证2K输出已验证。
// 视觉内容来自已有PNG夹具，缩放由测试服务执行，明确不代表真实AI推理。
// 提交用例必须先有真实 prompt，不能只要调用生成就预先给出结果路径。
// fail 分支故意返回四百，验证正式 HTTP 错误跨 IPC 后保留已有节点媒体。
// 失败不会进入 requests，后续计数只表示被测试服务接受的任务。
// ID 按接收顺序递增，便于对应 history、view 和取消请求。
// hold 在接收时冻结到任务对象，后续切回 normal 不应让已挂起任务自动成功。
// 尺寸从实际 prompt 中读取，不能从测试自己准备的预期常量生成结果自证正确。
// 普通图读取 EmptyLatentImage，编辑图读取实际 edit-scale。
// 如果生产漏传目标尺寸，nativeImage 缩放或后续像素断言会失败。
// 参考链已删除空 latent，因此这个分支可发现仍使用旧无效尺寸节点的错误。
// 输入 PNG 是仓库已有真实文件，不从网络下载不可重复素材。
// 输出由 Electron 图像编码器写成真实 PNG 字节，而非仅改文件名为 png。
// resize 明确采用请求中的两边，后续真实解码可以查出二千档确实进入请求。
// 这不证明模型生成质量，也不证明真实 GPU 能承受对应像素预算。
// 两千像素返回图可以大于原夹具，测试服务缩放不属于产品生成逻辑。
// state 持有 bytes 让 view 路由下载，产品仍须完成自己的保存与 Meta 写入。
// 没有直接把 bytes 放入节点，避免绕过生产任务结果筛选。
// 同一请求在 history 中只完成一次，不能因为轮询多次产生重复文件。
// 取消标志初始 false，由真实 queue 或 interrupt 路由改变。
// 服务不创建客户端对象 URL，临时预览资源仍由原执行器拥有。
// 任务接受只回 prompt_id，不能提前假装文件已经保存到受管目录。
async function submit(state, request, response) {
  const { prompt } = await body(request);
  if (state.mode === "fail") return json(response, { error: "fixture failure" }, 400);
  const upscale = !!prompt["66:57"];
  state.events.push({ type: "prompt", upscale });
  if (upscale && state.failUpscale) return json(response, { error: "upscale fixture failure" }, 400);
  const id = `canvas-fixture-${state.requests.length + 1}`;
  const nodes = Object.values(prompt);
  if (nodes.some(node => node.class_type === "SaveVideo") && process.env.CANVAS_TASKS_SMOKE === "1") {
    state.requests.push({ id, prompt, bytes: fs.readFileSync(path.resolve("scripts/fixtures/video-composition/video.mp4")), held: state.mode === "hold", cancelled: false });
    return json(response, { prompt_id: id });
  }
  if (nodes.some(node => node.class_type === "SaveVideo") && state.videoUpscale) {
    state.requests.push(await state.videoUpscale.submit(prompt, id, state.mode === "hold" || state.holdUpscale));
    return json(response, { prompt_id: id });
  }
  if (nodes.some(node => node.class_type === "PreviewAudio")) {
    state.requests.push({ id, prompt, bytes: fs.readFileSync(path.resolve("scripts/fixtures/video-composition/audio.wav")), held: state.mode === "hold", cancelled: false });
    return json(response, { prompt_id: id });
  }
  const size = upscale ? { width: state.lastUploadSize.width * prompt["66:57"].inputs["resize_type.multiplier"], height: state.lastUploadSize.height * prompt["66:57"].inputs["resize_type.multiplier"] } : nodes.find(imageLatent)?.inputs ?? prompt["edit-scale"]?.inputs ?? prompt["6"]?.inputs;
  const bytes = nativeImage.createFromPath(path.resolve("scripts/fixtures/video-composition/image.png")).resize({ width: size.width ?? Math.round(Math.sqrt(size.megapixels * 1e6) / 32) * 32, height: size.height ?? Math.round(Math.sqrt(size.megapixels * 1e6) / 32) * 32 }).toPNG();
  state.requests.push({ id, prompt, bytes, held: state.mode === "hold" || upscale && state.holdUpscale, cancelled: false });
  json(response, { prompt_id: id });
}

// 轮询、下载和取消走真实HTTP路由，任务ID与生产停止逻辑完全一致。
// hold没有假延时成功；只有明确切状态或取消后才结束本次任务。
// 路由匹配使用标准 URL，查询参数与 pathname 分开解析，防止文件名查询污染 history ID。
// 模型查询只提供前置条件，不输出任何生成文件。
// 上传路由消费真实 multipart 字节，uploadBytes 大于零证明产品确实发过参考数据。
// 上传回包包含 name、subfolder 和 type，继续由原上传适配器解释。
// 这个回包不声称测试服务已执行图像编辑算法。
// history 查找本次请求 ID，未知 ID 返回空对象，让生产轮询保持它的真实等待语义。
// held 与 cancelled 都不返回完成输出，不用固定延时自动变成成功。
// 正常 history 的 outputs 键来自提交 prompt 的 PreviewImage 身份。
// 这条身份关系很重要：原编辑执行器只接受自己请求中的预览节点。
// 第一次专项发现夹具写死 preview 键，产品正确拒绝，不应通过放宽产品筛选来迁就夹具。
// 修正夹具编号后才可核对真实编辑链的保存与回填。
// view 返回同一任务已编码字节，Content-Type 用实际 PNG 类型。
// 文件名只在隔离请求数组中查找，不读取用户指定任意路径。
// queue GET 只列仍 hold 且未取消的任务，以原生产取消流程能观察到的形状返回。
// 取消 POST 根据 delete 或 prompt_id 精确设置对应项，不能清除所有请求。
// 这让“停止一项不干扰其他任务”的原规则继续具有实际服务前提。
// 取消后下一次 queue 查询看不到该 ID，生产取消器才能确认停止。
// interrupt 与 queue 共享任务状态，不提供一个立即成功但队列仍在运行的假回包。
// 没有匹配路由返回四百零四，不能以兜底二百掩盖产品使用了错误 endpoint。
// 每个异步路由都由安装入口的 catch 接住，避免服务器未处理拒绝使窗口永久等待。
// response.end 完成后调用栈返回，不建立后台不断推送结果的定时器。
// HTTP 夹具只存在当前 Electron 冒烟进程，一次测试结束关闭全部连接。
// 错误日志可以引用固定 fixture failure 文本，不能输出真实供应商响应或用户凭据。
// 流式上传只累计字节数，不缓存整张参考图片到另一个长期数组。
// 产品保存的 PNG 仍由后续真实文件读取确认，不靠 state.bytes 数量自证落盘。
// 本机服务证明运输链路，真实远端延迟、网络波动与显存占用不在该证据范围。
// 每个批次按真实 history 形状返回多个文件条目，下载仍逐个走 /view。
// Moss 的空画布节点不同，但尺寸和张数仍从该节点读取。
function imageLatent(node) {
  return node.class_type === "EmptyLatentImage" || node.class_type === "EmptyFlux2LatentImage";
}
function outputNames(item, extension) {
  const latent = Object.values(item.prompt).find(imageLatent);
  const count = extension === "png" ? latent?.inputs.batch_size ?? 1 : 1;
  return Array.from({ length: count }, (_, index) => `${item.id}${index ? `-${index}` : ""}.${extension}`);
}

async function serve(state, request, response) {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/object_info/GSVAtomicLoadModel") return json(response, gptSovitsLoaderOptions());
  if (url.pathname.startsWith("/models/")) return json(response, state.names);
  if (url.pathname === "/prompt") return submit(state, request, response);
  if (url.pathname === "/free") { state.events.push({ type: "free", body: await body(request) }); response.writeHead(200); return response.end(); }
  if (url.pathname === "/upload/image") return upload(state, request, response);
  if (url.pathname.startsWith("/history/")) {
    const item = state.requests.find(value => value.id === url.pathname.split("/").pop());
    // history 的输出键必须是提交图中的真实节点 ID；编辑器会拒绝不属于 PreviewImage 的回包。
    // 夹具不能编造 preview 这个键，否则普通图通过、参考编辑却在下载后被正确判为无结果。
    const audio = item && Object.values(item.prompt).some(node => node.class_type === "PreviewAudio");
    const video = item && Object.values(item.prompt).some(node => node.class_type === "SaveVideo");
    const outputId = item && Object.keys(item.prompt).find(id => item.prompt[id].class_type === "PreviewImage" || item.prompt[id].class_type === "SaveImage" || item.prompt[id].class_type === "SaveVideo" || item.prompt[id].class_type === "PreviewAudio");
    if (item?.video && !item.held && !item.cancelled) return json(response, { [item.id]: { status: { completed: true }, outputs: state.videoUpscale.history(item) } });
    const messages = item && process.env.TASK_ELAPSED_SMOKE === "1" ? [["execution_start", { prompt_id: item.id, timestamp: 100000 }], ["execution_success", { prompt_id: item.id, timestamp: 128700 }]] : undefined;
    if (!item || item.held || item.cancelled) return json(response, {});
    // GPT-SoVITS 模板以 PreviewAudio 结尾，历史文件来自临时目录。
    const type = Object.values(item.prompt).some(node => node.class_type === "GSVAtomicSynthesize") ? "temp" : "output";
    const files = outputNames(item, audio ? "wav" : video ? "mp4" : "png").map(filename => ({ filename, subfolder: "", type }));
    return json(response, { [item.id]: { status: { completed: true, messages }, outputs: { [outputId]: { [audio ? "audio" : video ? "videos" : "images"]: files } } } });
  }
  if (url.pathname === "/view") {
    if (state.videoUpscale && url.searchParams.get("type") === "input") return serveVideoInput(state, response, url);
    const filename = url.searchParams.get("filename");
    const item = state.requests.find(value => outputNames(value, path.extname(filename ?? "").slice(1)).includes(filename));
    const video = Object.values(item.prompt).some(node => node.class_type === "SaveVideo");
    const audio = Object.values(item.prompt).some(node => node.class_type === "PreviewAudio");
    // 夹具拒绝用 output 读取临时音频，保证生成链确实使用了 history 的文件类别。
    if (Object.values(item.prompt).some(node => node.class_type === "GSVAtomicSynthesize") && url.searchParams.get("type") !== "temp") return json(response, { error: "Wrong audio folder type" }, 404);
    response.writeHead(200, { "Content-Type": audio ? "audio/wav" : video ? "video/mp4" : "image/png" });
    return response.end(video && !item.video ? fs.readFileSync(path.resolve("scripts/fixtures/video-composition/video.mp4")) : item.bytes);
  }
  if (url.pathname === "/queue" && request.method === "GET") return json(response, { queue_running: state.requests.filter(item => item.held && !item.cancelled).map(item => [1, item.id]), queue_pending: [] });
  if (url.pathname === "/queue" || url.pathname === "/interrupt") {
    const data = await body(request);
    state.requests.filter(item => data.delete?.includes(item.id) || data.prompt_id === item.id).forEach(item => { item.cancelled = true; });
    return json(response, {});
  }
  json(response, {}, 404);
}

// 两种插件返回格式都走真实 IPC，默认与替代权重来自同一个加载节点。
function gptSovitsLoaderOptions() {
  return { GSVAtomicLoadModel: { input: { required: {
    gpt: ["COMBO", { options: ["GPT_SoVITS/pretrained_models/s1v3.ckpt", "GPT_weights/fixture.ckpt"] }],
    sovits: [["GPT_SoVITS/pretrained_models/v2Pro/s2Gv2ProPlus.pth", "SoVITS_weights/fixture.pth"]],
  } } } };
}

/** 输入预览也读取刚上传的真实分段，不能把源预览伪装成超分结果。 */
async function serveVideoInput(state, response, url) {
  response.writeHead(200, { "Content-Type": "video/mp4" });
  response.end(await state.videoUpscale.readInput(url.searchParams.get("filename")));
}

// 宿主初始化完成后才写入隔离用户配置，避免产品连到用户自己的ComfyUI。
// 测试根目录独立，生产文件处理器保存的图库也不会进入正式用户目录。
// 先监听系统分配的空闲端口，避免写死八千一百八十八与用户自己的 ComfyUI 冲突。
// 服务实际地址写入独立游客文档，产品按原设置水合读取。
// 输出目录放在本次 root/gallery，不能回落到用户正式作品目录。
// 原用户文档由宿主预先准备，安装器只调整本专项需要的设置。
// 真实文件处理器接管保存，不能保留原外壳空 handler 冒充生成图片落盘。
// 真实 Comfy 处理器接管模型列表、上传、生成和停止。
// registerHandle 会移除同名旧处理器，避免重复注册导致测试初始化失败。
// 默认输出路径也指向隔离 gallery，覆盖用户未设置路径时的合法回退。
// 远端夹具在窗口加载前安装，首个生成动作不会访问真实收费服务。
// 返回 state 供断言读取真实请求，而不是供 UI 直接取测试结果。
// closeAllConnections 避免未结算 HTTP 连接阻止进程退出。
// server.close 停止接受后续请求，测试结束不能留一个后台假模型端口。
// 关服务属于宿主 finally，断言失败也会执行，不依赖总通过分支。
// root 由每次运行新建，前一次保存文件不能让这次假通过。
// 安装期间没有打开资源管理器或系统文件框，因此不宣称人工导入能力验收。
// 读取和改写仅发生在明确 documentPath，测试不会扫描用户 Documents 目录。
// 生产主进程模块边界保持不变，夹具不运行时导入渲染 TS 来替代 handler。
// 真实生成任务的返回形状继续由现有 shared 与 IPC 校验器约束。
// 模型回归失败时应该修产品或服务夹具的错误前提，不能用无条件成功绕过。
// 关闭时保留临时根便于人工复查截图与 PNG，避免失败证据被自动删除。
async function installCanvasGenerationFixture(root, documentPath) {
  const state = { events: [], lastUploadSize: { width: 256, height: 256 }, failUpscale: false, holdUpscale: false, mode: "normal", names: modelNames(), requests: [], remote: [], uploadBytes: 0, uploads: 0 };
  if (process.env.SEEDVR2_SMOKE === "1") state.videoUpscale = require("./seedvr2-video-fixture").create(root);
  const server = http.createServer((request, response) => { void serve(state, request, response).catch(() => json(response, {}, 500)); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const document = JSON.parse(fs.readFileSync(documentPath, "utf8"));
  document.settings.comfyServerUrl = `127.0.0.1:${server.address().port}`;
  document.settings.outputPath = path.join(root, "gallery");
  require("./canvas-task-fixture").installModels(root, document, state);
  if (process.env.CANVAS_AUDIO_SMOKE === "1") require("./canvas-audio-fixture").installAudioModels(root, document, state);
  fs.writeFileSync(documentPath, JSON.stringify(document));
  require("../../apps/electron/src/main/modules/images/files.handlers").registerFileHandlers();
  require("../../apps/electron/src/main/modules/comfy/comfy.handlers").registerComfyHandlers();
  registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => path.join(root, "gallery"));
  await installRemote(state, root);
  return { state, close: () => { server.closeAllConnections(); server.close(); } };
}

// 远端仅替换传输层；请求校验、凭据分区、真实解码、受管目录与取消仍是原实现。
// 隔离密钥是不可用的夹具串，不从环境变量或用户设置借用任何凭据。
// 这类返回值夹具单独报告，不能称为已验证供应商真实尺寸或收费行为。
// 远端专题不访问 euzhi.vip，不读取环境变量里的真实 OPENAI_API_KEY。
// 测试密钥明确不可用，只进入本次隔离凭据根。
// 只替换 transport 的联网动作，其他 handler 校验保持生产实现。
// 请求仍经过真实配置、模式、数量、媒体路径与取消检查。
// PNG 在夹具中先编码成一千零二十四方图，和当前远端契约一致。
// JSON 生成请求与 multipart 编辑请求分别被还原为可检查字段。
// state.remote 记录的是生产真正交给 transport 的 payload，不是测试自己预计的值。
// 信号已取消时立即抛错，不能在测试传输层忽略生产取消语义。
// fail 模式使用固定四百二十九标签，验证原错误分类而不存储供应商敏感正文。
// n 决定返回几张独立数据项，每项仍需生产主进程真实解码并写入文件。
// 重复的固定图内容只模拟传输，不能称为不同 AI 推理结果或多样性验证。
// handler 使用 root/user 的受管资源路径，和真实配置下的画布归属机制相同。
// secretRoot 与 media root 分开，工程导出不能意外包含测试或用户密钥文件。
// 凭据 update 复用生产存储器，确保专用 key 槽位接线而非任意裸头注入。
// 测试不检查固定密钥明文回显，UI 永远不应取得它。
// 只有本进程 require 缓存内模块被替换，用户正在运行的应用不受影响。
// 窗口销毁后进程结束，替换不写回 transport 源码或分发文件。
// 此证据单列为返回值夹具，与前面本机 HTTP 和人工鼠标证据区分。
// 供应商真实模型可用性、费用和分辨率需要真实服务授权测试，不在此宣称。
// 成功落盘数量还会由图节点与受管路径断言交叉检查，避免只看 transport 调用数。
async function installRemote(state, root) {
  const io = require("../../apps/electron/src/main/modules/euzhi-images/transport");
  const bytes = nativeImage.createFromPath(path.resolve("scripts/fixtures/video-composition/image.png")).resize({ width: 1024, height: 1024 }).toPNG();
  const flareUrl = "https://images.example.test/flare.png";
  // 单张 Flare 复现文档的 URL 响应，实际解码和写盘仍由生产代码完成。
  io.download = async (url, signal) => {
    signal.throwIfAborted();
    if (url !== flareUrl) throw Error("unexpected-fixture-url");
    return bytes;
  };
  io.submit = async (endpoint, _key, payload, signal) => {
    const input = typeof payload === "string" ? JSON.parse(payload) : Object.fromEntries(payload);
    state.remote.push({ endpoint, input }); signal.throwIfAborted();
    if (state.mode === "fail") throw Error("http-429");
    if (input.model === "gpt-image-2.5-flare") return { data: [{ url: flareUrl }] };
    return { data: Array.from({ length: Number(input.n) }, () => ({ b64_json: bytes.toString("base64") })) };
  };
  const secretRoot = path.join(root, "secrets");
  require("../../apps/electron/src/main/modules/euzhi-images/credentials").update("not-a-real-key", secretRoot);
  require("../../apps/electron/src/main/modules/euzhi-images/euzhi-images.handlers").registerEuzhiImageHandlers({ root: path.join(root, "user", "Infinite Canvas"), secretRoot });
}

// HTTP 服务与远端传输有意采用不同替代层，二者应在交付记录分别命名。
// 本机 HTTP 会真实覆盖请求流、轮询、下载与取消的传输行为。
// 远端返回值夹具更适合验证专用凭据与生产保存边界，但不覆盖真实互联网连接。
// 测试没有把这两类状态写成生产能力开关，也没有给用户增加一个假服务选项。
// 本地尺寸由请求图读取，远端尺寸由已确认合同固定，不能互相借用证据。
// 普通批量六张在服务端表现为六次逐张请求，远端批量二表现为一次 n=2。
// 这两个计数不同是现有执行器的真实契约，不应为了测试统一而重写产品。
// 文件编码成功但主进程复制失败时，产品应显示失败，本夹具不会手动补文件。
// 服务上传成功但模型列表缺失时，原前置校验仍有权拒绝任务。
// 编辑完成的输出节点身份错误时，也应拒绝，不用夹具成功状态覆盖产品筛选。
// 这些拒绝都是产品保护边界，夹具必须满足合法 golden 而不是要求产品放宽。
// 状态模式只影响未来明确接收的请求，不用短定时器让结果随机变动。
// 取消确认采用可观察队列变化，因此停止路径可以在后台窗口条件下稳定结束。
// 主进程 HTTP 请求不会依赖页面 rAF，避免窗口隐藏后测试服务失去推进。
// 服务关闭不删除文件，失败现场和成功结果都能在隔离根人工复查。
// 任何真实用户文件都不在这个根下，清理也不应扫描或移动它们。
// 假密钥文件仅属于临时 secretRoot，不和用户设置的真实 key 合并。
// 远端服务注册与其他生产注册保持 IpcResult 统一封装，没有裸返回值快捷通道。
// submit 对 signal 的检查不能证明真实服务支持撤销，只证明本地传输适配消费信号。
// 后续如果增加真实服务回归，需要明确授权及独立证据，不能把此夹具改名充数。
// 专项通过不表示整个仓库全部检查通过，门禁与其他原场景要分别报告。
// 本文件没有更改生产 endpoint，发布包始终使用原配置与真实服务。
// 模块导出只暴露安装器，外层不能绕过 HTTP 直接调用内部生成函数伪造成功。
// state 的用途是读取可观察请求记录，不是让测试随意改产品 React 状态。
// 按这条边界保留 fixture，有助于今后识别运输故障与模型语义故障的区别。
module.exports = { installCanvasGenerationFixture };

/** 解析本机夹具的 multipart 图片以确认真实上传尺寸；视频另用固定视频结果，不冒充GPU超分。 */
async function upload(state, request, response) {
  const chunks = [];
  for await (const chunk of request) { state.uploadBytes += chunk.length; chunks.push(chunk); }
  const bytes = Buffer.concat(chunks), marker = bytes.indexOf(Buffer.from("\r\n\r\n"));
  const end = bytes.indexOf(Buffer.from("\r\n--"), marker + 4);
  const name = /filename="([^"\r\n]+\.mp4)"/i.exec(bytes.subarray(0, marker).toString())?.[1];
  if (name && state.videoUpscale) {
    await state.videoUpscale.upload(name, bytes.subarray(marker + 4, end));
    state.uploads++;
    return json(response, { name, subfolder: "fixture-input", type: "input" });
  }
  const audio = /filename="[^"\r\n]+\.(wav|flac|mp3)"/i.test(bytes.subarray(0, marker).toString());
  const image = audio ? null : nativeImage.createFromBuffer(bytes.subarray(marker + 4, end));
  if (image && !image.isEmpty()) state.lastUploadSize = image.getSize();
  state.uploads++;
  json(response, { name: `reference-${state.uploads}.${audio ? "wav" : "png"}`, subfolder: "fixture-input", type: "input" });
}
