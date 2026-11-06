/**
 * 随包 H3 技能回归，验证真实文件、宿主工具、分页与迁移后的读取边界。
 * 运行 node scripts/verify-agent-skills.js；归档读取单独启动无窗口 Electron 子进程。
 * 测试目录由 mkdtemp 生成，不访问用户模型、账户、视频输出或凭据文件。
 * 复制夹具后只在临时目录注入损坏、超限、穿越和链接逃逸状态。
 * 正常技能来自项目实际导入的资料，不能用一份只含预期文本的假技能代替。
 * 对每个登记源文件校验 SHA-256，保证双语正文和 references 一起被带入。
 * 把真实模块和资料装入临时 ASAR 后再调用，覆盖 Electron 归档内文件读取差异。
 * 不构建完整安装包，不把归档测试描述为已完成所有安装器或便携版验证。
 * 父进程使用普通 Node 清理归档，避免 Electron 原生缓存持有 Windows 文件句柄。
 * 使用生产 listAgentSkills 和 readAgentSkill，不替换实际权限或摘要判断。
 * 测试不会执行技能里的任何 Hub 指令，也不会调用实际视频生成服务。
 * 任何断言失败都会设置非零退出码，临时资源在 finally 中清理。
 */
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto"), {createRequire} = require("node:module");
const {listAgentSkills,readAgentSkill} = require("../apps/electron/src/main/modules/agent/skill-tools");
const {findHostTool,hostToolSpecs} = require("../apps/electron/src/main/modules/agent/host-tools");
const source = path.join(__dirname,"../apps/electron/src/main/modules/agent"), root = fs.mkdtempSync(path.join(os.tmpdir(),"ir-agent-skills-"));
const bundle = path.join(source,"skills/minimax-h3"), manifest = JSON.parse(fs.readFileSync(path.join(bundle,"manifest.json"),"utf8"));
let passed = 0;
/**
 * 检查组等待异步任务结束后再计数，不能让尚在进行的 Promise 被当成成功。
 * 失败直接向顶层抛出，避免把后续成功输出混成整体通过。
 * 输出组名而不输出正文或本地绝对路径，便于聚焦失败风险。
 */
async function check(name,run) { await run(); passed++; console.log(`PASS ${name}`); }
/**
 * 文件校验按 manifest 的源文件集合统计，新增接入说明不冒充上游原始资料。
 * 英文正文、中文正文、提示词指南、meta.yaml 都必须具有对应字节摘要。
 * 不规范化换行，防止搬运或 Git 自动换行破坏导入一致性却被测试掩盖。
 * 这里独立计算摘要，不调用生产读取函数的内部实现来获得预期值。
 * 源文件数量固定为本次导入的 41 项，新版本导入应显式更新统计与记录。
 * 两个可移植技能与八个 Hub 技能采用配对计数，不能全部标为可直接执行。
 * 每项 id 与 name 应一致，正文选择根据真实资源清单而非另造一个路径表。
 * 工具清单只检查当前新增接口，不要求整个 Agent 永久保持固定工具数量。
 * 单独检查 required 字段，使模型能知道正文读取必须提供 skill。
 * 模型看见工具不是已经使用过工具，真实读取检查在后面的组中执行。
 */
async function checkBundle() {
  // manifest 的文件列表是导入边界，不能只统计根目录里一共有多少个子目录。
  // 41 项同时覆盖英文与中文技能，若复制时漏掉 references 会在摘要读取处失败。
  // 上游原文没有项目内部实现代码，这组也不把接入模块算成上游技能资源。
  // SHA-256 按字节计算，中文编码与换行改变都会产生不同摘要。
  // 清单内既有 portable 也有 Hub-only 条目，数量对照能发现错误的统一兼容标记。
  // runtimeNotes 必须提醒图片工具不可替代 H3，避免用户把文字技能当成执行插件。
  // 工具参数 required 来自发给 sidecar 的声明，而不是另一份测试专用 Schema。
  // findHostTool 成功代表真实宿主可以分派名称，防止只有工具卡片却没有实现。
  // 不强制工具列表只有某几个名称，新加其他应用能力不应让本检查无意义失败。
  // 这组没有读取用户的 allowedRoots，内置技能权限与用户文件浏览权限独立。
  await check("41 个上游源文件字节与清单摘要一致",() => {
    assert.equal(manifest.files.length,41); for(const file of manifest.files) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(bundle,file.path))).digest("hex"),file.sha256);
  });
  await check("发现全部 10 项，保留 2 项可移植与 8 项 Hub 限制",async () => {
    const result=JSON.parse(await listAgentSkills()); assert.equal(result.total,10); assert.equal(result.skills.filter(item=>!item.requiresHub).length,2); assert.equal(result.skills.filter(item=>item.requiresHub).length,8); assert.match(result.runtimeNotes,/不能当作 H3 视频工具/);
  });
  await check("工具声明可发现、可调用，并要求 skill id",() => {
    const specs=hostToolSpecs(); assert.ok(specs.some(item=>item.name==="list_agent_skills")); assert.deepEqual(specs.find(item=>item.name==="read_agent_skill").parameters.required,["skill"]); assert.ok(findHostTool("read_agent_skill"));
  });
}
/**
 * 查询成功组先执行，排除因为全部资源不可读而使负向断言恒真。
 * h3-prompt-writing 只有英文入口，必须保持 SKILL.md，而不是猜一个中文文件名。
 * anime-director 有中文正文，默认入口应按清单选中 SKILL.cn.md。
 * 基础指南和 Ref2VA 指南都必须能读，不能只支持技能根目录中的文件。
 * 精确的英文结构字段用于证明真正读取了对应参考手册。
 * 不在测试里完整复制指南作为预期，从正式文件读取其内容作分页对照。
 * 分页使用较短的三百字符上限，以确保长文至少跨越多个请求。
 * 每一块都采用返回的 nextOffset，不能用测试自己猜测的偏移掩盖协议错误。
 * 拼回后的文字必须与源文件一致，不允许漏段、重叠或错误的字符/字节单位。
 * 每次调用还检查 content 长度不超过 limit，以约束上下文大小。
 * 最终 nextOffset 为 null，避免产生永远无法结束的“还有下一页”。
 * 零偏移与末尾偏移都具有合法语义，不能用 truthy 默认值破坏它们。
 * 查询无命中返回空集，是正常查询结果，不应让 Agent 因异常中止。
 * 实际注册工具的 run 路径也执行读取，不能只有独立服务函数可用。
 */
async function checkReading() {
  // 默认入口的中英文差异来自清单，不用语言模型自行猜测可用文件名。
  // anime-director 的中文正文包含本地化说明，但 H3 格式字段仍应遵守基础指南。
  // h3-prompt-writing 没有中文入口，正确行为是读取英文而非回落到空文档。
  // base 与 ref 指南的断言使用不同字段，能发现两个路径被错误映射到同一文件。
  // 双语文本的 UTF-8 字节数与 UTF-16 字符数不同，分页拼接对照能发现单位混用。
  // 三百字符的短页会多次调用真实摘要检查，不能在首轮通过后跳过后续资源验证。
  // 不把读取整份文件作一次 map 后拆成假分页，所有分页都经过生产入口参数验证。
  // offset 恰好等于总长时允许结束，offset 更大则属于另一个明确拒绝用例。
  // 确认 files 列表含基础指南，模型才能按真实结果定位引用资源。
  // query 无命中与 skill 不存在不同，前者是正常搜索，后者是错误读取请求。
  // 正式 run 调用没有 sender 参数，因为这个工具直接由主进程完成只读工作。
  // 这些通过结果不依赖 React 挂载，不会因页面切换丢失执行端。
  await check("中文默认入口与英文基础技能均可读取",async () => {
    assert.equal(JSON.parse(await readAgentSkill({skill:"anime-director"})).file,"SKILL.cn.md"); const result=JSON.parse(await readAgentSkill({skill:"h3-prompt-writing"})); assert.equal(result.file,"SKILL.md"); assert.ok(result.files.includes("references/base-en.txt"));
  });
  await check("基础/首尾帧指南和 Ref2VA 指南保留准确字段",async () => {
    assert.match(JSON.parse(await readAgentSkill({skill:"h3-prompt-writing",file:"references/base-en.txt"})).content,/integrated_multimodal_description/); assert.match(JSON.parse(await readAgentSkill({skill:"h3-prompt-writing",file:"references/ref-en.txt"})).content,/retention_analysis/);
  });
  await check("分页可无损拼回双语长文，末尾明确结束",async () => {
    const expected=fs.readFileSync(path.join(bundle,"anime-director/SKILL.cn.md"),"utf8"); let offset=0,actual="";
    do {const result=JSON.parse(await readAgentSkill({skill:"anime-director",offset,limit:300}));assert.ok(result.content.length<=300);actual+=result.content;offset=result.nextOffset;} while(offset!==null);
    assert.equal(actual,expected); assert.equal(JSON.parse(await readAgentSkill({skill:"anime-director",offset:expected.length})).nextOffset,null);
  });
  await check("名称筛选、空结果与正式宿主执行入口",async () => {
    assert.equal(JSON.parse(await listAgentSkills({query:"anime-director"})).total,1); assert.equal(JSON.parse(await listAgentSkills({query:"no-such-fixture-skill"})).total,0); assert.match(JSON.parse(await findHostTool("read_agent_skill").run({skill:"h3-prompt-writing"})).content,/T2VA/);
  });
}
/**
 * 输入矩阵只改变工具参数，不删除正式源文件，避免污染项目工作区。
 * 未知 skill 与非法 file 分开验证，不能让任意文件名都先在技能选择处失败。
 * 路径穿越同时覆盖正斜杠、反斜杠、绝对盘符和 URL 编码的常见写法。
 * 测试目标始终是有效技能 h3-prompt-writing，确保触发的是文件白名单。
 * 未登记但物理存在的 manifest 不能借 ../ 或绝对路径形式读出。
 * offset 与 limit 接收 unknown，工具模型不遵守 JSON Schema 时仍要拒绝。
 * 数字字符串不得隐式转换，避免不同语言桥的自动转换差异。
 * limit=0 会无法推进分页，必须拒绝而不是永远返回空片段。
 * 超大 limit 与负 offset 也要失败，不能依赖 slice 自行截断修复输入。
 * offset 超过末尾使用合法整数，区分数值形状错误和实际文本越界。
 * query 对象是与普通字符串不同的类型，不允许 String(object) 变成无匹配成功。
 * 所有拒绝都由生产实现发出，不用假工具直接返回测试预期错误。
 */
async function checkArguments() {
  // 路径白名单先于实际磁盘打开，非法输入不能探测其他用户文件是否存在。
  // 正常 skill id 保持不变，不能让未知 id 检查替代对 file 的边界检查。
  // ../anime-director 是跨技能访问，即使目标属于同一个内置包也不允许这种命名。
  // 用户需要读取另一个技能时应显式换 skill id，从而保留清晰的结果归属。
  // 绝对盘符示例仅是一个无权限读取的请求字符串，测试不会创建或访问该系统文件。
  // 反斜杠穿越在 Windows 特别常见，应与正斜杠形式一样被拒绝。
  // 编码后的点段不执行 URL 解码，不能把它当成隐含的合法目录引用。
  // limit 超过上限即使源文档更短也拒绝，Schema 与运行边界保持一致。
  // 分页负数不能交给 slice 的倒数语义处理，否则用户可能读到错误段落。
  // 超出末尾的合法整数应报告位置错误，不能伪装成成功读取空正文。
  await check("未知技能、越界/跨技能/绝对路径资源均被拒绝",async () => {
    await assert.rejects(readAgentSkill({skill:"missing"}),/未知/); for(const file of ["../manifest.json","../anime-director/SKILL.md","..\\manifest.json","C:/Windows/win.ini","%2e%2e/manifest.json"]) await assert.rejects(readAgentSkill({skill:"h3-prompt-writing",file}),/资源清单/);
  });
  await check("非法分页类型、无进展 limit 与超范围输入被拒绝",async () => {
    for(const args of [{offset:-1},{offset:"0"},{limit:0},{limit:24001},{offset:Infinity},{offset:99999999}]) await assert.rejects(readAgentSkill({skill:"h3-prompt-writing",...args}),/分页|超出/); await assert.rejects(listAgentSkills({query:{}}),/字符串/);
  });
}
/**
 * 把模块和完整技能资料复制到独立 fixture，模拟安装位置与源码目录不同。
 * 模块定位只依赖自身 __dirname，原始用户 D 盘目录不参与任何读取。
 * 这个副本随后用于损坏和链接测试，不能修改项目正式资料来制造失败。
 * 复制内容不包含 Python、模型权重或用户配置，总量约半 MB。
 * 对副本 require 使用新绝对路径，避免 Node 缓存返回先前加载的正式模块。
 * 保留技能原始文件名与目录层级，不能把 references 平铺后仍声称支持相对引用。
 * 构建白名单检查只确认现有配置收录整个 agent 子树，未运行完整 electron-builder。
 * 实际 ASAR 读取组另行覆盖归档内模块路径和 fs 行为。
 */
function relocated() {
  const folder=path.join(root,"installed/src/main/modules/agent"); fs.mkdirSync(folder,{recursive:true}); fs.copyFileSync(path.join(source,"skill-tools.js"),path.join(folder,"skill-tools.js")); fs.cpSync(path.join(source,"skills"),path.join(folder,"skills"),{recursive:true}); return {folder,tools:require(path.join(folder,"skill-tools.js"))};
}
/**
 * 可读副本先通过再注入损坏，保证 negative case 不是整个迁移模块加载失败。
 * 第一项只在合法资源后追加一个字符，应由 SHA-256 漂移触发明确失败。
 * 用一个小 limit 读取仍必须拒绝，不能只对返回片段校验而漏掉文件尾损坏。
 * 第二项写入大于 MAX_BYTES 的数据，应由读取上限先拒绝，不必等摘要计算。
 * 两项操作后恢复原始字节，保证后续链接测试只受链接逃逸这一变量影响。
 * 源字节来自副本修改前的 Buffer，不重新从原始 D 盘路径读取。
 * 这里不修改 manifest 摘要来配合坏数据，否则会削弱完整性负向用例。
 * Windows junction 用于目录逃逸，不需要创建文件符号链接的管理员特权。
 * junction 指向本轮临时根内的 outside，但已经超出固定技能资源根。
 * 不能因为 outside 也属于“测试目录”就把它当成生产授权范围。
 * 目标文件内容复制正确，以保证即使哈希匹配也仍会被真实路径边界拒绝。
 * finally 恢复引用目录，清理时不对外部实际目录作递归操作。
 * 所有删除路径由本轮固定 fixtureFolder 推导，并在操作前核对仍在 mkdtemp 根内。
 * 测试不声称抵御同时控制清单和全部应用文件的攻击，只验证当前读取接口的边界。
 */
async function checkIsolation() {
  // moved 模块的目录结构模拟安装路径，不保留原工程相对路径作为备用读取来源。
  // 如果生产代码硬编码原始 D 盘路径，迁移组应不能读出这份独立副本的修改状态。
  // 摘要失败组只修改副本文件尾，正文前一字符没有变化，短分页也必须拒绝。
  // 超大组写满 128 KiB 再多一个字节，精确覆盖读取上限外的一字节边界。
  // 错误恢复使用原始 Buffer，不经过字符串编码转换，因此 SHA-256 应完全还原。
  // junction 目标放在技能根外，但名称和字节与原 references 相同。
  // 这样路径检查失败不能被“摘要不匹配”抢先掩盖，真实路径边界必须独立生效。
  // Windows junction 不需要用户额外授权，属于可以可靠自动运行的负向夹具。
  // POSIX 对应目录 symlink，测试保持同一个根外引用语义。
  // reference 目录重命名后作为 saved 备份，finally 恢复时不丢失原始参考资料。
  // 删除 junction 只移除链接本身，不递归修改 outside 目标里的实际文件。
  // 正式源码目录和用户传来的技能目录始终没有写入行为。
  const {folder,tools}=relocated(), file=path.join(folder,"skills/minimax-h3/h3-prompt-writing/SKILL.md"), original=fs.readFileSync(file);
  await check("迁移后的模块不依赖原始来源目录",async () => assert.equal(JSON.parse(await tools.listAgentSkills()).total,10));
  await check("正文漂移及超大资源不能通过短分页绕过",async () => {
    try {fs.appendFileSync(file,"x");await assert.rejects(tools.readAgentSkill({skill:"h3-prompt-writing",limit:1}),/不一致/);fs.writeFileSync(file,Buffer.alloc(128*1024+1));await assert.rejects(tools.readAgentSkill({skill:"h3-prompt-writing"}),/读取失败/);} finally {fs.writeFileSync(file,original);}
  });
  const references=path.join(path.dirname(file),"references"), saved=references+"-saved", outside=path.join(root,"outside");
  assert.ok(path.resolve(references).startsWith(path.resolve(root)+path.sep)); fs.mkdirSync(outside); fs.copyFileSync(path.join(references,"base-en.txt"),path.join(outside,"base-en.txt")); fs.renameSync(references,saved);
  await check("参考目录 junction 不能逃出固定技能根",async () => {
    try {fs.symlinkSync(outside,references,process.platform==="win32"?"junction":"dir");await assert.rejects(tools.readAgentSkill({skill:"h3-prompt-writing",file:"references/base-en.txt"}),/读取失败/);} finally {if(fs.existsSync(references))fs.rmSync(references,{recursive:true});fs.renameSync(saved,references);}
  });
}
/**
 * 使用工程已安装的 electron-builder 依赖解析 ASAR 库，不引入新的运行依赖。
 * 归档只包含本轮临时副本，绝不把用户目录或完整项目塞入测试包。
 * Electron 子进程 require 的 __dirname 含 app.asar，生产模块必须照常发现旁边的技能根。
 * fs.realpath、open、read 与 close 在归档内执行，能发现普通 Node 文件夹测试漏掉的差异。
 * 先确认 src 子树在打包白名单中，再验证模块位于 src/main/modules/agent 的真实归档布局。
 * 归档中的文件摘要仍匹配导入原文，归档不会自动“修复”错误的正文或清单。
 * 这里只构建小型 ASAR 夹具，不覆盖 NSIS 安装、签名或 Python 运行环境分发。
 * 普通 Node 不能模拟 Electron ASAR fs patch，因此必须启动实际 Electron 子进程读取。
 * 子进程二进制取自项目已安装的 electron 包，不依赖系统 PATH 中的其他版本。
 * 异步 createPackage 必须等待完成，不能在归档尚未写完时 require 它。
 * 读取成功只证明随包技能可用，不证明 Hub 服务可用或视频生成成功。
 */
async function checkAsar() {
  // ASAR 是项目真实打包机制，小型归档测试比只检查 yml 字符串更能发现运行差异。
  // 归档文件布局保留 modules/agent/skill-tools.js 与 skills/minimax-h3 的相邻关系。
  // 子进程里不能因为源码路径仍存在而回落读取，模块定位只允许当前归档旁的资源。
  // 从 app-builder-lib 的依赖树解析 ASAR，避免依赖 pnpm 具体版本目录名。
  // 如果工程打包依赖发生变化导致无法找到 ASAR 库，应修复测试前提而非跳过这一组。
  // 子进程 stdout 不作为通过依据，真正结果取决于零退出码和脚本内部 assert。
  // 调用过程中出现异常会显式 app.exit(1)，不能依赖 Electron 默认退出码。
  // 父进程等子进程结束后才删除物理归档，避免 Windows 原生缓存持有文件句柄。
  // 二十秒超时返回 status=null，也会被 assert 识别为失败，不会自动重试掩盖问题。
  // 子进程不连接模型服务，不启动主应用，不使用应用的单实例锁。
  // 中文入口与英文指南各读一次，覆盖编码解码及嵌套 references 的归档读取。
  // 外层测试最终继续跑真实 Agent 会话，不能用归档读取通过代替跨语言协议检查。
  const fromBuilder=createRequire(require.resolve("../apps/electron/node_modules/electron-builder")), fromLib=createRequire(fromBuilder.resolve("app-builder-lib")), asar=fromLib("@electron/asar");
  const archive=path.join(root,"app.asar"); await asar.createPackage(path.join(root,"installed"),archive);
  await check("实际 ASAR 中宿主模块、中文正文及参考指南可读取",async () => {
    // ASAR 缓存会持有 Windows 文件句柄，改为独立子进程读取，退出后再由父进程清理。
    // 子进程只加载已生成的本轮归档，不启动主应用、不占用单实例锁、不打开任何窗口。
    // 验证目标来自固定测试生成路径，脚本文本不拼接用户提供的文件名或外部命令。
    // 路径通过 argv 传入，避免引号、中文目录或空格改变生成脚本语法。
    // 同一真实工具模块在子进程里检查列表、中文默认入口和基础指南。
    // 子进程退出码必须为零；超时或启动失败都不能把读取组当作通过。
    // 二十秒上限只限制小型本地归档读取，不代表视频生成任务的超时约定。
    const driver=path.join(root,"read-asar.js");fs.writeFileSync(driver,'const assert=require("node:assert/strict"),path=require("node:path"),app=require("electron").app; (async()=>{const packed=require(path.join(process.argv[2],"src/main/modules/agent/skill-tools.js"));assert.equal(JSON.parse(await packed.listAgentSkills()).total,10);assert.equal(JSON.parse(await packed.readAgentSkill({skill:"anime-director"})).file,"SKILL.cn.md");assert.match(JSON.parse(await packed.readAgentSkill({skill:"h3-prompt-writing",file:"references/base-en.txt"})).content,/overall_soundscape/);})().then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});');
    const child=require("node:child_process").spawnSync(process.versions.electron?process.execPath:require("electron"),[driver,archive],{encoding:"utf8",windowsHide:true,timeout:20000});assert.equal(child.status,0,child.error?.message||child.stderr);
  });
}
/**
 * 各组顺序运行，先确定成功基准，再注入失败条件，最后读迁移后的归档资源。
 * 临时副本被恢复后才打包，不能让损坏夹具影响 ASAR 组的结论。
 * 构建配置是文本断言，仅证明白名单存在，不拿它代替实际归档读取。
 * 最后汇总组数，不将 SKIP 算作已通过的一组。
 * 没有创建真实视频文件，整个结果仅针对技能发现与读取能力。
 */
async function main() {
  // 所有检查都需要先读到当前导入清单，不能借前一次进程留下的缓存绕过文件状态。
  // 本轮报告的成功仅对应当前源码与夹具，未将真实视频服务状态作为隐含前提。
  // main 不并行执行这些检查，文件注入、ASAR 生命周期和 Agent 服务各自完整收尾。
  // checkIsolation 的恢复是 checkAsar 前提，先后顺序能避免打包一个损坏夹具。
  // 实际 Agent 会话只使用随包正式资源，其他组的临时坏数据不会进入模型上下文。
  // passed 统计的是检查组，不是每一条内部 assert，避免把数量说成生成成功次数。
  // 结束摘要不会报告视频条数，因为没有执行任何视频采样或下载任务。
  // 构建白名单断言支持后续配置审查，真正读取仍由归档子进程完成。
  // 测试文件本身不注册新的应用工具，只通过已有注册表和 runner 调用生产能力。
  // 清理或子进程异常仍会使整个脚本非零退出，不能只看这一行成功摘要做结论。
  // 构建配置属于 electron 包根，不与已迁移的 Agent 业务模块相邻。
  // src 的递归白名单覆盖宿主 JS 和技能资料，原 agent/ 白名单已经移除。
  // 归档读取组继续独立执行，不能仅靠匹配配置字符串就声称资源可读。
  assert.match(fs.readFileSync(path.join(__dirname,"../apps/electron/electron-builder.yml"),"utf8"),/'src\/\*\*\/\*'/);
  // 启动真实 Agent，但语言模型请求只发往测试建立的本机 HTTP 服务，不花 token。
  // 两轮上下文检查证明已知参考手册可直接读取，并保留一次正式回答机会。
  // 这项独立于 ASAR 子进程，两个运行环境顺序执行，不同时占用 Electron 生命周期。
  // 仍然不调用视频执行器，最终回答必须明确只是已读取资料并准备提示词。
  await checkBundle(); await checkReading(); await checkArguments(); await checkIsolation(); await checkAsar();
  // 低于默认预算仍要交付五秒例子，不能仅检查“资料已读”而漏掉用户实际答案。
  // 目录发现和长文分页已有前面的独立检查，这里专门验证短咨询链路。
  // 模型回复脚本化，不据此报告真实服务商的提示词遵循率或推理效果。
  await check("真实 Agent 两轮读取指南并回答五秒动作示例，无外部模型费用",async()=>assert.equal(await require("./lib/check-agent-skill-session").checkAgentSkillSession(),2));
  console.log(`AGENT SKILLS OK: ${passed} groups`);
}
// 清理目标必须是 mkdtemp 返回的 root，不接受工具参数或外部环境变量覆盖。
// 所有负向写入都限制在该根，正式源码与用户原始技能目录保持不变。
// Electron 不创建窗口也需要显式退出，否则空应用生命周期可能等待其他句柄。
// app.exit 使用最终非零状态，断言失败不能被普通 app.quit 变成成功。
// 普通 Node 则保留 process.exitCode，由进程自然退出。
// finally 在通过或失败时都释放临时文件，不遗留伪造的安装目录。
// Electron 会把 .asar 路径当作虚拟目录，递归清理应使用 original-fs 操作物理归档文件。
// 清理异常也必须落实为非零退出并结束应用，不能遗留一个没有窗口的测试进程。
// ordinary fs 仍用于前面的生产行为验证，此处只在测试夹具清理阶段绕过归档解释。
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  try {(process.versions.electron?require("original-fs"):fs).rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});} catch(error) {console.error(error);process.exitCode=1;}
  if(process.versions.electron)require("electron").app.exit(process.exitCode||0);
});
