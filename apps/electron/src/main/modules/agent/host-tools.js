/**
 * 宿主工具注册表：Agent 能调用的「应用侧能力」都在这里**声明 + 实现**。
 *
 * 为什么放主进程：这些能力（模型扫描、图片 Meta、图库…）在 Electron 侧已经有实现，
 * 在 Python 里重写必然与这边分叉。所以声明经 payload 的 `hostTools` 传给 sidecar
 * （模型据此决定调不调用），实现留在本地：
 *
 *     sidecar → stdout  {"type":"host_request","id":…,"name":…,"arguments":…}
 *     本模块  → stdin   {"type":"host_response","id":…,"ok":true,"result":"…"}
 *
 * **加一个新工具 = 在这里加一条**（声明 + run），不用改 Python、不用改协议。
 *
 * 两种实现形态，按能力落在哪一侧选：
 * - **主进程能自己做完的**（读用户数据、扫目录…）→ `run` 直接返回结果，例如 `list_local_models`；
 * - **能力在渲染层的**（工作流组装、落盘、Meta 内嵌…）→ `run` 调 `callRenderer()` 把活转给
 *   渲染层（`apps/next/src/utils/agentHostTools.ts`），本进程只等回执。主进程是手写
 *   CommonJS，运行期拿不到渲染层的 TS，硬在这里重写就是第二套判据。
 */
const fs = require("fs");

// 总清单和LoRA工具复用一套类别根与来源证据，不再递归后按文件大小猜类别。
// JSON仅公开完整相对名；用户设置路径仍只在本进程中使用。
// 工具桥依旧返回文本，JSON.stringify的结果可直接交给现有sidecar。
const { listModels } = require("./model-catalog");
const { MODEL_QUERY_PROPERTIES } = require("./model-query");
const { IPC_CHANNELS } = require("../../../common/ipc-channels");
// LoRA 的目录发现与兼容性判据集中在独立模块，避免扩张工具注册表职责。
// 它只读取模型类别目录和受限的已有资料，不下载或修改任何模型。
// 工具声明供模型理解，实际安全与兼容性限制仍由执行入口检查。
const { listLoras, prepareLoraGeneration } = require("./lora-tools");
// 随包技能通过宿主只读入口提供，不依赖 Python 文件白名单覆盖整个应用安装目录。
// 列表和正文分开按需调用，避免把全部 H3 长文塞进每次普通绘图请求的上下文。
// 技能资料不是可执行插件，文件读取与资源完整性检查由独立模块统一负责。
const { listAgentSkills, readAgentSkill } = require("./skill-tools");
// 角色身份查询复用创建页角色库，而非把 LoRA 文件名检索当作角色百科。
// 工具声明与执行一并登记，Python 不需要另写角色接口或新增 preload 权限。
// 角色未确认时先交给用户核对，再查询本地扩展与实际兼容性。
const { queryCharacters, queryCharacterFilters } = require("./character-tools");

/** 测试 / 调试用：覆盖用户数据文件位置（正常运行时用应用自己的那份） */
const ENV_USER_DATA = "ILLUSION_AGENT_USER_DATA";
/** 生图要排队 + 采样 + 下载，远超其它宿主工具；单独给它一条宽松的超时 */
const GENERATE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 发起本次运行的发送端。真实运行时是 Electron 的 `webContents`；
 * 这里只声明真正用到的 `send` —— 自检脚本能用最小假对象顶替（见 verify-agent-events.js），
 * 不必为了类型把整个 WebContents 拖进来。
 * @typedef {{ send: (channel: string, payload: unknown) => void }} HostToolSender
 */

/**
 * 等渲染层回执的调用（callId → 待兑现的 Promise）
 * @type {Map<string, { resolve: (value: { result: string, images: string[] }) => void, reject: (reason: Error) => void, timer: NodeJS.Timeout }>}
 */
const pendingHostCalls = new Map();
let hostCallSequence = 0;

/**
 * 把一次宿主工具调用转给**渲染层**执行，等它的回执。
 *
 * 与 `host_response`（主进程 → Python）是不同的一跳：这条是本进程 ↔ 渲染层的往返。
 * 三条纪律：① `sender.send` 可能因窗口销毁直接抛，必须当场 reject，
 * 否则调用要白等到超时；② 超时必须清掉 pending，避免 Map 无限增长；
 * ③ 回执（`settleHostCall`）由 `ipc-handlers/agent.handlers.js` 的 `agent:hostResult` 送达。
 * @param {HostToolSender} sender 发起本次 Agent 运行的发送端
 * @param {string} name 工具名
 * @param {Record<string, unknown>} args 工具入参
 * @param {number} timeoutMs 等回执的上限
 * @returns {Promise<{ result: string, images: string[] }>}
 */
function callRenderer(sender, name, args, timeoutMs) {
  hostCallSequence += 1;
  const callId = `hostcall-${Date.now().toString(36)}-${hostCallSequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingHostCalls.delete(callId);
      reject(new Error(`渲染层在 ${Math.round(timeoutMs / 1000)} 秒内没有回执（${name}）`));
    }, timeoutMs);
    pendingHostCalls.set(callId, { resolve, reject, timer });

    try {
      sender.send(IPC_CHANNELS.AGENT_HOST_CALL, { callId, name, arguments: args });
    } catch (error) {
      clearTimeout(timer);
      pendingHostCalls.delete(callId);
      reject(
        new Error(
          `窗口不可用，无法执行 ${name}：${error instanceof Error ? error.message : error}`
        )
      );
    }
  });
}

/**
 * 渲染层的回执入口。
 * @param {unknown} payload `{ callId, ok, result?, error? }`
 * @returns {boolean} 是否认领到了一次在等的调用（认领不到说明超时已收场，正常丢弃）
 */
function settleHostCall(payload) {
  if (!payload || typeof payload !== "object") return false;
  const { callId, ok, result, images, error } =
    /** @type {{ callId?: unknown, ok?: unknown, result?: unknown, images?: unknown, error?: unknown }} */ (
      payload
    );
  if (typeof callId !== "string" || !callId) return false;

  const entry = pendingHostCalls.get(callId);
  if (!entry) return false;

  pendingHostCalls.delete(callId);
  clearTimeout(entry.timer);
  if (ok) {
    entry.resolve({
      result: String(result ?? ""),
      images: Array.isArray(images)
        ? images.filter((item) => typeof item === "string" && item.length > 0)
        : [],
    });
  } else {
    entry.reject(new Error(String(error || "渲染层执行宿主工具失败")));
  }
  return true;
}

/**
 * 工具：生图（**执行端在渲染层**）。
 *
 * 不在这里调 `comfyProxy` 的原因：`comfyProxy` 只负责「提交工作流 → 等 history → 下载」，
 * 而它要的 API Prompt 得由渲染层的 `buildImagePrompt`（模板 JSON + 参数填槽 + LoRA 链）
 * 组装，产物还得由渲染层的 `saveGeneratedImagesToDisk` 落盘并内嵌 Meta。
 * 三段一起转过去，Agent 生成的图才和界面上点「生成」的结果完全一致（含图库归档）。
 * @param {Record<string, unknown>} args
 * @param {{ sender: HostToolSender, runId: string }} ctx
 * @returns {Promise<{ result: string, images: string[] }>}
 */
async function generateImage(args, ctx) {
  // LoRA 必须先根据本地实际主模型确认系列，不能直接信任 Agent 填的 series。
  // 校验失败直接作为工具错误返回，不向渲染端发起一轮注定失败的生成。
  // 规范名称保留子目录，渲染端还会核对 ComfyUI 返回的完整名称。
  // 没有 LoRA 的旧请求继续沿用模板默认参数，不要求补填 model。
  // 每次调用读取最新设置，不使用上一次查询留下的目录或兼容性缓存。
  // 与生成共用同一工具超时；主模型不匹配不会消耗 GPU 任务。
  // 未使用 LoRA 时不额外读取模型路径，保持旧工具独立运行与假模型测试的前提。
  // null、错误对象和非空数组仍交给校验器，不把脏值当成没有扩展。
  // 这样普通生图不会因用户未配置模型库或纯 Node 中没有 app 对象而新增读设置错误。
  const checked = args.loras === undefined || (Array.isArray(args.loras) && !args.loras.length) ? args : await prepareLoraGeneration(args, readSettingsPaths());
  return callRenderer(ctx.sender, "generate_image", checked, GENERATE_TIMEOUT_MS);
}

/**
 * LoRA 查询走主进程目录扫描，页面切换不会让这项查询失去执行端。
 * 参数只包含查询文字和可选主模型，不允许工具指定额外扫描目录。
 * 省略主模型时列出系列，有主模型时基于真实模型证据给兼容性结论。
 * 未知或损坏来源不会被隐藏，结果包含不能加载的原因。
 * 查询不写入模型、来源或封面，也不触发网络资料补全。
 * 工具结果是文本，继续沿用现有 sidecar 协议，不增加 preload 能力。
 * @param {Record<string, unknown>} args
 */
function queryLoras(args) { return listLoras(args, readSettingsPaths()); }

/**
 * 读应用设置里的模型路径。
 * 读的是**用户数据文档**（`settings.paths`），所以 Agent 看到的路径与它在设置页里填的一致。
 * @returns {{ searchPath: string, checkpointPath: string, lorasPath: string, diffusionModelsPath: string }}
 */
function readSettingsPaths() {
  const empty = {
    searchPath: "",
    checkpointPath: "",
    lorasPath: "",
    diffusionModelsPath: "",
  };
  try {
    const custom = (process.env[ENV_USER_DATA] || "").trim();
    /**
     * 两条读取路径：
     * - 显式给了 `ILLUSION_AGENT_USER_DATA`（自检 / 调试）→ **直接读那个文件**：
     *   这条路径不依赖 Electron，纯 Node 的自检脚本也能跑；
     * - 否则走应用自己的 `readUserData()`（懒加载：它依赖 electron 的 app）。
     */
    /** @type {{ settings?: { paths?: Record<string, unknown> } } | null} */
    let document = null;
    if (custom) {
      document = JSON.parse(fs.readFileSync(custom, "utf8"));
    } else {
      const { readUserData } = require("../../storage/user-data");
      document = readUserData()?.data ?? null;
    }
    const paths = document?.settings?.paths;
    if (!paths || typeof paths !== "object") return empty;
    return {
      searchPath: typeof paths.searchPath === "string" ? paths.searchPath : "",
      checkpointPath:
        typeof paths.checkpointPath === "string" ? paths.checkpointPath : "",
      lorasPath: typeof paths.lorasPath === "string" ? paths.lorasPath : "",
      diffusionModelsPath:
        typeof paths.diffusionModelsPath === "string"
          ? paths.diffusionModelsPath
          : "",
    };
  } catch (error) {
    console.error("[AGENT] 读取模型路径失败:", error instanceof Error ? error.message : error);
    return empty;
  }
}

/**
 * 模型清单入口只负责读取应用设置，具体查询由公共目录适配器执行。
 * 与LoRA预检使用相同目录根、完整名称和系列证据，避免查询能看到却无法选择。
 * searchPath存在时仍优先，但其下checkpoint、LoRA和UNet分别归类。
 * 模型名称不再使用scanner的展示标题，返回值保留全部子目录和扩展名。
 * 分页在完整计数后执行；第40项后可用nextOffset继续读取。
 * 工具不接受自定义扫描根，不能用JSON参数越过设置里的模型目录。
 * 不输出用户路径或把来源JSON全文交给模型，公共结果由适配器挑选字段。
 * 参数无效时由现有宿主错误通道交付，不返回看似正常的空清单。
 * 本地文件存在不代表ComfyUI已注册或成功加载，返回状态会标注验证层级。
 * 此入口不修改模板、用户文档或下载队列，查询不会产生生成副作用。
 * 旧调用kind=search保持可用，含义是所有已分类目录而非扫描任意模型文件。
 * @param {Record<string,unknown>} [args] 类别、系列、关键词及分页参数
 * @returns {Promise<string>} JSON文本，兼容现有宿主桥协议
 */
async function listLocalModels(args = {}) {
  return listModels(args, readSettingsPaths());
}

const HOST_TOOLS = [
  // 界面：Agent 的角色检索过程，默认使用创建页同一份离线参考库。
  // 用户只描述外观时允许省略姓名，分类值应来自真实资料或分类工具。
  // 未收录属性返回 null，不允许模型从姓名、作品或偏好中补猜。
  // query 存在时用于身份确认，歧义通过既有运行器立即向用户澄清。
  // 只按属性浏览可以返回多个候选，但不能替用户静默决定角色。
  // 此工具不能证明权重存在；LoRA 必须继续核对本地列表与兼容性。
  // 不接受页码或任意 URL，避免 Agent 遍历站点和整个本地目录。
  // 字段均有长度限制，运行时还会拒绝未知字段与全空查询。
  // 参数是 AND 关系，发色条件不能与瞳色条件互换。
  // 默认本地无网络访问，显式 online 仅用于旧在线库的姓名/作品查询。
  // 先按实际资料确认身份，再将原 trigger/tags 用于后续提示词。
  // 中文译名未收录不等于角色不存在，应询问英文名而非连续换词。
  // total 是全部匹配，returned 是最多八条摘要，截断不代表资料完整。
  // 具体生成仍由生成工具完成，此接口没有下载或写入副作用。
  {
    // 新 Agent 只使用本地资料；旧显式在线调用和创建页的在线展示保持兼容。
    // 参数 query 可直接携带用户提供的名字与已知别名，不必先翻译再猜标签。
    // 唯一身份是资料可用条件，不代表用户已经授权生成或必须加载角色 LoRA。
    name: "search_characters", description: "本地角色检索：标准名→已收录别名→片段→单处拼写差异，前层命中即停止。可带作品和外观；作品无命中仅补查一次并标记冲突。识别最多3项，浏览最多8项。needsConfirmation=true先询问；false且nextAction=use_character时直接使用trigger/tags。角色不需要专用LoRA，勿重复查询或编造属性。",
    parameters: { type: "object", properties: { query: { type: "string", maxLength: 200 }, copyright: { type: "string", maxLength: 200, description: "可选作品线索；不确定可省略" }, gender: { type: "string", maxLength: 200 }, hair: { type: "string", maxLength: 200 }, eye: { type: "string", maxLength: 200 }, source: { type: "string", enum: ["local"], default: "local" } }, required: [], additionalProperties: false }, run: queryCharacters,
  },
  // 分类发现只读内置资料，不能让模型自己创造可选过滤值。
  // 例如用户说金发时可以查 hair，核对库中到底采用 blonde 还是其他值。
  // 四个属性分别列举，避免一次返回几千个作品挤占上下文。
  // query 为可选分类关键词，不会对角色姓名做额外模糊猜测。
  // 每次最多三十个值；若 truncated 为真，应先缩小关键词。
  // 空结果应告诉用户资料不含该分类，不得按工具不存在的值继续生成。
  // source 固定本地，分类查询不会自动访问在线角色站点。
  // 工具返回总数供模型说明范围，不能把前三十条说成完整分类表。
  // 所有返回值均是资料原文，可以原样用于 search_characters。
  // 工具描述只是提示，field 白名单和长度由实际实现重新校验。
  // 这里注册会同步暴露给 sidecar，不需要另维护 Python MCP 镜像。
  // 不开放文件路径、URL 或代码执行参数。
  {
    name: "list_character_filters", description: "列出本地角色库实际存在的分类值。field=copyright作品/gender性别/hair发色/eye瞳色，可用query过滤分类名称；返回最多30项及总数。请将返回原值用于 search_characters，不编造缺失分类；截断时请用户缩小作品关键词。",
    parameters: { type: "object", properties: { field: { type: "string", enum: ["copyright", "gender", "hair", "eye"] }, query: { type: "string", maxLength: 200 } }, required: ["field"], additionalProperties: false }, run: queryCharacterFilters,
  },
  // 技能发现先返回名称、适用范围与运行条件，模型据此挑选当前任务所需的资料。
  // MiniMax H3 的上游部分流程依赖 Hub 专用工具，查询结果保留这种限制。
  // 真正可调用的生成能力仍由工具注册表决定，读取技能不新增 hub_* 能力。
  // 这里的 query 只筛名称和描述，不作为模型库路径或任意文件读取参数。
  // 目录随主进程 agent/**/* 进入安装包，无需用户继续保留原始 D 盘文件夹。
  // tools 声明自动传给 sidecar，语言模型能发现该入口，不需要改一份 Python 工具镜像。
  // 无 query 时列出全部十项，适合先浏览后根据任务选择风格。
  // 输出是 JSON 文本，不引入新的事件或跨进程字段形状。
  {
    // 已知 H3 入口无需再发现，避免每写一个示例都先耗费一轮列目录。
    // 中文长句不一定出现在英文描述中，未知资料才用短关键词查询。
    // 咨询可直接使用系统速记，本工具不是所有视频问题的强制前置步骤。
    name: "list_agent_skills", description: "仅在不知道适用技能时查询内置视频提示词、导演和风格技能。普通提示词咨询直接回答；已知H3可直接read_agent_skill(skill=h3-prompt-writing)，无需先查目录。query用短名称或英文关键词；无结果可省略query查看概要一次，禁止反复变换长句查询。这里只读资料，不执行视频生成。",
    parameters: {type:"object",properties:{query:{type:"string",description:"可选：名称或描述关键词，如 anime、prompt、brand"}},required:[],additionalProperties:false}, run: listAgentSkills,
  },
  // 正文读取只允许当前技能清单中的文件，不能借此访问用户目录或密钥。
  // 默认优先中文入口，h3-prompt-writing 保留其原始英文格式规则。
  // 参考指南与入口正文使用同一个白名单和摘要校验，不能通过上级路径读取其他技能。
  // 长文分段读取，nextOffset=null 才代表已经到末尾，不能只读首段便声称读完。
  // offset 的单位是解码后的 UTF-16 字符，不是磁盘字节或文件行号。
  // limit 上限与运行期校验保持一致，Schema 不能替代实现中的实际边界检查。
  // 文件清单随正文返回，模型能够继续读取 references/base-en.txt 或 ref-en.txt。
  // 不能把 Hub 工具的文字描述当成已注册工具，返回的适配说明会明确运行边界。
  // 读取操作不联网、不执行脚本，也不会把技能复制到用户全局 Codex 技能目录。
  // 接入的是项目自身 Agent，桌面开发助手与应用运行时的技能集合彼此独立。
  // 内容来自用户指定的本地资料，保留原文摘要及来源说明便于后续更新核对。
  // 任何读取异常经现有 host_response 错误通道返回，不需要创建新的 preload API。
  {
    // 直接读取仍由 skill-tools 核对清单与摘要，不开放任意用户文件。
    // 基础与 Ref2VA 手册可直接定位，省去先读入口再找文件的一次往返。
    // nextOffset 只表示还有资料，不表示每个简单请求都必须读完整本手册。
    name: "read_agent_skill", description: "按已知id直接读取内置技能或所需资料，不必先列目录。普通提示词咨询用系统速记即可。H3基础规范可直接传skill=h3-prompt-writing,file=references/base-en.txt；完整Ref2VA用references/ref-en.txt。仅按需读取，确需续页使用nextOffset；不得把局部阅读说成已读全文。原文Hub工具不等于当前可执行能力，禁止编造视频结果。",
    parameters: {type:"object",properties:{skill:{type:"string",description:"技能 id，如 h3-prompt-writing 或 anime-director"},file:{type:"string",description:"可选：该技能清单中的相对资源名，缺省优先中文 SKILL.cn.md"},offset:{type:"integer",minimum:0,description:"正文 UTF-16 字符偏移，首次省略，后续使用返回的 nextOffset"},limit:{type:"integer",minimum:1,maximum:24000,description:"单次字符上限，默认 12000"}},required:["skill"],additionalProperties:false}, run: readAgentSkill,
  },
  // 查询与生成分开：Agent 可以先了解系列、触发词和拒绝原因，再决定加载哪些扩展。
  // model 要使用主模型完整相对名；提供后以实际文件证据判断，而不是自报架构。
  // 目录与来源冲突的条目仍然展示，便于解释为什么某项不能补入生成链。
  // 返回的 compatible 只对本次选定主模型有效，不能当作全局允许列表。
  // 查询接口不给文件读写和下载权限，也不会自动追加触发词改变用户的画面要求。
  // 空目录返回 total=0；截断列表带 truncated，调用方可再用 query 缩小范围。
  // 具体目录、来源读取大小及文件授权都由 lora-tools 和已有服务实现。
  // 注册表只暴露声明与调用入口，不复制模型家族识别规则。
  // 描述刻意说明视频只做系列识别，避免模型承诺当前工具尚不支持的生成能力。
  // 工具参数也必须经运行时校验，JSON Schema 不是可信数据边界。
  // 工具超时沿用普通宿主查询默认值，生图仍使用自己的十分钟等待上限。
  // 声明会自动传入 Python sidecar 的 hostTools，不需要手改另一份工具清单。
  {
// 查询返回兼容性时必须携带实际主模型，不用series字符串替代真实文件。
// series在该查询是结果过滤条件，compatible仍与选定主模型独立比较。
// 不增加新的工具名称，已安装sidecar会自动收到更新后的声明。
    name: "list_loras",
    // LoRA 是可选增强，只有明确用途线索才做小范围查询，不按角色强制扫全库。
    // 无匹配时允许使用主模型和角色标签生成，不能把可选资源缺失当成失败。
    // 真正加载前仍须兼容，摘要开关不能绕过现有主模型证据校验。
    description: "可选LoRA定向查询。model原样取主模型name；生成准备用query关键词、summary=true、limit=5，compatible=true且用途相符才加载。无匹配即跳过，不因角色没有LoRA阻塞生图，不遍历全库凑扩展。需要续页用nextOffset，勿从0扩大limit重读。",
    parameters: {type:"object",properties:{model:{type:"string",description:"可选主模型完整相对名称，含扩展名；从list_local_models返回值原样复制"},query:MODEL_QUERY_PROPERTIES.query,series:MODEL_QUERY_PROPERTIES.series,offset:MODEL_QUERY_PROPERTIES.offset,limit:MODEL_QUERY_PROPERTIES.limit,summary:MODEL_QUERY_PROPERTIES.summary},required:[],additionalProperties:false},
    run: queryLoras,
  },
  {
    name: "list_local_models",
    // Schema和运行期分页限制共用一份契约，类别别名不会遗漏UNet。
    // 目录根由用户设置决定，模型不能通过工具添加任意磁盘扫描位置。
    // 对Anima默认流程明确给出首个查询，减少先all再猜类别的往返。
    // 空结果应解释roots状态并请用户配置，不让模型反复猜文件名。
    // 可用性承诺止于本地前置检查，实际服务器模型清单仍由生成环节核验。
    description: "本地模型查询。生成未指定系列时用kind=diffusion,series=anima,summary=true,limit=3；取usable=true的完整name作为必需主模型，不逐个比较全部模型。编码器/VAE/补丁不可作主模型。列表已足够就停止查询；分页用nextOffset。无可用模型按roots状态提示设置→模型路径，不猜路径。完整清单可省略summary。",
    parameters: {type:"object",properties:MODEL_QUERY_PROPERTIES,required:[],additionalProperties:false},
    run: listLocalModels,
  },
  {
    name: "generate_image",
    description:
      "调用应用自己的生图功能画一张图（复用设置里的 ComfyUI 地址、工作流模板、输出目录与图库）。" +
      "当用户要求画画、生成图像、文生图、出图时调用它；不要试图自己拼 ComfyUI 请求。" +
      "耗时通常一到两分钟，调用期间等结果即可。返回保存路径；把路径告诉用户，不要复述参数。" +
      // 只在最新请求明确要生成时提交，历史的“只列清单”不延续到新的生成请求。
      // 主模型先确定，角色资料命中后可直接写提示词，不必再寻找角色 LoRA。
      // 未指定的画布和采样参数保持模板默认，不把每项可选设置都变成追问。
      "以最新用户请求为准：只列清单不得生成；明确要图且主模型可用、角色已确定就立即调用。LoRA可省略或空数组；缺少角色LoRA不阻塞。未指定尺寸、步数、CFG使用模板默认，不要求用户逐项选择。",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "正向提示词（必填），描述想要的画面" },
        negativePrompt: { type: "string", description: "反向提示词；省略则用应用的默认反向词" },
        series: {
          type: "string",
          enum: ["anima", "sdxl"],
          description: "模型系列，与创建页的两套工作流对应；默认 anima",
        },
        model: {
          type: "string",
          description:
            "从list_local_models原样复制主模型name，必须保留子目录和扩展名；Anima用kind=diffusion，SDXL用kind=checkpoint；" +
            "生成准备必须确定可用主模型；没有指定时从Anima摘要选usable=true项，不要求用户比较全部模型。",
        },
        width: { type: "integer", description: "宽度（像素），省略用模板默认" },
        height: { type: "integer", description: "高度（像素），省略用模板默认" },
        steps: { type: "integer", description: "采样步数，省略用模板默认" },
        cfg: { type: "number", description: "CFG 强度，省略用模板默认" },
        // LoRA 数组顺序决定实际加载链顺序，不能用对象键排序替代。
        // name 必须包含扩展名，优先使用 list_loras 返回的完整相对名称。
        // strength 默认 1，0 和负数具有实际含义，不能用真假值判断是否缺省。
        // [-5,5] 是输入护栏，不代表所有模型在极端值下都有可用效果。
        // 省略或空数组不加载 LoRA，保持不使用扩展时的原生成行为。
        // 一旦使用 LoRA 就必须填写 model；系列从该主模型证据确认。
        // 调用方填写 series 与实际主模型不符时拒绝，而不是静默换模型。
        // 兼容性由执行端检查，给单项额外附上 family 字段不能绕过判据。
        // 二十项限制用于约束工作流规模，重复选择相同文件会另外报错。
        // 视频 LoRA 和其他图片架构不能因为同属 loras 目录就交叉加载。
        // 未知系列需先补全 baseModel 或明确分类，工具不会根据名称猜测。
        // 声明不强制拼接触发词，是否使用由用户的提示词意图决定。
        loras: { type: "array", maxItems: 20, description: "按顺序加载的兼容 LoRA；使用时必须指定 model。先用 list_loras 查询，不可跨系列混用。", items: {
          type: "object", properties: { name: {type:"string",description:"LoRA 完整相对文件名，含扩展名"}, strength: {type:"number",minimum:-5,maximum:5,default:1,description:"模型权重，默认 1"} }, required: ["name"], additionalProperties: false,
        } },
      },
      // 新工具声明要求明确模型；旧内部调用的模板兼容留在执行适配层。
      // 模型是主加载器，不因 loras 为空而变成不必要的可选参数。
      // JSON Schema 引导模型填全请求，真正的路径核验仍由原执行器完成。
      required: ["prompt", "model"],
    },
    /** 生图远慢于其它宿主工具：单独给一条宽松的等待上限（见 callRenderer） */
    timeoutMs: GENERATE_TIMEOUT_MS,
    run: generateImage,
  },
];

/**
 * 给 sidecar 的声明（只有声明，没有实现代码）。
 * `timeoutMs` 只在声明里出现，Python 侧按工具取用（见 `agent_core/host_tools.py`）——
 * 生图这类慢工具不该被 30 秒的全局默认值掐断。
 */
function hostToolSpecs() {
  // 工具描述与 Schema 同时随每次请求交给 Python，修改后需重启桌面主进程。
  // 本轮只缩小角色来源和准备查询范围，不增加文件扫描根或任意路径参数。
  // model 必填约束针对新的 Agent 调用，内部旧模板回落仍由执行适配器兼容。
  // list_loras 的 summary 字段复用公共查询规则，不维护另一套布尔开关语义。
  // 描述中的小 limit 是生成准备建议，用户主动查看完整清单时仍可正常分页。
  // 只列清单与执行生成的区分写在工具说明中，不能把查询成功当成用户授权。
  // 运行期仍进行模型路径与系列检查，Schema 的存在不能替代真实文件校验。
  // 本地无结果应由用户补充设置或角色信息，不通过新增云端回退隐藏问题。
  return HOST_TOOLS.map((tool) => {
    /** @type {{ name: string, description: string, parameters: object, timeoutMs?: number }} */
    const spec = {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    };
    const timeoutMs = /** @type {{ timeoutMs?: unknown }} */ (tool).timeoutMs;
    if (typeof timeoutMs === "number") spec.timeoutMs = timeoutMs;
    return spec;
  });
}

/**
 * 按名字取工具（调用前先查、查不到就回错误文本，而不是抛）
 * @param {string} name
 */
function findHostTool(name) {
  return HOST_TOOLS.find((tool) => tool.name === name) || null;
}

module.exports = {
  HOST_TOOLS,
  hostToolSpecs,
  findHostTool,
  listLocalModels,
  settleHostCall,
};
