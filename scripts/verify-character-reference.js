/**
 * 读取真实内置角色资料，验证创建页与 Agent 共用的搜索协议。
 * 资料查询网络被明确禁用；本地筛选成功才说明不依赖在线搜索。
 * 封面 URL 是显示线索，实际图片请求属于渲染层，不在本地扫描中执行。
 * 不请求聊天模型、不生成图片、不读取用户模型或账号配置。
 * 测试用真实八千条数据，避免只给 mock 添加几个字段就宣布接通。
 * 线上兼容行为由 verify-agent-controls 独立模拟 HTTP 验证。
 * 此脚本在 Electron 中执行，以覆盖真实应用路径解析。
 * 所有断言失败都以退出一收尾，不将 app.quit 当失败出口。
 * 输出只报告通过的功能，不打印角色库全文或用户路径。
 */
const assert = require("node:assert/strict"), { app } = require("electron");
const { searchCharacters } = require("../apps/electron/src/main/modules/animadex");
const { queryCharacters, queryCharacterFilters } = require("../apps/electron/src/main/modules/agent/character-tools");
const { validateCharacterSearch } = require("../apps/electron/src/main/modules/animadex/local-catalog");
const rows = require("../packages/shared/src/data/character-reference.json");

/**
 * 分层检索使用真实资料：精确、已收录别名、片段和单字错误分别覆盖。
 * 用户提供的莉音只指向 Blue Archive 的 Rio，不由测试生成一份虚构别名库。
 * 同一输入有标准名时不得被更热门的片段结果挤掉，返回层级也要对应。
 * 片段包含多个角色时继续确认，不因只显示前三项而误报唯一身份。
 * 单处拼写差异即使仅剩一项也需要用户确认，不能默默修改角色名。
 * 错作品触发一次本地回退，但回退结果不能自动作为正确身份使用。
 * 创建页使用同样别名算法，却仍保留严格作品分类，不继承 Agent 的回退。
 * 轻量回执不返回整库分类、封面和长规则，避免放大下一次模型输入。
 * 零结果不隐式联网，上层的 fetch 禁用替身负责独立反证。
 * 这些检查证明候选身份和协议行为，不宣称真实聊天模型总会正确执行。
 */
async function checkLayeredSearch() {
  // 每一项的触发词固定写出，避免用被测输出反过来计算期望身份。
  // 查询方式不同但应指向相同源记录，不允许把别名本身写成生成标签。
  // 合并用户同时给出的英文与中文名称不需要再发第二次工具请求。
  // 单位测试只比较返回的事实，不依赖某种热度排序碰巧把 Rio 放第一。
  for (const [query, type] of [["rio (blue archive)", "exact"], ["莉音", "alias"], ["rio 莉音", "partial"]]) {
    // 作品条件固定为真实原值，层级差异只来自姓名输入而非过滤范围变化。
    // 三种查询都调用正式宿主入口，创建页共享算法由下方严格分类对照覆盖。
    // 完整标准名包含作品括号，别名命中不得改变最终 trigger 的原始拼写。
    const result = JSON.parse(await queryCharacters({query,copyright:"blue archive"}));
    assert.equal(result.characters[0].trigger,"rio (blue archive)"); assert.equal(result.match.type,type);
    assert.equal(result.needsConfirmation,false); assert.equal(result.nextAction,"use_character");
  }
  // 公主原名的 e 改成 x 是一次替换，应该召回候选而不能跳过确认。
  // 类型为 fuzzy 是可观察契约，不根据“结果只剩一人”猜测识别可靠性。
  // 作品条件有效，使该用例只测拼写容错，而非作品放宽。
  const typo = JSON.parse(await queryCharacters({query:"princxss zelda",copyright:"the legend of zelda"}));
  // 类型、候选身份、确认标志三者同时核对，不能只看“查到了一条”。
  // 没有将确认标志等同于查询失败，用户仍可从候选中知道应如何纠正。
  assert.equal(typo.match.type,"fuzzy"); assert.equal(typo.characters[0].name,"princess zelda"); assert.equal(typo.needsConfirmation,true);
  // 原作品不存在时应明确冲突，不要求用户再手动删作品才能看候选。
  // 同时验证页面严格分类仍为空，避免 Agent 容错污染普通筛选。
  // 结果里不再重复长 note；缺失属性等关键事实则由原检查独立保护。
  const conflict = JSON.parse(await queryCharacters({query:"莉音",copyright:"not-a-recorded-work"}));
  assert.equal(conflict.match.workConflict,true); assert.equal(conflict.needsConfirmation,true); assert.equal(conflict.nextAction,"ask_user");
  assert.equal((await searchCharacters({source:"local",q:"莉音",copyright:"not-a-recorded-work"})).total,0);
  // archivx 类作品错字不应经括号内的词拆分被当成角色姓名。
  // 此处只替换 archive 的最后字母，专门检测单处纠错是否误用了作品后缀。
  // 正常角色名和标准作品条件已在上面通过，零结果不是资料没有加载。
  assert.equal(JSON.parse(await queryCharacters({query:"archivx",copyright:"blue archive"})).total,0);
  // 该输入是作品单词而非已登记姓名，预期明确为空，不能只断言“不是 Rio”。
  // 若纠错从作品里召回任意人物，total 断言会失败而不是被前三项截断遮住。
  // 这个用例不测试作品别名功能；当前作品仍使用严格分类原值。
  // alice 在原库确有多条记录，返回前三个仅为帮助用户选择而非自动消歧。
  // total 应大于 returned；若先截断再统计，这个独立数量条件会失败。
  // 候选有截断时仍须确认，不以热度第一项替代用户决策。
  const ambiguous = JSON.parse(await queryCharacters({query:"alice"}));
  assert.ok(ambiguous.total>3); assert.equal(ambiguous.returned,3); assert.equal(ambiguous.truncated,true); assert.equal(ambiguous.needsConfirmation,true);
  assert.equal("note" in ambiguous,false); assert.equal("facets" in ambiguous,false);
  // 删除的是每次重复的大块说明，姓名、作品、标签和确认协议仍由前面断言保护。
  // facets 有独立分类入口，不应随每次按名查询都发送整库作品与颜色集合。
  // 上层禁用 fetch 保证这些新测试没有悄悄请求在线角色服务。
}

/**
 * 以用户指定的塞尔达四个属性作为正向基准。
 * 用不同大小写和下划线验证规范化只影响匹配键，不改变返回原值。
 * 资料名称是 princess zelda；不能把简称 zelda 假装成唯一身份。
 * 同作品还收录 toon zelda 等，精确原名才可得到此基准唯一项。
 * tags 必须从原始属性转换，不能出现未在资料里提供的外观。
 * 角色卡可以关联 CDN 封面，但不能伪造来源页面或已安装 LoRA。
 * 主进程 UI 查询与宿主工具对同条件必须得到同一姓名与作品。
 * 未显式 source 的 Agent 查询应选择离线来源。
 * 有唯一匹配时不得触发无条件澄清，正常生图链路仍可继续。
 * 坚持 total 来自匹配全集，不能仅因返回一张卡就声称唯一。
 * 封面是否能加载不影响标签，只有浏览器图片事件能确认显示成功。
 * 测试不验证角色百科正确性，只验证资料原样可靠传递。
 * 原 trigger 是资料姓名，不能擅自拼接未知别名。
 */
async function checkIdentity() {
  // filters 使用用户示例的全部属性，只改变大小写和下划线制造输入差异。
  // 若规范化漏掉空格替换，这次真实资料检索会返回零项而失败。
  // 源数据存在多个 zelda 版本，因此不能把含糊简称当作正向唯一项。
  // 对照的是创建页正式 searchCharacters，而不是工具适配器自建搜索。
  // 摘要的 slug 保证同一角色在两个入口中身份稳定。
  // 关联封面不证明安装了角色权重，本地 LoRA 列表仍应为空。
  // 返回唯一项仅表示在当前资料和条件下唯一，不声称百科身份绝对唯一。
  // 本测试不联网，不能因为 fetch 缓存碰巧命中就通过。
  const filters = {copyright:"THE_LEGEND_OF_ZELDA",gender:"1girl",hair:"blonde",eye:"blue"};
  const ui = await searchCharacters({source:"local",q:"PRINCESS_ZELDA",...filters});
  assert.equal(ui.total,1); assert.equal(ui.results[0].name,"princess zelda"); assert.deepEqual(ui.results[0].tags,["1girl","blonde hair","blue eyes"]);
  assert.equal(ui.results[0].hasImage,false); assert.deepEqual(ui.results[0].loras,[]); assert.equal(ui.results[0].url,"");
  // 完整作品与姓名都在文件名内，图片不是仅按 zelda 片段随便取的。
  // 期望字符串独立写出，不能照抄被测编码函数来证明其正确。
  // 该地址只供 UI 加载；全局禁用 fetch 仍必须允许查询完成。
  assert.equal(ui.results[0].thumbUrl,"https://blobs.animadex.net/Outputs/thumbs/princess%20zelda%2C%20the%20legend%20of%20zelda.webp");
  const agent = JSON.parse(await queryCharacters({query:"princess zelda",...filters}));
  assert.equal(agent.source,"local"); assert.equal(agent.characters[0].slug,ui.results[0].slug); assert.equal(agent.needsConfirmation,false);
}

/**
 * 封面关联只改显示字段，仍需通过真实资料和正式本地入口验证。
 * 初音是参考工具的已知封面样例，用固定地址检查逗号与空格的编码。
 * Fate 名称包含斜杠，若未编码就会变成 CDN 子目录并导致错误图片路径。
 * 这两项来自完整内置 JSON，不向测试临时增加理想化角色记录。
 * 每项都要求唯一姓名命中，防止错误查询碰巧返回一张可用图片。
 * imageUrl 与 thumbUrl 应共用同一缩略图，不猜不存在的高清资源路径。
 * reference 来自本地，不因有封面就声称在线确认了颜色资料。
 * hasImage 仍是未确认状态，推导的 URL 不能当作 HTTP 成功证据。
 * loras 始终为空，避免把角色参考图误当作已安装的角色权重。
 * 所有调用都处于 fetch 禁用范围，证明图片规则没有引入逐卡搜索。
 * Agent 摘要不带图片字段，封面接入不能增加模型上下文与工具轮次。
 * 公网 CDN 的实时可用性由单独探测说明，不依赖此离线回归。
 */
async function checkPreviews() {
  // 两条期望地址分别覆盖普通名字和作品括号中的斜杠。
  // 字符串写明百分号形式，能检测是否发生重复编码或漏编码。
  // 姓名与作品的大小写沿用资料原文，不经过检索键的替换规则。
  for (const [name, expected] of [
    ["hatsune miku", "hatsune%20miku%2C%20vocaloid.webp"],
    ["tamamo no mae (fate/extra)", "tamamo%20no%20mae%20(fate%2Fextra)%2C%20fate%20(series).webp"],
  ]) {
    // 查询通过正式分页适配器，封面只为返回卡片构造，不扫描网络资源。
    // 精确姓名匹配不能因图片字段改变而退化成首个片段候选。
    // 没有依赖真实图片内容，因此该回归可在断网时重复执行。
    const result = await searchCharacters({source:"local",q:name});
    assert.equal(result.total,1);
    const card = result.results[0];
    // 固定 CDN 前缀防止误将姓名解释成任意远端地址。
    // 同图地址保证列表与详情初始参考封面一致。
    // LoRA 断言独立于 URL，防止展示改动扩大为安装或下载行为。
    assert.equal(card.thumbUrl,`https://blobs.animadex.net/Outputs/thumbs/${expected}`);
    assert.equal(card.imageUrl,card.thumbUrl);
    assert.deepEqual(card.loras,[]);
  }
  // 默认本地工具继续只提供身份摘要，不能把整张媒体卡塞给语言模型。
  // 此处调用 Agent 正式执行器，与上面的 UI 分页入口形成独立对照。
  // 只检查展示字段不进入摘要，不改变原有角色识别确认协议。
  const agent = JSON.parse(await queryCharacters({query:"hatsune miku"}));
  assert.equal("thumbUrl" in agent.characters[0],false);
}

/**
 * 全部四项共同约束，不允许发色过滤被姓名搜索绕过。
 * 反向条件选择资料里不匹配的黑发，必须得到明确零匹配。
 * 无结果仍返回 facets，用户可以直接改筛选，不被困在空列表。
 * 按外观浏览本来就可能多项，不能被误判为同名识别失败。
 * 命名识别多项则仍标记澄清，避免第一名自动成为用户角色。
 * 分页以全集计算 total，并把最大页码夹到真实最后一页。
 * pageSize 大于上限时必须压到六十，防止模型一次取整库。
 * name 的模糊候选不改变四项原值，不能出现过滤条件外角色。
 * 全库行数同时由源 JSON 作对照，避免只验证硬编码数字。
 * 热度排序由既有字段决定，不凭文件遍历次序取第一页。
 * 此组只读查询，不产生收藏或用户数据的写入。
 * 空白 query 与无 query 在 UI 搜索中等价，工具全空另行拒绝。
 * 过滤值是明确原值，不依赖中文颜色自动翻译。
 * total 与 results.length 分开断言，防止分页变成丢数据。
 */
async function checkFiltering() {
  const miss = JSON.parse(await queryCharacters({query:"zelda",hair:"black"})); assert.equal(miss.total,0); assert.equal(miss.needsConfirmation,true);
  // 属性浏览刻意不提供 query，验证工具不再强制“先知道角色名”。
  // expected 从原始 JSON 独立过滤，避免直接调用被测筛选器制造恒真对照。
  // 八项限制只影响摘要条数，不能影响真实匹配总数。
  // 所有返回候选逐个检查颜色，防止仅第一项符合条件便误判通过。
  // 不触发 needsConfirmation 仅表示允许展示候选，工具 note 仍要求用户选择。
  // 命名歧义在下面 alice 用例保留硬性确认，与浏览语义形成对照。
  // 此处没有把角色热度当正确性条件，不绑定数据排名具体顺序。
  // 将来数据更新时，用真实 JSON 的分母能暴露漏加载而不是改断言迁就。
  const browse = JSON.parse(await queryCharacters({gender:"1girl",hair:"blonde",eye:"blue"}));
  const expected = rows.filter(row => row.gender==="1girl" && row.hair==="blonde" && row.eye==="blue");
  assert.equal(browse.total,expected.length); assert.equal(browse.intent,"browse"); assert.equal(browse.needsConfirmation,false); assert.equal(browse.returned,8); assert.equal(browse.truncated,true);
  assert.ok(browse.characters.every(row => row.gender==="1girl" && row.hair==="blonde" && row.eye==="blue"));
  const all = await searchCharacters({source:"local",page:99999,pageSize:999}); assert.equal(all.total,rows.length); assert.equal(all.pageSize,60); assert.equal(all.page,all.pages);
  // 徽标独立对照原始记录，不按最后一页的卡片数计算分类数量。
  // gender 与 hair 使用不同分母，保证相同文本不会串到另一个分类。
  // 空属性不出现在计数表，未知字段仍按既有规则排除。
  assert.equal(all.facetCounts.gender["1girl"],rows.filter(row=>row.gender==="1girl").length); assert.equal(all.facetCounts.hair.blonde,rows.filter(row=>row.hair==="blonde").length); assert.ok(!Object.hasOwn(all.facetCounts.eye,""));
  const empty = await searchCharacters({source:"local",copyright:"not-a-recorded-work"}); assert.equal(empty.total,0); assert.ok(empty.facets.hair.includes("blonde"));
  const ambiguous = JSON.parse(await queryCharacters({query:"alice"})); assert.ok(ambiguous.total>1); assert.equal(ambiguous.needsConfirmation,true);
}

/**
 * 从实际资料寻找缺失属性，而非在测试里创建一份“理想空数据”。
 * 姓名和作品一起查询，避免同名记录改变未知属性对照。
 * 任一缺失属性在 Agent 摘要中必须是 null 并列入 missingFields。
 * 空发色不能生成默认颜色 tag，这是防幻觉的可执行边界。
 * 验证真实分类里有用户示例，不把分类 Schema 当成分类数据。
 * 作品关键词只缩小作品分类，不会触发网络角色搜索。
 * 返回值有总数和截断标志，Agent 可以准确说明候选范围。
 * 零分类匹配明确返回空数组，不默认为第一种颜色。
 * 分类字符串原样传给搜索器，避免 UI 与 Agent 维护两套标签。
 * 不保证语言模型遵守所有提示，只验证工具没有填造缺失值。
 */
async function checkUnknowns() {
  // 未知字段选择同时缺头发和眼睛的真实记录，覆盖两个独立空值分支。
  // 姓名存在不意味着外观字段完整，不能把精确名称命中当补值许可。
  // 候选摘要保留缺失字段列表，模型能明说资料不足而非输出默认颜色。
  // 标签断言检查实际返回数组，不靠工具说明中“禁止幻觉”文字宣称安全。
  // 分类查询要加载整库，即使只拿一张示例卡仍应包含其他角色的颜色。
  // 不匹配分类结果也包含 total，避免空列表被当成加载超时。
  // 这些属性只是源资料，测试不会纠正用户原始数据的角色设定。
  // 若无真实空字段，此用例会响亮失败，提示更新未知资料测试前置条件。
  const row = rows.find(item => !item.hair && !item.eye); assert.ok(row);
  const result = JSON.parse(await queryCharacters({query:row.name,copyright:row.copyright}));
  const candidate = result.characters.find(item => item.name===row.name); assert.ok(candidate); assert.equal(candidate.hair,null); assert.equal(candidate.eye,null); assert.ok(candidate.missingFields.includes("hair")); assert.ok(!candidate.tags.includes("blonde hair"));
  const colors = JSON.parse(await queryCharacterFilters({field:"hair"})); assert.ok(colors.values.includes("blonde")); assert.equal(colors.source,"local");
  const works = JSON.parse(await queryCharacterFilters({field:"copyright",query:"the legend of zelda"})); assert.ok(works.values.includes("the legend of zelda"));
  const empty = JSON.parse(await queryCharacterFilters({field:"eye",query:"not-a-color"})); assert.deepEqual(empty.values,[]); assert.equal(empty.total,0);
}

/**
 * Schema 是给模型看的说明，宿主仍要拦住直接传来的坏参数。
 * 拼错字段不能被静默忽略，否则条件变宽后容易生成错误角色。
 * 类型错误与过长输入应在文件、网络访问前拒绝。
 * 全空工具请求拒绝，与 UI 允许浏览首页有意区分。
 * 用户描述只有属性是合法查询，前一组已提供对应正向对照。
 * online 不支持外观属性，明确失败比假装过滤成功更可靠。
 * 非正整数页码会破坏切片边界，须在入口校验。
 * 页长超限则夹紧而非拒绝，前一组验证该历史兼容行为。
 * 分类 field 只有四个枚举，不让任意对象字段变成读取入口。
 * query 类型错误不能通过 String 转型伪装成搜索条件。
 * 错误消息只作诊断，不应包含调用者的完整私有输入。
 * 本组验证工具和共享 IPC 手写校验器，而非只搜索源码文字。
 */
async function checkInvalid() {
  // unknown 是人为拼错的字段；直接调用执行器必须和 Schema 一样拒绝。
  // 空对象不能变成免费列举整份角色库，否则容易诱发长上下文循环。
  // page 的非法值测试共享验证器，Agent 本身不允许传入任意分页。
  // query 数值不应被宽松转成字符串“42”再碰巧查出角色。
  // 过长字符串与空结果不同，前者是参数错误，后者是有效查询的成功结果。
  // 不支持 online+hair 时不得悄悄移除 hair，然后返回范围更大的远端结果。
  // 分类 name 不在四属性中，即使它存在于源 JSON 也不能突破公开契约。
  // 只比较错误是否存在，不绑定用户可见中文的标点或本机路径。
  for (const args of [{},{query:""},{query:42},{query:"z".repeat(201)},{query:"zelda",unknown:"x"},{source:"online",hair:"blue"}]) await assert.rejects(queryCharacters(args));
  for (const args of [null,[],{source:"elsewhere"},{page:0},{page:1.5},{eye:2},{sort:"fake"},{q:"x".repeat(201)}]) assert.ok(validateCharacterSearch(args));
  await assert.rejects(queryCharacterFilters({field:"name"})); await assert.rejects(queryCharacterFilters({field:"hair",query:42}));
}

/**
 * 加载正式 renderer 合并函数，类型转译不改变匹配算法。
 * 依赖入口是桌面桥和词条模块，仅用空模块隔离，不执行 IPC。
 * 本组不模拟在线站点是否真的存在图片，专测“能否合并”的身份边界。
 * 同名不同作品是反向基准，不能为了补封面借用另一个人的图片。
 * 大小写和下划线属于格式差异，可以匹配，中文别名不在此规则内。
 * 两个同身份候选仍视为歧义，不能任意选第一项。
 * 合并后 slug 与本地属性不变，确保收藏和分类结果不会漂移。
 * 外观标签维持本地值，站点返回未知外观不能覆盖原来筛选。
 * LoRA 推荐复制的是站点资料，不等于安装或生成授权。
 * 测试转译的是整个真实模块，不从源码摘取函数或重新写一份实现。
 * vm 没有 fetch、文件读写和用户配置，合并函数必须是无副作用运算。
 * 未提供的模块在合并路径上不应被调用，误调用将抛错而非假通过。
 * 这一组与真实 JSON 分类回归独立，避免同一个算法自己证明自己。
 * 所有 fixture 使用明确人工角色，测试报告不冒充上游服务验证。
 * 原 module.exports 与 exports 指向同一个对象，符合 CommonJS 导出语义。
 * 文件路径仅用于测试加载，不交给 Agent 或发送线上服务。
 */
function checkOnlineMerge() {
  const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path"),ts=require("../apps/next/node_modules/typescript");
  const text=fs.readFileSync(path.join(__dirname,"../apps/next/src/utils/characters.ts"),"utf8"), compiled=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const loaded={exports:{}}; vm.runInNewContext(compiled,{module:loaded,exports:loaded.exports,require:()=>({})}); const merge=loaded.exports.mergeCharacterDetails;
  // local-preview 是纯转换测试的标识，不是要请求的真实网络地址。
  // 本地缩略图与详情图使用同一个标识，对应正式目录适配器的输出规则。
  // 记录仍带稳定 slug 和原标签引用，可检查媒体合并是否意外重建身份。
  const local={name:"princess zelda",copyright:"the legend of zelda",slug:"local:zelda",thumbUrl:"local-preview",imageUrl:"local-preview",tags:["blonde hair"],reference:{hair:"blonde",eye:"blue",gender:"1girl"}};
  // 线上夹具显式清空高清图，不能因对象展开继承本地封面而漏测回退分支。
  // 缩略图与本地不同，替换后才可证明线上确切媒体获得了优先级。
  // 外观刻意冲突，原标签引用断言应继续证明分类资料没有被覆盖。
  const online={...local,name:"PRINCESS_ZELDA",copyright:"the_legend_of_zelda",copyrightName:"The Legend of Zelda",slug:"online:zelda",thumbUrl:"preview",imageUrl:"",loras:[{name:"recommended"}],tags:["wrong hair"]};
  assert.equal(merge(local,[{...online,copyright:"another work",copyrightName:"Another Work"}]),null); assert.equal(merge(local,[online,online]),null); assert.equal(merge(local,[{...online,name:"toon zelda"}]),null);
  const combined=merge(local,[online]); assert.equal(combined.slug,local.slug); assert.equal(combined.reference,local.reference); assert.equal(combined.tags,local.tags); assert.equal(combined.thumbUrl,"preview"); assert.equal(combined.loras[0].name,"recommended");
  // 线上只含缩略图也应替换详情初始图，不留下旧的本地关联地址。
  // 上游缺少所有媒体时，不能用空字符串抹掉已关联封面。
  // 两种情况都先通过原来的唯一身份检查，不放宽同名不同作品边界。
  assert.equal(combined.imageUrl,"preview");
  const withoutMedia=merge(local,[{...online,thumbUrl:"",imageUrl:""}]);
  // 列表和详情分别读取两种 URL，两处都须保留本地地址，不能只修列表。
  // 空媒体来自唯一匹配的线上记录，与身份不匹配返回 null 的场景不同。
  // 保留 URL 不设置 hasImage=true，不会把推导线索升级成已验证的网络事实。
  assert.equal(withoutMedia.imageUrl,"local-preview");
  assert.equal(withoutMedia.thumbUrl,"local-preview");
}

// fetch 替身是负向对照：如果默认本地误走在线，上述任何查询都会失败。
// 恢复放在 finally，即使断言失败也不会污染其他 Electron 模块。
// 顶层捕获覆盖异步读取、工具映射及断言异常，退出码严格非零。
// app.whenReady 用真实 Electron 生命周期，避免 Node 无 app 造成假故障。
// 不调用 app.quit 收尾，因为 Electron 不保证遵守 process.exitCode。
// 不开窗口，这不是 UI 样式测试；UI 另跑真实静态导出冒烟。
// 通过只证明离线数据和协议边界，不声称在线生成效果已测试。
app.whenReady().then(async () => {
  const original = global.fetch; global.fetch = async () => { throw new Error("local character search must not access network"); };
  // 新分层检查与旧分类、未知字段和分页回归共用同一个断网条件。
  // 任一查询误走在线都会在这里失败，不能把网络返回当作本地别名命中。
  // 最终退出只在所有异步断言完成后发生，不因先打印部分成功而放行。
  // 封面回归也处于禁网边界内；任何本地逐卡 HTTP 补图都会直接失败。
  // 原分类、分页和身份测试保留，确保接入图片没有改变资料匹配协议。
  // 合并测试额外检查线上缺媒体时的回退，不依赖外部服务当时是否在线。
  try { await checkLayeredSearch(); await checkIdentity(); await checkPreviews(); await checkFiltering(); await checkUnknowns(); await checkInvalid(); checkOnlineMerge(); console.log("PASS local characters: linked previews, layered aliases, identity, four filters, facets, unknowns, pagination, validation, no network"); }
  finally { global.fetch=original; }
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
